# Registro externo de caminantes (`externalRegistrationUrl`)

Algunas parroquias llevan el registro de caminantes **en su propio sitio**, con su propio
formulario y su propio cobro. El caso que originó la feature: Emaús Hombres del Buen Despacho
(retiro Del Valle II, 16–18 oct 2026), que registra y cobra en
`https://emaushombres.buendespacho.com/inscripcion` y nos entrega un Excel para sincronizar.

Sin este campo el retiro queda con **dos puertas de entrada** —el formulario de la parroquia y
`emaus.cc/<slug>`— y con dos instrucciones de pago distintas. Un caminante que ve dos cuentas
bancarias diferentes para el mismo retiro no sabe cuál es legítima.

## Qué hace

Cuando el retiro tiene `externalRegistrationUrl`:

- `emaus.cc/<slug>` **redirige** al sitio de la parroquia en vez de renderizar el formulario propio.
- `walkerRegistrationLink` (store) devuelve esa URL, así que el enlace del tablero, el QR del
  volante imprimible y las plantillas de mensaje apuntan todos al mismo lugar.

**Los servidores no se ven afectados**: `emaus.cc/<slug>/server` sigue registrando en emaus.cc,
porque la parroquia solo recoge caminantes.

Se configura en el modal de retiro, campo *Registro externo de caminantes*, junto al slug.
Dejarlo vacío devuelve el comportamiento normal.

## Dónde vive

| Pieza | Archivo |
| --- | --- |
| Columna | `apps/api/src/migrations/sqlite/20260831130000_AddExternalRegistrationUrlToRetreat.ts` |
| Entidad | `apps/api/src/entities/retreat.entity.ts` |
| Validación | `packages/types/src/index.ts` (`retreatSchema`) |
| Respuestas públicas | `apps/api/src/controllers/retreatController.ts` (por id y por slug) |
| Enlace de caminante | `apps/web/src/stores/retreatStore.ts` |
| Redirección | `apps/web/src/views/ParticipantRegistrationView.vue` |
| Campo en la UI | `apps/web/src/components/RetreatModal.vue` |

## Tres cosas que no son obvias

**El protocolo se valida a mano, y no es cosmético.** El valor va a `window.location.replace`,
así que un `javascript:...` sería XSS. `z.string().url()` **no** protege: usa `new URL()`, que
acepta cualquier esquema. Por eso el schema lleva un `.refine()` que exige `http(s)`, y la vista
repite la comprobación antes de redirigir por si quedó un valor viejo en base.
Guard: `apps/api/src/tests/services/retreatExternalRegistrationUrl.simple.test.ts`.

**Un retiro terminado no redirige.** Fue un bug encontrado probando en el navegador: la primera
versión redirigía antes de mirar `isRegistrationClosed`, y quien abría el enlace de un retiro ya
pasado acababa en el formulario de la parroquia en lugar de ver «este retiro ya terminó». No
podemos asumir que la parroquia cierre el suyo.

**`''` se guarda como `null`, no como cadena vacía.** El input manda `''` cuando queda en blanco;
sin el `preprocess` sería un 400 (el bug recurrente de `.optional()` con formato en este repo), y
mapeándolo a `undefined` el valor viejo quedaría pegado para siempre sin poder borrarse.

**El input antepone `https://` al perder el foco.** No es cosmética: `validateRequest`
(`apps/api/src/middleware/validateRequest.ts`) responde `{ message: 'Validation error' }` y el
detalle por campo va en `errors[]`, pero `RetreatModal` muestra `error.response?.data?.message`.
Es decir, quien escribiera `parroquia.com/inscripcion` sin protocolo vería un toast que dice
«Validation error» y nada más. Normalizar en el cliente elimina el rechazo más probable; lo que
sí es basura sigue fallando la validación, que es lo que queremos.

## Lo que esta feature NO resuelve

La sincronización de los inscritos. El Excel de la parroquia usa nombres de columna distintos a
los que espera `mapToEnglishKeys()` (`apps/api/src/services/participantService.ts`), así que
necesita un conversor aparte: `fecha_nacimiento` va partida en `dia`/`mes`/`anio`, los booleanos
son `1`/`0` contra `"S"`, y `estado_civil` manda texto contra una letra `S|C|D|V|O` (ojo:
*Soltero* y *Separado-Divorciado* empiezan ambos con S, así que el mapeo va por tabla, no por
inicial).
