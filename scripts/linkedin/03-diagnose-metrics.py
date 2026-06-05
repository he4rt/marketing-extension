#!/usr/bin/env python3
"""03 · Diagnostica POR QUE as métricas de um post vêm zeradas (o caso metrics=0 ao vivo).

Para cada post, compara três sinais por URN:
  - SOLTO   : a URN aparece perto de QUALQUER contador (ReactionType/commentCount/repostCount)?
  - ESTRITO : o regex exato do parser (`..."id":"<id>"}}},"value":{"$case":"intValue",...}`) casa?
  - amostra : se SOLTO>0 e ESTRITO==0, despeja ~220 chars ao redor do 1º contador solto —
              é ali que se vê o shape real e se conserta o regex.

Conclusões típicas:
  • SOLTO==0  → o stream NÃO traz contadores p/ esse post (carregados sob demanda/hover).
  • SOLTO>0, ESTRITO==0 → shape divergente do fixture; ajustar o regex do metrics-reader.
  • ESTRITO>0 → métricas extraíveis; bug é a jusante.

Uso:
  python3 scripts/linkedin/03-diagnose-metrics.py /tmp/li/00-laravel.txt
"""

import argparse
import re

from _sdui import _ACTIVITY, _AUTHOR, find_post_nodes, sweep_metrics, tokenize

KINDS = ["ReactionType_[A-Z]+", "commentCount-", "repostCount-"]
STRICT = r'"id":"%s_?urn:li:activity:%s"\}\}\},"value":\{"\$case":"intValue","intValue":(\d+)\}'


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("file", help="conteúdo decodificado (do 00)")
    args = ap.parse_args()

    raw = open(args.file, encoding="utf8").read()
    byid = tokenize(args.file and raw)

    nodes = find_post_nodes(byid)
    print(f"{len(nodes)} cabeçalho(s) de post em {args.file}\n")
    for _lid, content in nodes:
        urn = _ACTIVITY.search(content).group(0)
        digits = urn.split(":")[-1]
        author = (_AUTHOR.search(content) or [None, "?"])
        name = author.group(1) if hasattr(author, "group") else "?"
        m = sweep_metrics(raw, digits)
        print(f"  • {name}  {urn}")
        print(f"      sweep → ❤ {m['like_count']}  💬 {m['comment_count']}  🔁 {m['repost_count']}")
        for kind in KINDS:
            loose = len(re.findall(kind.replace("[A-Z]+", "[A-Z]+") + r"[^\"]*" + digits, raw))
            strict = len(re.findall(STRICT % (kind, digits), raw))
            flag = "" if strict or not loose else "  ⚠ shape divergente"
            print(f"      {kind:<18s} solto={loose:<4d} estrito={strict:<4d}{flag}")
            if loose and not strict:
                mm = re.search(kind + r"[^\"]*" + digits, raw)
                s = max(0, mm.start() - 40)
                print(f"          amostra: …{raw[s:mm.end() + 180]!r}")
        print()


if __name__ == "__main__":
    main()
