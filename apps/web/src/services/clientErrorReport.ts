/**
 * Reporte de un fallo ocurrido en una pantalla PÚBLICA (registro de caminante
 * o de servidor), para que quede una línea en el log del API.
 *
 * Existe por un caso concreto: el 2026-09-08 una persona vio "An unexpected
 * error occurred" al confirmar su registro desde un iPhone y se tuvo que ir a
 * una computadora. En el servidor no había NADA — ni un 4xx, ni un 5xx, ni una
 * línea en el access log — porque la petición nunca llegó, y el cliente tiraba
 * la única evidencia que quedaba (`error.message`). Sin esto, un fallo así solo
 * se puede diagnosticar por captura de pantalla.
 *
 * Se manda con `sendBeacon`: no espera respuesta y sobrevive a que la pestaña
 * se cierre, que es justo el escenario que queremos registrar. Como sendBeacon
 * no permite poner cabeceras, la ruta está exenta de CSRF en el API.
 */
import { getApiUrl } from "@/config/runtimeConfig";

export interface ClientErrorReport {
  /** Qué intentaba hacer la persona, p. ej. `confirm-registration`. */
  context: string;
  /** El mensaje del error tal cual, sin traducir: es para diagnosticar. */
  message: string;
  /** Status HTTP, si el servidor llegó a responder. */
  status?: number;
  /** Si ya se reintentó automáticamente y también falló. */
  retried?: boolean;
}

const MAX_CONTEXT = 60;
const MAX_MESSAGE = 300;
const MAX_PAGE = 200;

const compact = (value: string, max: number): string =>
  value.replace(/\s+/g, " ").trim().slice(0, max);

export function reportClientError(report: ClientErrorReport): void {
  try {
    const body = JSON.stringify({
      context: compact(report.context, MAX_CONTEXT),
      message: compact(report.message || "unknown", MAX_MESSAGE) || "unknown",
      status: typeof report.status === "number" ? report.status : undefined,
      retried: report.retried === true,
      page: compact(typeof location !== "undefined" ? location.pathname : "-", MAX_PAGE),
    });
    const url = `${getApiUrl()}/telemetry/public/client-error`;

    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      if (navigator.sendBeacon(url, new Blob([body], { type: "application/json" }))) {
        return;
      }
    }

    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {
      // Ya estamos en el camino de error: no hay nada mejor que hacer.
    });
  } catch {
    // Reportar un fallo no puede romper el flujo de la persona que se registra.
  }
}
