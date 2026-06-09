/**
 * Convierte un error de axios/API en un mensaje legible para el usuario.
 * Maneja: `data.message`, el array de errores de Zod de `validateRequest`
 * (sea bajo `data.errors` o como array crudo en `data`), y fallbacks.
 *
 * Módulo SIN side-effects (a diferencia de `api.ts`, que crea el axios + CSRF),
 * para poder testearlo y reusarlo sin arrastrar la inicialización del cliente.
 */
export function apiErrorMessage(err: any, fallback = "Ocurrió un error"): string {
  const data = err?.response?.data;
  const firstZod = (arr: any[]): string => {
    const e = arr[0];
    const path = Array.isArray(e?.path)
      ? e.path.filter((p: any) => p !== "body").join(".")
      : "";
    return [path, e?.message].filter(Boolean).join(" ").trim();
  };
  if (data) {
    if (typeof data === "string" && data) return data;
    if (typeof data.message === "string" && data.message) {
      if (Array.isArray(data.errors) && data.errors.length) {
        const z = firstZod(data.errors);
        return z ? `${data.message}: ${z}` : data.message;
      }
      return data.message;
    }
    if (Array.isArray(data.errors) && data.errors.length) return firstZod(data.errors) || fallback;
    if (Array.isArray(data) && data.length) return firstZod(data) || fallback;
  }
  return err?.message || fallback;
}
