// Roteador da visão de detalhe: resolve o item selecionado a partir dos signals e despacha
// para o detalhe certo (X/IG ou LinkedIn). Reativo: se o STORE_UPDATED remover o item,
// cai no fallback "não disponível".

import {
  type LinkedInProviderData,
  type ProviderData,
  providerData,
  selected,
} from "../../state/store";
import { DetailShell } from "./DetailShell";
import { LinkedInDetail } from "./LinkedInDetail";
import { PublicationDetail } from "./PublicationDetail";

function Missing() {
  return <p class="py-8 text-center text-sm text-ink-3">Este item não está mais disponível.</p>;
}

export function DetailView() {
  const sel = selected.value;
  if (!sel) return null;

  if (sel.provider === "linkedin") {
    const data = providerData.value.linkedin as LinkedInProviderData | undefined;
    const post = data?.content.find((p) => p.id === sel.id);
    return <DetailShell>{post ? <LinkedInDetail post={post} /> : <Missing />}</DetailShell>;
  }

  const data = providerData.value[sel.provider] as ProviderData | undefined;
  const pub = data?.publications[sel.id];
  if (!pub) {
    return (
      <DetailShell>
        <Missing />
      </DetailShell>
    );
  }
  return (
    <DetailShell>
      <PublicationDetail
        pub={pub}
        comments={data?.commentsByPublication[sel.id] ?? []}
        engagements={data?.engagementsByPublication[sel.id] ?? []}
      />
    </DetailShell>
  );
}
