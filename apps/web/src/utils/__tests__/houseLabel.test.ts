import { describe, it, expect } from 'vitest';
import { houseLocationLabel } from '../houseLabel';

describe('houseLocationLabel', () => {
  it('muestra la dirección (address1), no la ciudad', () => {
    expect(
      houseLocationLabel({ address1: 'Av. Principal 123', city: 'Ciudad de México', state: 'CDMX' }),
    ).toBe('Av. Principal 123');
  });

  it('limpia comas/espacios sobrantes al inicio/fin (calle vacía)', () => {
    expect(houseLocationLabel({ address1: ', EL PEDREGAL', city: 'Ciudad López Mateos', state: 'Edomex' })).toBe(
      'EL PEDREGAL',
    );
    expect(houseLocationLabel({ address1: '  Jalapa 75, Roma Norte  ' })).toBe('Jalapa 75, Roma Norte');
  });

  it('cae a "ciudad, estado" cuando no hay dirección', () => {
    expect(houseLocationLabel({ address1: '', city: 'Cuernavaca', state: 'Morelos' })).toBe('Cuernavaca, Morelos');
    expect(houseLocationLabel({ address1: '  ,  ', city: 'Cuernavaca', state: 'Morelos' })).toBe('Cuernavaca, Morelos');
  });

  it('omite partes vacías en el fallback', () => {
    expect(houseLocationLabel({ city: 'Cuernavaca' })).toBe('Cuernavaca');
    expect(houseLocationLabel({ state: 'Morelos' })).toBe('Morelos');
  });

  it('tolera null/undefined y objetos sin campos', () => {
    expect(houseLocationLabel(null)).toBe('');
    expect(houseLocationLabel(undefined)).toBe('');
    expect(houseLocationLabel({})).toBe('');
    expect(houseLocationLabel({ address1: null, city: null, state: null })).toBe('');
  });
});
