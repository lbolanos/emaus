---
paths:
  - "apps/web/**"
  - "packages/ui/**"
---

# Convenciones del frontend

## Llamadas a la API

**Siempre a través del servicio centralizado** — nunca `fetch` directo.

```typescript
// CORRECTO
import { getSmtpConfig } from '@/services/api';
const config = await getSmtpConfig();

// INCORRECTO
const response = await fetch('/api/endpoint', {
  headers: await setupCsrfHeaders(),
  credentials: 'include',
});
```

El servicio ya trae CSRF, manejo de errores, autenticación y configuración consistente. Las
funciones nuevas van en `apps/web/src/services/api.ts`.

## UI / UX

- Todo el texto de UI en **español**.
- Usar `WalkerView.vue` como plantilla para nuevas list views.
- Los componentes compartidos viven en `packages/ui` (basados en reka-ui / port de Radix).
- Patrones de Vue 3 Composition API (`<script setup>` + TypeScript). Para trabajo de Vue en
  profundidad, cargar el skill **`vue-best-practices`**.

## Checkboxes y switches: `model-value`, nunca `checked`

`Checkbox` y `Switch` de `@repo/ui` envuelven reka-ui, que **sólo** entiende
`modelValue` / `update:modelValue`. Un `:checked` o un `@update:checked` se descarta en silencio:
el control se ve apagado y el handler no corre.

```vue
<!-- ❌ -->
<Checkbox :checked="row.selected" @update:checked="toggle(row.id)" />
<Switch v-model:checked="value" />

<!-- ✅ -->
<Checkbox :model-value="row.selected" @update:model-value="toggle(row.id)" />
<Switch v-model="value" />
```

El tercer estado del checkbox va por el mismo prop: `:model-value="'indeterminate'"`. Un
`<input type="checkbox" :checked>` nativo sí es correcto — la regla es sólo para los componentes
compartidos.

Guard: `apps/web/src/test/repoUiToggleApi.test.ts`. Detalle y trampas al tocar el wrapper:
skill `troubleshooting` #4.

## El bug de reka-ui que se repite

Cuando un `<DropdownMenuItem>` abre un `Dialog` / `AlertDialog` / `Sheet` / `Drawer` de
`@repo/ui`, usa **`useRekaDialogFix`** (`apps/web/src/composables/useRekaDialogFix.ts`) junto
con `@select="deferOpen(...)"`. Si no, queda un `pointer-events: none` huérfano en `<body>` y
la página se ve congelada.

Detalle y otros síntomas parecidos: skill `troubleshooting`.
