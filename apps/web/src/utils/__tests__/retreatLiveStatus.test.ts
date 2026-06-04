import { describe, it, expect } from 'vitest';
import {
  toYmd,
  todayYmdInTz,
  ymdToUtcMillis,
  addDaysYmd,
  isRetreatLive,
  daysUntilRetreat,
  RETREAT_GRACE_DAYS_BEFORE,
  DEFAULT_RETREAT_TIMEZONE,
} from '../retreatLiveStatus';

// Instantes de referencia. Recordar: CDMX = UTC-6 (sin DST).
// 21:00 UTC del jueves 4 = 15:00 (3 PM) en CDMX, sigue siendo jueves 4.
const THU_3PM_CDMX = new Date('2026-06-04T21:00:00Z');
// 03:00 UTC del viernes 5 = 21:00 (9 PM) del jueves 4 en CDMX (aún jueves).
const THU_9PM_CDMX = new Date('2026-06-05T03:00:00Z');
// 21:00 UTC del miércoles 3 = 15:00 del miércoles 3 en CDMX.
const WED_3PM_CDMX = new Date('2026-06-03T21:00:00Z');

describe('toYmd', () => {
  it('toma los primeros 10 chars de un string de fecha-solo', () => {
    expect(toYmd('2026-06-05')).toBe('2026-06-05');
  });

  it('toma la parte de fecha de un ISO completo sin shift', () => {
    expect(toYmd('2026-06-05T00:00:00.000Z')).toBe('2026-06-05');
  });

  it('lee componentes UTC de un Date (columna date guardada a medianoche UTC)', () => {
    expect(toYmd(new Date('2026-06-05T00:00:00.000Z'))).toBe('2026-06-05');
  });

  it('devuelve null para null/undefined/empty', () => {
    expect(toYmd(null)).toBeNull();
    expect(toYmd(undefined)).toBeNull();
    expect(toYmd('')).toBeNull();
  });
});

describe('todayYmdInTz', () => {
  it('jueves 3 PM CDMX → jueves 4', () => {
    expect(todayYmdInTz('America/Mexico_City', THU_3PM_CDMX)).toBe('2026-06-04');
  });

  it('jueves 9 PM CDMX sigue siendo jueves 4 aunque en UTC ya sea viernes', () => {
    expect(todayYmdInTz('America/Mexico_City', THU_9PM_CDMX)).toBe('2026-06-04');
  });

  it('mismo instante en Madrid (UTC+2 en verano) ya es viernes 5', () => {
    // 03:00 UTC = 05:00 en Madrid (CEST) → viernes 5
    expect(todayYmdInTz('Europe/Madrid', THU_9PM_CDMX)).toBe('2026-06-05');
  });

  it('default es America/Mexico_City', () => {
    expect(todayYmdInTz(undefined, THU_3PM_CDMX)).toBe('2026-06-04');
    expect(DEFAULT_RETREAT_TIMEZONE).toBe('America/Mexico_City');
  });
});

