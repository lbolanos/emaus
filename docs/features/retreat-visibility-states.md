# Estados de visibilidad del retiro (Borrador / Anunciado / Publicado)

Antes `isPublic` controlaba a la vez la visibilidad en la landing y la aceptación de
inscripciones: imposible anunciar un retiro con sus fechas sin abrir el registro. Ahora son
**dos banderas** y el modal las edita como un solo selector de 3 estados:

| Estado | `isPublic` | `registrationOpen` | Landing | Inscripción |
| --- | --- | --- | --- | --- |
| **Borrador** | false | false | No aparece | Cerrada |
| **Anunciado** | true | false | Tarjeta con fechas + badge "Próximamente" | Cerrada (`RETREAT_REGISTRATION_NOT_OPEN`) |
| **Publicado** | true | true | Tarjeta normal | Abierta |

Un retiro nuevo nace en **Borrador** (defaults del modal). Cambiar de estado es editar el retiro
(Ajustes) y guardar; el hint bajo cada radio explica el efecto.

## Defaults: entity false, migración DEFAULT 1

- Entity (`apps/api/src/entities/retreat.entity.ts`): `registrationOpen` con `default: false` —
  un retiro creado por la API nace cerrado hasta que el admin lo publique.
- Migración `20261021130000_AddRegistrationOpenToRetreat`: `DEFAULT 1` — las filas existentes
  (retiros ya operando) quedan **abiertas**, sin cambio de comportamiento al deployar.
- La pareja es deliberada: zod no asigna defaults al controller (`validateRequest` no aplica el
  parsed body), así que quien decide al crear es el default del entity.

## El gate: `=== false`, no `!`

`assertRetreatAcceptsRegistrations` (`apps/api/src/services/participantService.ts`) rechaza con
`RETREAT_REGISTRATION_NOT_OPEN` (HTTP 400) solo cuando `registrationOpen === false`. Cualquier
payload legado sin el campo (pre-migración, caches) se trata como abierto. El mismo criterio
`=== false` se repite en:

| Pieza | Archivo |
| --- | --- |
| Gate de inscripción (walkers y parejas, individual y secciones) | `apps/api/src/services/participantService.ts` |
| Mapa a 400 | `apps/api/src/controllers/participantController.ts` |
| Bandera en listado y detalle públicos | `apps/api/src/controllers/retreatController.ts` (`getPublicRetreats`, `buildPublicRetreatDetail`) |
| Selector de 3 estados + hints + payload | `apps/web/src/components/RetreatModal.vue` (`visibilityState`) |
| Badge "Próximamente" en la tarjeta | `apps/web/src/views/LandingView.vue` |
| CTAs del volante deshabilitados ("Inscripciones abren pronto") | `apps/web/src/components/PublicRetreatFlyerModal.vue` |
| Panel "abren pronto" + no redirigir a registro externo | `apps/web/src/views/ParticipantRegistrationView.vue` |
| Card cerrada para parejas | `apps/web/src/views/CoupleRegistrationView.vue` |
| Hint bajo los enlaces de registro del dashboard | `apps/web/src/views/RetreatDashboardView.vue` |

## Reglas derivadas

- **Registro externo (`externalRegistrationUrl`) tampoco redirige** mientras el retiro esté
  anunciado: la parroquia no debería recibir caminantes de un retiro sin abrir. Con el campo
  ausente o `true`, el redirect legacy se conserva.
- **La vista de registro muestra fechas, no el formulario**: el panel "Las inscripciones abren
  pronto" lista las fechas del retiro (parse date-only a componentes locales — ver abajo) y el
  multi-paso no se monta.
- **Servidores incluidos**: el gate aplica a ambos flujos (`walker` y `server`).
- El badge del volante/landing no menciona palancas, cartas ni dinámicas internas (reglas de
  contenido público, `landingPublicContent.test.ts`).

## Trampa de fechas date-only (ya corregida aquí)

Las columnas `date` de SQLite llegan al frontend como medianoche UTC. Formatear con
`new Date(d).toLocaleDateString(…)` **corre el día** en TZ local (2027-03-05 se pinta como
"4 de marzo" en CST). En superficies nuevas, parsear el prefijo `YYYY-MM-DD` a componentes
locales (patrón de `LandingView.formatDateRange`; aplicado en el panel de "abren pronto" y en
las fechas del dropdown "Copiar de un retiro anterior"). Cargar el skill `timezone-handling`
antes de tocar cualquier formato de fecha.

## Verificación E2E (2026-10-21, dev, Tlalpan)

Anunciado: landing con badge y fechas, volante con ambos CTAs `aria-disabled` y sin href,
`POST /api/participants/new` → 400 `RETREAT_REGISTRATION_NOT_OPEN`,
`/register/walker/:id` → panel "abren pronto" con "5 de marzo de 2027 – 7 de marzo de 2027".
Publicado (edición por UI): listado público con `registrationOpen: true`, mismo POST con
`dryRun: true` → 200 `{"valid":true}`, formulario multi-paso renderiza. Dev quedó en Anunciado.
