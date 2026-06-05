#!/usr/bin/env python3
"""00 · Decodifica as respostas de busca de um .har do LinkedIn para arquivos de texto.

O corpo de `/flagship-web/search/results/content/` chega como octet-stream (base64 no
.har). Este script extrai cada resposta dessas e grava em `<out>/NN-<keywords>.txt`,
prontos para os scripts 01/02/03. Sem dependências externas.

Uso:
  python3 scripts/linkedin/00-decode-har.py ~/Downloads/www.linkedin.com.har
  python3 scripts/linkedin/00-decode-har.py <har> --out /tmp/li --url flagship-web/feed
"""

import argparse
import os
import re
from urllib.parse import parse_qs, urlparse

from _sdui import iter_har_responses

# Default: streams de busca que trazem os posts (content/ e all/). Para os streams de
# MÉTRICAS preguiçosas, rode com --url rsc-action/actions (pagination/component).
POST_STREAMS = "flagship-web/search/results"


def slug(url: str, idx: int) -> str:
    kw = parse_qs(urlparse(url).query).get("keywords", [""])[0]
    kw = re.sub(r"[^A-Za-z0-9]+", "-", kw).strip("-").lower() or "sem-query"
    return f"{idx:02d}-{kw}"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("har", help="caminho do arquivo .har")
    ap.add_argument("--out", default="/tmp/li", help="pasta de saída (default /tmp/li)")
    ap.add_argument("--url", default=POST_STREAMS, help="substring do URL a casar")
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    found = 0
    for idx, (url, body) in enumerate(iter_har_responses(args.har, args.url)):
        path = os.path.join(args.out, slug(url, idx) + ".txt")
        open(path, "w", encoding="utf8").write(body)
        print(f"  [{idx:02d}] {len(body):>9d} bytes  {path}")
        print(f"        {url[:110]}")
        found += 1
    if not found:
        print(f"Nenhuma resposta casando '{args.url}' encontrada em {args.har}")
    else:
        print(f"\n{found} resposta(s) decodificada(s) em {args.out}/")


if __name__ == "__main__":
    main()
