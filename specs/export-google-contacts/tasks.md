# Tasks: exportar participantes a Google Contacts

## M0 — spec

- [x] spec.md (prospectivo, decisiones 2026-10-20)

## M1 — util + tests

- [x] `toE164Phone` exportado en `apps/web/src/utils/phone.ts` (refactor de `withCallingCode`)
- [x] `apps/web/src/utils/googleContactsExport.ts` (`buildGoogleContactsCsv`)
- [x] tests: `__tests__/phone.test.ts` (helper) + `__tests__/googleContactsExport.test.ts` (CA1-CA5)
- [x] `pnpm --filter web test` verde en los archivos tocados (43 tests)

## M2 — UI + i18n

- [x] radio Google Contacts en `ExportParticipantsModal` (R3), emit `export-google-contacts` (R4)
- [x] handler + descarga en `ParticipantList.vue` (sin audit de salud, R6)
- [x] claves i18n es + en (R5)
- [x] test del modal (CA6/CA7) y del handler (CA9) — suite conjunta 125/125, `vue-tsc --noEmit` limpio

## M3 — verificación + docs

- [x] levantar dev del worktree (skill `worktree-testing`), flujo completo en `/app/walkers`
- [x] docs: sección en `apps/web/src/docs/es/walkers.md` + `docs/features/export-google-contacts.md`
- [ ] reporte acumulado + esperar OK de commit

## Desviaciones

- La sección de ayuda in-app fue a `apps/web/src/docs/es/walkers.md` (la vista donde vive el
  modal), no a `crm.md` como decía el plan: la exportación Excel/CSV existente tampoco está
  documentada en `crm.md` y el flujo es operativo de la lista de caminantes, no del CRM.

## M4 — defaults (2026-10-21, pedido post-reconcile)

- [x] filename default con `.csv` incluido (sin duplicar si el custom ya lo trae)
- [x] identificador prellenado con `Emaus ` + `retreat_number_version` del retiro activo
- [x] tests (84/84 en modal+ParticipantList, `vue-tsc` limpio) + spec (sección "Cambio posterior")
