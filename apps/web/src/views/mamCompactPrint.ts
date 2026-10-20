// Pure builder for the MAM compact printout (Excel-like: dense table, one day
// per page). Kept out of MinuteByMinuteView so the layout is testable without
// mounting anything (same idea as mamTime.ts / mamMusic.ts) and so the view's
// own @media print stays untouched — this sheet renders in its own window.
//
// Window/print mechanics follow buildPrintableHtml (packages/utils): the
// auto-print script is embedded in the document so headless Chrome executes
// the exact same layout, the footer URL is made readable via replaceState, and
// the window closes itself after printing. No <base href> and no image wait:
// this document has no external resources.

import { escapeHtml } from '@/utils/tablesPrint';
import { participantLabel } from '@/utils/participant';
import { printableSlug } from '@repo/utils';

export interface MamPrintParticipant {
  firstName?: string | null;
  lastName?: string | null;
  nickname?: string | null;
}

export interface MamPrintResponsability {
  id: string;
  name: string;
  /** Participant assigned to the role itself (the "responsable"). */
  participant?: MamPrintParticipant | null;
}

export interface MamPrintItem {
  id: string;
  name: string;
  type: string;
  day: number;
  startTime: string;
  endTime: string;
  orderInDay?: number | null;
  responsabilityId?: string | null;
  /** Support people assigned directly to the item (apoyos). */
  responsables?: Array<{ participant?: MamPrintParticipant | null } | null> | null;
}

export interface MamCompactPrintInput {
  items: MamPrintItem[];
  responsabilities: MamPrintResponsability[];
  /** Composed by the view: parish (+ retreat version when present). */
  retreatLabel: string;
  /** ISO of retreat.startDate; null → the day header omits the date. */
  startDateIso: string | null;
  /**
   * Retreat timezone (wall clock the schedule was planned in). Falls back to
   * the browser timezone, same as the on-screen rows.
   */
  timeZone?: string;
}

/** Background tint per item type — Tailwind shade-100 hexes, 1:1 with the
 * TYPE_BADGE_COLORS badges of MinuteByMinuteView. The printout window has no
 * Tailwind, so the canonical hexes live here; unknown types fall back to the
 * neutral gray of `otro`, like typeBadgeClass does. */
export const MAM_COMPACT_TYPE_COLORS: Record<string, string> = {
  charla: '#DBEAFE', // blue-100
  testimonio: '#EDE9FE', // violet-100
  dinamica: '#FFEDD5', // orange-100
  misa: '#FEF9C3', // yellow-100
  comida: '#DCFCE7', // green-100
  refrigerio: '#CCFBF1', // teal-100
  traslado: '#F1F5F9', // slate-100
  campana: '#FEF3C7', // amber-100
  logistica: '#F3F4F6', // gray-100
  santisimo: '#E0E7FF', // indigo-100
  descanso: '#FFE4E6', // rose-100
  oracion: '#FCE7F3', // pink-100
  otro: '#F3F4F6', // gray-100 (fallback)
};

/** "14:05" — 24h clock, like the Excel sheet (not the 12h+meridiano of the
 * on-screen rows). Deterministic in tests by passing timeZone: 'UTC'. */
