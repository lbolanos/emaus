import { describe, it, expect, vi } from 'vitest';
import {
  buildMamCompactPrintHtml,
  formatHHMM,
  dayDateFromStart,
  openMamCompactPrint,
  MAM_COMPACT_TYPE_COLORS,
  type MamPrintItem,
  type MamPrintResponsability,
} from '../mamCompactPrint';

// Criteria of specs/mam-compact-print/spec.md (R1). All fixtures are minimal
// and synthetic; times use UTC so assertions are deterministic.

let seq = 0;
function makeItem(overrides: Partial<MamPrintItem> = {}): MamPrintItem {
  seq += 1;
  return {
    id: `item-${seq}`,
    name: `Actividad ${seq}`,
    type: 'otro',
    day: 1,
    startTime: '2026-10-16T14:05:00.000Z',
    endTime: '2026-10-16T15:05:00.000Z',
    orderInDay: null,
    responsabilityId: null,
    responsables: null,
    ...overrides,
  };
}

const TEAMS: MamPrintResponsability[] = [
  {
    id: 'team-comedor',
    name: 'Comedor',
    participant: { firstName: 'María', lastName: 'González', nickname: null },
  },
  { id: 'team-cocina', name: 'Cocina', participant: null },
];

function buildHtml(
  items: MamPrintItem[],
  extra: {
    responsabilities?: MamPrintResponsability[];
    retreatLabel?: string;
    startDateIso?: string | null;
    timeZone?: string;
  } = {},
) {
  return buildMamCompactPrintHtml({
    items,
    responsabilities: 'responsabilities' in extra ? extra.responsabilities ?? [] : TEAMS,
    retreatLabel: extra.retreatLabel ?? 'Buen Despacho',
    // ?? would swallow an intentional null (no startDate on the retreat).
    startDateIso: extra.startDateIso !== undefined ? extra.startDateIso : '2026-10-16T00:00:00.000Z',
    timeZone: extra.timeZone,
  });
}

describe('formatHHMM', () => {
  it('formats 24h with zero padding', () => {
    expect(formatHHMM('2026-10-16T14:05:00.000Z', 'UTC')).toBe('14:05');
    expect(formatHHMM('2026-10-16T00:25:00.000Z', 'UTC')).toBe('00:25');
  });

  it('midnight is 00:xx under h23, never 24:xx', () => {
    expect(formatHHMM('2026-10-16T00:00:00.000Z', 'UTC')).toBe('00:00');
  });

  it('respects an explicit timezone', () => {
    // 14:05 UTC = 08:05 in America/Mexico_City (UTC-6, no DST in October 2026)
    expect(formatHHMM('2026-10-16T14:05:00.000Z', 'America/Mexico_City')).toBe('08:05');
  });

  it('degrades to the browser timezone on an invalid timezone string', () => {
    expect(formatHHMM('2026-10-16T14:05:00.000Z', 'Not/A_Zone')).toBe(
      formatHHMM('2026-10-16T14:05:00.000Z'),
    );
  });
});

describe('dayDateFromStart', () => {
  it('derives day N from startDate without a timezone shift', () => {
    const day2 = dayDateFromStart('2026-10-16T00:00:00.000Z', 2);
    expect(day2.getFullYear()).toBe(2026);
    expect(day2.getMonth()).toBe(9); // October (0-based)
    expect(day2.getDate()).toBe(17);
  });
});

