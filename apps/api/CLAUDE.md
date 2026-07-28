# apps/api — reglas del build

## Dependencias nuevas → externalizar en `rollupOptions.external`

El `apps/api` se empaqueta como **bundle SSR** con Vite/Rollup. **Toda dependencia de Node que
agregues** (`pnpm --filter api add <dep>`) **debe añadirse a `rollupOptions.external` en
`apps/api/vite.config.ts`**, junto a `typeorm`/`express`/etc. Si no, `pnpm build` falla con
*"Rollup failed to resolve import «dep»"*.

**Ni los tests, ni el lint, ni `tsc`/`vue-tsc` detectan esto — solo `pnpm build`.** Regla: tras
agregar una dep al api, externalizarla y correr `pnpm build` antes de dar por terminado.

> La prohibición de `__dirname`/`require` en este bundle (ESM: crashea el API al arrancar en prod)
> vive en el `CLAUDE.md` de la raíz, siempre cargado.
