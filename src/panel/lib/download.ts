// Download de JSON no painel — portado do popup (downloadJson/exportFilename/dateStamp).
// Funciona em página de extensão: Blob + objectURL + clique sintético.

import type { ExportJSON } from "../../shared/domain";

export function dateStamp(): string {
  return new Date().toISOString().split("T")[0] ?? "";
}

export function downloadJson(data: unknown, filename: string): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportFilename(data: ExportJSON): string {
  const handle = Object.values(data.meta?.handles || {}).find(Boolean) || "export";
  return `he4rt-social-${handle}-${dateStamp()}.json`;
}
