# Tasks: help-inline-videos

Identificadores estables (`T1`…`T11`); si una tarea se reparte o se agrega derivada, sufijo
`-bis` / letra (`T4b`), nunca renumerar.

## M0 — specs

- [x] T1 — Worktree + setup (`pnpm install`, build `@repo/ui`, limpiar `.vite`).
- [x] T2 — `research.md` con anclas verificadas contra `2b170c84`.
- [x] T3 — `spec.md` (R1-R6, CA1-CA6, decisiones, fuera de alcance).
- [x] T4 — `plan.md` + `tasks.md`. Commit `docs(specs): … (M0)`.

## M1 — implementación

- [ ] T5 — `apps/web/src/utils/helpMarkdown.ts`: `extractYouTubeId` + `renderHelpMarkdown`.
- [ ] T6 — `apps/web/src/utils/__tests__/helpMarkdown.test.ts` (CA5, CA6, 4 formas de URL).
- [ ] T7 — `apps/web/src/components/help/HelpVideoModal.vue` (R2).
- [ ] T8 — `apps/web/src/components/help/__tests__/HelpVideoModal.test.ts` (CA3, CA4).
- [ ] T9 — Integración `HelpView.vue` + `HelpPanel.vue` (helper + delegación + modal) (CA1, CA2).
- [ ] T10 — Integración `helpStore.ts` (helper; caché intacta).
- [ ] T11 — i18n `help.video.*` en `es.json` y `en.json`.
- [ ] T12 — Verificación de M1 (4 suites + `pnpm --filter web build`) y commit.

## M2 — smoke + cierre

- [ ] T13 — Smoke CA1-CA4 en dev del worktree (3002/5174), ambos locales.
- [ ] T14 — Reconciliación de specs (estado, símbolos reales, descartes) + commit final.
