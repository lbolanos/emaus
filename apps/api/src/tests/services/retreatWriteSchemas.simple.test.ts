// Guard de regresión para una CLASE de bug recurrente (incidente 2026-07-09):
//
//   Un campo Zod `.optional()` con validación de FORMATO (regex/url/email/datetime)
//   RECHAZA el string vacío `''` y devuelve 400 "Validation error", aunque sea
//   "opcional". `.optional()` solo salta `undefined`, no `''`.
//
//   El cliente manda `''` para inputs vacíos, sobre todo al armar el payload de
//   create con spread del DTO: `emit('submit', { ...formData.value })`. Cada campo
//   vacío viaja como `''` → falla el formato.
//
//   Bug real: no se podía crear un retiro porque `walkerArrivalTime` y
//   `serverArrivalTimeFriday` (formato HH:MM, opcionales) llegaban como `''`.
//
// Regla: los campos opcionales con formato DEBEN tolerar `''`/`null` (normalizándolos
// a `undefined`) sin dejar de validar valores con formato inválido. Este test lo
// verifica contra el schema de escritura real.
//
// Doc: docs/features/retreat-form-validation-and-error-messages.md

import { describe, it, expect } from '@jest/globals';
import { createRetreatSchema, updateRetreatSchema } from '@repo/types';

const HOUSE_ID = '4c8173c9-a068-4efe-a936-e3618523bead';

const baseBody = {
  parish: 'Parroquia de Prueba',
  startDate: new Date('2026-08-28T00:00:00.000Z'),
  endDate: new Date('2026-08-30T00:00:00.000Z'),
  houseId: HOUSE_ID,
};

describe('createRetreatSchema — tolerancia de horas de llegada vacías', () => {
  it('acepta walker/serverArrivalTime = "" y los normaliza a undefined', () => {
    const res = createRetreatSchema.shape.body.safeParse({
      ...baseBody,
      walkerArrivalTime: '',
      serverArrivalTimeFriday: '',
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.walkerArrivalTime).toBeUndefined();
      expect(res.data.serverArrivalTimeFriday).toBeUndefined();
    }
  });

  it('acepta null y lo normaliza a undefined', () => {
    const res = createRetreatSchema.shape.body.safeParse({
      ...baseBody,
      walkerArrivalTime: null,
    });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.walkerArrivalTime).toBeUndefined();
  });

  it('acepta un valor HH:MM válido', () => {
    const res = createRetreatSchema.shape.body.safeParse({
      ...baseBody,
      walkerArrivalTime: '18:30',
      serverArrivalTimeFriday: '09:00',
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.walkerArrivalTime).toBe('18:30');
      expect(res.data.serverArrivalTimeFriday).toBe('09:00');
    }
  });

  it('sigue rechazando formatos inválidos (no es "cualquier string")', () => {
    for (const bad of ['25:00', '10:99', '9', 'mañana', '9:5']) {
      const res = createRetreatSchema.shape.body.safeParse({ ...baseBody, walkerArrivalTime: bad });
      expect(res.success).toBe(false);
    }
  });

  it('el update (partial) también tolera "" en las horas', () => {
    const res = updateRetreatSchema.shape.body.safeParse({
      walkerArrivalTime: '',
      serverArrivalTimeFriday: '',
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.walkerArrivalTime).toBeUndefined();
      expect(res.data.serverArrivalTimeFriday).toBeUndefined();
    }
  });
});
