// Spinner discreto para o primeiro carregamento de uma aba.
export function Spinner() {
  return (
    <div class="flex items-center justify-center py-10">
      <span class="size-5 animate-spin rounded-full border-2 border-line-2 border-t-accent" />
    </div>
  );
}
