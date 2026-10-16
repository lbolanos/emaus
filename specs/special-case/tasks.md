# Tasks: special-case

> SDD tasks — versión 1.0 (2026-10-15). Al cerrar cada milestone se marcan los items y se añade
> una línea `**Done**:` con fecha. Toda desviación va en `### Desviaciones <fecha>` al pie del
> milestone.

## M0 — worktree + specs SDD

- [x] Worktree `.claude/worktrees/special-case`, branch `worktree-special-case` desde
      `origin/master` (`781875e8`)
- [x] `pnpm install`
- [x] Copiar `apps/api/.env` del worktree pays-at-house + `packages/ui/dist` (`cp -ac`)
- [x] `specs/special-case/spec.md` (Decisiones D1-D4 + defaults)
- [x] `specs/special-case/research.md`
- [x] `specs/special-case/plan.md`
- [x] `specs/special-case/tasks.md`
- [x] **Gate**: Leonardo revisa el spec antes de codear M1 — aprobado 2026-10-15. D2
      confirmado (treasurer/logistics también ven el caso, igual que la ficha médica); el
      motivo del caso se borra al atender (categoría + `specialCaseNotes`; las notas generales
      del caminante, `notes`, no se tocan jamás).

## M1 — Backend: modelo + migración + exposición

- [x] Migration `20261015180000_AddSpecialCaseToRetreatParticipants.ts` (timestamp del día real;
      up: 3 ADD COLUMN con guard PRAGMA idempotente; down: 3 DROP COLUMN; SQL plano)
- [x] `CreateSchema.ts`: 3 columnas en el CREATE TABLE de `retreat_participants`
- [x] `retreatParticipant.entity.ts`: 3 `@Column` + comentario de régimen health
- [x] `participant.entity.ts`: 3 virtuales + `toJSON`
- [x] `packages/types/src/permissions.ts`: los 3 en `SENSITIVE_HEALTH_FIELDS`
- [x] `packages/types/src/index.ts`: `participantSchema` (bool + enum + texto nullable)
- [x] `participantService.ts`: overlay `findAllParticipants` (select + asignación);
      `updateParticipant` (destructure + `rpUpdates` + higiene `specialCase === false` +
      `oldAuditSnapshot` + virtuales del retorno); `PARTICIPANT_AUDIT_FIELDS`
- [x] `participantRetreatHydration.ts`: hidratar los 3 (ambas ramas)
- [x] `retreatParticipantController.ts`: extender `stripHealthFromRetreatParticipants` (hueco
      FR-4)
- [x] Migración corre en el worktree (CLI); `PRAGMA table_info` muestra las 3 columnas
- [x] Commit `feat(api): special-case flag with health regime`

**Done**: 2026-10-15. Verificado: migración sobre copia de la DB de dev
(`DB_DATABASE=database.worktree.sqlite`, 606 filas rp, 3 columnas, `specialCase=0` en todas);
re-ejecución con columnas presentes pasa por el guard; SQL del `down` + `up` desde cero sobre
copia desechable con `integrity_check ok`. `tsc` del api sin errores nuevos contra la línea base
(los ~240 preexistentes no cambian); `vue-tsc` del web exit 0; `pnpm --filter api build` ok; 40
suites api relacionadas (incl. `tests/migrations`) en verde, 602 tests.

### Desviaciones 2026-10-15

- **Timestamp de la migración**: `20261015180000`, no el tentativo `20261016120000` — el día
  real de M1 es el 15 y queda después de `20261015120000` (pays-at-house).
- **FR-4 ampliado**: `stripHealthFromRetreatParticipants` ahora strippa también la fila rp
  (con `stripSensitiveHealthFields`, así que incluye `notes` de la fila además de `specialCase*`)
  y acepta item o lista. Se aplica a los **11** handlers de `retreatParticipantController` que
  devuelven filas rp, no solo a los 2 de research: `/history/participant/:id`, `/history/user/*`
  y `/history/charlistas` exigen solo `participant:read` (lo tiene `regular_server`) y
  `/history/my-retreats*` le devolvería al propio caminante la marca del palanquero — todos
  habrían servido `specialCase*` (incumple HU-4/CA-7). Efecto colateral: cierra la fuga
  preexistente de `notes` de la fila rp y de la salud de `.participant` en esos endpoints. Ninguna
  vista web lee salud ni `notes` de `/history/*` (consumidor único: `participantHistoryStore`).
- **`PUT /participants/self`**: su respuesta llevaba los virtuales per-retiro sin strip; ahora
  quita `SPECIAL_CASE_FIELDS` a quien no tiene `participant:health`. Solo esos 3, no toda la
  lista: el resto del eco son datos del propio usuario, algunos escritos por esa misma petición
  (`selfUpdateParticipant.test.ts` lo fija).
- **CA-6**: categoría fuera del enum → **400**, no 422. `validateRequest` responde 400 a todo
  error de zod; M2 asierta 400.
