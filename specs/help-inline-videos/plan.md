# Plan: help-inline-videos

Derivado de `spec.md` (R1-R6, CA1-CA6). Milestones cortos, cada uno con commit y verificación
propia. Concurrencia de jest: **una corrida a la vez** (regla del repo). Los tests de este
feature son Vitest (web), no comparten SQLite.

## M0 — worktree + specs SDD (hecho)

- Worktree `.claude/worktrees/help-inline-videos`, branch `worktree-help-inline-videos`
  (naming del tool `EnterWorktree`; el plan original decía `help-inline-videos` a secas).
- `pnpm install` (store compartido, 7.8s) + build de `@repo/ui` (el `cp -ac` del main se cayó
  porque el entry se llama `index.es.js`, no `index.js`; el build tardó 3s) +
  `rm -rf apps/web/node_modules/.vite`.
- `research.md`, `spec.md`, `plan.md`, `tasks.md`. Anclas contra `2b170c84`.
- Commit `docs(specs): help inline videos spec (M0)`.

**Verificación**: `git status` limpio tras el commit.

## M1 — implementación (todo frontend)

Orden dentro del milestone (cada paso compila antes del siguiente):

1. **Helper** `apps/web/src/utils/helpMarkdown.ts` (R1): `extractYouTubeId` + `renderHelpMarkdown`
   (parse → DOMParser → inyección de attrs → sanitize default + `ADD_ATTR: ['target']`).
2. **Tests del helper** `apps/web/src/utils/__tests__/helpMarkdown.test.ts` (R6): los casos de
   CA5/CA6 + `extractYouTubeId`.
3. **Modal** `apps/web/src/components/help/HelpVideoModal.vue` (R2): patrón `LandingVideos.vue`;
   íconos `X`/`ExternalLink` ya están en el mock global de lucide.
4. **Test del modal** `apps/web/src/components/help/__tests__/HelpVideoModal.test.ts` (R6).
5. **Integración**: `HelpView.vue` y `HelpPanel.vue` (R3) — helper + delegación de clic +
   montar el modal; `helpStore.ts` (R4) — solo el helper.
6. **i18n** (R5): `help.video.title` y `help.video.openInNewWindow` en `es.json` **y** `en.json`
   (namespace top-level `help`, junto a `panel`/`sections`).

**Verificación de M1**:

```bash
pnpm --filter web test src/utils/__tests__/helpMarkdown.test.ts
pnpm --filter web test src/components/help/__tests__/HelpVideoModal.test.ts
pnpm --filter web test src/stores/__tests__/helpStore.test.ts   # sin cambios, debe seguir verde
pnpm --filter web test src/views/__tests__/LandingView.test.ts \
                 src/components/landing/__tests__/LandingVideos.test.ts  # intactos, verdes
pnpm --filter web build                                          # vue-tsc: imports sin usar
```

Commit `feat(help): reproducción inline de videos en modal + abrir en ventana nueva (M1)`.

## M2 — smoke + reconciliación

- Dev del worktree: `start-worktree-dev.sh` (plan original: 3002/5174; reales: **3004/5176**,
  ambos pares anteriores ocupados por otras sesiones). Login
  `leonardo.bolanos@gmail.com` / `123456`.
- CA1: `/help` → clic «Ver video tutorial» → modal reproduce inline.
- CA2: HelpPanel desde una vista con ayuda contextual; verificar en ancho móvil (devtools).
- CA3: botón «Abrir en ventana nueva» → tab nueva de YouTube; verificar `noopener` (no hay
  `window.opener`).
- CA4: cerrar con ✕ / backdrop / Escape → el audio se corta (iframe desmontado).
- Locale `en`: modal y botones traducidos.
- **Reconciliación de la spec** (obligatoria): repasar `research.md`/`spec.md` contra el código
  final; corregir en el mismo commit lo que difiera; anotar lo descartado. Pasar el estado de
  `spec.md` a "implementado (<commit>)".

Commit final `docs(specs): reconciliación help-inline-videos (M2)`.
