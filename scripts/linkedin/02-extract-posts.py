#!/usr/bin/env python3
"""02 · Extrai os posts de um stream SDUI usando a MESMA receita do parser TS.

É o oráculo de referência em Python: se o 02 acha N posts com autor/texto/métricas e o
parser TS (src/providers/linkedin/search/sdui) discorda, a divergência está no TS. Bom
para validar fixtures e entender uma captura nova antes de mexer no código.

Uso:
  python3 scripts/linkedin/02-extract-posts.py /tmp/li/00-laravel.txt
  python3 scripts/linkedin/02-extract-posts.py /tmp/li/00-laravel.txt --json
"""

import argparse
import json

from _sdui import extract_posts


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("file", help="conteúdo decodificado (do 00)")
    ap.add_argument("--json", action="store_true", help="imprime os posts como JSON")
    args = ap.parse_args()

    raw = open(args.file, encoding="utf8").read()
    posts = extract_posts(raw)

    if args.json:
        print(json.dumps(posts, ensure_ascii=False, indent=2))
        return

    print(f"{len(posts)} post(s) extraído(s) de {args.file}\n")
    for p in posts:
        m = p["metrics"]
        print(f"  • {p['author']}  (@{p['vanity']})   {p['activity_urn']}")
        print(
            f"      ❤ {m['like_count']}  💬 {m['comment_count']}  🔁 {m['repost_count']}"
            f"   reações={m['reaction_breakdown']}"
        )
        print(f"      “{p['text'][:110]}”")
        print()


if __name__ == "__main__":
    main()
