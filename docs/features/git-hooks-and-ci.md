# Git hooks (husky) + CI — diseño y rationale

Fecha: 2026-06-09

Objetivo: commits **rápidos** (segundos) con feedback local útil, dejando lo pesado
(suite completa, build) para el CI. Antes, `git commit` corría `pnpm lint` + la **suite
completa** del paquete tocado en cada commit (minutos), duplicando lo que el CI ya hace.

## Resumen

| Etapa | Qué corre | Dónde |
| --- | --- | --- |
| **pre-commit** | `eslint --fix` solo sobre archivos staged (globs por paquete) | `.husky/pre-commit` + `.lintstagedrc.cjs` |
| **pre-push** | tests **relacionados**: API `jest --findRelatedTests`, web suite completa | `.husky/pre-push` |
| **CI** | lint + test-api + test-web + build | `.github/workflows/ci.yml` |
| **deploy** | lint + tests + build + deploy a Lightsail | `.github/workflows/deploy-production.yml` (push a `master`) |

Saltar hooks: `SKIP_PRE_COMMIT=1 git commit` / `SKIP_PRE_PUSH=1 git push` (o `--no-verify`).

## pre-commit — `lint-staged` con globs por paquete

`.lintstagedrc.cjs` (nombrado así, no `lint-staged.config.js`, porque el `.gitignore`
ignora `*.config.js`):

```js
module.exports = {
  'apps/api/**/*.ts':          ['eslint --fix'],
  'apps/web/**/*.{ts,vue,js}':  ['eslint --fix'],
  'packages/ui/**/*.{ts,vue}':  ['eslint --fix'],
  'packages/types/**/*.ts':     ['eslint --fix'],
  'packages/utils/**/*.ts':     ['eslint --fix'],
};
```

### Por qué globs por paquete (no un glob global)

Solo existen `.eslintrc.cjs` en esos **5 paquetes**. No hay eslintrc en la raíz, `scripts/`,
ni `packages/config`. ESLint v8 (eslintrc) busca config subiendo desde cada archivo; si se
lintea un archivo **fuera** de un paquete (p.ej. el propio `.lintstagedrc.cjs`, `ecosystem.config.js`,
`scripts/*.js`), aborta con **"ESLint couldn't find a configuration file"** y el hook falla
aunque el cambio sea válido. Los globs acotados replican el alcance de `pnpm lint` (que corre
`eslint src` dentro de cada paquete). Los `.eslintrc.cjs` no se autolintean (son `.cjs`, fuera
de los globs `.ts`/`.vue`/`.js`).

### Por qué NO `prettier --write`

El repo **nunca se formateó con Prettier**: `prettier --check` reporta ~1000 archivos no
conformes (514/519 en apps/api, 354/353 en apps/web, 143/143 en packages). Como no hay
`.prettierrc`, Prettier usa sus defaults (espacios) y reescribiría el archivo **entero** la
primera vez que lo tocas → un cambio de 6 líneas produce un diff de cientos de líneas que
entierra el cambio real (incidente real con `config.ts`/`index.ts`). Por eso el hook **no**
corre prettier. `eslint --fix` es seguro: el preset usa `eslint-config-prettier`, que
**desactiva** las reglas de formato → eslint no toca indentación.

> Si algún día se quiere formato consistente: hacer una **normalización global controlada**
> (un commit `style:` con `prettier --write` sobre todo + agregar `.prettierrc`) con el repo
> limpio (sin WIP ni branches abiertas), nunca vía el hook.

### `tsconfigRootDir`

Cada `.eslintrc.cjs` hoja fija `parserOptions.tsconfigRootDir: __dirname`. Sin esto, el
`project: './tsconfig.json'` se resolvería contra el `cwd` y el lint type-aware fallaría al
correr `eslint` desde la **raíz** (como hace lint-staged). Es inocuo para `turbo lint` (cwd ya
es el dir del paquete) y mejora el lint desde el editor.

## pre-push — tests relacionados

`.husky/pre-push` calcula los archivos que se van a pushear (vs upstream, fallback `origin/master`)
y corre:

- **API**: `jest --findRelatedTests <fuentes .ts cambiadas>` — acota de ~2100 tests a las suites
  que importan los archivos tocados.
- **web**: suite completa (`pnpm --filter web test`, ~10s). **No** se usa `vitest related`: su
  análisis del grafo de imports rompe con los `.md` que importan algunos componentes
  (`Failed to parse source ... invalid JS syntax ... .md`); la suite completa con `vitest run`
  no tiene ese problema y es rápida.

Limitación: `--findRelatedTests` solo encuentra tests que **importan estáticamente** el archivo
cambiado; tests de integración indirectos pueden no dispararse. **El CI con la suite completa es
el backstop.**

## CI / CD

- `ci.yml` (PR + push a main/develop): jobs paralelos `lint`, `test-api`, `test-web`, `build`.
- `deploy-production.yml` (push a `master`): lint + tests + build + deploy a Lightsail (rsync + PM2).
- `build-release.yml` (tags `v*.*.*`): build de release.

### Workflows de Gemini eliminados (2026-06-09)

Había 5 workflows `gemini-*.yml` (plantilla de `run-gemini-cli` de Google) que **nunca se
configuraron** con credenciales. El job `review` fallaba en cada PR con *"No authentication
method provided"*, generando runs en rojo y emails. Se eliminaron (commit `chore(ci)`). No los
referencia ningún workflow propio. `gh workflow disable` requiere admin del repo; la vía efectiva
es borrar los archivos y que lleguen a `master`.

## Gotchas

- **Commitear archivos de config raíz** (`.eslintrc.cjs`, `.lintstagedrc.cjs`): no los lintea el
  hook (globs por paquete) → no rompen el commit.
- **Partial commits** (`git commit -- <paths>`): lint-staged no los maneja bien; usar
  `SKIP_PRE_COMMIT=1` para esos commits aislados.
- **Dos sesiones sobre el mismo working tree**: comparten índice `.git`; `git add`/`commit`
  concurrentes se pisan. Commitear desde una sola sesión a la vez.