describe('buildMamCompactPrintHtml', () => {
  it('creates one section per day, ordered, with startTime/orderInDay sort', () => {
    const html = buildHtml([
      makeItem({ day: 3, startTime: '2026-10-18T12:40:00.000Z' }),
      makeItem({ day: 1, startTime: '2026-10-16T09:00:00.000Z' }),
      makeItem({ day: 1, startTime: '2026-10-16T08:00:00.000Z', orderInDay: 3 }),
      makeItem({ day: 1, startTime: '2026-10-16T08:00:00.000Z', orderInDay: 2 }),
      makeItem({ day: 1, startTime: '2026-10-16T08:00:00.000Z', orderInDay: 1 }),
    ]);
    const sections = html.match(/<section class="day" data-day="(\d+)">/g) ?? [];
    expect(sections).toEqual([
      '<section class="day" data-day="1">',
      '<section class="day" data-day="3">',
    ]);

    const day1 = html.split('data-day="1"')[1].split('<section')[0];
    const names = [...day1.matchAll(/Actividad (\d+)/g)].map((m) => m[1]);
    // Same startTime → orderInDay tiebreak (1 < 2 < 3); 08:00 before 09:00.
    expect(names).toEqual(['5', '4', '3', '2']);
  });

  it('keeps an after-midnight item inside its planned day', () => {
    // 00:25 on the calendar belongs to day 2's night (AFTER_MIDNIGHT grouping):
    // the `day` column is the source of truth, not the calendar date.
    const html = buildHtml(
      [
        makeItem({ day: 2, startTime: '2026-10-17T06:25:00.000Z' }), // 00:25 CDMX
        makeItem({ day: 2, startTime: '2026-10-17T17:00:00.000Z' }),
      ],
      { timeZone: 'America/Mexico_City' },
    );
    const day2 = html.split('data-day="2"')[1];
    const hours = [...day2.matchAll(/c-hora">(\d\d:\d\d)–/g)].map((m) => m[1]);
    expect(hours).toEqual(['00:25', '11:00']);
  });

  it('forces one page per day and keeps the first day on page 1', () => {
    const html = buildHtml([
      makeItem({ day: 1 }),
      makeItem({ day: 2 }),
      makeItem({ day: 3 }),
    ]);
    expect(html).toContain('section.day { break-before: page; page-break-before: always; }');
    expect(html).toContain('section.day:first-child { break-before: auto; page-break-before: auto; }');
    expect(html).toContain('break-inside: avoid');
    expect(html).toContain('thead { display: table-header-group; }');
  });

  it('prints backgrounds: exact color adjustment and per-type tints', () => {
    const html = buildHtml([
      makeItem({ type: 'misa' }),
      makeItem({ type: 'xyz-unknown' }),
    ]);
    expect(html).toContain('print-color-adjust: exact');
    expect(html).toContain('class="t-misa"');
    expect(html).toContain(`.t-misa { background: ${MAM_COMPACT_TYPE_COLORS['misa']}; }`);
    // Unknown types fall back to the neutral tint, like typeBadgeClass.
    expect(html).toContain('class="t-otro"');
    // Every mapped type has a static rule (12 types + fallback).
    expect(Object.keys(MAM_COMPACT_TYPE_COLORS)).toHaveLength(13);
    for (const [type, color] of Object.entries(MAM_COMPACT_TYPE_COLORS)) {
      expect(html).toContain(`.t-${type} { background: ${color}; }`);
    }
  });

  it('escapes user-facing text', () => {
    const html = buildHtml(
      [
        makeItem({
          name: 'Charla <Con> " & Demo',
          responsabilityId: 'team-comedor',
        }),
      ],
      {
        responsabilities: [
          { id: 'team-comedor', name: 'Equipo <&>', participant: null },
        ],
      },
    );
    expect(html).not.toContain('Charla <Con>');
    expect(html).toContain('Charla &lt;Con&gt; &quot; &amp; Demo');
    expect(html).toContain('<b>Equipo &lt;&amp;&gt;</b>');
  });

  it('renders the responsables cell: team, assigned person, then apoyos', () => {
    const html = buildHtml([
      makeItem({
        responsabilityId: 'team-comedor',
        responsables: [
          { participant: { firstName: 'José', lastName: 'López', nickname: 'Chapita' } },
          // Duplicated name (assigned person also listed as apoyo) appears once.
          { participant: { firstName: 'María', lastName: 'González', nickname: null } },
        ],
      }),
    ]);
    expect(html).toContain('<b>Comedor</b> <span class="names">María González, Chapita</span>');
  });

  it('meaningful nickname wins over first name (participantLabel rule)', () => {
    const html = buildHtml([
      makeItem({
        responsables: [
          { participant: { firstName: 'Ignacio', lastName: 'Pérez', nickname: 'Nacho' } },
        ],
      }),
    ]);
    expect(html).toContain('<span class="names">Nacho</span>');
  });

  it('team without assigned participant renders the team alone', () => {
    const html = buildHtml([makeItem({ responsabilityId: 'team-cocina' })]);
    expect(html).toContain('<b>Cocina</b></td>');
  });

  it('apoyos without a team render the names alone; nothing renders an empty cell', () => {
    const html = buildHtml([
      makeItem({ responsables: [{ participant: { firstName: 'Ana', lastName: 'Ruiz', nickname: null } }] }),
      makeItem(),
    ]);
    expect(html).toContain('<td class="c-resp"><span class="names">Ana Ruiz</span></td>');
    expect(html).toContain('<td class="c-resp"></td>');
  });

  it('day header: retreat label, day number, long date and time range', () => {
    const html = buildHtml(
      [makeItem({ day: 2, startTime: '2026-10-17T06:25:00.000Z', endTime: '2026-10-17T07:00:00.000Z' })],
      { startDateIso: '2026-10-16T00:00:00.000Z', timeZone: 'America/Mexico_City' },
    );
    expect(html).toContain('Minuto a Minuto — Buen Despacho');
    // Retreat starts Friday 2026-10-16 → day 2 is Saturday 2026-10-17.
    expect(html).toContain('Día 2 — sábado 17 de octubre de 2026 · 00:25–01:00');
  });

  it('omits the date (but not the day number) when startDateIso is null', () => {
    const html = buildHtml([makeItem()], { startDateIso: null });
    expect(html).toContain('Día 1 · ');
    expect(html).not.toContain('Día 1 — ');
  });

  it('document shell: title, lang, charset and embedded auto-print script', () => {
    const html = buildHtml([makeItem()]);
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<html lang="es">');
    expect(html).toContain('<meta charset="UTF-8" />');
    expect(html).toContain('<title>Minuto a Minuto — Buen Despacho</title>');
    expect(html).toContain(`history.replaceState(null, '', "/imprimir/minuto-a-minuto-buen-despacho")`);
    expect(html).toContain('window.print()');
    expect(html).toContain('window.close()');
  });

  it('a 56-item day renders exactly 56 tbody rows (page budget guard)', () => {
    const items = Array.from({ length: 56 }, (_, i) =>
      makeItem({ day: 2, startTime: `2026-10-17T${String(6 + Math.floor(i / 6)).padStart(2, '0')}:${String((i % 6) * 10).padStart(2, '0')}:00.000Z` }),
    );
    const html = buildHtml(items);
    const tbody = html.split('<tbody>')[1].split('</tbody>')[0];
    expect(tbody.match(/<tr class="t-/g)).toHaveLength(56);
  });
});

describe('openMamCompactPrint', () => {
  it('reports a blocked popup through the callback and returns false', () => {
    // Acceptance criterion 6: a blocked popup must surface to the view (which
    // toasts the instruction), never fail silently.
    const spy = vi.spyOn(window, 'open').mockReturnValue(null);
    const onPopupBlocked = vi.fn();
    const ok = openMamCompactPrint(
      {
        items: [makeItem()],
        responsabilities: [],
        retreatLabel: 'Buen Despacho',
        startDateIso: null,
      },
      { onPopupBlocked },
    );
    expect(ok).toBe(false);
    expect(onPopupBlocked).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
