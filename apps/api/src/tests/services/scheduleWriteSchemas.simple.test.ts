// Guard de regresión para una CLASE de bug recurrente (2026-06-08):
//
//   Los schemas de ESCRITURA (Create/Update*) se derivan de los schemas de la
//   ENTIDAD (que incluyen campos read-only/derivados como `attachments`,
//   `templateDescription`, `responsables`, `endTime`). Si el cliente reenvía el
//   DTO de LECTURA completo (p.ej. `{ ...item }`), esos campos viajan en el body;
//   y como `ResponsabilityAttachmentSchema.storageUrl` es requerido, el attachment
//   parcial que devuelve el list revienta con 400.
//
//   Bugs reales de esta clase en esta sesión:
//     - editar item de Template MaM → 400 (attachments.0.storageUrl required)
//     - crear actividad → 400 (endTime required)
//
// Regla: los schemas de escritura DEBEN tolerar el DTO de lectura completo
// (omitiendo/ignorando los campos read-only). Este test lo verifica enviando un
// DTO de lectura "sucio" (con attachments SIN storageUrl) y exigiendo que pase.

import { describe, it, expect } from '@jest/globals';
import {
  CreateRetreatScheduleItemSchema,
  UpdateRetreatScheduleItemSchema,
  CreateScheduleTemplateSchema,
  UpdateScheduleTemplateSchema,
} from '@repo/types';

const RETREAT_ID = '4c8173c9-a068-4efe-a936-e3618523bead';
const ITEM_ID = '11111111-1111-4111-8111-111111111111';
const SET_ID = '22222222-2222-4222-8222-222222222222';
const PARTICIPANT_ID = '33333333-3333-4333-8333-333333333333';

// Attachment como lo devuelve el list: parcial, SIN `storageUrl` (el campo que
// hacía fallar la validación). Si el schema de escritura lo valida → 400.
const partialAttachment = {
  id: '44444444-4444-4444-8444-444444444444',
  responsabilityName: 'Comedor',
  kind: 'file',
  fileName: 'guion.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1234,
};

// DTO de lectura completo de un RetreatScheduleItem (como lo regresa /items).
const fullRetreatItem = {
  id: ITEM_ID,
  retreatId: RETREAT_ID,
  scheduleTemplateId: null,
  name: 'Charla',
  type: 'charla',
  day: 1,
  startTime: '2026-06-05T22:00:00.000Z',
  endTime: '2026-06-05T22:50:00.000Z',
  durationMinutes: 50,
  orderInDay: 0,
  status: 'pending',
  responsabilityId: null,
  location: null,
  notes: null,
  musicTrackUrl: null,
  palanquitaNotes: null,
  planBNotes: null,
  blocksSantisimoAttendance: false,
  actualStartTime: null,
  actualEndTime: null,
  responsables: [{ participantId: PARTICIPANT_ID, role: null }],
  attachments: [partialAttachment],
  templateDescription: 'Contexto de la actividad',
};

// DTO de lectura completo de un ScheduleTemplate (como lo regresa /schedule-templates).
const fullTemplate = {
  id: ITEM_ID,
  templateSetId: SET_ID,
  name: 'Llegada de servidores',
  description: 'desc',
  type: 'logistica',
  defaultDurationMinutes: 60,
  defaultOrder: 0,
  defaultDay: 1,
  defaultStartTime: '12:00',
  requiresResponsable: false,
  responsabilityName: 'Logistica',
  palanquitaNotes: null,
  planBNotes: null,
  blocksSantisimoAttendance: false,
  isActive: true,
  attachments: [partialAttachment],
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
};

describe('Write schemas toleran el DTO de lectura completo (anti-400)', () => {
  it('CreateRetreatScheduleItemSchema acepta el item de lectura completo (attachments parciales incluidos)', () => {
    const r = CreateRetreatScheduleItemSchema.safeParse({
      body: fullRetreatItem,
      params: { retreatId: RETREAT_ID },
    });
    expect(r.success).toBe(true);
    if (r.success) {
      // Los campos read-only se descartan, no llegan al servicio.
      expect(r.data.body).not.toHaveProperty('attachments');
      expect(r.data.body).not.toHaveProperty('templateDescription');
      expect(r.data.body).not.toHaveProperty('responsables');
    }
  });

  it('UpdateRetreatScheduleItemSchema acepta el item de lectura completo', () => {
    const r = UpdateRetreatScheduleItemSchema.safeParse({
      body: fullRetreatItem,
      params: { id: ITEM_ID },
    });
    expect(r.success).toBe(true);
  });

  it('CreateScheduleTemplateSchema acepta el template de lectura completo (attachments parciales incluidos)', () => {
    const r = CreateScheduleTemplateSchema.safeParse({ body: fullTemplate });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.body).not.toHaveProperty('attachments');
  });

  it('UpdateScheduleTemplateSchema acepta el template de lectura completo', () => {
    const r = UpdateScheduleTemplateSchema.safeParse({
      body: fullTemplate,
      params: { id: ITEM_ID },
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.body).not.toHaveProperty('attachments');
  });
});
