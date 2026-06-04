// Descritores dos 3 endpoints Voyager aprofundados pelo Active Fetch (L3).
//
// PURO: nada de chrome.*. Cada descritor declara, para um endpoint lógico:
//  - queryIdField: qual campo da CalibrationCache guarda o queryId colhido daquele endpoint;
//  - buildVariables(activityUrn): o trecho `variables=(...)` da URL Voyager, no formato que
//    o parser correspondente (linkedinParseReactions/Comments/Reposts) sabe ler de volta.
//
// O contrato com o parser é a forma do `variables`:
//  - reactions: o parser casa /urn:li:activity:(\d+)/ → injetamos `urn:<activityUrn>`;
//  - comments:  o parser casa /urn:li:activity:(\d+)/ → injetamos `socialDetailUrn:...<activityUrn>`;
//  - reposts:   o parser casa `targetUrn:<urn>`        → injetamos `targetUrn:<activityUrn>`.

import type { CalibrationCache } from "./calibration";

// Ids lógicos dos endpoints L3 (mesmos nomes que processLinkedInCapture já roteia).
export type VoyagerEndpointId =
  | "socialDashReactions"
  | "socialDashComments"
  | "feedDashReshareFeed";

// Quais campos de queryId da calibração mapeiam cada endpoint.
type QueryIdField = "queryId_reactions" | "queryId_comments" | "queryId_reposts";

export type VoyagerEndpointDescriptor = {
  id: VoyagerEndpointId;
  queryIdField: QueryIdField;
  // Monta o `variables=(...)` (sem o nome do parâmetro) para uma atividade.
  buildVariables: (activityUrn: string) => string;
};

const PAGINACAO = "count:10,start:0";

export const VOYAGER_ENDPOINTS: Readonly<Record<VoyagerEndpointId, VoyagerEndpointDescriptor>> =
  Object.freeze({
    socialDashReactions: {
      id: "socialDashReactions",
      queryIdField: "queryId_reactions",
      buildVariables: (urn) => `(${PAGINACAO},urn:${urn})`,
    },
    socialDashComments: {
      id: "socialDashComments",
      queryIdField: "queryId_comments",
      buildVariables: (urn) => `(${PAGINACAO},socialDetailUrn:urn:li:fsd_socialDetail:${urn})`,
    },
    feedDashReshareFeed: {
      id: "feedDashReshareFeed",
      queryIdField: "queryId_reposts",
      buildVariables: (urn) => `(${PAGINACAO},targetUrn:${urn})`,
    },
  });

// Ordem de fan-out: pessoas (reactions) → comentários → reposts.
export function voyagerEndpointIds(): VoyagerEndpointId[] {
  return ["socialDashReactions", "socialDashComments", "feedDashReshareFeed"];
}

// Descritor de um endpoint lógico; null se o id for desconhecido (defensivo).
export function endpointDescriptor(id: string): VoyagerEndpointDescriptor | null {
  return VOYAGER_ENDPOINTS[id as VoyagerEndpointId] ?? null;
}

// O queryId colhido para um endpoint, ou null se ainda não calibrado.
export function queryIdFor(id: VoyagerEndpointId, calib: CalibrationCache): string | null {
  return calib[VOYAGER_ENDPOINTS[id].queryIdField];
}
