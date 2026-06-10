// lint-staged: solo procesa los archivos staged (rápido). Lo corre .husky/pre-commit.
// Nombrado .lintstagedrc.cjs (no lint-staged.config.js) porque el .gitignore ignora *.config.js.
//
// Globs ACOTADOS por paquete a propósito: ESLint (v8 eslintrc) solo tiene config
// dentro de los 5 paquetes (apps/api, apps/web, packages/ui|types|utils). NO hay
// .eslintrc en la raíz, scripts/ ni packages/config. Si lintearamos archivos fuera
// de esos paquetes, ESLint aborta con "couldn't find a configuration file" y el hook
// falla (aunque el cambio sea válido). Por eso cada glob apunta a un paquete y replica
// su `eslint --ext` (mismo alcance que `pnpm lint`). Archivos fuera de los paquetes
// (raíz, scripts/, *.config.js, docs) no se lintean en el hook — igual que en CI.
//
// NO usamos `prettier --write`: el repo nunca se formateó con Prettier (~1000 archivos
// no conformes), así que prettier reescribiría el archivo entero en cada commit y
// enterraría el cambio real. eslint --fix es seguro: el preset usa eslint-config-prettier,
// que desactiva las reglas de formato, así que eslint NO toca la indentación.
module.exports = {
  'apps/api/**/*.ts': ['eslint --fix'],
  'apps/web/**/*.{ts,vue,js}': ['eslint --fix'],
  'packages/ui/**/*.{ts,vue}': ['eslint --fix'],
  'packages/types/**/*.ts': ['eslint --fix'],
  'packages/utils/**/*.ts': ['eslint --fix'],
};
