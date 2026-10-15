# Spec: enlace público personalizado para que cada servidor elija su guardia del Santísimo

**Estado**: cerrada (reconciled 2026-10-14) · **Branch**: `santisimo-guardia-links` (worktree
`.claude/worktrees/santisimo-guardia-links`) · **Escrita**: 2026-10-14

## Problema

La asignación de servidores a turnos de la capilla del Santísimo es hoy 100 % manual: el
coordinador abre `SantisimoAdminView`, slot por slot, usa el picker de servidores elegibles y
asigna. La vista pública `/santisimo/:slug` sirve solo para la comunidad externa ("angelitos"):
nombre libre, multi-select, sin identidad.

Se necesita mandar **por WhatsApp, con plantilla y personalizado por servidor**, un enlace
público que cifre `retreat + participant`, para que cada servidor elija **un** horario de
guardia desde el celular, sin login, y pueda cambiarlo después. El envío usa la cola asistida
existente (`WhatsAppSendQueue`, 1 clic = 1 envío), por lo que el enlace debe resolverse como
variable de plantilla en los tres caminos de resolución (motor de secuencias, envío manual,
preview).

Cita del usuario (2026-10-14): «planea un enlace publico con retiro y servidor encriptado que
se pueda enviar con plantilla por mensaje whatsapp personalizado, para que se inscriba cada
servidor el horario en el que quiere asistir a la capilla santisimo».

## Decisiones de dominio (cerradas con Leonardo, 2026-10-14)

1. **Un solo horario por servidor** (radio). Reabrir el enlace permite cambiarlo; nunca hay
   dos guardias del mismo servidor en el mismo retiro.
2. **No excluir los slots de comida** (corrección mid-sesión al borrador inicial, que los
   ocultaba): se muestran **todos** los slots y los `mealWindow` llevan un badge que anuncia
   que coinciden con la hora de comida. Los angelitos siguen pudiendo tomarlos: el cupo es
   compartido y se consume por orden de llegada.
3. **Enlace reutilizable hasta el cierre**: el servidor puede cambiar o quitar su elección
   mientras el retiro viva; la vista admin siempre refleja el estado actual.
4. **Token cifrado stateless** (AES-256-GCM, `node:crypto`, sin dependencias nuevas). Es un
   patrón nuevo en este repo — el convenio existente es token opaco guardado en DB
   (`cancelToken`, `dataDeleteToken`) — pero el usuario pidió explícitamente que el enlace
   lleve retiro+servidor cifrados, y stateless evita migración de tokens y regeneración
   trivial de enlaces. La clave se deriva por HMAC de `INVITE_TOKEN_SECRET ?? SESSION_SECRET`
   con label de dominio: no exige variable nueva en prod.
5. **El GET del invite no exige `retreat.isPublic`**, solo `santisimoEnabled`: el token es la
   capability; `isPublic` gobierna las superficies abiertas por slug, no los enlaces
   personales. La membresía sí se valida (fila en `retreat_participants`, participante no
   borrado), sin filtro por `type`: si un coordinador manda el enlace a un partial_server,
   funciona igual (decisión documentada, no bug).
6. **Sin reCAPTCHA en el POST del invite** (desviación del patrón `publicCreateSignup`): el
   token cifrado es una capability no adivinable, CORS bloquea escrituras cross-site y hay
   rate limit. Revertible si se pide.
7. **Cero migración de schema**: `santisimo_signup.participantId` ya existe (columna plana).
   La única migración de la feature es la semilla de la plantilla WhatsApp.
8. Trabajo en worktree propio con SDD (esta spec + plan + tasks + research).

## Objetivo

1. Que el coordinador genere y envíe desde la app, con una plantilla de WhatsApp, un enlace
   personal por servidor (→ M2, M4).
2. Que el servidor elija su único horario de guardia desde el celular sin login, con badge de
   comida informativo (→ M3).
3. Que pueda cambiar o quitar su elección reabriendo el enlace (→ M1, M3).
4. Que la vista admin vea el resultado sin cambios de su parte (los signups ligados a
   `participantId` ya se renderizan) (→ M1).

