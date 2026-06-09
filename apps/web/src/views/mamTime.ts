// Helpers puros de tiempo para el minuto a minuto (MinuteByMinuteView.vue).
// Aislados de la vista para poder testearlos sin montar el componente.
//
// Los helpers de HH:MM / after-midnight viven en `@repo/types` (single source of
// truth compartida con el backend) y se re-exportan aquí por conveniencia.
import { hhmmToDayMinutes, dayMinutesToHHMM } from '@repo/types';

export { hhmmToDayMinutes, dayMinutesToHHMM, templateGap } from '@repo/types';

/**
 * Minutos entre el fin de la actividad actual y el inicio de la siguiente.
 * - Positivo  → hueco (tiempo muerto entre actividades).
 * - Negativo  → solape (la actividad actual termina después de que empieza la siguiente).
 * - 0         → encajan exactamente.
 */
export function gapAfter(curEndIso: string, nextStartIso: string): number {
  return Math.round(
    (new Date(nextStartIso).getTime() - new Date(curEndIso).getTime()) / 60000,
  );
}

/**
 * Nueva duración (en minutos) para que la actividad actual termine justo cuando
 * empieza la siguiente. Como el día se ordena por startTime, normalmente es ≥ 0.
 */
export function durationToFill(curStartIso: string, nextStartIso: string): number {
  return Math.round(
    (new Date(nextStartIso).getTime() - new Date(curStartIso).getTime()) / 60000,
  );
}

// ── Detección block-aware de desajustes entre items consecutivos ──────────────
//
// Funciones puras compartidas por las dos vistas (minuto a minuto por retiro y
// editor de templates). "Block-aware": las actividades que arrancan a la MISMA
// hora son paralelas (revisiones, pruebas de audio) y no se consideran solape
// entre sí; el indicador se evalúa al final del bloque vs el inicio del siguiente.
// La lista DEBE venir ordenada cronológicamente dentro de su día.

type RetreatItemLike = { startTime: string; endTime: string; status?: string | null };

/**
 * Gap (min) tras items[idx] hacia el siguiente, en el minuto a minuto por retiro.
 * Positivo = hueco, negativo = solape. Devuelve null si: no hay siguiente, son
 * paralelos (mismo startTime), el bloque y el siguiente ya están completados, o
 * el desfase es < 1 min. El caller agrega la condición "solo en vista por día".
 */
export function retreatGapAfter(items: RetreatItemLike[], idx: number): number | null {
  const cur = items[idx];
  const next = items[idx + 1];
  if (!cur || !next) return null;
  if (next.startTime === cur.startTime) return null; // bloque paralelo
  let allCompleted = true;
  let blockEnd = -Infinity;
  for (let j = idx; j >= 0 && items[j].startTime === cur.startTime; j--) {
    blockEnd = Math.max(blockEnd, new Date(items[j].endTime).getTime());
    if (items[j].status !== 'completed') allCompleted = false;
  }
  if (allCompleted && next.status === 'completed') return null;
  const gap = Math.round((new Date(next.startTime).getTime() - blockEnd) / 60000);
  return Math.abs(gap) < 1 ? null : gap;
}

type TemplateItemLike = {
  defaultStartTime?: string | null;
  defaultDurationMinutes?: number;
};

/**
 * Gap (min) tras items[idx] hacia el siguiente, en el editor de templates.
 * Usa defaultStartTime ("HH:MM") + defaultDurationMinutes con offset
 * after-midnight. Positivo = hueco, negativo = solape. null si no aplica.
 */
export function templateGapAfter(items: TemplateItemLike[], idx: number): number | null {
  const cur = items[idx];
  const next = items[idx + 1];
  if (!cur || !next) return null;
  if (!cur.defaultStartTime || !next.defaultStartTime) return null;
  if (cur.defaultStartTime === next.defaultStartTime) return null; // bloque paralelo
  const nextStart = hhmmToDayMinutes(next.defaultStartTime);
  if (nextStart == null) return null;
  let blockEnd = -Infinity;
  for (let j = idx; j >= 0 && items[j].defaultStartTime === cur.defaultStartTime; j--) {
    const s = hhmmToDayMinutes(items[j].defaultStartTime);
    if (s != null) blockEnd = Math.max(blockEnd, s + (items[j].defaultDurationMinutes || 0));
  }
  if (blockEnd === -Infinity) return null;
  const gap = nextStart - blockEnd;
  return Math.abs(gap) < 1 ? null : gap;
}

// ── Compactar día (cerrar huecos y solapes en cascada) ────────────────────────

/**
 * Dada una lista ORDENADA de items con `start`/`end` numéricos (mismo unit:
 * epoch-ms para el retiro, minutos-del-día para el template), calcula qué items
 * deben moverse para que cada BLOQUE (items con el mismo `start` = paralelos)
 * empiece cuando termina el bloque anterior. El primer bloque queda donde está.
 * Devuelve solo los items que cambian, con su nuevo `start`. Función pura.
 */
export function computeCompactPlan(
  items: Array<{ id: string; start: number; end: number }>,
): Array<{ id: string; start: number }> {
  if (items.length < 2) return [];
  const blocks: Array<Array<{ id: string; start: number; end: number }>> = [];
  for (const it of items) {
    const last = blocks[blocks.length - 1];
    if (last && last[0].start === it.start) last.push(it);
    else blocks.push([it]);
  }
  const endOf = (b: Array<{ end: number }>) => Math.max(...b.map((x) => x.end));
  let cursorEnd = endOf(blocks[0]);
  const plan: Array<{ id: string; start: number }> = [];
  for (let k = 1; k < blocks.length; k++) {
    const block = blocks[k];
    const origStart = block[0].start;
    const width = endOf(block) - origStart;
    const target = cursorEnd;
    if (origStart !== target) {
      for (const b of block) plan.push({ id: b.id, start: target });
    }
    cursorEnd = target + width;
  }
  return plan;
}
