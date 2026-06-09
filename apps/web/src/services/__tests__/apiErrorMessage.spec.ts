import { describe, it, expect } from 'vitest';
import { apiErrorMessage } from '@/services/apiError';

describe('apiErrorMessage', () => {
  it('arma mensaje desde data.message + primer error Zod', () => {
    const err = {
      response: {
        data: {
          message: 'Validation error',
          errors: [
            { path: ['body', 'attachments', 0, 'storageUrl'], message: 'Required' },
          ],
        },
      },
    };
    expect(apiErrorMessage(err)).toBe('Validation error: attachments.0.storageUrl Required');
  });

  it('maneja el array Zod CRUDO en data (sin message)', () => {
    const err = {
      response: { data: [{ path: ['body', 'endTime'], message: 'Required' }] },
    };
    expect(apiErrorMessage(err)).toBe('endTime Required');
  });

  it('usa data.message cuando no hay errores Zod', () => {
    const err = { response: { data: { message: 'No autorizado' } } };
    expect(apiErrorMessage(err)).toBe('No autorizado');
  });

  it('usa data string', () => {
    const err = { response: { data: 'Forbidden' } };
    expect(apiErrorMessage(err)).toBe('Forbidden');
  });

  it('cae a err.message si no hay response', () => {
    expect(apiErrorMessage(new Error('Network Error'))).toBe('Network Error');
  });

  it('usa el fallback cuando no hay nada útil', () => {
    expect(apiErrorMessage({}, 'No se pudo guardar')).toBe('No se pudo guardar');
  });
});
