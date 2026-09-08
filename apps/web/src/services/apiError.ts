/**
 * Convierte un error de axios/API en un mensaje legible para el usuario.
 * Maneja: `data.message`, el array de errores de Zod de `validateRequest`
 * (sea bajo `data.errors` o como array crudo en `data`), y fallbacks.
 *
 * Módulo SIN side-effects (a diferencia de `api.ts`, que crea el axios + CSRF),
 * para poder testearlo y reusarlo sin arrastrar la inicialización del cliente.
 */

/** Una página HTML (502/504 de nginx, challenge de Cloudflare) en vez de JSON. */
const LOOKS_LIKE_HTML = /^\s*</;

/** Un cuerpo de texto más largo que esto no es un mensaje: es una página. */
const MAX_PLAIN_BODY_LENGTH = 200;

/**
 * El mensaje que puso el servidor en el cuerpo de la respuesta, o `null` si no
 * hay ninguno aprovechable.
 *
 * Devolver `null` es la respuesta correcta cuando el cuerpo no viene del API:
 * un 502/504 de nginx o un challenge de Cloudflare traen una página HTML
 * entera, y volcarla en un toast es peor que no decir nada.
 */
export function serverErrorMessage(err: any): string | null {
  const data = err?.response?.data;
  if (!data) return null;

  const firstZod = (arr: any[]): string => {
    const e = arr[0];
    const path = Array.isArray(e?.path)
      ? e.path.filter((p: any) => p !== "body").join(".")
      : "";
    return [path, e?.message].filter(Boolean).join(" ").trim();
  };

  if (typeof data === "string") {
    const text = data.trim();
    if (!text || LOOKS_LIKE_HTML.test(text) || text.length > MAX_PLAIN_BODY_LENGTH) {
      return null;
    }
    return text;
  }
  if (typeof data.message === "string" && data.message) {
    if (Array.isArray(data.errors) && data.errors.length) {
      const z = firstZod(data.errors);
      return z ? `${data.message}: ${z}` : data.message;
    }
    return data.message;
  }
  if (Array.isArray(data.errors) && data.errors.length) return firstZod(data.errors) || null;
  if (Array.isArray(data) && data.length) return firstZod(data) || null;
  return null;
}

export function apiErrorMessage(err: any, fallback = "Ocurrió un error"): string {
  return serverErrorMessage(err) ?? (err?.message || fallback);
}

/**
 * La petición nunca obtuvo respuesta: murió en el camino (red del móvil que se
 * cae, Safari que mata la conexión de una pestaña que estuvo mucho tiempo en
 * segundo plano, intermediario que la corta).
 *
 * Se exige la marca de axios porque en un `catch` alrededor de una llamada al
 * API también pueden caer excepciones de JavaScript, y a esas no hay que
 * contarle al usuario que se quedó sin internet.
 */
export function isNetworkError(err: any): boolean {
  if (!err || err.response) return false;
  return err.isAxiosError === true || err.code === "ERR_NETWORK" || err.code === "ECONNABORTED";
}

const RETRIED_FLAG = "retriedAfterNoResponse";

const DEFAULT_RETRY_DELAY_MS = 800;

/**
 * Corre `send` y, si la petición no obtuvo respuesta, la repite UNA vez.
 *
 * Un fallo sin respuesta suele arreglarse solo al segundo intento (la conexión
 * se rehace), y presentarlo como error fatal hace que la persona abandone el
 * dispositivo: el 2026-09-08 alguien se fue del teléfono a una computadora por
 * esto.
 *
 * Úsese SOLO en operaciones que se pueden repetir sin duplicar nada. Si el
 * primer intento sí había entrado y solo se perdió la respuesta, el segundo
 * choca con el guard del servidor y devuelve 409: `wasRetriedAfterNoResponse`
 * permite leer ese 409 como "ya estaba hecho" en vez de como un fallo.
 */
export async function retryOnceOnNetworkError<T>(
  send: () => Promise<T>,
  options: { delayMs?: number; onRetry?: (err: unknown) => void } = {},
): Promise<T> {
  try {
    return await send();
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    options.onRetry?.(error);
    await new Promise((resolve) => setTimeout(resolve, options.delayMs ?? DEFAULT_RETRY_DELAY_MS));
    try {
      return await send();
    } catch (retryError: any) {
      if (retryError && typeof retryError === "object") retryError[RETRIED_FLAG] = true;
      throw retryError;
    }
  }
}

/** Si este error viene del segundo intento de `retryOnceOnNetworkError`. */
export function wasRetriedAfterNoResponse(err: any): boolean {
  return err?.[RETRIED_FLAG] === true;
}
