// Guard del consentimiento expreso para datos personales sensibles.
//
// Los datos de salud del participante (medicamentos y horarios, restricciones
// alimentarias, apoyos por capacidad diferente) son datos sensibles bajo la
// LFPDPPP art. 9, que exige consentimiento EXPRESO — distinto del genérico que
// se recaba para el aviso de privacidad.
//
// El endpoint de registro es público, así que la regla no puede vivir solo en
// el formulario: `createParticipantSchema` debe rechazar el alta que declara
// salud sin la autorización, y aceptar la que no declara ninguna.

import { describe, it, expect } from '@jest/globals';
import { createParticipantSchema } from '@repo/types';

const baseWalker = {
  type: 'walker' as const,
  firstName: 'Ana',
  lastName: 'Ramírez',
  nickname: 'Ana',
  birthDate: '1990-04-12',
  maritalStatus: 'S' as const,
  street: 'Calle Falsa',
  houseNumber: '123',
  postalCode: '01000',
  neighborhood: 'Centro',
  city: 'Ciudad de México',
  state: 'CDMX',
  country: 'México',
  cellPhone: '5512345678',
  email: 'ana@example.com',
  occupation: 'Docente',
  snores: false,
  hasMedication: false,
  hasDietaryRestrictions: false,
  sacraments: ['baptism' as const],
  emergencyContact1Name: 'Luis Ramírez',
  emergencyContact1Relation: 'Hermano',
  emergencyContact1CellPhone: '5587654321',
  acceptedPrivacyNotice: true,
};

const parse = (body: Record<string, unknown>) =>
  createParticipantSchema.safeParse({ body });

describe('createParticipantSchema — consentimiento de datos sensibles', () => {
  it('acepta el registro sin datos de salud y sin la casilla', () => {
    const result = parse(baseWalker);
    expect(result.success).toBe(true);
  });

  it.each([
    ['medicación', { hasMedication: true, medicationDetails: 'Insulina', medicationSchedule: '8:00' }],
    ['restricción alimentaria', { hasDietaryRestrictions: true, dietaryRestrictionsDetails: 'Celiaquía' }],
    ['apoyo por capacidad diferente', { disabilitySupport: 'Movilidad' }],
  ])('rechaza declarar %s sin consentimiento expreso', (_label, healthData) => {
    const result = parse({ ...baseWalker, ...healthData });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.errors.map((e) => e.path.join('.'));
      expect(paths).toContain('body.acceptedSensitiveDataConsent');
    }
  });

  it('acepta declarar salud cuando se otorga el consentimiento', () => {
    const result = parse({
      ...baseWalker,
      hasMedication: true,
      medicationDetails: 'Insulina',
      medicationSchedule: '8:00',
      acceptedSensitiveDataConsent: true,
    });

    expect(result.success).toBe(true);
  });

  it('sigue exigiendo el aviso de privacidad genérico', () => {
    const result = parse({ ...baseWalker, acceptedPrivacyNotice: false });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.errors.map((e) => e.path.join('.'));
      expect(paths).toContain('body.acceptedPrivacyNotice');
    }
  });
});
