import { describe, it, expect } from 'vitest';
import {
  gapAfter,
  durationToFill,
  hhmmToDayMinutes,
  dayMinutesToHHMM,
  templateGap,
  retreatGapAfter,
  templateGapAfter,
  computeCompactPlan,
} from '@/views/mamTime';

describe('gapAfter — detección de hueco/solape entre actividades', () => {
  it('hueco positivo cuando la siguiente empieza después del fin', () => {
    // 10:00–10:15, siguiente a las 10:30 → hueco de 15 min
    expect(
      gapAfter('2026-06-05T10:15:00.000Z', '2026-06-05T10:30:00.000Z'),
    ).toBe(15);
  });

  it('solape negativo cuando la siguiente empieza antes del fin', () => {
    // 10:00–11:00, siguiente a las 10:30 → se encima 30 min
    expect(
      gapAfter('2026-06-05T11:00:00.000Z', '2026-06-05T10:30:00.000Z'),
    ).toBe(-30);
  });

  it('cero cuando encajan exactamente', () => {
    expect(
      gapAfter('2026-06-05T10:15:00.000Z', '2026-06-05T10:15:00.000Z'),
    ).toBe(0);
  });

  it('redondea segundos al minuto más cercano', () => {
    // 40 s ≈ 1 min
    expect(
      gapAfter('2026-06-05T10:00:00.000Z', '2026-06-05T10:00:40.000Z'),
    ).toBe(1);
  });
});

describe('durationToFill — duración para terminar al iniciar la siguiente', () => {
  it('calcula la duración desde el inicio actual hasta el inicio del siguiente', () => {
    // inicio 10:00, siguiente 10:45 → 45 min
    expect(
      durationToFill('2026-06-05T10:00:00.000Z', '2026-06-05T10:45:00.000Z'),
    ).toBe(45);
  });

  it('al ajustar un solape acorta la duración al hueco real', () => {
    // inicio 10:00 (duraba 60), siguiente 10:30 → nueva duración 30
    expect(
      durationToFill('2026-06-05T10:00:00.000Z', '2026-06-05T10:30:00.000Z'),
    ).toBe(30);
  });

  it('cruza medianoche correctamente (after-midnight)', () => {
    // inicio 23:50, siguiente 00:10 del día siguiente → 20 min
    expect(
      durationToFill('2026-06-05T23:50:00.000Z', '2026-06-06T00:10:00.000Z'),
    ).toBe(20);
  });
});

describe('hhmmToDayMinutes — minutos del día con offset after-midnight', () => {
  it('hora normal de la tarde', () => {
    expect(hhmmToDayMinutes('21:00')).toBe(21 * 60);
  });

  it('madrugada (< 06:00) se corre al día siguiente (+1440)', () => {
    expect(hhmmToDayMinutes('00:10')).toBe(10 + 1440);
    expect(hhmmToDayMinutes('05:59')).toBe(5 * 60 + 59 + 1440);
  });

  it('06:00 ya NO es madrugada', () => {
    expect(hhmmToDayMinutes('06:00')).toBe(6 * 60);
  });

  it('null/invalid → null', () => {
    expect(hhmmToDayMinutes('')).toBeNull();
    expect(hhmmToDayMinutes(null)).toBeNull();
    expect(hhmmToDayMinutes('25:00')).toBeNull();
    expect(hhmmToDayMinutes('abc')).toBeNull();
  });
});

describe('dayMinutesToHHMM — formato con wrap de medianoche', () => {
  it('formatea minutos normales', () => {
    expect(dayMinutesToHHMM(21 * 60)).toBe('21:00');
    expect(dayMinutesToHHMM(9 * 60 + 5)).toBe('09:05');
  });

  it('envuelve valores ≥ 1440 (after-midnight)', () => {
    expect(dayMinutesToHHMM(1440 + 10)).toBe('00:10');
  });

  it('envuelve negativos', () => {
    expect(dayMinutesToHHMM(-30)).toBe('23:30');
  });
});