- **Constantes nuevas en `@repo/types`** (para reuso en M3): `SPECIAL_CASE_FIELDS`
  (`permissions.ts`, se expande dentro de `SENSITIVE_HEALTH_FIELDS`) y `SPECIAL_CASE_CATEGORIES`
  / `SpecialCaseCategory` (`index.ts`, alimenta el `z.enum`).
- **`PARTICIPANT_AUDIT_FIELDS`**: comentario de excepción — el array dice excluir datos médicos;
  el caso especial entra igual porque su traza es el objetivo (D1) y la auditoría solo la leen
  `audit:read`, creador y admin del retiro, todos con `participant:health`.
- **Riesgo residual, sin tocar**: `POST/PUT /history` (`participant:update`, `Object.assign` del
  body crudo) puede escribir `specialCase*` (y `notes`, ya hoy) sin el 403 de salud. No es
  explotable con los roles actuales (todo rol con `participant:update` tiene
  `participant:health`), pero dejaría de serlo si eso cambia. Fuera de alcance.

## M2 — Backend: tests

- [ ] `specialCaseWritePath.test.ts` nuevo: marca con categoría (fila del retiro de contexto,
      retorno la refleja); desmarcado persiste false Y limpia categoría+nota del caso (con
      `notes` del caminante intacto); payload sin los campos no borra; multi-retiro sin mezclar
- [ ] `healthDataExposureGuards.test.ts`: strip en GET lista/ficha sin health; 403 en PUT con
      cualquiera de los 3 (incl. `specialCaseNotes: ''`); respuesta del update strippeada;
      `/retreat-participants` sin las columnas (regresión FR-4)
- [ ] Superficie extra de M1 (ver desviaciones): `/history/participant/:id` y
      `/history/my-retreats` sin `specialCase*` ni `notes` de la fila para rol sin health (y con
      ellos para rol con health); `PUT /participants/self` sin `specialCase*` en la respuesta
- [ ] Audit: diff del update registra marca (con categoría) y desmarca
- [ ] 400 con categoría fuera del enum (era 422 en el spec; ver desviaciones M1)
- [ ] Suite api en verde — 2 shards secuenciales, `npx jest` directo con
      `--max-old-space-size`
- [ ] Commit `test(api): special-case coverage`

## M3 — Frontend

- [ ] `ParticipantSpecialCaseToggle.vue` nuevo (diálogo categoría+nota; gates update+health;
      desmarque con confirm)
- [ ] `ParticipantList.vue`: prop `inlineSpecialCaseBadge` + badge ámbar + toggle en celda
      propia (sin tocar la rama `lastPaymentDate`)
- [ ] `PalancasView.vue`: encender el flag
- [ ] `SpecialCasesView.vue` nueva (bandeja; plantilla WalkerView; contacto + quitar)
- [ ] Router: ruta `special-cases` gated `participant:health`
- [ ] Sidebar: ítem en `communications` (ícono `Flag`, gate health) + `Flag` al allowlist
- [ ] `RetreatDashboardView.vue`: tarjeta gated health con contador computed; sección
      `specialCases` en `dashboardSettingsStore.ts`
- [ ] i18n es + en (todas las keys de plan.md)
- [ ] Docs `apps/web/src/docs/{es,en}/special-cases.md` + edición de `palancas.md` y
      `retreat-dashboard.md`
- [ ] Tests web: toggle, bandeja, `Sidebar.test.ts`, `ParticipantList.test.ts`
- [ ] `pnpm --filter web test` en verde + `vue-tsc --noEmit`
- [ ] Commit `feat(web): special-case flag, inbox and dashboard card`

## M4 — Verificación end-to-end + cierre

- [ ] Dev del worktree (`start-worktree-dev.sh`, puertos libres) y guion con persistencia real:
  1. Migración aplicada (PRAGMA: 3 columnas)
  2. Marcar como perfil communications (badge ámbar en Palancas; retorno con los 3 campos)
  3. Bandeja lista al marcado con categoría/nota; tarjeta dashboard = 1 y navega
  4. Quitar → motivo del caso limpio (`notes` intacto), bandeja vacía, contador 0
  5. Rol sin health: sin badge/ítem/tarjeta; payloads sin los campos
  6. Dos retiros: marca per-retiro sin mezclar
  7. Restaurar el estado de los participantes usados
- [ ] E2E `tests/e2e/special-case.spec.ts` (overlay GET, PUT abortado asertado, sin persistir;
      login por UI con skip por respuesta del API)
- [ ] `pnpm --filter api test` (2 shards) + `pnpm --filter web test` + `vue-tsc` limpio
- [ ] `pnpm --filter api build` (gate bundle ESM)
- [ ] `## Reconcile` en spec.md (cada CA contra lo implementado)
- [ ] PR a master; esperar `gh pr checks` en verde antes de merge
- [ ] Commit final `docs(specs): special-case reconcile`
