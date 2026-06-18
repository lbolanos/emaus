// Validación de teléfonos por país del retiro (feature 2026-06-09):
//
//   El registro de caminantes/servidores debe verificar que los teléfonos
//   contengan SOLO dígitos (sin letras/espacios/símbolos) y, según el país del
//   retiro (la casa), tengan la cantidad exacta de dígitos (ej. MX/CO = 10).
//
// Este test cubre el helper compartido `@repo/types/phone` que usan tanto el
// formulario (web) como el controlador (api).

import { describe, it, expect } from '@jest/globals';
import {
  validatePhoneForCountry,
  validateParticipantPhones,
  getPhoneDigitLengths,
  phoneValidationMessage,
  normalizePhone,
  normalizeParticipantPhones,
  toNationalPhone,
} from '@repo/types';

describe('validatePhoneForCountry', () => {
  it('acepta 10 dígitos en México', () => {
    expect(validatePhoneForCountry('5512345678', 'MX').valid).toBe(true);
  });

  it('resuelve país por NOMBRE (no solo ISO): "México"/"Mexico"/"Colombia"', () => {
    // La casa guarda el país como texto libre, no como ISO-2.
    expect(getPhoneDigitLengths('México')).toEqual([10]);
    expect(getPhoneDigitLengths('Mexico')).toEqual([10]);
    expect(getPhoneDigitLengths('  colombia ')).toEqual([10]);
    expect(getPhoneDigitLengths('Estados Unidos')).toEqual([10]);
    expect(getPhoneDigitLengths('España')).toEqual([9]);
    expect(validatePhoneForCountry('551234', 'México').valid).toBe(false);
    expect(validatePhoneForCountry('5512345678', 'México').valid).toBe(true);
  });

  it('acepta 10 dígitos en Colombia (case-insensitive)', () => {
    expect(validatePhoneForCountry('3001234567', 'co').valid).toBe(true);
  });

  it('rechaza menos de 10 dígitos en México', () => {
    const r = validatePhoneForCountry('551234', 'MX');
    expect(r.valid).toBe(false);
    expect(r.error).toBe('wrong_length');
    expect(r.expectedLengths).toEqual([10]);
  });

  it('rechaza más de 10 dígitos en México', () => {
    expect(validatePhoneForCountry('55123456789', 'MX').valid).toBe(false);
  });

  it('rechaza letras', () => {
    const r = validatePhoneForCountry('55ABC45678', 'MX');
    expect(r.valid).toBe(false);
    expect(r.error).toBe('not_digits');
  });

  it('ACEPTA separadores de formato (se normalizan): espacios, guiones, paréntesis, +', () => {
    expect(validatePhoneForCountry('55 1234 5678', 'MX').valid).toBe(true);
    expect(validatePhoneForCountry('(55) 1234-5678', 'MX').valid).toBe(true);
    expect(validatePhoneForCountry('55.1234.5678', 'MX').valid).toBe(true);
  });

  it('rechaza letras incluso con separadores', () => {
    expect(validatePhoneForCountry('55 ABC 5678', 'MX').error).toBe('not_digits');
  });

  it('TOLERA la lada de país (+52 / 52 / 0052) en México', () => {
    // Bug 2026-06-17 (Celaya): la gente y el autocompletado de contactos del
    // celular guardan el número con la lada → no podían avanzar del paso 1.
    expect(validatePhoneForCountry('+52 55 1234 5678', 'MX').valid).toBe(true);
    expect(validatePhoneForCountry('52 55 1234 5678', 'MX').valid).toBe(true);
    expect(validatePhoneForCountry('0052 55 1234 5678', 'MX').valid).toBe(true);
  });

  it('TOLERA prefijos nacionales legados (044 / 045 / 01) en México', () => {
    expect(validatePhoneForCountry('044 55 1234 5678', 'MX').valid).toBe(true);
    expect(validatePhoneForCountry('045 5512345678', 'MX').valid).toBe(true);
    expect(validatePhoneForCountry('01 55 1234 5678', 'MX').valid).toBe(true);
  });

  it('NO acorta de más: un número que ya tiene 10 dígitos no se toca aunque empiece con prefijo', () => {
    // "5512345678" es válido tal cual; no debe recortarse el "55" inicial.
    expect(validatePhoneForCountry('5512345678', 'MX').valid).toBe(true);
    expect(toNationalPhone('5512345678', 'MX')).toBe('5512345678');
  });

  it('sigue rechazando longitudes realmente inválidas (sin prefijo reconocible)', () => {
    // 11 dígitos que no empiezan con lada ni prefijo legado: inválido.
    expect(validatePhoneForCountry('55123456789', 'MX').valid).toBe(false);
    // 8 dígitos: corto, ningún prefijo lo arregla.
    expect(validatePhoneForCountry('12345678', 'MX').valid).toBe(false);
  });

  it('vacío/ausente es válido (la obligatoriedad se valida aparte)', () => {
    expect(validatePhoneForCountry('', 'MX').valid).toBe(true);
    expect(validatePhoneForCountry(undefined, 'MX').valid).toBe(true);
    expect(validatePhoneForCountry(null, 'MX').valid).toBe(true);
  });

  it('país sin regla: solo exige dígitos, sin longitud fija', () => {
    expect(getPhoneDigitLengths('ZZ')).toBeNull();
    expect(validatePhoneForCountry('123', 'ZZ').valid).toBe(true);
    expect(validatePhoneForCountry('12345678901234', 'ZZ').valid).toBe(true);
    expect(validatePhoneForCountry('12ab', 'ZZ').valid).toBe(false);
  });

  it('sin país: solo exige dígitos', () => {
    expect(validatePhoneForCountry('123456', undefined).valid).toBe(true);
    expect(validatePhoneForCountry('12a', undefined).valid).toBe(false);
  });

  it('Brasil acepta 10 u 11 dígitos', () => {
    expect(validatePhoneForCountry('1133334444', 'BR').valid).toBe(true);
    expect(validatePhoneForCountry('11933334444', 'BR').valid).toBe(true);
    expect(validatePhoneForCountry('119333344', 'BR').valid).toBe(false);
  });
});

