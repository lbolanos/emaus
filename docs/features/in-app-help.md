# Ayuda in-app ("Obtener ayuda para esta página")

El panel de ayuda contextual se abre desde el sidebar (menú del usuario → "Obtener ayuda para
esta página", `Sidebar.vue` → `isHelpPanelOpen`) y muestra el doc markdown de la sección que
corresponde a la **ruta actual**.

## Cómo resuelve el contenido

- `apps/web/src/config/helpIndex.ts` — lista de secciones. `getHelpByRoute(routeName)` devuelve la
  **primera** sección cuyo `routeContext` incluye la ruta actual (por **substring**:
  `routeName.includes(ctx)`).
- `apps/web/src/components/HelpPanel.vue` — carga `@/docs/${locale}/${section.key}.md` con `marked`
  y lo sanea con `DOMPurify` (⚠️ **quita iframes** → para videos usá un enlace, no `<iframe>`).

## Agregar ayuda a una página nueva

1. Crear el doc en **es y en**: `apps/web/src/docs/es/<key>.md` y `apps/web/src/docs/en/<key>.md`.
   Estilo: título H1, 1 párrafo de intro, 2–4 secciones cortas. Basá el contenido en la vista real.
   Si hay video, poné arriba: `📺 **[Ver video tutorial](https://youtu.be/<id>)**`.
2. Agregar la sección en `helpIndex.ts`:
   ```ts
   {
     key: '<key>',                       // == nombre del archivo .md (HelpPanel carga `${key}.md`)
     title: 'English Title',
     titleEs: 'Título en Español',       // title != titleEs (lo exige el test bilingüe)
     icon: 'mdi-...',
     routeContext: ['<route-name>'],     // nombres de RUTA (no paths); cubre por includes()
     topics: [{ key: '<key>-overview', title: 'Overview', titleEs: 'Descripción general', content: '<key>.md' }],
   }
   ```
3. Agregar un test de resolución en `helpIndex.test.ts` (`getHelpByRoute('<route>')?.key === '<key>'`).

## Gotchas (ganados a pulso)

- **`key` == nombre del archivo .md.** `HelpPanel` carga `${section.key}.md`, NO `topic.content`.
  Si no coinciden, el panel muestra "Error al cargar el contenido".
- **`routeContext` usa nombres de RUTA, no paths, y matchea por substring.** Ej.: la ruta se llama
  `pre-retreat-tasks` aunque el path sea `tareas-pre-retiro`; `'pre-retreat-task'` cubre ambas
  (`pre-retreat-tasks` y `pre-retreat-task-template`). Cuidado con colisiones entre rutas.
- **Test bilingüe**: `title` debe ser distinto de `titleEs` para toda sección (si el término es igual
  en ambos idiomas, ej. "Angelitos"/"Palancas", diferenciá el inglés: "Angelitos (Helpers)").
- **Agrupar** rutas afines en una sola sección (varios `routeContext`) en vez de un doc por ruta
  (ej. `reports` cubre `bags-report`/`shirts-report`/…; `message-templates` cubre `global-message-templates`).
- Auditoría de cobertura: comparar `routeName` del sidebar (`Sidebar.vue`) vs `routeContext` de `helpIndex`.
- Incidentes 2026-07-06: `minuto-a-minuto` y `role-management` no tenían sección → panel vacío; y batch
  de 22 páginas sin ayuda cubierto agrupando (se omiten `telemetry`/`domain-audit`, admin interno).
