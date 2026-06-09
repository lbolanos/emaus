// Regresión (2026-06-08): crear una actividad del minuto a minuto devolvía 400
// porque CreateRetreatScheduleItemSchema heredaba `endTime` como REQUERIDO de
// RetreatScheduleItemSchema, pero el modal solo manda startTime + durationMinutes
// (el servicio calcula endTime). Fix: endTime es opcional al crear.
//
// Tests de schema puro (sin DB ni TypeORM).

import { describe, it, expect } from '@jest/globals';
import {
  CreateRetreatScheduleItemSchema,
  UpdateRetreatScheduleItemSchema,
} from '@repo/types';

const RETREAT_ID = '4c8173c9-a068-4efe-a936-e3618523bead';
const PARTICIPANT_ID = '11111111-1111-4111-8111-111111111111';

describe('CreateRetreatScheduleItemSchema — endTime opcional', () => {
  it('acepta un body SIN endTime (solo startTime + durationMinutes)', () => {
    const r = CreateRetreatScheduleItemSchema.safeParse({
      body: {
        name: 'Testimonio 1',
        type: 'testimonio',
        day: 1,
        startTime: '2026-06-05T22:00:00.000Z',
        durationMinutes: 50,
      },
      params: { retreatId: RETREAT_ID },
    });
    expect(r.success).toBe(true);
  });

  it('sigue aceptando un body CON endTime explícito', () => {
    const r = CreateRetreatScheduleItemSchema.safeParse({
      body: {
        name: 'Charla',
        startTime: '2026-06-05T22:00:00.000Z',
        endTime: '2026-06-05T22:50:00.000Z',
      },
      params: { retreatId: RETREAT_ID },
    });
    expect(r.success).toBe(true);
  });

  it('acepta responsableParticipantIds (apoyos)', () => {
    const r = CreateRetreatScheduleItemSchema.safeParse({
      body: {
        name: 'Misa',
        startTime: '2026-06-05T22:00:00.000Z',
        responsableParticipantIds: [PARTICIPANT_ID],
      },
      params: { retreatId: RETREAT_ID },
    });
    expect(r.success).toBe(true);
  });

  it('rechaza un body sin name', () => {
    const r = CreateRetreatScheduleItemSchema.safeParse({
      body: { startTime: '2026-06-05T22:00:00.000Z' },
      params: { retreatId: RETREAT_ID },
    });
    expect(r.success).toBe(false);
  });

  it('coacciona responsabilityId "" → null (tolera el <select> vacío)', () => {
    const r = CreateRetreatScheduleItemSchema.safeParse({
      body: {
        name: 'Logística',
        startTime: '2026-06-05T22:00:00.000Z',
        responsabilityId: '',
      },
      params: { retreatId: RETREAT_ID },
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.body.responsabilityId).toBeNull();
  });
});

describe('UpdateRetreatScheduleItemSchema — todo parcial', () => {
  it('acepta solo durationMinutes (caso "Ajustar duración")', () => {
    const r = UpdateRetreatScheduleItemSchema.safeParse({
      body: { durationMinutes: 30 },
      params: { id: RETREAT_ID },
    });
    expect(r.success).toBe(true);
  });

  it('acepta solo day (mover de día) sin startTime/endTime', () => {
    const r = UpdateRetreatScheduleItemSchema.safeParse({
      body: { day: 3 },
      params: { id: RETREAT_ID },
    });
    expect(r.success).toBe(true);
  });
});