describe('templateGap — hueco/solape entre items de template (HH:MM)', () => {
  it('hueco', () => {
    // 09:00 + 30 = 09:30, siguiente 10:00 → hueco 30
    expect(templateGap('09:00', 30, '10:00')).toBe(30);
  });

  it('solape', () => {
    // 09:00 + 60 = 10:00, siguiente 09:30 → se encima 30
    expect(templateGap('09:00', 60, '09:30')).toBe(-30);
  });

  it('encaja exacto → 0', () => {
    expect(templateGap('09:00', 60, '10:00')).toBe(0);
  });

  it('noche → madrugada: 23:30+30=00:00, siguiente 00:10 → hueco 10', () => {
    expect(templateGap('23:30', 30, '00:10')).toBe(10);
  });

  it('falta alguna hora → null', () => {
    expect(templateGap(null, 30, '10:00')).toBeNull();
    expect(templateGap('09:00', 30, null)).toBeNull();
  });
});

describe('retreatGapAfter — block-aware sobre items del retiro (ISO + status)', () => {
  const item = (start: string, end: string, status = 'pending') => ({
    startTime: start,
    endTime: end,
    status,
  });

  it('hueco entre dos items secuenciales', () => {
    const items = [
      item('2026-06-05T10:00:00Z', '2026-06-05T10:15:00Z'),
      item('2026-06-05T10:30:00Z', '2026-06-05T10:45:00Z'),
    ];
    expect(retreatGapAfter(items, 0)).toBe(15);
  });

  it('solape entre dos items secuenciales', () => {
    const items = [
      item('2026-06-05T10:00:00Z', '2026-06-05T11:00:00Z'),
      item('2026-06-05T10:30:00Z', '2026-06-05T10:45:00Z'),
    ];
    expect(retreatGapAfter(items, 0)).toBe(-30);
  });

  it('NO marca solape entre actividades en paralelo (mismo startTime)', () => {
    const items = [
      item('2026-06-05T20:40:00Z', '2026-06-05T21:10:00Z'), // revisión cuartos
      item('2026-06-05T20:40:00Z', '2026-06-05T21:10:00Z'), // revisión salón (paralelo)
      item('2026-06-05T21:10:00Z', '2026-06-05T21:25:00Z'),
    ];
    // entre los dos paralelos (idx 0): null (no es transición)
    expect(retreatGapAfter(items, 0)).toBeNull();
    // entre el último del bloque (idx 1) y el siguiente (idx 2): encajan → null
    expect(retreatGapAfter(items, 1)).toBeNull();
  });

  it('usa el MÁX endTime del bloque paralelo para el gap al siguiente', () => {
    const items = [
      item('2026-06-05T20:40:00Z', '2026-06-05T21:00:00Z'), // termina 21:00
      item('2026-06-05T20:40:00Z', '2026-06-05T21:10:00Z'), // termina 21:10 (más largo)
      item('2026-06-05T21:30:00Z', '2026-06-05T21:45:00Z'),
    ];
    // gap = 21:30 - 21:10 (máx del bloque) = 20
    expect(retreatGapAfter(items, 1)).toBe(20);
  });

  it('ignora cuando bloque y siguiente están completados', () => {
    const items = [
      item('2026-06-05T10:00:00Z', '2026-06-05T10:15:00Z', 'completed'),
      item('2026-06-05T10:30:00Z', '2026-06-05T10:45:00Z', 'completed'),
    ];
    expect(retreatGapAfter(items, 0)).toBeNull();
  });

  it('sí marca si al menos uno no está completado', () => {
    const items = [
      item('2026-06-05T10:00:00Z', '2026-06-05T10:15:00Z', 'completed'),
      item('2026-06-05T10:30:00Z', '2026-06-05T10:45:00Z', 'pending'),
    ];
    expect(retreatGapAfter(items, 0)).toBe(15);
  });

  it('último item del día → null (sin siguiente)', () => {
    const items = [item('2026-06-05T10:00:00Z', '2026-06-05T10:15:00Z')];
    expect(retreatGapAfter(items, 0)).toBeNull();
  });
});

