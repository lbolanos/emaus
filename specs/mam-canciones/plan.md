# Plan: mam-canciones

> SDD plan — versión 1.0 (2026-10-19). Feature chica y contenida al frontend: sin API, sin
> migraciones, sin permisos nuevos. El riesgo real no es técnico sino de UX móvil, y se
> cubre con el e2e manual del worktree (criterios 1-6 del spec).

## Orden y por qué

1. **M1 — Módulo puro + ancla en el MAM.** Primero `mamMusic.ts` (D4) con sus tests: el
   criterio D3 queda fijado antes de tocar markup. Después la fila de `MinuteByMinuteView`
   (R1, R3). Es la pantalla del reporte y la que concentra el valor.
2. **M2 — «Mi agenda».** Mismo helper sobre `MyScheduleView` (R2). Sale casi gratis y es la
   vista del servidor en su teléfono.
3. **M3 — Verificación móvil + cierre.** Playwright con iPhone emulado sobre el dev del
   worktree (skill `worktree-testing` para los puertos), corrida de la suite web, docs de
   ayuda del MAM si aplica, y reconcile del spec.

## Riesgos y mitigaciones

- **La fila es clickeable y arrastrable** → `@click.stop` en el ancla; probar también el
  touch (regla #7 del troubleshooting: en emulación touch puede dispararse `touchmove`;
  el ancla nativa no necesita handlers propios, pero el e2e móvil lo confirma).
- **Ensanchar la fila en móvil** → el ancla reemplaza al span 🎵 oculto, no se suma: el
  label largo se trunca (`truncate`, como el resto de la línea de metadatos).
- **Sin test previo de `MinuteByMinuteView`** → no se monta la vista completa: el criterio
  vive en `mamMusic.ts` (unit) y el rendering se verifica en el e2e del worktree. Si al
  implementar surge un mount ligero razonable, se añade; si no, no se fuerza.

## Entorno del worktree

- Setup ya hecho (2026-10-19): `.env`, `database.sqlite` y `packages/ui/dist` copiados del
  main; `pnpm install` corrido.
- Al levantar dev: skill `worktree-testing` (puertos propios; `FRONTEND_URL` inline para
  CORS del login).
- La DB del worktree ya trae Buen Despacho con sus 6 pistas: escenarios de prueba listos.
