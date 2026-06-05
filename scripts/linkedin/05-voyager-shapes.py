#!/usr/bin/env python3
"""05 · Extrai, de um .har, o SHAPE REAL das requisições Voyager dos 3 endpoints do L3.

Motivação (root cause #3): o replay do Active Fetch montava `variables` SINTÉTICAS
(ex.: reactions com `urn:urn:li:activity:<id>`), e o Voyager respondeu HTTP 400. O shape
verdadeiro (visto no tráfego do próprio LinkedIn) é outro — ex.: reactions usa
`threadUrn:urn:li:ugcPost:<id>` (encodado) + `includeWebMetadata=true`.

Este script varre as requisições `voyager/api/graphql` do .har, agrupa pelos 3 endpoints
do L3 (socialDashReactions / socialDashComments / feedDashReshareFeed) e imprime, para
cada um: o queryId, o template de `variables` (decodificado), o NOME do parâmetro de URN e
o TIPO de URN (activity/ugcPost/share/fsd_socialDetail) e se há `includeWebMetadata`.

Também correlaciona: junta os activity/share URNs vistos nos streams de busca com os URNs
usados pelas requisições sociais, para responder "reactions aceita share ou só ugcPost?".

Uso:
  python3 scripts/linkedin/05-voyager-shapes.py ~/Downloads/www.linkedin.com.har
"""

import argparse
import json
import re
from urllib.parse import unquote

# Endpoints do L3 (prefixo do queryId Voyager) → rótulo lógico.
L3_ENDPOINTS = {
    "voyagerSocialDashReactions": "socialDashReactions",
    "voyagerSocialDashComments": "socialDashComments",
    "voyagerFeedDashReshareFeed": "feedDashReshareFeed",
}

URN_RE = re.compile(r"urn:li:([a-zA-Z_]+):(\d+)")
PARAM_URN_RE = re.compile(r"(\w+Urn|urn):(urn:li:[a-zA-Z_]+:\d+)")


def iter_voyager_requests(har_path):
    """(queryId_full, query_string_decodificada, url_bruta) de cada request Voyager graphql."""
    har = json.load(open(har_path, encoding="utf8"))
    for entry in har.get("log", {}).get("entries", []):
        url = entry.get("request", {}).get("url", "")
        if "voyager/api/graphql" not in url or "queryId=" not in url:
            continue
        qs = url.split("?", 1)[1] if "?" in url else ""
        decoded = unquote(qs)
        qid = re.search(r"queryId=([^&]+)", decoded)
        yield (qid.group(1) if qid else ""), decoded, url


def variables_of(decoded):
    m = re.search(r"variables=(\([^&]*\)|[^&]*)", decoded)
    return m.group(1) if m else ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("har")
    args = ap.parse_args()

    seen = {label: [] for label in L3_ENDPOINTS.values()}
    all_urns = {}  # tipo -> set(id)

    for qid, decoded, _url in iter_voyager_requests(args.har):
        prefix = qid.split(".")[0]
        for t, n in URN_RE.findall(decoded):
            all_urns.setdefault(t, set()).add(n)
        label = L3_ENDPOINTS.get(prefix)
        if not label:
            continue
        variables = variables_of(decoded)
        param_urns = PARAM_URN_RE.findall(decoded)
        seen[label].append(
            {
                "queryId": qid,
                "variables": variables,
                "param_urns": param_urns,
                "includeWebMetadata": "includeWebMetadata=true" in decoded,
            }
        )

    print(f"\n=== .har: {args.har} ===\n")
    for label, reqs in seen.items():
        print(f"### {label} — {len(reqs)} request(s)")
        if not reqs:
            print("  (nenhuma — abra/clique o que dispara este endpoint e regere o .har)\n")
            continue
        ex = reqs[0]
        print(f"  queryId:            {ex['queryId']}")
        print(f"  includeWebMetadata: {ex['includeWebMetadata']}")
        print(f"  variables:          {ex['variables']}")
        print(f"  param→urn:          {ex['param_urns']}")
        print()

    print("=== URNs vistos no .har (para correlação share vs ugcPost vs activity) ===")
    for t in sorted(all_urns):
        ids = sorted(all_urns[t])
        print(f"  urn:li:{t}: {len(ids)} → {ids[:6]}{' …' if len(ids) > 6 else ''}")


if __name__ == "__main__":
    main()
