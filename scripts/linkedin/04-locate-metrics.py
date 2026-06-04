#!/usr/bin/env python3
"""04 · Localiza, num .har INTEIRO, EM QUAL resposta vivem os contadores de cada post.

A descoberta-chave do metrics=0: no LinkedIn SDUI os POSTS e suas MÉTRICAS podem vir em
streams diferentes. A renderização inicial (`search/results/content` ou `.../all`) traz
autor + texto; os contadores de reação/comentário/repost costumam chegar em chunks
preguiçosos (`rsc-action/pagination` e `rsc-action/component`) durante o scroll — e às
vezes NÃO chegam para os posts do topo (carregam só quando a barra social fica visível).

Este script cruza tudo: extrai os posts dos streams de busca e, para cada URN, varre
TODAS as respostas do .har atrás dos contadores. Saída: tabela post × onde-estão-as-métricas.

Uso:
  python3 scripts/linkedin/04-locate-metrics.py ~/Downloads/www.linkedin.com.har
"""

import argparse
import re

from _sdui import _ACTIVITY, _AUTHOR, find_post_nodes, iter_har_responses, tokenize

POST_STREAMS = "flagship-web/search/results"  # content/ e all/
ALL_STREAMS = "flagship-web"  # onde procurar os contadores (inclui rsc-action)


def counters_for(raw: str, digits: str) -> dict:
    def n(pat: str) -> int:
        return len(re.findall(pat % digits, raw))

    return {
        "react": n(r"ReactionType_[A-Z]+_urn:li:activity:%s"),
        "comment": n(r"commentCount-urn:li:activity:%s"),
        "repost": n(r"repostCount-urn:li:activity:%s"),
    }


def short(url: str) -> str:
    return re.sub(r"https://[^/]+", "", url).split("?")[0]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("har", help="caminho do .har")
    args = ap.parse_args()

    # 1) posts (autor + URN) a partir dos streams de busca
    posts: dict[str, str] = {}  # digits -> nome
    for _url, body in iter_har_responses(args.har, POST_STREAMS):
        for _lid, content in find_post_nodes(tokenize(body)):
            digits = _ACTIVITY.search(content).group(0).split(":")[-1]
            name = _AUTHOR.search(content)
            if name:
                posts.setdefault(digits, name.group(1).strip())
    print(f"{len(posts)} post(s) nos streams de busca ({POST_STREAMS})\n")

    # 2) índice de contadores por resposta
    responses = [(short(u), b) for u, b in iter_har_responses(args.har, ALL_STREAMS)]

    # 3) cruza
    for digits, name in posts.items():
        locais = []
        for path, body in responses:
            if digits not in body:
                continue
            c = counters_for(body, digits)
            if c["react"] or c["comment"] or c["repost"]:
                locais.append(f"{path} (R{c['react']}/C{c['comment']}/Rp{c['repost']})")
        status = "  ".join(locais) if locais else "⚠ MÉTRICAS AUSENTES em todo o .har"
        print(f"  • {name:<20s} …{digits[-6:]}  →  {status}")


if __name__ == "__main__":
    main()
