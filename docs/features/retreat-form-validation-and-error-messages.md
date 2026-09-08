# Formulario de retiro: validación, mensajes de error y etiqueta de casa

Incidente y mejoras del 2026-07-09. Toca `RetreatModal.vue`, `packages/types`, y todos los
stores de `apps/web`.

## 1. No se podía crear un retiro — `''` vs `.optional()` (raíz)

**Síntoma:** al crear un retiro, el `POST /api/retreats` devolvía `400 Validation error` en
`walkerArrivalTime` y `serverArrivalTimeFriday`, aunque esos campos son opcionales y se dejaban
vacíos.

**Causa:** son `z.string().regex(HH:MM).optional()`. `.optional()` solo salta `undefined`, **no
`''`**. El formulario arma el payload de create con spread del DTO —
`emit('submit', { ...formData.value })`— así que cada campo vacío viaja como `''` y falla la regex.
(El path de *update* ya normalizaba con `x || undefined`; el de *create* no.)

**Fix** (`packages/types/src/index.ts`): un schema reusable que normaliza `''`/`null` → `undefined`
**antes** de la regex, con mensaje legible:

```ts
const arrivalTimeSchema = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Debe tener formato HH:MM (24h)').optional(),
);
// walkerArrivalTime: arrivalTimeSchema, serverArrivalTimeFriday: arrivalTimeSchema
```

Precedentes del mismo patrón ya en el repo: emails de participante + `tshirtSize`
(`z.preprocess`), `memoryPhotoUrl`/`musicPlaylistUrl` (`.optional().or(z.literal(''))`).

> **Clase de bug recurrente.** Cualquier campo `.optional()` con formato
> (`.regex/.url/.email/.datetime`) rechaza `''`. Detectar con:
> `grep -rE "\.(regex|url|email|datetime)\([^)]*\)\.optional\(\)" packages/types apps/api/src`
> y verificar que tenga `z.preprocess` o `.or(z.literal(''))`. Guard:
> `apps/api/src/tests/services/retreatWriteSchemas.simple.test.ts`.

## 2. El error no decía qué campo fallaba — `apiErrorMessage` en todos los stores

**Síntoma:** el toast mostraba solo `"Validation error"` genérico; el usuario no veía el campo.

El 400 de Zod trae `errors[].path` con el campo. El helper `apiErrorMessage(err, fallback)`
(`apps/web/src/services/apiError.ts`, módulo standalone y **sin side-effects**) lo formatea
(ej. `"Validation error: walkerArrivalTime Debe tener formato HH:MM (24h)"`).

Se propagó a los 8 stores que mostraban `data.message` genérico: `retreatStore`, `houseStore`,
`participantStore`, `authStore`, `communityCommunicationStore`, `santisimoStore`, `tableMesaStore`,
`inventoryStore`.

> **Importar desde `@/services/apiError`, NO desde `@/services/api`.** Los tests mockean
> `@/services/api` (el cliente axios) y el mock no reexporta `apiErrorMessage` → quedaría
> `undefined` y explota. `apiError.ts` es un módulo aparte, justamente para poder usarlo sin el
> mock del cliente.

`apiErrorMessage` cae a `err.message` si no hay body estructurado; esto es un pelín más de info que
el fallback fijo (consistente con la mayoría de stores, que ya lo hacían).

## 3. El desplegable de casas mostraba la ciudad, no la dirección

**Síntoma:** en el selector de casa del formulario, debajo del nombre se veía la ciudad. Como casi
todas las casas están en "Ciudad de México", no ayudaba a distinguirlas.

**Fix:** util `apps/web/src/utils/houseLabel.ts` → `houseLocationLabel(house)` muestra `address1`
(la calle), limpia comas/espacios sobrantes (ej. `", EL PEDREGAL"` → `"EL PEDREGAL"`), y cae a
`"ciudad, estado"` si no hay dirección. Usado en `RetreatModal.vue`. Guard:
`apps/web/src/utils/__tests__/houseLabel.test.ts`.

## 4. La petición que nunca llegó — 2026-09-08, registro público

**Síntoma:** una persona confirmó su registro desde un iPhone, vio `An unexpected error occurred`
y se fue a hacerlo desde una computadora. En el servidor **no había rastro**: ni 4xx, ni 5xx, ni
una línea en `emaus-access.log`.