describe('templateGapAfter — block-aware sobre items de template (HH:MM + after-midnight)', () => {
  const t = (defaultStartTime: string | null, defaultDurationMinutes = 15) => ({
    defaultStartTime,
    defaultDurationMinutes,
  });

  it('hueco entre items secuenciales', () => {
    const items = [t('09:00', 15), t('09:30', 15)];
    expect(templateGapAfter(items, 0)).toBe(15);
  });

  it('solape entre items secuenciales', () => {
    const items = [t('09:00', 60), t('09:30', 15)];
    expect(templateGapAfter(items, 0)).toBe(-30);
  });

  it('NO marca solape entre paralelos (mismo defaultStartTime)', () => {
    const items = [t('20:40', 30), t('20:40', 30), t('21:10', 15)];
    expect(templateGapAfter(items, 0)).toBeNull(); // entre paralelos
    expect(templateGapAfter(items, 1)).toBeNull(); // bloque encaja con el siguiente
  });

  it('after-midnight: noche (23:30, 30 min) → madrugada (00:10) = hueco 10', () => {
    // 00:10 se ordena DESPUÉS de 23:30 gracias al offset +1440
    const items = [t('23:30', 30), t('00:10', 20)];
    expect(templateGapAfter(items, 0)).toBe(10);
  });

  it('item sin hora → null', () => {
    const items = [t(null, 15), t('09:00', 15)];
    expect(templateGapAfter(items, 0)).toBeNull();
  });

  it('último item → null', () => {
    expect(templateGapAfter([t('09:00', 15)], 0)).toBeNull();
  });
});

describe('computeCompactPlan — cerrar huecos/solapes en cascada', () => {
  it('mueve el siguiente para cerrar un hueco', () => {
    const plan = computeCompactPlan([
      { id: 'a', start: 0, end: 15 },
      { id: 'b', start: 30, end: 45 },
    ]);
    expect(plan).toEqual([{ id: 'b', start: 15 }]);
  });

  it('mueve el siguiente para cerrar un solape', () => {
    const plan = computeCompactPlan([
      { id: 'a', start: 0, end: 60 },
      { id: 'b', start: 30, end: 45 },
    ]);
    expect(plan).toEqual([{ id: 'b', start: 60 }]);
  });

  it('respeta bloques paralelos (mismo start) usando el fin máximo', () => {
    const plan = computeCompactPlan([
      { id: 'a', start: 0, end: 30 },
      { id: 'a2', start: 0, end: 20 }, // paralelo a 'a'
      { id: 'b', start: 40, end: 55 },
    ]);
    // bloque 0 termina en 30 (máx) → b se mueve a 30; a/a2 no se tocan
    expect(plan).toEqual([{ id: 'b', start: 30 }]);
  });

  it('cascada: cada bloque arranca cuando termina el anterior', () => {
    const plan = computeCompactPlan([
      { id: 'a', start: 0, end: 15 },
      { id: 'b', start: 30, end: 45 }, // dur 15
      { id: 'c', start: 60, end: 75 }, // dur 15
    ]);
    // a fija; b→15 (fin 30); c→30
    expect(plan).toEqual([
      { id: 'b', start: 15 },
      { id: 'c', start: 30 },
    ]);
  });

  it('día ya compacto → plan vacío', () => {
    expect(
      computeCompactPlan([
        { id: 'a', start: 0, end: 15 },
        { id: 'b', start: 15, end: 30 },
      ]),
    ).toEqual([]);
  });

  it('un solo item → plan vacío', () => {
    expect(computeCompactPlan([{ id: 'a', start: 0, end: 15 }])).toEqual([]);
  });
});