## Historias de usuario

- **Como coordinador**, cuando arranco la organización de un retiro, quiero enviar por WhatsApp
  a cada servidor su enlace personal de guardias, para que cada quien elija su horario en vez
  de que yo los asigne a mano uno por uno.
- **Como servidor**, cuando recibo el mensaje en el celular, quiero tocar mi enlace y marcar un
  solo horario sin crear cuenta ni loguearme, para quedar inscrito en mi guardia.
- **Como servidor**, cuando mis planes cambian, quiero reabrir el mismo enlace y mover mi
  horario (o quitarlo), para que quede libre el cupo que ya no voy a usar.
- **Como coordinador**, cuando un servidor me dice que ya eligió, quiero ver su guardia en la
  vista admin del Santísimo como si la hubiera asignado yo.

## Requerimientos

- **R1 (M1)**: `apps/api/src/utils/santisimoInviteToken.ts` con
  `buildSantisimoInviteToken(retreatId, participantId)` (AES-256-GCM sobre JSON `{v:1,r,p}`,
  salida base64url de `iv|tag|ciphertext`), `parseSantisimoInviteToken(token)` (null ante
  cualquier fallo, jamás lanza, jamás loguea el token) y `buildSantisimoInviteUrl(base, ...)`.
  Clave = HMAC-SHA256(`INVITE_TOKEN_SECRET ?? SESSION_SECRET`, `'santisimo-guardia-invite-v1'`).
  Sin expiración embebida.
- **R2 (M1)**: `GET /api/santisimo/public/invite/:token` público: 404 uniforme para token
  inválido, retiro inexistente o sin `santisimoEnabled`, participante borrado o no inscrito.
  Respuesta whitelist: `{ participant:{firstName,fullName}, retreat:{parish,startDate,endDate},
  current:{slotId,startTime,endTime,mealWindow}|null, slots:[{id,startTime,endTime,capacity,
  signedUpCount,mealWindow,isDisabled,intention,selectable}] }`. Oculta slots pasados;
  `selectable = !isDisabled && (signedUpCount < capacity || slot actual)`.
- **R3 (M1)**: `POST /api/santisimo/public/invite/:token/signup` público con
  `publicParticipantLimiter` + `validateRequest(PublicSantisimoInviteSignupSchema)` (Zod en
  `packages/types/src/santisimo.ts`, body `{ slotId }`). Valida: slot del retiro (404),
  `isDisabled` (409), pasado (409), capacidad restando su propio signup (409). En transacción:
  borra los signups previos del participante en el retiro y crea uno nuevo con `participantId`,
  `name` = fullName, `phone`/`email` del participante, `ipAddress`, `isAngelito=false`,
  `autoAssigned=false`, sin `cancelToken`. Audit `santisimo_signup.invite_signup` (acción nueva
  en `packages/types/src/audit.ts`) con participantId + IP; **nunca el token ni la URL**.
- **R4 (M1)**: `DELETE /api/santisimo/public/invite/:token/signup` público con rate limit:
  quita la guardia actual del participante; audit `santisimo_signup.invite_cancel` con
  `via:'invite_token'`.
- **R5 (M2)**: `GET /api/santisimo/retreats/:retreatId/guardia-links` con
  `requirePermission('santisimo:read')` + `checkRetreatAccess`: `{ links:
  Record<participantId, url> }` para participantes `type='server'` no borrados del retiro.
- **R6 (M2)**: variable `participant.santisimoGuardiaLink` en `@repo/utils`
  (`ParticipantData` + `buildParticipantReplacements` + mock + entrada en el picker de
  `BaseMessageTemplateModal`) resuelta en los **tres caminos**: MessageDialog y
  WhatsAppSendQueue (fetch del mapa R5 al abrir, inyección por destinatario),
  BaseMessageTemplateModal (fetch con participante real; mock sin participante) y
  `messageSequenceService.resolveContent` (inyección lazy si el contenido la contiene, base
  `FRONTEND_URL`).