describe('phoneValidationMessage', () => {
  it('mensaje de longitud única', () => {
    const r = validatePhoneForCountry('123', 'MX');
    expect(phoneValidationMessage(r)).toContain('10 dígitos');
  });

  it('mensaje de longitudes múltiples', () => {
    const r = validatePhoneForCountry('123', 'BR');
    expect(phoneValidationMessage(r)).toContain('10 o 11 dígitos');
  });

  it('mensaje de solo dígitos', () => {
    const r = validatePhoneForCountry('12a', 'MX');
    expect(phoneValidationMessage(r)).toContain('solo puede contener números');
  });

  it('válido devuelve null', () => {
    expect(phoneValidationMessage({ valid: true })).toBeNull();
  });
});

describe('validateParticipantPhones', () => {
  it('reporta cada teléfono inválido (participante + emergencia + invitador)', () => {
    const errors = validateParticipantPhones(
      {
        cellPhone: '5512345678', // ok
        homePhone: '123', // corto
        emergencyContact1CellPhone: '55-1234', // símbolos
        inviterCellPhone: '3001234567', // ok
      },
      'MX',
    );
    const fields = errors.map((e) => e.field).sort();
    expect(fields).toEqual(['emergencyContact1CellPhone', 'homePhone']);
  });

  it('no reporta nada cuando todos son válidos o vacíos', () => {
    const errors = validateParticipantPhones(
      { cellPhone: '5512345678', homePhone: '', inviterCellPhone: undefined },
      'MX',
    );
    expect(errors).toHaveLength(0);
  });
});

describe('normalizePhone', () => {
  it('quita espacios, guiones, paréntesis, puntos y +', () => {
    expect(normalizePhone('(55) 1234-5678')).toBe('5512345678');
    expect(normalizePhone('55.1234.5678')).toBe('5512345678');
    expect(normalizePhone('+52 55 1234 5678')).toBe('525512345678');
  });

  it('vacío/null/undefined → cadena vacía', () => {
    expect(normalizePhone('')).toBe('');
    expect(normalizePhone(null)).toBe('');
    expect(normalizePhone(undefined)).toBe('');
  });

  it('NO quita letras (siguen presentes para que falle la validación)', () => {
    expect(normalizePhone('55ABC5678')).toBe('55ABC5678');
  });
});

describe('toNationalPhone', () => {
  it('canoniza la lada/prefijos al número nacional (con país)', () => {
    expect(toNationalPhone('+52 55 1234 5678', 'MX')).toBe('5512345678');
    expect(toNationalPhone('52 55 1234 5678', 'México')).toBe('5512345678');
    expect(toNationalPhone('044 55 1234 5678', 'MX')).toBe('5512345678');
    expect(toNationalPhone('01 5512345678', 'MX')).toBe('5512345678');
  });

  it('sin país: solo quita separadores (no recorta prefijos)', () => {
    expect(toNationalPhone('+52 55 1234 5678')).toBe('525512345678');
    expect(toNationalPhone('(55) 1234-5678')).toBe('5512345678');
  });

  it('deja intacto lo que no reconoce (letras o prefijo no resoluble)', () => {
    expect(toNationalPhone('55ABC5678', 'MX')).toBe('55ABC5678');
    expect(toNationalPhone('55123456789', 'MX')).toBe('55123456789');
  });
});

describe('normalizeParticipantPhones', () => {
  it('normaliza solo los campos de teléfono presentes, conserva el resto', () => {
    const out = normalizeParticipantPhones({
      firstName: 'Ana',
      cellPhone: '(55) 1234-5678',
      emergencyContact1CellPhone: '55 9876 5432',
      inviterCellPhone: undefined,
    } as any);
    expect(out.cellPhone).toBe('5512345678');
    expect(out.emergencyContact1CellPhone).toBe('5598765432');
    expect((out as any).firstName).toBe('Ana');
    expect(out.inviterCellPhone).toBeUndefined();
  });

  it('con país: canoniza los teléfonos al número nacional', () => {
    const out = normalizeParticipantPhones(
      {
        cellPhone: '+52 55 1234 5678',
        emergencyContact1CellPhone: '044 55 9876 5432',
      } as any,
      'MX',
    );
    expect(out.cellPhone).toBe('5512345678');
    expect(out.emergencyContact1CellPhone).toBe('5598765432');
  });
});
