"""Biblioteca compartilhada de análise do stream SDUI (React-Flight) da busca do LinkedIn.

Cristaliza o que descobrimos sobre o endpoint `/flagship-web/search/results/content/`:
ele NÃO é Voyager GraphQL — é um stream React-Flight/RSC (linhas `HEX_ID:conteúdo`).
A receita de extração por post (validada contra .har real) é:

  - nó do post  = linha com `feed-actor` + uma `urn:li:activity:\\d+` (única = a do post)
  - autor       = `for post by <Nome>"`  (inline; memberFirstName é o VISITANTE, não o autor)
  - vanity      = primeiro `/in/<vanity>` do cabeçalho
  - texto       = ref `"legacyControlName":"commentary_text"},"children":"$L<id>"` → resolve
  - métricas    = contadores `ReactionType_<TIPO>_urn...`, `commentCount-...`, `repostCount-...`
                  no shape `..."id":"<id>"}}},"value":{"$case":"intValue","intValue":N}` (dedup por MAX)

Os módulos numerados (00-, 01-, ...) importam estas funções. Mantemos tudo em regex/
substring porque as linhas Flight são gigantes e cheias de refs preguiçosas — fazer
JSON.parse da linha inteira do post NÃO devolve o autor (foi o bug original).
"""

from __future__ import annotations

import base64
import json
import re
from typing import Iterator

# --- carregamento de .har ----------------------------------------------------

SEARCH_CONTENT = "flagship-web/search/results/content"


def iter_har_responses(har_path: str, url_substr: str = SEARCH_CONTENT) -> Iterator[tuple[str, str]]:
    """Itera (url, corpo_decodificado) das respostas do .har cujo URL casa `url_substr`.

    Lida com corpo base64 (octet-stream) e texto puro. Nunca lança por entry ruim.
    """
    har = json.load(open(har_path, encoding="utf8"))
    for entry in har.get("log", {}).get("entries", []):
        url = entry.get("request", {}).get("url", "")
        if url_substr not in url:
            continue
        content = entry.get("response", {}).get("content", {})
        body = content.get("text", "") or ""
        if content.get("encoding") == "base64":
            try:
                body = base64.b64decode(body).decode("utf8", "replace")
            except Exception:
                pass
        yield url, body


# --- tokenizer Flight --------------------------------------------------------

_HEX_LINE = re.compile(r"^([0-9a-f]+):")


def tokenize(raw: str) -> dict[str, str]:
    """Quebra o stream em `byId` (hex_id → conteúdo). Primeira ocorrência vence."""
    byid: dict[str, str] = {}
    for line in raw.split("\n"):
        m = _HEX_LINE.match(line)
        if not m:
            continue
        hid = m.group(1)
        if hid not in byid:
            byid[hid] = line[m.end() :]
    return byid


def resolve_ref(byid: dict[str, str], ref: str) -> str | None:
    """Resolve "$L<hex>" / "$<hex>" / "<hex>" para o conteúdo da linha-alvo."""
    if not ref:
        return None
    hid = ref[2:] if ref.startswith("$L") else ref[1:] if ref.startswith("$") else ref
    return byid.get(hid) if re.fullmatch(r"[0-9a-f]+", hid or "") else None


# --- coleta de texto (árvore Flight) -----------------------------------------


def collect_text(node, out: list[str]) -> None:
    if isinstance(node, str):
        if node and not node.startswith("$"):
            out.append(node)
        return
    if not isinstance(node, list):
        return
    if len(node) >= 4 and node[0] == "$" and isinstance(node[3], dict):
        collect_text(node[3].get("children"), out)
        tp = node[3].get("textProps")
        if isinstance(tp, dict):
            collect_text(tp.get("children"), out)
        return
    for item in node:
        collect_text(item, out)


# --- extração por post -------------------------------------------------------

