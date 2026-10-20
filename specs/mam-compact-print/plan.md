# Plan: mam-compact-print

> SDD plan — versión 1.0 (2026-10-19). Feature contenida al frontend: sin API, sin
> migraciones, sin permisos nuevos. El riesgo real es de **densidad de página** (un día con 56
> ítems debe caber en una A4) y se cierra con un criterio medible (pdfinfo == 3 páginas), no a
> ojo.

## Orden y por qué

1. **M0 — Worktree + specs.** Setup del worktree (`.env`, DB 3 archivos, `packages/ui/dist`,
   `pnpm install`) y specs con criterios contra datos existentes. La regla SDD del repo exige
   spec antes de código y fija el criterio medible antes de tocar CSS.
2. **M1 — Módulo puro + tests.** `mamCompactPrint.ts` con su suite: toda la lógica decidable
   (agrupación, orden, horas h23, colores, escape, responsables) queda fijada antes de tocar
   la vista. Es la parte con lógica; la vista solo ensambla inputs.
3. **M2 — Wiring UI.** Botón en `MamMoreActions` + handler en `MinuteByMinuteView` (ambas
   instancias del menú) + toast de popup bloqueado. Smoke manual en el dev del worktree.
4. **M3 — Densidad medible.** Loop Playwright → `popup.pdf()` → `pdfinfo` → `pdftoppm` sobre
   Buen Despacho; ajustar solo constantes del stylesheet hasta `Pages == 3`.
5. **M4 — Docs + help + cierre.** `docs/features/minuto-a-minuto.md`, help in-app (diálogo +
   markdown es/en) con su aserción, suite completa + typecheck, reconcile de la spec.

## Riesgos y mitigaciones

- **El día de 56 filas no cabe en una página** (el principal): el presupuesto medido deja
  ~30mm de margen (research §3). Si la verificación falla, ladder en orden re-midiendo con
  `pdfinfo` cada paso: margen 10→8mm → fuente 7.5→7pt y padding 0.6→0.5mm → line-height
  1.12→1.05 → truncar apoyos a 2+"…" **solo con OK de Leonardo** (perder información en papel
  es decisión de producto). Nunca: filtrar filas ni partir un día en dos páginas.
- **Drift de timezone** (el papel dice otra hora que la planeada): `formatHHMM` recibe
  `retreat.timezone` explícito; tests deterministas con `timeZone: 'UTC'`.
- **Popup bloqueado pasa desapercibido**: `onPopupBlocked` → toast destructivo (patrón
  `TablesView`), retorno `false`.
- **Romper el print existente**: cero cambios en `onPrint` ni en el `@media print` de la vista.

## Entorno del worktree

- Setup hecho (2026-10-19): branch `worktree-mam-compact-print`; `.env`, `database.sqlite`
  (+wal/shm) y `packages/ui/dist` copiados del main; `pnpm install` corrido.
- Al levantar dev: skill `worktree-testing` (puertos 3002/5174 si están libres — comprobar
  que ningún otro worktree los tenga; login de dev estándar).
- La DB copiada ya trae Buen Despacho completo (149 ítems, 3 días): escenarios de verificación
  listos, sin siembra.