export function formatHHMM(iso: string, timeZone?: string): string {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('es', {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      ...(timeZone ? { timeZone } : {}),
    });
  } catch {
    // A bad timezone string in the DB would kill the whole printout at the
    // retreat; degrade to the browser timezone instead.
    formatter = new Intl.DateTimeFormat('es', {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
  }
  const parts = formatter.formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('hour')}:${get('minute')}`;
}

/** Calendar date of day N, mirroring dayDateLabel: the API stores
 * "2026-10-16T00:00:00.000Z" but it conceptually is the calendar date, so it
 * is rebuilt with UTC components to avoid a timezone shift. */
export function dayDateFromStart(startDateIso: string, day: number): Date {
  const start = new Date(startDateIso);
  const local = new Date(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  local.setDate(local.getDate() + (day - 1));
  return local;
}

function typeClass(type: string): string {
  return `t-${type in MAM_COMPACT_TYPE_COLORS ? type : 'otro'}`;
}

/** Group items by `day` (the source of truth for grouping — items after
 * midnight belong to the day they were planned under) and sort each day by
 * startTime with orderInDay as tiebreaker, mirroring itemsByDay. */
function groupByDay(items: MamPrintItem[]): Map<number, MamPrintItem[]> {
  const byDay = new Map<number, MamPrintItem[]>();
  for (const item of items) {
    const list = byDay.get(item.day);
    if (list) list.push(item);
    else byDay.set(item.day, [item]);
  }
  for (const [day, list] of byDay) {
    list.sort(
      (a, b) =>
        a.startTime.localeCompare(b.startTime) ||
        (a.orderInDay ?? 0) - (b.orderInDay ?? 0),
    );
    byDay.set(day, list);
  }
  return byDay;
}

/** "Equipo María, Chapita" — team in semibold, people in smaller gray text.
 * The role's participant comes first, then the item's apoyos, deduplicated.
 * Items with apoyos but no team (they exist: 13 in Buen Despacho) render the
 * names alone; nothing to say → empty cell. */
function responsablesCell(
  item: MamPrintItem,
  responsabilitiesById: Map<string, MamPrintResponsability>,
): string {
  const team = item.responsabilityId
    ? responsabilitiesById.get(item.responsabilityId)
    : undefined;
  const names: string[] = [];
  const assigned = participantLabel(team?.participant);
  if (assigned) names.push(assigned);
  for (const apoyo of item.responsables ?? []) {
    const label = participantLabel(apoyo?.participant);
    if (label && !names.includes(label)) names.push(label);
  }
  const teamHtml = team ? `<b>${escapeHtml(team.name)}</b>` : '';
  const namesHtml = names.length
    ? `<span class="names">${names.map((n) => escapeHtml(n)).join(', ')}</span>`
    : '';
  return [teamHtml, namesHtml].filter(Boolean).join(' ');
}

function daySection(
  day: number,
  items: MamPrintItem[],
  input: MamCompactPrintInput,
  responsabilitiesById: Map<string, MamPrintResponsability>,
): string {
  const tz = input.timeZone;
  const dateLabel = input.startDateIso
    ? dayDateFromStart(input.startDateIso, day)
        .toLocaleDateString('es', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
        // CLDR emits "sábado, 17 de octubre" — drop the comma so it doesn't
        // pile up after the em-dash separator ("Día 2 — sábado 17 de…").
        .replace(', ', ' ')
    : '';
  const lastEnd = items.reduce(
    (max, it) => (it.endTime > max ? it.endTime : max),
    items[0].endTime,
  );
  const dayLabel = `Día ${day}${dateLabel ? ` — ${dateLabel}` : ''}`;
  const range = `${formatHHMM(items[0].startTime, tz)}–${formatHHMM(lastEnd, tz)}`;

  const rows = items
    .map((item) => {
      const hora = `${formatHHMM(item.startTime, tz)}–${formatHHMM(item.endTime, tz)}`;
      return `<tr class="${typeClass(item.type)}"><td class="c-hora">${hora}</td><td class="c-act">${escapeHtml(
        item.name,
      )}</td><td class="c-resp">${responsablesCell(item, responsabilitiesById)}</td></tr>`;
    })
    .join('\n');

  return `<section class="day" data-day="${day}">
<header class="day-head"><span class="dh-left">Minuto a Minuto — ${escapeHtml(
    input.retreatLabel,
  )}</span><span class="dh-right">${escapeHtml(dayLabel)} · ${range}</span></header>
<table>
<thead><tr><th class="c-hora">Hora</th><th class="c-act">Actividad</th><th class="c-resp">Responsables</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</section>`;
}

const STYLESHEET = `
@page { size: A4; margin: 10mm; }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: Arial, Helvetica, sans-serif; color: #1F2937; margin: 0; }
section.day { break-before: page; page-break-before: always; }
section.day:first-child { break-before: auto; page-break-before: auto; }
.day-head { display: flex; justify-content: space-between; align-items: baseline;
  gap: 4mm; background: #16365C; color: #fff; padding: 1.8mm 2.5mm; }
.dh-left { font-size: 9pt; font-weight: bold; }
.dh-right { font-size: 8.5pt; text-align: right; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
thead th { background: #334155; color: #fff; font-size: 7pt; text-transform: uppercase;
  letter-spacing: 0.3pt; text-align: left; padding: 1mm 1.5mm;
  border: 0.5pt solid #334155; }
td { font-size: 7.5pt; line-height: 1.12; padding: 0.6mm 1.5mm;
  border: 0.5pt solid #B6C0CC; vertical-align: top; overflow-wrap: break-word; }
.c-hora { width: 13%; font-size: 7pt; font-variant-numeric: tabular-nums; white-space: nowrap; }
.c-act { width: 45%; font-weight: 500; }
.c-resp { width: 42%; }
.c-resp .names { font-size: 6.5pt; color: #475569; }
tr { break-inside: avoid; page-break-inside: avoid; }
thead { display: table-header-group; }
${Object.entries(MAM_COMPACT_TYPE_COLORS)
  .map(([type, color]) => `.t-${type} { background: ${color}; }`)
  .join('\n')}
`;

/** Full printable HTML document for the compact MAM sheet: one section (and
 * one page) per day with items. Pure — no window access. */
export function buildMamCompactPrintHtml(input: MamCompactPrintInput): string {
  const responsabilitiesById = new Map(
    input.responsabilities.map((r) => [r.id, r]),
  );
  const byDay = groupByDay(input.items);
  const sections = [...byDay.keys()]
    .sort((a, b) => a - b)
    .map((day) =>
      daySection(day, byDay.get(day)!, input, responsabilitiesById),
    )
    .join('\n');

  const title = `Minuto a Minuto — ${input.retreatLabel}`;
  const printPath = `/imprimir/minuto-a-minuto-${printableSlug(input.retreatLabel)}`;
  // The footer URL the browser prints: window.open('') would show
  // "about:blank". Same trick as buildPrintableHtml.
  const rename = `try { history.replaceState(null, '', ${JSON.stringify(
    printPath,
  )}); } catch (e) {}`;

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8" />
<title>${escapeHtml(title)}</title>
<style>${STYLESHEET}</style></head><body>
${sections}
<script>
  (function () {
    ${rename}
    setTimeout(function () { window.print(); }, 50);
    window.addEventListener('afterprint', function () { window.close(); });
  })();
</` + `script>
</body></html>`;
}

/** Opens the printout window, writes the document and lets its embedded
 * script trigger the print dialog. Returns false (and calls onPopupBlocked)
 * when the browser blocked the popup. */
export function openMamCompactPrint(
  input: MamCompactPrintInput,
  opts: { onPopupBlocked?: () => void } = {},
): boolean {
  const printWindow = window.open('', '_blank', 'width=900,height=1100');
  if (!printWindow) {
    opts.onPopupBlocked?.();
    return false;
  }
  printWindow.document.write(buildMamCompactPrintHtml(input));
  printWindow.document.close();
  return true;
}
