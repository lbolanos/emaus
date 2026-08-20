---
paths:
  - "apps/web/tests/e2e/**"
  - "apps/web/playwright.config.ts"
---

# Tests e2e (Playwright)

Viven en `apps/web/tests/e2e/*.spec.ts` (ojo: `apps/web/e2e/` es otra cosa — los scripts de
video-demo). Se corren contra el stack de dev; `playwright.config.ts` reutiliza el `pnpm dev` que
ya esté levantado:

```bash
cd apps/web && npx playwright test tests/e2e/<spec>.ts --project=chromium --reporter=list
```

Cuatro cosas que hacen fallar un spec nuevo por razones que no son del código:

- **Fijar el idioma.** Playwright arranca en `en-US` y la app sigue `navigator.language`, así que
  la UI sale en inglés y ningún texto en español coincide. `test.use({ locale: 'es-MX' })` más
  `page.addInitScript(() => localStorage.setItem('preferred-locale', 'es'))`.
- **Nunca escribir en la base.** El registro público acepta `?test=true` (dry-run): el API valida
  el payload y no persiste nada. Si el spec envía un formulario, que use esa vía y afirme
  `expect(body.dryRun).toBe(true)` sobre la request capturada, como guard explícito.
- **`count()` no espera.** Es el fallo más traicionero: contar elementos de un paso del asistente
  antes de que monte devuelve 0, el bucle no hace nada y el spec falla más adelante, en otro sitio.
  Poné un `await expect(<algo del paso>).toBeVisible()` antes de contar, y otro después de cada
  avance de paso.
- **Datos del retiro por variable de entorno.** Los specs que necesitan un retiro real lo toman de
  `process.env.E2E_RETREAT_ID` con un default de la base de dev, y hacen `test.skip(...)` con un
  motivo legible si ese retiro no existe o no cumple las condiciones. Así el spec no se vuelve rojo
  en una base distinta.

Aserción negativa sobre una pantalla que aún no cargó (`toHaveCount(0)`) siempre pasa: esperá
primero a que la pantalla esté, o el test es un falso verde.

Ejemplo completo con las cuatro: `apps/web/tests/e2e/server-registration-shirt-sizes.spec.ts`.
