# Tasks: santisimo-guardia-links

Convención: al cerrar cada milestone se marcan los items y se añade una línea `**Done**:`
con fecha. Toda desviación del plan va en una sección `### Desviaciones <fecha>` al pie del
milestone correspondiente.

## M0 — worktree + specs SDD

- [x] Branch `santisimo-guardia-links` + worktree `.claude/worktrees/santisimo-guardia-links`
- [x] `pnpm install` + copia de `apps/api/.env` + `pnpm --filter @repo/ui build` +
      limpieza de `apps/web/node_modules/.vite`
- [x] `spec.md` (problema, decisiones fechadas, R1-R8, CA1-CA11, fuera de alcance)
- [x] `research.md` (anclas del código pre-M1, verificadas contra `c8363d08`)
- [x] `plan.md` (M0-M5 con verificación)
- [x] `tasks.md`
- [x] Commit `docs(specs): ... (M0)` — `9af9882d`

## M1 — backend: token util + endpoints públicos del invite

- [x] `apps/api/src/utils/santisimoInviteToken.ts` (R1) + test unitario puro
- [x] `PublicSantisimoInviteSignupSchema` + tipos en `packages/types/src/santisimo.ts`
- [x] Acciones `santisimo_signup.invite_signup` / `.invite_cancel` en `packages/types/src/audit.ts`
- [x] `santisimoService.getInviteData` / `inviteSignup` / `inviteCancel` (transacción, audit)
- [x] Handlers `publicGetInvite` / `publicInviteSignup` / `publicInviteCancel` en el controller
- [x] Rutas públicas en `santisimoRoutes.ts` antes de `router.use(isAuthenticated)`
      (+ rate limit `publicParticipantLimiter` en POST/DELETE)
- [x] Tests Jest: token roundtrip/tamper/clave; CA2-CA6; wiring (sin auth, CSRF-exentas)
- [x] `pnpm --filter api exec tsc --noEmit` sin errores nuevos vs baseline master
- [x] Commit `feat(api): ... (M1)` — `5a74a746`

**Done**: 2026-10-14 — 39 tests nuevos (11 token + 13 integración service + 11 controller + 4
wiring source-level), tsc sin errores en archivos tocados (los 146 del baseline viven en
tableMesaService/participantService/etc.), `pnpm --filter api build` verde (los 2 matches de
`__dirname` en dist/index.js son el shim ESM preexistente de `src/index.ts`, no código nuevo).

## M2 — variable `participant.santisimoGuardiaLink` en los 3 caminos

- [x] `ParticipantData.santisimoGuardiaLink` + builder + mock en `packages/utils`
- [x] `GET /santisimo/retreats/:retreatId/guardia-links` (R5)
- [x] Inyección en `MessageDialog.vue` (fetch del mapa al abrir + `updateMessagePreview`)
- [x] Inyección en `WhatsAppSendQueue.vue` (fetch al abrir + `resolvedMessageFor`)
- [x] Inyección en `BaseMessageTemplateModal.vue` (preview con participante real) + picker
- [x] Inyección lazy en `messageSequenceService.resolveContent`
- [x] Tests: utils, wiring endpoint, `resolveContent` (CA7-CA8)
- [x] Commit `feat(templates): ... (M2)`

**Done**: 2026-10-14 — 23 tests jest de M2 verdes (4 integración getGuardiaLinks/resolveContent
+ 14 controller con `getGuardiaLinks` 403/200 + 5 wiring incl. ruta autenticada y match de URL
en `api.ts` del web), 3 tests Vitest de la variable (`apps/web/src/utils/__tests__/santisimoGuardiaLink.test.ts`),
255 tests Vitest existentes de los 3 componentes tocados y las vistas que los montan siguen
verdes, `tsc --noEmit` api en 146 (= baseline) y `vue-tsc --noEmit` web en 0.

### Desviaciones 2026-10-14 (M2)

- `santisimoService.getGuardiaLinks` filtra por `retreat_participants.type='server'` con
  `isCancelled:false` y participante no borrado — el plan decía "participantes type='server'",
  sin mencionar membresías canceladas; se alinea con `resolveInviteContext` (membresía activa).

## M3 — vista pública `/santisimo/servidor/:token`

- [x] Ruta `public-santisimo-server` con `requiresAuth:false`
- [x] `PublicSantisimoServerView.vue` (radios, badge de comida, guardar/cambiar/quitar, errores)
- [x] `api.ts`: 4 métodos + tipos en el grupo `santisimoApi`
- [x] i18n es+en (`santisimo.serverInvite.*`); allowlist lucide si hay ícono nuevo
- [x] Test Vitest de la vista (CA9 parcial)
- [x] `pnpm --filter web exec vue-tsc --noEmit` sin errores nuevos
- [x] Commit `feat(web): ... (M3)`

**Done**: 2026-10-14 — 8 tests Vitest de la vista (columnas/radios/name único, badge 🍽
solo en mealWindow, lleno deshabilitado, 404 → mensaje único, guardar + recarga, 409
CAPACITY amigable, guardia actual con preselección y quitar, sin slots). Sin íconos lucide
nuevos (✝ y 🍽 literales como en `PublicSantisimoView`), así que no se tocó el allowlist.
vue-tsc 0; locales válidos y 17/17 en `src/locales/__tests__/`.

