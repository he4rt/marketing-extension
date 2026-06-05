// Bootstrap do painel: monta o app Preact e liga a sincronização com o navegador
// (auto-seleção de aba, Collection Target, broadcast STORE_UPDATED).

import { render } from "preact";
import { App } from "./app";
import { initSync } from "./state/sync";
import { initTheme } from "./state/theme";

const root = document.getElementById("app");
if (root) {
  initTheme();
  render(<App />, root);
  initSync();
}
