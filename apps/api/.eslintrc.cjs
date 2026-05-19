module.exports = {
  root: true,
  extends: ["../../packages/config/eslint-preset.js"],
  parserOptions: {
    project: "./tsconfig.json",
  },
  ignorePatterns: ["src/tests/**", "src/**/*.test.ts"],
  rules: {
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unsafe-assignment": "off",
    "@typescript-eslint/no-unsafe-member-access": "off",
    "@typescript-eslint/no-unsafe-call": "off",
    "@typescript-eslint/no-unsafe-argument": "off",
    "@typescript-eslint/require-await": "off",
    "@typescript-eslint/no-unsafe-return": "off",
    "@typescript-eslint/no-misused-promises": "off",
    "@typescript-eslint/no-unused-vars": "off",
    "@typescript-eslint/restrict-template-expressions": "off",
    "@typescript-eslint/no-var-requires": "off",
    "prefer-const": "off",
    // El build de producción es ESM (Vite emite `file:///`), donde
    // `require()` no existe como global → ReferenceError en runtime.
    // En dev pasa desapercibido porque ts-node corre en CJS. Esta regla
    // bloquea el commit antes de que llegue a prod. Si necesitas CJS
    // (interop con un módulo legacy), usa `import { x } from 'y'` con
    // `esModuleInterop`, o `const x = await import('y')` para lazy.
    // Bug histórico que evitamos con esto: `require('crypto').randomUUID()`
    // en createCommunication → 503 en prod 2026-05-19.
    "no-restricted-syntax": [
      "error",
      {
        selector: "CallExpression[callee.name='require']",
        message:
          "No uses require() — el bundle de prod es ESM y revienta con 'require is not defined'. Usa `import` al top, o `await import()` para lazy.",
      },
    ],
  },
};