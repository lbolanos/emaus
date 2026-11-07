# Tasks: help-inline-videos

Identificadores estables (`T1`…`T11`); si una tarea se reparte o se agrega derivada, sufijo
`-bis` / letra (`T4b`), nunca renumerar.

## M0 — specs

- [x] T1 — Worktree + setup (`pnpm install`, build `@repo/ui`, limpiar `.vite`).
- [x] T2 — `research.md` con anclas verificadas contra `2b170c84`.
- [x] T3 — `spec.md` (R1-R6, CA1-CA6, decisiones, fuera de alcance).
- [x] T4 — `plan.md` + `tasks.md`. Commit `docs(specs): … (M0)`.

## M1 — implementación

- [x] T5 — `apps/web/src/utils/helpMarkdown.ts`: `extractYouTubeId` + `renderHelpMarkdown`.
- [x] T6 — `apps/web/src/utils/__tests__/helpMarkdown.test.ts` (CA5, CA6, 4 formas de URL).
- [x] T7 — `apps/web/src/components/help/HelpVideoModal.vue` (R2).
- [x] T8 — `apps/web/src/components/help/__tests__/HelpVideoModal.test.ts` (CA3, CA4).
- [x] T9 — Integración `HelpView.vue` + `HelpPanel.vue` (helper + delegación + modal) (CA1, CA2).
- [x] T10 — Integración `helpStore.ts` (helper; caché intacta).
- [x] T11 — i18n `help.video.*` en `es.json` y `en.json`.
- [x] T12 — Verificación de M1 (5 suites, 103 tests + `pnpm --filter web build`) y commit
  `ea81ada3`.

## M2 — smoke + cierre

- [x] T13 — Smoke CA1-CA4 + CA7 en dev del worktree (3004/5176; 3002/5174 y 3003/5175 ocupados
  por otras sesiones). Navegación SPA (login → Walkers → panel → ayuda); corrió en locale `en`.
  8/8 PASS.
- [x] T14 — Reconciliación de specs (estado, símbolos reales, descartes) + commit final.
- [x] T15-bis — (descubierto en T13) Fix R7: `letters` + `server-briefing` en
  `routesRequiringId` del Sidebar — bucle de recarga pre-existente de master en `/app/help`.
  CA7. Commit `918b96c2`.
