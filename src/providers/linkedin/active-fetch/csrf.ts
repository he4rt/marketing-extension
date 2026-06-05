// Leitura do csrf-token do LinkedIn no SERVICE WORKER, a partir do cookie JSESSIONID.
//
// Por quê aqui (e não no harvest de headers): o harvest roda a partir das mensagens de
// captura no SW, que NÃO carregam o csrf (por design — token de sessão não trafega via
// postMessage). O SW, porém, pode ler o cookie diretamente via chrome.cookies. O valor do
// JSESSIONID vem entre aspas (ex.: "ajax:123") e o header csrf-token usa o valor SEM aspas.
//
// Chamado pelo scheduler (facet.refreshAuth) imediatamente antes do replay, então o csrf
// está sempre fresco. Requer a permissão "cookies" + host permission de linkedin.com.

import { setCsrfToken } from "./calibration";

const LINKEDIN_URL = "https://www.linkedin.com";

export async function refreshCsrfFromCookie(): Promise<void> {
  try {
    const cookie = await chrome.cookies.get({ url: LINKEDIN_URL, name: "JSESSIONID" });
    if (cookie?.value) setCsrfToken(cookie.value.replace(/"/g, ""));
  } catch {
    // Sem permissão/cookie → segue sem csrf; buildVoyagerRequest devolve null e o scheduler
    // reporta "uncalibrated" graciosamente.
  }
}