**Causa:** la petición no obtuvo respuesta — la pestaña llevaba 70 minutos abierta y Safari de iOS
mata la conexión de una pestaña suspendida. `error.response` es `undefined`, así que
`error.response?.data?.message` era `undefined` y el toast caía al literal en inglés, que además
no sugiere reintentar. Y el cliente tiraba `error.message`, la única evidencia que quedaba.

**Fix**, en `apps/web/src/services/apiError.ts` (mismo módulo standalone de la §2):

```ts
isNetworkError(err)                  // hubo respuesta o no; exige la marca de axios, para no
                                     // contarle "sin internet" a un TypeError del mismo try
serverErrorMessage(err)              // el mensaje del API, o null si el cuerpo no es del API
retryOnceOnNetworkError(send, opts)  // repite UNA vez cuando no hubo respuesta
wasRetriedAfterNoResponse(err)       // si este error viene del segundo intento
```

Tres reglas que salieron de este caso:

- **`serverErrorMessage` devuelve `null` ante un cuerpo HTML o de más de 200 caracteres.** Un
  502/504 de nginx o un challenge de Cloudflare responden una página entera, y volcarla en un
  toast es peor que no decir nada. `apiErrorMessage` la usa, así que esto vale para todos sus
  llamadores.
- **`retryOnceOnNetworkError` solo en operaciones que se pueden repetir sin duplicar nada.** En el
  registro se puede: `confirmExistingParticipant` choca con `assertNotDoubleRegisteredInRetreat`
  y `createParticipant` reusa la ficha por correo — el segundo intento devuelve 409, no crea una
  segunda ficha.
- **Un 409 del segundo intento NO se anuncia como éxito.** Suele significar que el primero sí
  entró, pero con un correo compartido (caso real de este proyecto, ver
  `docs/features/parish-walker-import.md`) la fila puede ser de otra persona: se dice el hecho
  que es cierto en los dos casos ("ya está registrado en este retiro") y no se cierra el
  formulario, para no perder lo que escribió.

**Fallos que el servidor no ve:** `POST /api/telemetry/public/client-error` deja una línea
`[CLIENT ERROR]` en el log del API. Público (va antes del `isAuthenticated` de
`telemetryRoutes.ts`), exento de CSRF porque `sendBeacon` no puede poner cabeceras, con rate limit
propio y **sin escribir en la base**. Solo se reportan los fallos de los que no queda constancia
—sin respuesta, o con cuerpo que no es del API—: un 400 o un 409 con su mensaje ya está en el log
del servidor. Cómo leerlos en producción: skill `infra-remota`.

## Gotcha de entorno: el API dev no observa `packages/*`

`apps/api` corre con `nodemon --watch src`. Editar `packages/types` **no reinicia el API dev** → el
schema viejo sigue en memoria (los tests pasan, pero el API corriendo devuelve el error viejo).
Reiniciar sin matar `pnpm dev`: `touch apps/api/src/index.ts`; verificar con
`curl http://localhost:3084/api/health`.

## Tests

- `apps/api/src/tests/services/retreatWriteSchemas.simple.test.ts` — tolerancia de `''`/`null` +
  rechazo de formato inválido + valor HH:MM válido (create y update).
- `apps/web/src/utils/__tests__/houseLabel.test.ts` — dirección, limpieza de comas, fallback a
  ciudad/estado, tolerancia a null/undefined.
- `apps/web/src/services/__tests__/apiErrorMessage.spec.ts` — cuerpo HTML y cuerpo largo se
  ignoran, `isNetworkError` distingue axios de un error de JavaScript, y el reintento (que espera
  de verdad, que no repite un rechazo del servidor, y que marca el error del segundo intento).
- `apps/web/src/views/__tests__/ParticipantRegistrationConfirmRetry.test.ts` y
  `ParticipantRegistrationSubmitRetry.test.ts` — el reintento en los dos caminos que escriben.
  El primer caso del segundo archivo comprueba **la fixture**: si deja de pasar la validación de
  los cinco pasos, el archivo entero deja de probar algo y se ve.
- `apps/web/src/views/__tests__/participantRegistrationI18nKeys.test.ts` — que las claves que usa
  la vista existan en `es.json` **y** `en.json`. Hace falta porque el mock global de `vue-i18n`
  devuelve la clave tal cual: una errata pasa verde en toda la suite y en producción le muestra
  `serverRegistration.toasts.algo` a un caminante.
