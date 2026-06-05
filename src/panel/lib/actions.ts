// Ações de toolbar (export/raw/clear) — portadas do popup. Usam o mesmo protocolo de
// mensagens; só a UI mudou. `provider === null` agrega todas as plataformas.

import type { ExportJSON, SocialProvider } from "../../shared/domain";
import type { RawPayloadsResponse } from "../../shared/messages";
import { send } from "../state/bridge";
import { refreshActive, refreshSummary } from "../state/store";
import { dateStamp, downloadJson, exportFilename } from "./download";

export async function exportPlatform(provider: SocialProvider | null): Promise<void> {
  const data = await send<ExportJSON | undefined>({ action: "GET_EXPORT", provider });
  if (data) downloadJson(data, exportFilename(data));
}

export async function exportRaw(provider: SocialProvider | null): Promise<void> {
  const res = await send<RawPayloadsResponse | undefined>({ action: "GET_RAW_PAYLOADS", provider });
  if (!res?.endpoints) return;
  downloadJson(res.endpoints, `he4rt-raw-${provider || "all"}-${dateStamp()}.json`);
}

// CLEAR_ALL limpa todas as plataformas (preservando handles); reidratamos a aba atual + resumo.
export async function clearAll(): Promise<void> {
  await send({ action: "CLEAR_ALL" });
  await refreshActive();
  await refreshSummary();
}
