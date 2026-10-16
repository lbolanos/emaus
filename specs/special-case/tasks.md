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

- [ ] Migration `20261016120000_AddSpecialCaseToRetreatParticipants.ts` (timestamp del día real;
      up: 3 ADD COLUMN con guard PRAGMA idempotente; down: 3 DROP COLUMN; SQL plano)
- [ ] `CreateSchema.ts`: 3 columnas en el CREATE TABLE de `retreat_participants`
- [ ] `retreatParticipant.entity.ts`: 3 `@Column` + comentario de régimen health
- [ ] `participant.entity.ts`: 3 virtuales + `toJSON`
- [ ] `packages/types/src/permissions.ts`: los 3 en `SENSITIVE_HEALTH_FIELDS`
- [ ] `packages/types/src/index.ts`: `participantSchema` (bool + enum + texto nullable)
- [ ] `participantService.ts`: overlay `findAllParticipants` (select + asignación);
      `updateParticipant` (destructure + `rpUpdates` + higiene `specialCase === false` +
      `oldAuditSnapshot` + virtuales del retorno); `PARTICIPANT_AUDIT_FIELDS`
- [ ] `participantRetreatHydration.ts`: hidratar los 3 (ambas ramas)
- [ ] `retreatParticipantController.ts`: extender `stripHealthFromRetreatParticipants` (hueco
      FR-4)
- [ ] Migración corre en el worktree (CLI); `PRAGMA table_info` muestra las 3 columnas
- [ ] Commit `feat(api): special-case flag with health regime`

## M2 — Backend: tests

- [ ] `specialCaseWritePath.test.ts` nuevo: marca con categoría (fila del retiro de contexto,
      retorno la refleja); desmarcado persiste false Y limpia categoría+nota del caso (con
      `notes` del caminante intacto); payload sin los campos no borra; multi-retiro sin mezclar
- [ ] `healthDataExposureGuards.test.ts`: strip en GET lista/ficha sin health; 403 en PUT con
      cualquiera de los 3 (incl. `specialCaseNotes: ''`); respuesta del update strippeada;
      `/retreat-participants` sin las columnas (regresión FR-4)
- [ ] Audit: diff del update registra marca (con categoría) y desmarca
- [ ] 422 con categoría fuera del enum
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
