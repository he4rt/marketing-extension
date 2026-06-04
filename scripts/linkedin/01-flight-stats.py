#!/usr/bin/env python3
"""01 · Marcadores estruturais de um stream SDUI decodificado.

Responde rápido: "isto é o stream REAL do LinkedIn ou um fixture sintético/forjado?"
e "quantos posts/contadores este stream carrega?". Útil como primeira passada antes de
extrair (02) ou diagnosticar métricas (03).

Uso:
  python3 scripts/linkedin/01-flight-stats.py /tmp/li/00-laravel.txt
  python3 scripts/linkedin/01-flight-stats.py /tmp/li/*.txt
"""

import argparse

from _sdui import structural_markers

# Heurística: o stream real tem feed-actor por post e contadores ReactionType;
# o fixture forjado antigo usava memberFirstName/Expanded sem feed-actor.
LEGEND = {
    "bytes": "tamanho do corpo",
    "byid_lines": "linhas HEX_ID: indexadas",
    "feed_actor": "ocorrências de feed-actor (cabeçalhos de post)",
    "unique_activity_urns": "posts distintos (urn:li:activity)",
    "for_post_by": "autores distintos (for post by)",
    "commentary_text_refs": "refs de texto de post (commentary_text)",
    "reactionType_counters": "contadores de reação ReactionType_*",
    "memberFirstName_viewer": "blocos do VISITANTE logado (ruído, não é autor)",
    "Expanded_flight": "nós Expanded (árvore Flight)",
}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+", help="arquivo(s) de conteúdo decodificado (do 00)")
    args = ap.parse_args()

    for path in args.files:
        raw = open(path, encoding="utf8").read()
        m = structural_markers(raw)
        print(f"\n=== {path} ===")
        for key, label in LEGEND.items():
            print(f"  {m[key]:>9d}  {key:<24s} {label}")
        verdict = (
            "REAL (feed-actor + contadores)"
            if m["feed_actor"] > 0 and m["reactionType_counters"] > 0
            else "SUSPEITO: faltam feed-actor e/ou contadores ReactionType"
        )
        print(f"  → {verdict}")


if __name__ == "__main__":
    main()
