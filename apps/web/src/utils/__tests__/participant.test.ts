import { describe, it, expect } from 'vitest';
import { isMeaninglessNickname, participantLabel } from '../participant';

describe('isMeaninglessNickname', () => {
  it('trata como vacíos "N/A", variantes y espacios', () => {
    for (const n of ['', '   ', 'N/A', 'n/a', 'NA', 'na', 'N.A.', 'N/D', '-']) {
      expect(isMeaninglessNickname(n)).toBe(true);
    }
    expect(isMeaninglessNickname(null)).toBe(true);
    expect(isMeaninglessNickname(undefined)).toBe(true);
  });

  it('respeta apodos reales', () => {
    for (const n of ['Roy', 'El Profe', 'George', 'Nacho']) {
      expect(isMeaninglessNickname(n)).toBe(false);
    }
  });
});

describe('participantLabel', () => {
  it('usa el apodo cuando es significativo', () => {
    expect(participantLabel({ firstName: 'Rodrigo', lastName: 'Reyna', nickname: 'Roy' })).toBe('Roy');
  });

  it('cae al nombre completo cuando el apodo es "N/A" o vacío', () => {
    expect(participantLabel({ firstName: 'Octavio', lastName: 'Natera', nickname: 'N/A' })).toBe(
      'Octavio Natera',
    );
    expect(participantLabel({ firstName: 'Ana', lastName: 'López', nickname: null })).toBe('Ana López');
  });

  it('vacío si no hay participante', () => {
    expect(participantLabel(null)).toBe('');
    expect(participantLabel(undefined)).toBe('');
  });
});