- **R7 (M3)**: ruta pública `/santisimo/servidor/:token` (`requiresAuth:false`, name
  `public-santisimo-server`) y vista `PublicSantisimoServerView.vue`: radios nativos de un
  solo slot, saludo con nombre, columnas por día, badge de comida en `mealWindow` (sin
  excluir), guardar/cambiar/quitar, estados loading/enlace inválido/retiro terminado/sin
  slots. i18n es **y** en. Cliente por `apps/web/src/services/api.ts` (grupo `santisimoApi`).
- **R8 (M4)**: entrada "Enviar enlaces de guardia por WhatsApp" en el menú ⠀⋮ Más acciones de
  `SantisimoAdminView` que abre `WhatsAppSendQueue` (montado, no `v-if`) con los servidores
  del retiro y plantillas retreat-scope de audiencia server (`getMessageTemplateAllowance` →
  `getMessageTemplateAudience`). Migración única de semilla (SQL plano, sin `@repo/types`,
  insert-if-absent): plantilla WhatsApp en texto plano con `{participant.firstName}`,
  `{retreat.parish}`, `{participant.santisimoGuardiaLink}` y aviso de enlace personal.
  Docs de usuario (`apps/web/src/docs/es/santisimo.md` + par en) y sección nueva en la skill
  del Santísimo — en su copia **versionada** `.ruler/skills/santisimo/SKILL.md` (la copia
  `.claude/skills/` del checkout main es local y no versionada; se sincroniza al cerrar).

## Criterios de aceptación

- **CA1 (M1)**: roundtrip del token recupera `{retreatId, participantId}`; token con un byte
  alterado, base64url inválido o clave distinta → `null`, sin lanzar.
- **CA2 (M1)**: GET con token válido devuelve slots no pasados con `selectable` correcto y
  `current` si existe; token editado y retiro con `santisimoEnabled=false` devuelven el mismo
  404 (sin distinguir la causa).
- **CA3 (M1)**: POST en slot libre crea exactamente 1 signup con `participantId` y datos del
  participante, y elimina el previo del mismo participante en el retiro (quedan siempre ≤1).
- **CA4 (M1)**: POST en slot ajeno lleno → 409 `CAPACITY`; POST sobre su slot actual lleno →
  éxito sin duplicar.
- **CA5 (M1)**: POST en slot `isDisabled` → 409; slot pasado → 409; slot de otro retiro → 404.
- **CA6 (M1)**: DELETE quita su signup y libera el cupo; las filas de audit de signup/cancel
  existen y su metadata no contiene el token ni la URL.
- **CA7 (M2)**: `resolveContent` sobre plantilla con `{participant.santisimoGuardiaLink}`
  produce URL con la base de `FRONTEND_URL` y token parseable; sobre plantilla sin la variable
  no agrega trabajo.
- **CA8 (M2)**: `guardia-links` devuelve solo servers no borrados; cada URL abre la vista R7
  con el nombre correcto.
- **CA9 (M3)**: en ventana de incógnito: elegir slot → confirmación; cambiar → el API refleja
  reemplazo; quitar → cupo liberado; slots `mealWindow` visibles, con badge y seleccionables.
- **CA10 (M4)**: desde la vista admin, la cola de WhatsApp muestra un enlace distinto por
  servidor y el mismo texto base de la plantilla sembrada.
- **CA11 (M4)**: tras `migration:run`, la plantilla sembrada existe con la variable y el aviso
  de no reenviar; el repositorio queda sin secretos nuevos versionados.

## Fuera de alcance

- Formatear las horas del enlace con la timezone del retiro (hoy browser-local, igual que las
  vistas existentes del Santísimo).
- reCAPTCHA en el POST del invite (R3 documenta la desviación; revertible).
- Revocación individual de enlaces: rotar `INVITE_TOKEN_SECRET` los invalida todos.
- Enlaces para angelitos/caminantes: el mapa de envío arma solo `type='server'` (si un
  coordinador copia el enlace a otra persona inscrita, funciona — decisión 5).