describe('ymdToUtcMillis / addDaysYmd', () => {
  it('ymdToUtcMillis ancla a medianoche UTC', () => {
    expect(ymdToUtcMillis('2026-06-05')).toBe(Date.UTC(2026, 5, 5));
  });

  it('addDaysYmd resta cruzando fin de mes', () => {
    expect(addDaysYmd('2026-06-01', -1)).toBe('2026-05-31');
  });

  it('addDaysYmd suma cruzando fin de año', () => {
    expect(addDaysYmd('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('isRetreatLive — escenario San Agustín (inicia viernes, hoy jueves)', () => {
  const sanAgustin = {
    startDate: '2026-06-05', // viernes
    endDate: '2026-06-07', // domingo
    timezone: 'America/Mexico_City',
  };

  it('jueves (día de gracia) → en vivo', () => {
    expect(isRetreatLive(sanAgustin, THU_3PM_CDMX)).toBe(true);
  });

  it('jueves 9 PM CDMX (cerca de medianoche UTC) sigue en vivo, NO se adelanta', () => {
    expect(isRetreatLive(sanAgustin, THU_9PM_CDMX)).toBe(true);
  });

  it('miércoles → NO en vivo (el bug viejo lo activaba aquí)', () => {
    expect(isRetreatLive(sanAgustin, WED_3PM_CDMX)).toBe(false);
  });

  it('viernes (inicio real) → en vivo', () => {
    expect(isRetreatLive(sanAgustin, new Date('2026-06-05T21:00:00Z'))).toBe(true);
  });

  it('domingo (fin, inclusive) → en vivo', () => {
    expect(isRetreatLive(sanAgustin, new Date('2026-06-07T21:00:00Z'))).toBe(true);
  });

  it('lunes (después del fin) → NO en vivo', () => {
    expect(isRetreatLive(sanAgustin, new Date('2026-06-08T21:00:00Z'))).toBe(false);
  });
});

describe('isRetreatLive — timezone configurable', () => {
  it('respeta la timezone del retiro (Bogotá UTC-5)', () => {
    const bogota = { startDate: '2026-06-05', endDate: '2026-06-07', timezone: 'America/Bogota' };
    // 04:00 UTC viernes 5 = 23:00 jueves 4 en Bogotá → día de gracia, en vivo
    expect(isRetreatLive(bogota, new Date('2026-06-05T04:00:00Z'))).toBe(true);
    // 04:00 UTC jueves 4 = 23:00 miércoles 3 en Bogotá → fuera de gracia
    expect(isRetreatLive(bogota, new Date('2026-06-04T04:00:00Z'))).toBe(false);
  });

  it('usa el default cuando timezone es null', () => {
    const r = { startDate: '2026-06-05', endDate: '2026-06-07', timezone: null };
    expect(isRetreatLive(r, THU_3PM_CDMX)).toBe(true);
  });

  it('acepta startDate/endDate como Date', () => {
    const r = {
      startDate: new Date('2026-06-05T00:00:00Z'),
      endDate: new Date('2026-06-07T00:00:00Z'),
      timezone: 'America/Mexico_City',
    };
    expect(isRetreatLive(r, THU_3PM_CDMX)).toBe(true);
    expect(isRetreatLive(r, WED_3PM_CDMX)).toBe(false);
  });
});

describe('isRetreatLive — guards', () => {
  it('null/undefined → false', () => {
    expect(isRetreatLive(null)).toBe(false);
    expect(isRetreatLive(undefined)).toBe(false);
  });

  it('falta startDate o endDate → false', () => {
    expect(isRetreatLive({ startDate: '2026-06-05', endDate: null })).toBe(false);
    expect(isRetreatLive({ startDate: null, endDate: '2026-06-07' })).toBe(false);
  });

  it('el día de gracia es exactamente 1', () => {
    expect(RETREAT_GRACE_DAYS_BEFORE).toBe(1);
  });
});

describe('daysUntilRetreat — escenario San Agustín', () => {
  const r = { startDate: '2026-06-05', timezone: 'America/Mexico_City' };

  it('jueves → 1 (badge "falta 1 día", NO "hoy mismo")', () => {
    expect(daysUntilRetreat(r, THU_3PM_CDMX)).toBe(1);
  });

  it('jueves 9 PM CDMX sigue siendo 1 (no salta a 0 por la medianoche UTC)', () => {
    expect(daysUntilRetreat(r, THU_9PM_CDMX)).toBe(1);
  });

  it('viernes (inicio) → 0', () => {
    expect(daysUntilRetreat(r, new Date('2026-06-05T21:00:00Z'))).toBe(0);
  });

  it('miércoles → 2', () => {
    expect(daysUntilRetreat(r, WED_3PM_CDMX)).toBe(2);
  });

  it('después del inicio → negativo', () => {
    expect(daysUntilRetreat(r, new Date('2026-06-08T21:00:00Z'))).toBe(-3);
  });

  it('sin startDate → null', () => {
    expect(daysUntilRetreat({ startDate: null })).toBeNull();
    expect(daysUntilRetreat(null)).toBeNull();
  });
});
