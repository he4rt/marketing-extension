// Rótulos puros da descoberta SDUI do LinkedIn — movidos 1:1 de popup/linkedin-discovery.ts.
// A busca (Estágio 1) descobre N posts e pode achar M nós "ilegíveis" (parser drift).

import { plural } from "../../lib/format";

// Sinais opcionais da resposta GET_PLATFORM_DATA do LinkedIn. `unreadable`/`calibrated`
// chegam do controller (#18); ausentes = estado neutro.
export type LinkedInDiscoverySignals = {
  discovered: number;
  unreadable?: number;
  calibrated?: boolean;
};

// "N posts descobertos" (semântica de busca, não "publicações").
export function discoveredLabel(discovered: number): string {
  return `${discovered} ${plural(discovered, "post descoberto", "posts descobertos")}`;
}

// "M ilegíveis (parser drift)"; "" quando não há sinal ou zero ilegíveis.
export function unreadableLabel(unreadable: number | undefined): string {
  if (!unreadable || unreadable <= 0) return "";
  return `${unreadable} ${plural(unreadable, "ilegível", "ilegíveis")} (parser drift)`;
}
