# Spec: «Caso especial» del caminante

> SDD spec — versión 1.0 (2026-10-15). Estado: aprobado por Leonardo (gate M0 cerrado el
> 2026-10-15: D2 confirmado, defaults confirmados). No se codea M1 fuera de lo aquí decidido.

**Branch**: `worktree-special-case` (worktree `.claude/worktrees/special-case`, base
`origin/master` `781875e8`) · **Fecha**: 2026-10-15

## Problema

El palanquero (perfil **communications**, quien contacta al caminante antes del retiro) se
entera de cosas que el coordinador debe analizar y decidir antes del retiro: el caminante
necesita habitación aparte, tiene una condición de salud, u otra situación personal. Hoy eso
vive en WhatsApp sueltos y en la cabeza del palanquero: no llega al coordinador de forma
visible, no hay un lugar donde "espere atención", y cuando el coordinador lo resuelve no queda
rastro de que existió.

El sistema tampoco tiene una forma operativa de "esto necesita revisión del coordinador": lo más
parecido es el booleano `requestsSingleRoom` (que el algoritmo de camas ignora a propósito y que
hoy nadie solicita con razón), los campos de salud de la ficha (que describen, no piden
atención), y las notas del seguimiento CRM (un hilo cronológico sin bandeja).

## Decisiones de dominio (cerradas con Leonardo, 2026-10-15)

