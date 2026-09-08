import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  apiErrorMessage,
  isNetworkError,
  retryOnceOnNetworkError,
  serverErrorMessage,
  wasRetriedAfterNoResponse,
} from '@/services/apiError';

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

  // Un 502/504 de nginx o un challenge de Cloudflare responden una página HTML
  // entera. Volcarla en un toast fue lo que dejó a una persona sin saber que
  // solo tenía que volver a intentar (2026-09-08).
  it('ignora un cuerpo HTML en vez de volcarlo como mensaje', () => {
    const err = {
      message: 'Request failed with status code 502',
      response: { status: 502, data: '<html><head><title>502 Bad Gateway</title></head></html>' },
    };
    expect(serverErrorMessage(err)).toBeNull();
    expect(apiErrorMessage(err, 'fallback')).toBe('Request failed with status code 502');
  });

  it('ignora un cuerpo de texto demasiado largo para ser un mensaje', () => {
    const err = { response: { status: 503, data: 'x'.repeat(500) } };
    expect(serverErrorMessage(err)).toBeNull();
    expect(apiErrorMessage(err, 'fallback')).toBe('fallback');
  });

  it('sigue aceptando un cuerpo de texto corto', () => {
    expect(serverErrorMessage({ response: { data: 'Forbidden' } })).toBe('Forbidden');
  });
});

describe('isNetworkError', () => {
  it('es cierto para un error de axios sin respuesta', () => {
    expect(isNetworkError({ isAxiosError: true, message: 'Network Error' })).toBe(true);
    expect(isNetworkError({ code: 'ERR_NETWORK' })).toBe(true);
    expect(isNetworkError({ code: 'ECONNABORTED' })).toBe(true);
  });

  it('es falso cuando el servidor respondió, aunque sea un error', () => {
    expect(isNetworkError({ isAxiosError: true, response: { status: 500, data: {} } })).toBe(false);
  });

  // Si no, una excepción de JavaScript en el mismo try le diría a la persona
  // que se quedó sin internet.
  it('es falso para una excepción que no viene de axios', () => {
    expect(isNetworkError(new TypeError('x is not a function'))).toBe(false);
    expect(isNetworkError(null)).toBe(false);
  });
});

describe('retryOnceOnNetworkError', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  type Outcome<T> = { ok: true; value: T } | { ok: false; error: any };

  /**
   * Corre el helper dejando pasar la espera entre intentos. Se engancha el
   * resultado ANTES de avanzar los timers: si no, el rechazo del segundo
   * intento queda sin handler mientras corre el reloj falso.
   */
  const settle = async <T>(
    send: () => Promise<T>,
    options?: Parameters<typeof retryOnceOnNetworkError>[1],
  ): Promise<Outcome<T>> => {
    const pending = retryOnceOnNetworkError(send, options).then(
      (value): Outcome<T> => ({ ok: true, value }),
      (error): Outcome<T> => ({ ok: false, error }),
    );
    await vi.advanceTimersByTimeAsync(1000);
    return pending;
  };

  const noResponse = () => Object.assign(new Error('Network Error'), { isAxiosError: true });

  it('no reintenta cuando el primer intento funciona', async () => {
    const send = vi.fn().mockResolvedValue('ok');

    expect(await settle(send)).toEqual({ ok: true, value: 'ok' });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('reintenta una vez cuando no hubo respuesta y devuelve el segundo resultado', async () => {
    const onRetry = vi.fn();
    const send = vi.fn().mockRejectedValueOnce(noResponse()).mockResolvedValueOnce('ok');

    expect(await settle(send, { onRetry })).toEqual({ ok: true, value: 'ok' });
    expect(send).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('no reintenta cuando el servidor respondió: repetir un rechazo no lo cambia', async () => {
    const error = Object.assign(new Error('400'), {
      isAxiosError: true,
      response: { status: 400, data: { message: 'El retiro ya está cerrado' } },
    });
    const send = vi.fn().mockRejectedValue(error);

    const outcome = await settle(send);

    expect(outcome).toEqual({ ok: false, error });
    expect(send).toHaveBeenCalledTimes(1);
    expect(wasRetriedAfterNoResponse(error)).toBe(false);
  });

  it('marca el error del segundo intento, para poder leer su 409 como "ya estaba hecho"', async () => {
    const conflict = Object.assign(new Error('409'), {
      isAxiosError: true,
      response: { status: 409, data: { message: 'Ya está registrado' } },
    });
    const send = vi.fn().mockRejectedValueOnce(noResponse()).mockRejectedValueOnce(conflict);

    const outcome = await settle(send);

    expect(outcome.ok).toBe(false);
    expect(wasRetriedAfterNoResponse(conflict)).toBe(true);
  });

  it('espera entre intentos en vez de repetir de inmediato', async () => {
    const send = vi.fn().mockRejectedValueOnce(noResponse()).mockResolvedValueOnce('ok');

    const pending = retryOnceOnNetworkError(send, { delayMs: 500 });
    await vi.advanceTimersByTimeAsync(100);
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(500);
    await pending;
    expect(send).toHaveBeenCalledTimes(2);
  });
});