- Envío automático por API de WhatsApp (Meta Cloud API/Twilio): sigue siendo cola asistida.
- Excluir slots por responsabilidad del minuto a minuto en la vista del enlace (si el
  coordinador mueve horarios después, `resolveSantisimoConflicts` ya remueve signups que
  chocan — comportamiento existente).

## Reconcile (2026-10-14)

Cerrado M0-M5 en `9af9882d` → `91006834` + cierre M5. R1-R8 construidos según lo escrito;
el detalle por milestone (tests corridos, verificaciones por el dato) vive en `tasks.md`.

**Verificación de los CA**:

- CA1-CA6: tests Jest de M1 (token unitario + integración service + controller + wiring).
- CA7-CA8: tests Jest de M2 (`resolveContent`, endpoint `guardia-links`) + Vitest de la
  variable en `apps/web/src/utils/__tests__/santisimoGuardiaLink.test.ts`.
- CA9: e2e `apps/web/tests/e2e/santisimo-guardia-invite.spec.ts` con **emulación móvil**
  (`devices['iPhone 13']`, pedido explícito del usuario): elegir → confirmación, cambiar →
  reemplazo verificado por el dato contra el API (`signedUpCount` 1→0/0→1), quitar → cupo
  liberado, token editado → mensaje amigable. El badge de comida (CA4-UI) se verifica en el
  e2e solo si el retiro fixture tiene un `mealWindow` futuro con cupo; con todos llenos el
  spec lo anota y sigue (la cobertura completa del badge está en los 8 Vitest de la vista M3).
- CA10: e2e admin — la cola abre el popup `wa.me` por servidor y el **enlace del popup
  resuelve al participante correcto** (GET público del token del popup → `fullName`). No se
  compara el string del token contra un fetch previo del mapa: ver desviación 3.
- CA11: migración verificada por el dato contra copia aislada (1 plantilla global + 8 por
  retiro, CHECK vigente, `foreign_key_check` limpio, 39→40 globales preservadas). Sin
  secretos nuevos versionados (gitleaks en pre-commit).

**Desviaciones y hallazgos del cierre**:

1. **`getGuardiaLinks` filtra membresías canceladas y participantes borrados** (R5 decía
   "servers no borrados"): `retreat_participants.isCancelled = false` además del borrado
   lógico. Alineado con `resolveInviteContext` (membresía activa) — sin esto, la cola
   ofrecería enlaces de servidores que ya no van.
2. **Audit i18n**: las acciones `santisimo_signup.invite_signup` / `.invite_cancel` (M1)
   quedaron sin etiqueta hasta que `auditLocaleCoverage.test.ts` lo cazó; el fix entró en M3.
   El hueco era del checklist de M1, no del diseño.
3. **El token se regenera en cada generación** (IV aleatorio de AES-GCM): cada GET de
   `guardia-links` produce un token distinto — igualmente válido — para el mismo
   participante. Consecuencia del diseño stateless (decisión 4), no un bug: todos los tokens
   emitidos siguen vivos hasta el cierre del retiro. Relevante para tests (no comparar
   strings entre fetches) y para quien espere un enlace estable por participante.
4. **Skill del Santísimo**: la sección nueva vive en `.ruler/skills/santisimo/SKILL.md`
   (versionada); la copia `.claude/skills/` del checkout main es local y quedó
   desincronizada hasta el cierre del feature. R8 corregido en este mismo commit.
5. **e2e y rate limit**: el spec gasta 4 mutaciones públicas por corrida y el
   `publicParticipantLimiter` (10/hora por IP) vuelve falsa la 3ª corrida — el 429 se
   muestra como error genérico de guardado. El dev contra el que corre debe arrancar con
   `NODE_ENV=development SKIP_RATE_LIMIT=true` (documentado en el header del spec).
6. **CA9 decía "ventana de incógnito"**: la verificación real fue en contexto limpio de
   Playwright con emulación móvil — equivalente (sin cookies de sesión), y además cubre el
   factor móvil que motivó el feature.