| # | Decisión | Valor |
|---|----------|-------|
| D1 | Naturaleza | **Marca simple** per-retiro en `retreat_participants` (molde `paysAtHouse`, PR #8): `specialCase` bool, `specialCaseCategory` (`'room'\|'health'\|'other'`), `specialCaseNotes` texto libre nullable. **Sin entidad nueva ni ciclo de vida con resolución escrita**: atender = quitar la marca desde la bandeja. La traza de quién marcó/desmarcó y con qué valores queda en el domain-audit del update. |
| D2 | Privacidad | **Régimen de salud**: los 3 campos entran en `SENSITIVE_HEALTH_FIELDS` y heredan todo el tratamiento existente (strip de payloads, 403 en escritura, columnas ocultas en UI). **Set que ve el caso: superadmin, admin, treasurer, logistics y communications** (los roles con `participant:health` — verificado en las migraciones `20260914130000` y `20261007100000`). Matiz confirmado con Leonardo: treasurer y logistics también lo ven, porque ya ven la ficha médica hoy. `regular_server` no ve nada. |
| D3 | Dónde se atiende | **Tarjeta-contador en el dashboard del retiro + bandeja dedicada** (`SpecialCasesView`, ruta `special-cases`) **+ badge ámbar en la fila de Palancas**. Ruta, sidebar y tarjeta gated `participant:health`. Sin endpoint nuevo: la bandeja y el contador computan del listado de participantes ya hidratado. |
| D4 | Motivo | **Categoría fija + nota libre opcional**, en un diálogo pequeño al marcar (no `confirm()` plano): habitación aparte / salud / otra. La categoría es obligatoria; la nota, no. |

Defaults menores (confirmados con Leonardo, 2026-10-15):

- Al **desmarcar** se limpian la categoría y la nota **del caso** (`specialCaseCategory` /
  `specialCaseNotes`) — ojo: **las notas generales del caminante (`notes` de la ficha) no se
  tocan jamás**; esta feature no las lee, escribe ni borra. La traza de los valores del caso
  queda en el audit del update.
- El botón «marcar/quitar» exige `participant:update` **además** de `participant:health`
  (communications y admin cumplen ambos).
- Sin notificación realtime: no existe canal; el contador y la bandeja viven del refetch.

## Objetivo

Que el palanquero registre en el sistema "este caminante es un caso especial, por esto", y que
el coordinador lo vea en un solo lugar (bandeja + contador del dashboard), lo atienda por fuera
del sistema (llamarlo, decidir la habitación) y lo quite, dejando traza de quién marcó y quién
quitó.

## Historias de usuario

- **HU-1 (palanquero, perfil communications)**: El caminante me cuenta que necesita habitación
  aparte o tiene una condición; entro a Palancas, en su fila marco «Caso especial», elijo la
  categoría y dejo una nota; la fila queda con el badge ámbar y el motivo queda guardado.
- **HU-2 (coordinador, rol admin)**: En el dashboard del retiro veo la tarjeta «Casos
  especiales» con el contador; entro a la bandeja y veo nombre, teléfono, categoría y nota de
  cada caso; lo contacto, lo resuelvo, y quito la marca.
- **HU-3 (coordinador)**: Al quitar la marca, el motivo del caso se limpia de la ficha; el audit
  conserva quién marcó, con qué categoría, y quién quitó. Las notas generales del caminante
  quedan intactas.
- **HU-4 (rol sin `participant:health`, p. ej. regular_server)**: No ve badge en Palancas, ni
  ítem de sidebar, ni tarjeta en dashboard; y el API no le entrega los campos en ningún
  payload.
- **HU-5 (dos retiros)**: La marca es per-retiro; marcar en un retiro no afecta la fila del
  mismo caminante en otro.

## Requerimientos

- **FR-1** Migración reversible e idempotente (ADD COLUMN × 3 con guard `PRAGMA table_info`,
  SQL plano) + columnas en el CREATE TABLE de `CreateSchema` para DBs frescas.
- **FR-2** Virtuales `specialCase`/`specialCaseCategory`/`specialCaseNotes` en `Participant` +
  `toJSON`. **No** toca `paymentStatus` ni ningún cálculo financiero; **no** toca `notes`.
- **FR-3** Régimen de salud: los 3 campos en `SENSITIVE_HEALTH_FIELDS`
  (`packages/types/src/permissions.ts`) → strip en GET lista/ficha y respuesta del update, 403
  en PUT sin `participant:health` (valores vacíos cuentan), columnas fuera de
  `ParticipantList`/bulk-edit para roles sin el permiso.
- **FR-4** Cierre del hueco: `stripHealthFromRetreatParticipants`
  (`retreatParticipantController.ts`) borra también `specialCase*` de la fila
  `retreat_participants` (hoy solo strippa `.participant`).
- **FR-5** Escritura por `PUT /participants/:id` con `contextRetreatId` (camino de
  `paysAtHouse`); `specialCaseCategory` es `z.enum` en `participantSchema` (422 si es inválida);
  higiene: `specialCase === false` → categoría y nota del caso a `null` (nunca `notes`).
- **FR-6** Audit: los 3 campos en `PARTICIPANT_AUDIT_FIELDS` y en `oldAuditSnapshot`.
- **FR-7** Hidratación de los virtuales: overlay de `findAllParticipants` (select + asignación)
  y `participantRetreatHydration` (ambas ramas).
- **FR-8** Frontend: `ParticipantSpecialCaseToggle` (diálogo categoría+nota; gates
  `participant:update` **y** `participant:health`) como acción inline en Palancas; badge ámbar
  por fila; `SpecialCasesView` (bandeja: walkers no cancelados con `specialCase === true`;
  nombre, teléfono, categoría, nota; contacto y quitar marca); ruta `special-cases` + ítem de
  sidebar en `communications` gated `participant:health`; tarjeta del dashboard gated
  `participant:health` con contador computed y navegación a la bandeja.
- **FR-9** i18n completo en `es.json` **y** `en.json`; docs de usuario `special-cases.md` en
  `apps/web/src/docs/{es,en}/` + edición breve de `palancas.md` y `retreat-dashboard.md`.

## Criterios de aceptación (end-to-end)

1. Migración: tras arrancar el API, `PRAGMA table_info(retreat_participants)` muestra las 3
   columnas; una DB fresca desde `CreateSchema` también las tiene.
2. Palanquero marca con categoría y nota → la fila rp del retiro de contexto queda
   `specialCase=1` + categoría + nota; el retorno del update lo refleja; la fila de Palancas
   muestra el badge ámbar.
3. Bandeja: lista exactamente al marcado (walker, no cancelado) con categoría y nota; la tarjeta
   del dashboard marca 1 y navega a la bandeja.
4. Quitar la marca → `specialCase=0`, `specialCaseCategory=NULL`, `specialCaseNotes=NULL`;
   `notes` del caminante **intacto**; badge fuera, bandeja vacía, contador en 0.
5. Re-envío del DTO completo (payload con `specialCase: true` y sin categoría) NO borra la
   categoría existente.
6. Categoría fuera del enum → 422 del zod.
7. Rol sin `participant:health`: GET lista/ficha sin los 3 campos; PUT con cualquiera de los 3
   (incl. `specialCaseNotes: ''`) → 403 con `fields`; `/retreat-participants` sin las columnas;
   UI sin badge, sin ítem, sin tarjeta.
8. Dos retiros: la marca es per-retiro, no se mezcla (overlay).
9. Audit: el diff del update registra marca (con categoría) y desmarca, con actor.
10. Regresión: sin marca, el comportamiento es byte a byte el de antes (payloads sin los campos
    para quien no debe verlos); suites api/web en verde; `pnpm --filter api build` pasa.

**Negativos** (lo que NO debe pasar):

- Marcar NO cambia `paymentStatus`, montos ni summary de pagos.
- `regular_server` (o cualquier rol sin health) NO ve rastro del caso en ninguna superficie ni
  payload — ni el contador agregado.
- Sin `participant:update`, no aparece botón de marcar ni de quitar (aunque tenga health).
- El FilterDialog y los segmentos guardados NO exponen la marca (revelaría su existencia a
  perfiles sin health; la bandeja es la vista filtrada).
- La feature NO lee, escribe ni borra `notes` (notas generales del caminante).

## Fuera de alcance

- Notificaciones realtime al coordinador (no hay canal; patrón refetch).
- Auto-set de `requestsSingleRoom` cuando la categoría es `room` — el algoritmo de camas ignora
  ese campo a propósito (badge «Individual» informativo); **no automatizar** la decisión del
  coordinador.
- Export Excel de la bandeja; `getReceptionStats` (recepción no muestra el caso); purge de
  `specialCaseNotes` por retención de salud.
- Filtro en `FilterDialog`/segmentos/condiciones de secuencia (trabajo futuro con gate de
  permiso si llega a pedirse).
- Fix adyacente de `paysAtHouse` en `PARTICIPANT_AUDIT_FIELDS` (deuda del PR #8, otro PR).
- Cambios de permisos: ningún rol gana o pierde `participant:health` aquí.
