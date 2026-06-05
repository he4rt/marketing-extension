// Controle do Active Fetch (L3): dispara o fan-out e faz polling do andamento. O polling
// usa setTimeout com ref + cleanup no unmount (sem timers órfãos quando a aba muda).
// Gate de ToS: dry-run por padrão; só "enviar de verdade" origina tráfego real.

import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import type { ActiveFetchStatusResponse } from "../../../shared/messages";
import { send } from "../../state/bridge";
import { progressLabel } from "./progress";

const POLL_INTERVAL_MS = 800;

export function DeepenControl({ calibrated }: { calibrated: boolean }) {
  const status = useSignal<ActiveFetchStatusResponse | null>(null);
  const running = useSignal(false);
  const real = useSignal(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function poll() {
    timer.current = setTimeout(async () => {
      const s = await send<ActiveFetchStatusResponse | undefined>({
        action: "GET_ACTIVE_FETCH_STATUS",
        provider: "linkedin",
      });
      if (!s) {
        running.value = false;
        return;
      }
      status.value = s;
      if (s.running) poll();
      else running.value = false;
    }, POLL_INTERVAL_MS);
  }

  async function run() {
    if (!calibrated || running.value) return;
    const dryRun = !real.value;
    running.value = true;
    status.value = {
      running: true,
      total: 0,
      done: 0,
      actorsCaptured: 0,
      startedAt: null,
      finishedAt: null,
      dryRun,
    };
    const s = await send<ActiveFetchStatusResponse | undefined>({
      action: "RUN_ACTIVE_FETCH",
      provider: "linkedin",
      dryRun,
    });
    if (!s) {
      running.value = false;
      return;
    }
    status.value = s;
    if (s.running) poll();
    else running.value = false;
  }

  const label = status.value ? progressLabel(status.value) : "";

  return (
    <div class="mx-3.5 rounded-xl border border-line-2 bg-surface p-3.5 shadow-sm">
      <div class="mb-1 flex items-center gap-1.5 text-xs font-semibold">
        <span class="size-2 rounded-full bg-li" />
        Aprofundar engajamento (L3)
      </div>
      <p class="mb-3 text-[11.5px] leading-snug text-ink-2">
        Fan-out Voyager credenciado: colhe Actors por trás de cada reação e repost.
      </p>
      {label && <div class="mb-2.5 font-mono text-[10px] text-ink-3">{label}</div>}
      <button
        type="button"
        disabled={!calibrated || running.value}
        onClick={() => void run()}
        title={
          calibrated
            ? "Aprofundar engajamento (L3) dos posts descobertos"
            : "Abra um post uma vez para calibrar a sessão antes de aprofundar"
        }
        class="w-full rounded-lg border border-li bg-li px-3 py-2 text-[11.5px] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
      >
        {running.value ? "Aprofundando…" : "Aprofundar (L3)"}
      </button>
      <label class="mt-2.5 flex cursor-pointer items-center gap-2 font-mono text-[9.5px] text-ink-3">
        <input
          type="checkbox"
          checked={real.value}
          onChange={(e) => {
            real.value = (e.target as HTMLInputElement).checked;
          }}
        />
        enviar de verdade (origina tráfego)
      </label>
    </div>
  );
}