### Desviaciones 2026-10-14 (M3)

- `auditLocaleCoverage.test.ts` cazó que las acciones de audit de M1
  (`santisimo_signup.invite_signup` / `.invite_cancel`) no tenían etiqueta i18n: añadidas
  aquí a `audit.actions.santisimo_signup` en es+en (el hueco era de M1, el fix entra en M3).

## M4 — entrada admin + plantilla sembrada + docs

- [x] Ítem "Enviar enlaces de guardia por WhatsApp" en `SantisimoAdminView` (⋮ Más acciones,
      `useRekaDialogFix`/`deferOpen` si aplica, WhatsAppSendQueue montado)
- [x] Migración semilla de plantilla WhatsApp (skill `sqlite-migrations`; SQL plano, sin
      `@repo/types`, insert-if-absent)
- [x] Docs usuario es/en + sección nueva en `.claude/skills/santisimo/SKILL.md`
- [x] Verificar CA10-CA11
- [x] Commit `feat(web+api): ... (M4)`

**Done**: 2026-10-14 — El menú ⋮ de `SantisimoAdminView` es un div plano (no reka
DropdownMenu), así que NO hace falta `useRekaDialogFix`; el ítem abre la cola montada sin
`v-if`. Destinatarios filtrados por `type==='server'` **y** presencia en el mapa `guardia-links`
(paridad con el backend: membresía activa, no borrado). Plantillas ofertadas: audiencia
server|general, scope ≠ community. Migración `20261014120000` verificada por el dato contra
copia aislada del worktree (`database.worktree.sqlite`): 1 plantilla global + 8 por retiro, CHECK
vigente con el tipo nuevo, `PRAGMA foreign_key_check` limpio, recreate preservó las 39 globales
existentes (39→40), mensaje con `{participant.santisimoGuardiaLink}` + aviso de no reenviar.
tsc api 146 (baseline); vue-tsc 0; vitest 19/19 (locale coverage + SantisimoAdminView.help +
PublicSantisimoServerView). Sin secretos nuevos versionados.

**Nota CA10/CA11**: CA11 verificado arriba. CA10 (cola con enlace distinto por servidor en la
UI real) se cierra en M5 con el dev del worktree arriba; la resolución por destinatario ya
está cubierta por los tests de M2 en `WhatsAppSendQueue`.

### Desviaciones 2026-10-14 (M4)

- La skill del Santísimo vive versionada en `.ruler/skills/santisimo/SKILL.md` (la copia de
  `.claude/skills/santisimo/` del checkout main es local y no versionada): la sección nueva
  "Enlaces personales de guardia (invite cifrado)" + 2 entradas de troubleshooting entraron en
  la versión versionada; la copia local del main se sincroniza al cerrar el feature.

## M5 — verificación end-to-end + reconcile

- [x] Dev del worktree arriba (puertos libres verificados) + flujo CA2-CA10 manual
- [x] `pnpm --filter api build` + `pnpm --filter web build`
- [x] `tasks.md` cerrado + **Reconcile** en `spec.md`
- [x] URL del dev entregada al usuario
- [x] Commit `docs(specs): reconcile (M5)` — push/PR solo con visto bueno

**Done**: 2026-10-14 — Dev del worktree arriba (API `:3002`, web `:5174`, DB
`database.worktree.sqlite` con la migración auto-aplicada al arranque — camino de prod
validado). Flujo público verificado end-to-end por API (GET invite → signup → reemplazo →
DELETE 204) y por UI con e2e móvil: `apps/web/tests/e2e/santisimo-guardia-invite.spec.ts`
**3/3 verde ×2 corridas consecutivas** (elegir/cambiar/quitar con verificación por el dato
`signedUpCount` 1→0/0→1, token editado → mensaje amigable, cola admin CA10: popup wa.me cuyo
enlace resuelve al participante correcto por teléfono). Builds api+web verdes;
`grep __dirname dist/index.js` = 2 (shim preexistente de `src/index.ts`, sin cambios).
Reconcile escrito en `spec.md` con 6 desviaciones/hallazgos.

### Desviaciones 2026-10-14 (M5)

- El e2e móvil fallaba de forma consistente tras varias corridas: **429 del
  `publicParticipantLimiter`** (10 mutaciones públicas/hora por IP; el spec gasta 4 por
  corrida más los sondeos manuales). Fix: el dev del worktree arranca con
  `NODE_ENV=development SKIP_RATE_LIMIT=true` (salida canónica de `.claude/rules/e2e-tests.md`);
  documentado en el header del spec.
- El assert inicial de CA10 comparaba el token del popup contra el capturado en beforeAll:
  imposible de pasar, porque **cada GET de `guardia-links` regenera el token** (IV aleatorio
  AES-GCM; mismo participante, tokens coexistentes válidos). El spec ahora extrae el token del
  popup y verifica contra el API que resuelve al participante correcto (`fullName`).
- API re-arrancada manualmente (no con el script del skill, que re-copia la DB del main) tras
  matar el proceso viejo del puerto 3002; había que matar además un nodemon huérfano (PID
  1192) que habría revivido al primer guardado de un archivo del api.