_ACTIVITY = re.compile(r"urn:li:activity:\d+")
_AUTHOR = re.compile(r'for post by ([^"]+?)"')
_VANITY = re.compile(r"/(?:in|company)/([A-Za-z0-9\-%]+)")
_TEXT_REF = re.compile(r'"legacyControlName":"commentary_text"\},"children":"\$L([0-9a-f]+)"')


def find_post_nodes(byid: dict[str, str]) -> list[tuple[str, str]]:
    """Linhas que são cabeçalho de post: têm `feed-actor` e uma URN de atividade."""
    return [(k, c) for k, c in byid.items() if "feed-actor" in c and _ACTIVITY.search(c)]


def post_text(content: str, byid: dict[str, str]) -> str:
    m = _TEXT_REF.search(content)
    line = resolve_ref(byid, f"$L{m.group(1)}") if m else None
    if not line:
        return ""
    try:
        parsed = json.loads(line)
    except Exception:
        return ""
    out: list[str] = []
    collect_text(parsed, out)
    return re.sub(r"\s+", " ", " ".join(s.strip() for s in out if s.strip())).strip()


def sweep_metrics(raw: str, urn_digits: str) -> dict:
    """Soma contadores inline da URN. Dedup por MAX (renderizam em vários lugares)."""
    react = re.compile(
        r'"id":"ReactionType_([A-Z]+)_urn:li:activity:' + urn_digits
        + r'"\}\}\},"value":\{"\$case":"intValue","intValue":(\d+)\}'
    )
    by_type: dict[str, int] = {}
    for t, v in react.findall(raw):
        by_type[t] = max(by_type.get(t, 0), int(v))

    def one(prefix: str) -> int:
        rx = re.compile(
            r'"id":"' + prefix + r"-urn:li:activity:" + urn_digits
            + r'"\}\}\},"value":\{"\$case":"intValue","intValue":(\d+)\}'
        )
        vals = [int(x) for x in rx.findall(raw)]
        return max(vals) if vals else 0

    return {
        "like_count": sum(by_type.values()),
        "comment_count": one("commentCount"),
        "repost_count": one("repostCount"),
        "reaction_breakdown": by_type,
    }


def extract_posts(raw: str) -> list[dict]:
    """Aplica a receita completa ao stream e devolve os posts (autor/vanity/urn/texto/métricas)."""
    byid = tokenize(raw)
    posts: list[dict] = []
    seen: set[str] = set()
    for _lid, content in find_post_nodes(byid):
        urn = _ACTIVITY.search(content).group(0)
        if urn in seen:
            continue
        seen.add(urn)
        name = _AUTHOR.search(content)
        if not name:
            continue  # cabeçalho sem nome → drift (ilegível)
        posts.append(
            {
                "activity_urn": urn,
                "author": name.group(1).strip(),
                "vanity": (_VANITY.search(content) or [None, ""])[1]
                if _VANITY.search(content)
                else "",
                "text": post_text(content, byid),
                "metrics": sweep_metrics(raw, urn.split(":")[-1]),
            }
        )
    return posts


# --- marcadores estruturais (real vs. forjado) -------------------------------


def structural_markers(raw: str) -> dict:
    """Contagens que distinguem o stream REAL de um fixture sintético/forjado."""
    uniq_act = set(re.findall(r"urn:li:activity:\d+", raw))
    return {
        "bytes": len(raw),
        "byid_lines": len(tokenize(raw)),
        "feed_actor": raw.count("feed-actor"),
        "unique_activity_urns": len(uniq_act),
        "for_post_by": len(set(_AUTHOR.findall(raw))),
        "commentary_text_refs": len(_TEXT_REF.findall(raw)),
        "reactionType_counters": len(re.findall(r'"id":"ReactionType_[A-Z]+_urn:li:activity:\d+"', raw)),
        "memberFirstName_viewer": raw.count("memberFirstName"),
        "Expanded_flight": raw.count("Expanded"),
    }
