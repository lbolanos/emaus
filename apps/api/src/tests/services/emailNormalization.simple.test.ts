// Saneo de correos capturados en formularios (bug 2026-08-14, Celaya V):
//
//   El autocompletado de Contactos de iOS pega el valor con espacios al borde y
//   con caracteres de formato Unicode invisibles (marcas bidi, BOM). `.email()`
//   los rechaza mientras el correo se ve perfecto en la pantalla del teléfono,
//   así que el registro se queda clavado sin un error que el usuario entienda.
//
// Cubre el helper compartido `@repo/types/text` y su aplicación en
// `participantSchema`, que usan tanto el formulario (web) como el API.

import { describe, it, expect } from '@jest/globals';
import { normalizeEmail, stripInvisibleFormatChars, participantSchema } from '@repo/types';

const BIDI_ISOLATE_START = '\u202D';
const BIDI_ISOLATE_END = '\u202C';
const ZERO_WIDTH_SPACE = '\u200B';
const BOM = '\uFEFF';

describe('stripInvisibleFormatChars', () => {
  it('quita marcas bidi, espacios de ancho cero y BOM', () => {
    expect(stripInvisibleFormatChars(`${BIDI_ISOLATE_START}hola${BIDI_ISOLATE_END}`)).toBe('hola');
    expect(stripInvisibleFormatChars(`ho${ZERO_WIDTH_SPACE}la`)).toBe('hola');
    expect(stripInvisibleFormatChars(`${BOM}hola`)).toBe('hola');
  });

  it('NO toca espacios normales ni caracteres visibles (incluidos acentos)', () => {
    expect(stripInvisibleFormatChars(' José Pérez ')).toBe(' José Pérez ');
  });
});

describe('normalizeEmail', () => {
  it('quita invisibles y espacios de los bordes', () => {
    expect(normalizeEmail(`${BIDI_ISOLATE_START}ajgarcilazo@aol.com${BIDI_ISOLATE_END}`)).toBe(
      'ajgarcilazo@aol.com',
    );
    expect(normalizeEmail('  ajgarcilazo@aol.com ')).toBe('ajgarcilazo@aol.com');
  });

  it('NO cambia mayúsculas/minúsculas ni el contenido visible del correo', () => {
    expect(normalizeEmail('Ajgarcilazo@AOL.com')).toBe('Ajgarcilazo@AOL.com');
  });

  it('vacío/null/undefined → cadena vacía', () => {
    expect(normalizeEmail('')).toBe('');
    expect(normalizeEmail(null)).toBe('');
    expect(normalizeEmail(undefined)).toBe('');
  });
});

describe('participantSchema — correos del autofill', () => {
  // El mismo recorte que hace el formulario público al enviar el registro:
  // las fechas de auditoría las pone el servidor, no vienen del navegador.
  const registrationFormSchema = participantSchema.omit({
    id: true,
    registrationDate: true,
    lastUpdatedDate: true,
  });

  const baseParticipant = {
    retreatId: '3ca8848c-354a-4371-9806-25ad3c12d547',
    type: 'server' as const,
    firstName: 'Adrian',
    lastName: 'Garcilazo Ruiz',
    nickname: 'Sin apodo',
    birthDate: new Date('1969-09-08'),
    maritalStatus: 'C' as const,
    street: 'Calle',
    houseNumber: '1',
    postalCode: '53100',
    neighborhood: 'Echegaray',
    city: 'Naucalpan',
    state: 'Estado de México',
    country: 'MX',
    cellPhone: '5530978314',
    occupation: 'Comerciante',
    snores: false,
    hasMedication: false,
    hasDietaryRestrictions: false,
    sacraments: ['baptism' as const],
    emergencyContact1Name: 'Contacto',
    emergencyContact1Relation: 'Esposa',
    emergencyContact1CellPhone: '5512345678',
    isCancelled: false,
  };

  it('acepta y limpia un correo con marcas invisibles y espacios', () => {
    const result = registrationFormSchema.safeParse({
      ...baseParticipant,
      email: ` ${BIDI_ISOLATE_START}ajgarcilazo@aol.com${BIDI_ISOLATE_END} `,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      // Se persiste el correo ya saneado, no el que llegó del teclado.
      expect(result.data.email).toBe('ajgarcilazo@aol.com');
    }
  });

  it('limpia también los correos opcionales de contactos de emergencia', () => {
    const result = registrationFormSchema.safeParse({
      ...baseParticipant,
      email: 'ajgarcilazo@aol.com',
      emergencyContact1Email: `${BIDI_ISOLATE_START}contacto@ejemplo.com${BIDI_ISOLATE_END}`,
      emergencyContact2Email: '   ',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.emergencyContact1Email).toBe('contacto@ejemplo.com');
      // Un opcional que solo traía espacios queda ausente, no como cadena inválida.
      expect(result.data.emergencyContact2Email).toBeUndefined();
    }
  });

  it('sigue rechazando un correo realmente inválido', () => {
    const result = registrationFormSchema.safeParse({
      ...baseParticipant,
      email: 'ajgarcilazo@',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      // Falla por el correo, no de rebote por otro campo del fixture.
      expect(result.error.errors.map((e) => e.path.join('.'))).toContain('email');
    }
  });
});
