# Troubleshooting & Lecciones aprendidas

Incidentes reales encontrados durante el desarrollo y pruebas del sistema Emaús. Cada entrada incluye síntomas, diagnóstico, fix aplicado y cómo evitarlo en el futuro.

---

## 1. Bucle infinito de API → 429 en toda la app

### Síntomas
- La consola del navegador muestra **cientos de errores 429** en pocos segundos.
- Los endpoints básicos (`/auth/status`, `/csrf-token`) también devuelven 429.
- La app queda completamente en blanco (página vacía, spinner eterno).
- El error se repite en loop: `Failed to fetch tables. AxiosError @ tableMesaStore.ts:33`.

### Causa raíz
`tableMesaStore.ts` usaba `retreatStore.$subscribe()` en vez de `watch()`:

```ts
// ❌ ANTES — dispara en CUALQUIER mutación del store
retreatStore.$subscribe((_, state) => {
    fetchTables();
});
```

`$subscribe` de Pinia se ejecuta cada vez que **cualquier propiedad** del store muta (incluyendo `isLoading`, datos que llegan de la API, etc.). Esto generaba decenas de llamadas simultáneas a `/api/tables/retreat/:id`, que saturaban el rate-limiter y comenzaban a devolver 429. Las respuestas 429 entonces disparaban el error handler del CSRF, que a su vez reintentaba indefinidamente (ver incidente 2).

### Fix
```ts
// ✅ DESPUÉS — solo dispara cuando cambia el retiro seleccionado
watch(() => retreatStore.selectedRetreatId, (id) => {
    if (id) fetchTables();
}, { immediate: true });
```

Además cambiar `ref` de `vue` por `ref, watch` en el import.

### Archivos afectados
- `apps/web/src/stores/tableMesaStore.ts`

### Cómo detectarlo
```bash
# En DevTools → Network, filtrar por "tables/retreat"
# Si aparecen decenas de requests idénticos en < 1 segundo → bucle activo
```

### Tests
`apps/web/src/stores/__tests__/tableMesaStore.test.ts` → suite *"reactive: solo dispara fetchTables al cambiar selectedRetreatId"*

---

## 2. CSRF retry sin backoff → segundo bucle infinito

### Síntomas
- Después de que el rate-limiter empieza a responder 429, la app nunca se recupera sola aunque esperes mucho tiempo.
- Los errores continúan aunque el rate-limiter debería haber reseteado.
- La consola muestra `Error obteniendo token CSRF` cada ~1 segundo de forma indefinida.

### Causa raíz
`csrf.ts` `initializeCsrfProtection()` reintentaba cada 1 segundo sin límite:

```ts
// ❌ ANTES — retry infinito cada 1 segundo
} catch (csrfError) {
    setTimeout(() => {
        initializeSessionAndCsrf().catch(console.error);
    }, 1000);
}
```

El rate-limiter tiene ventana de 1 minuto. Con reintentos cada 1s, el primer intento exitoso necesita que los 60 segundos transcurran entre dos reintentos, pero como hay un nuevo request cada segundo que resetea la ventana para ese IP, nunca se recupera.

### Fix
```ts
// ✅ DESPUÉS — backoff exponencial, máximo 5 intentos
const initializeSessionAndCsrf = async (attempt = 0) => {
    const MAX_ATTEMPTS = 5;
    if (attempt >= MAX_ATTEMPTS) return;
    try {
        await axios.get('/auth/status', { withCredentials: true });
        await fetchCsrfToken();
    } catch (error) {
        try {
            await fetchCsrfToken();
        } catch (csrfError) {
            // 2s → 4s → 8s → 16s → 30s (cap)
            const delay = Math.min(2000 * Math.pow(2, attempt), 30_000);
            setTimeout(() => {
                initializeSessionAndCsrf(attempt + 1).catch(console.error);
            }, delay);
        }
    }
};
```

### Archivos afectados
- `apps/web/src/utils/csrf.ts`

### Cómo detectarlo
```bash
# En DevTools → Console, buscar "Error obteniendo token CSRF"
# Si aparece más de 5 veces, hay un bucle de retry mal configurado
```

### Tests
`apps/web/src/utils/__tests__/csrf.test.ts`

---

## 3. Rate-limiter activo — cómo recuperarse

### Síntomas
- Toda la app devuelve 429 incluso después de recargar.
- `/api/auth/status` devuelve 429, impidiendo el login.
- El error persiste varios minutos.

### Diagnóstico
```bash
curl -s http://localhost:3001/api/auth/status -w "\n%{http_code}"
# Si devuelve 429, el rate-limiter está activo para tu IP
```

### Fix inmediato (dev)
Esperar a que expire la ventana del rate-limiter:
```bash
# Verificar cuándo se recupera (polling cada 3s)
until curl -s http://localhost:3001/api/auth/status -o /dev/null -w "%{http_code}" | grep -q "200\|401"; do sleep 3; done && echo "API lista"
```

La ventana general es **1 minuto** (`windowMs: 1 * 60 * 1000, max: 300`). Para auth específicamente es **15 minutos**.

### Fix de raíz
Corregir el bucle que causó el problema (ver incidentes 1 y 2 arriba).

### Notas
- En producción el rate-limiter tiene los mismos parámetros; el tráfico normal nunca llega cerca del límite.
- El E2E script `e2e-minuto-a-minuto.sh` puede activarlo si se corre repetidamente en menos de 1 minuto.

---

## 4. Dashboard retiro — Error "al cargar los datos del retiro"

### Síntomas
- El dashboard de retiro muestra una tarjeta roja: `Error al cargar los datos del retiro`.
- La URL del retiro cambia automáticamente a otro retiro.

### Causa raíz
El store de retiros (`retreatStore`) tiene lógica de "retiro activo" que selecciona automáticamente el último retiro visitado desde localStorage. Si ese retiro ya no existe en la DB (fue borrado por un E2E script), el GET falla.

### Fix
Navegar manualmente a un retiro válido desde `/app/retreats`, o limpiar localStorage:
```js
// En DevTools → Console
localStorage.removeItem('selectedRetreatId');
location.reload();
```

---

## 5. Página en blanco al navegar a una ruta de retiro

### Síntomas
- Navegar a `/app/retreats/:id/schedule` muestra página completamente en blanco.
- El snapshot del browser solo muestra `region "Notifications (F8)"`.

### Causa raíz
Confusión entre el path de la ruta y el nombre del componente. Las rutas creadas para Minuto a Minuto son:

| Componente | Path correcto |
|------------|--------------|
| `MinutoAMinutoView` | `/app/retreats/:id/minuto-a-minuto` |
| `MyScheduleView` | `/app/my-schedule` (sin `:id`) |
| `ScheduleTemplateView` | `/app/settings/schedule-template` |

`/app/retreats/:id/schedule` **no existe** — devuelve la ruta 404 de Vue Router (que puede ser página vacía si no hay componente de 404 definido).

### Cómo verificar rutas disponibles
```bash
grep -n "path:" apps/web/src/router/index.ts | grep -i "schedule\|minuto\|agenda"
```

---

## 6. Tabla recortada en móvil (overflow-hidden)

### Síntomas
- La última columna de una tabla está cortada en pantallas < 600px.
- No hay scroll horizontal aunque la tabla sea más ancha que la pantalla.

### Causa raíz
El wrapper de la tabla tenía `overflow-hidden` en vez de `overflow-x-auto`:

```html
<!-- ❌ recorta el contenido -->
<div class="overflow-hidden">
  <table class="w-full">...</table>
</div>
```

### Fix
```html
<!-- ✅ permite scroll horizontal dentro del contenedor -->
<div class="overflow-x-auto">
  <table class="w-full min-w-[600px]">...</table>
</div>
```

`min-w-[600px]` fuerza a la tabla a mantener su ancho mínimo; el contenedor maneja el scroll.

### Archivos afectados
- `apps/web/src/views/ScheduleTemplateView.vue`

---

## 7. Botones desbordados en toolbar móvil

### Síntomas
- En móvil (< 640px), los botones del header de una vista se salen de la pantalla.
- Algunos botones no son accesibles porque están fuera del viewport.

### Causa raíz
Layout `flex` sin `flex-wrap` con 4 botones en una sola fila:

```html
<!-- ❌ no envuelve en móvil -->
<div class="flex justify-between items-start">
  <div class="flex gap-2">
    <Button>A</Button><Button>B</Button><Button>C</Button><Button>D</Button>
  </div>
</div>
```

### Fix
```html
<!-- ✅ apila verticalmente en móvil, horizontal en desktop -->
<div class="flex flex-col sm:flex-row sm:justify-between gap-3">
  <div class="flex flex-wrap gap-2">
    <Button size="sm">A</Button>
    <Button size="sm">B</Button>
    <Button size="sm">C</Button>
    <Button size="sm">D</Button>
  </div>
</div>
```

Clave: `flex-col` en base, `sm:flex-row` para ≥ 640px. Los botones con `flex-wrap` se reorganizan solos.

### Archivos afectados
- `apps/web/src/views/MinutoAMinutoView.vue`
- `apps/web/src/views/ScheduleTemplateView.vue`

---

## 8. Filas de tabla: botones solapan el contenido en móvil

### Síntomas
- En una fila con `[hora] [duración] [nombre] [botones]`, los botones se superponen al nombre porque no hay espacio suficiente.
- `flex-1` no protege al elemento del solapamiento cuando los elementos adyacentes tienen ancho variable.

### Causa raíz
Layout horizontal sin adaptación móvil en filas complejas con 4 columnas + botones:

```html
<!-- ❌ en 390px: botones solapan el nombre -->
<div class="flex items-start gap-3">
  <div class="w-20">12:00</div>
  <div class="w-16">10m</div>
  <div class="flex-1">Nombre largo de la actividad...</div>
  <div class="flex gap-1"><Button>Iniciar</Button><Button>+5m</Button></div>
</div>
```

### Fix
Separar en dos filas en móvil: hora+duración+botones arriba, nombre abajo.

```html
<!-- ✅ apila verticalmente en móvil -->
<div class="flex flex-col sm:flex-row sm:items-start gap-2">
  <!-- Fila superior móvil: hora + duración + botones -->
  <div class="flex items-center gap-2 sm:contents">
    <div class="w-16 sm:w-20 shrink-0">12:00</div>
    <div class="w-10 sm:w-16 shrink-0">10m</div>
    <div class="flex gap-1 ml-auto sm:hidden">
      <Button>Iniciar</Button><Button>+5m</Button>
    </div>
  </div>
  <!-- Nombre (ocupa toda la línea en móvil) -->
  <div class="flex-1 min-w-0">Nombre...</div>
  <!-- Botones solo en desktop -->
  <div class="hidden sm:flex gap-1 shrink-0">
    <Button>Iniciar</Button><Button>+5m</Button>
  </div>
</div>
```

La clase `sm:contents` hace que el div desaparezca visualmente en desktop y sus hijos fluyan en el flex padre, replicando el layout original de una sola fila.

### Archivos afectados
- `apps/web/src/views/MinutoAMinutoView.vue`

---

## 9. `start.getTime is not a function` al hacer PATCH a un schedule item

### Síntomas
- PATCH `/api/schedule/items/:id` devuelve **500 Internal Server Error**.
- Mensaje: `{"message":"start.getTime is not a function"}`.
- El problema aparece al editar un item desde el modal del Minuto a Minuto.

### Causa raíz
JSON no tiene tipo `Date` — las fechas viajan como strings ISO. TypeORM espera `Date` en columnas `datetime`. El servicio asumía que `data.startTime` ya era un `Date`:

```ts
// ❌ ANTES
if (update.startTime || update.durationMinutes !== undefined) {
    const start = update.startTime ?? existing.startTime;
    update.endTime = new Date(start.getTime() + dur * 60000); // ← falla si start es string
}
```

`existing.startTime` (cargado por TypeORM) sí es `Date`, pero `update.startTime` (de `req.body`) es `string`.

### Fix
Coerción explícita de campos fecha al llegar al service:

```ts
// ✅ DESPUÉS
const dateFields = new Set(['startTime', 'endTime', 'actualStartTime', 'actualEndTime']);
for (const k of [...] as const) {
    if (data[k] !== undefined) {
        const value = (data as any)[k];
        (update as any)[k] = dateFields.has(k) && value && !(value instanceof Date)
            ? new Date(value)
            : value;
    }
}
```

Y en `create()` y en el cálculo de `endTime`:
```ts
const startDate = start instanceof Date ? start : new Date(start);
update.endTime = new Date(startDate.getTime() + dur * 60000);
```

### Archivos afectados
- `apps/api/src/services/retreatScheduleService.ts` (`create` y `update`)

### Cómo evitarlo
Para endpoints que reciben fechas:
1. **Validar con Zod** usando `z.coerce.date()` en el controlador para convertir automáticamente strings ISO a Date.
2. O hacer la coerción explícita en el service como en el fix arriba.

```ts
// Plantilla recomendada con Zod
const scheduleItemUpdateSchema = z.object({
    startTime: z.coerce.date().optional(),
    endTime: z.coerce.date().optional(),
    actualStartTime: z.coerce.date().optional(),
    actualEndTime: z.coerce.date().optional(),
    name: z.string().optional(),
    // ...
});
```

### Tests
`apps/api/src/tests/services/retreatScheduleDateCoercion.simple.test.ts` — 14 tests cubriendo:
- Coerción de string ISO → Date
- Idempotencia para Date que ya es Date
- Cálculo correcto de `endTime` con string ISO (regression test)
- Payloads realistas de PATCH (incluye `actualStartTime`/`actualEndTime` al completar item)

---

## 10. Items del MaM no muestran responsable aunque las Responsabilidades tienen participantes

### Síntomas
- En `Asignaciones → Responsabilidades` el coordinador asignó participantes a 39 de 42 roles.
- En `Logística → Minuto a Minuto` los items siguen mostrando "sin responsable".
- Tabla `retreat_schedule_item.responsabilityId` toda en NULL.

### Causa raíz
Las **Responsabilidades** son instancias por retiro (cada retiro clona las 20 + las charlas). Los **items del Minuto a Minuto** tienen un FK opcional a la Responsabilidad pero, hasta este fix, ese FK se llenaba **manualmente item por item**. El coordinador no sabía que tenía que abrir cada modal y elegir el rol — además son 42+ items.

### Fix (cambio de diseño)
1. Cada item del template global (`schedule_template`) ahora declara `responsabilityName` (ej. "Comedor", "Campanero", "Charla: De la Rosa").
2. `materializeFromTemplate` resuelve `responsabilityName → responsabilityId` por nombre exacto al crear los items del retiro.
3. Endpoint nuevo `POST /api/schedule/retreats/:id/relink-responsibilities` para retiros existentes (botón "🔗 Re-vincular responsabilidades" en `MinutoAMinutoView.vue`).

### Cómo recuperarse en producción / dev
```bash
# 1. Aplicar migración
pnpm --filter api migration:run
# 2. Backfill el seeder
npx vite-node apps/api/src/cli/seed-template-responsibilities.ts
# 3. Para retiros antiguos: vía UI ("Re-vincular") o CLI:
npx vite-node apps/api/src/cli/relink-retreat-responsibilities.ts <retreatId>
```

### Archivos afectados
- `apps/api/src/entities/scheduleTemplate.entity.ts` — nueva columna `responsabilityName`
- `apps/api/src/migrations/sqlite/20260426130000_AddResponsabilityNameToScheduleTemplate.ts`
- `apps/api/src/services/retreatScheduleService.ts` — `buildResponsabilityNameIndex`, materialize auto-link, `relinkResponsibilities`
- `apps/api/src/data/scheduleTemplateSeeder.ts` — alias `R = {...}` con nombres canónicos + columna `responsabilityName` en cada item + función `backfillResponsabilityNames`

### Tests
- `apps/api/src/tests/services/scheduleTemplateSeeder.responsabilityNames.simple.test.ts` — 11 tests verificando que cada item del seeder tiene `responsabilityName` y que ese nombre existe en la lista canónica.

---

## Lecciones aprendidas

### `$subscribe` vs `watch` en Pinia

| | `$subscribe` | `watch(() => store.prop)` |
|---|---|---|
| Cuándo dispara | Cualquier mutación del store | Solo cuando `prop` cambia de valor |
| Uso correcto | Auditoría, DevTools, side effects globales | Reaccionar a un campo específico |
| Riesgo | Bucles accidentales | Bajo |

**Regla**: Si en el callback de `$subscribe` haces una acción que puede mutar cualquier store, casi seguro tienes un bucle. Usa `watch`.

### Retry loops — siempre añadir backoff + límite

Todo bloque `catch` que llame a `setTimeout(fn, N)` para reintentar DEBE tener:
1. **Contador de intentos** con límite máximo (`MAX_ATTEMPTS`).
2. **Backoff exponencial** para no saturar el servidor.
3. **Guard al inicio** que retorne si `attempt >= MAX_ATTEMPTS`.

```ts
// Plantilla segura de retry
const retry = async (attempt = 0, MAX = 5): Promise<void> => {
    if (attempt >= MAX) return;                          // 1. límite
    try { await doSomething(); }
    catch {
        const delay = Math.min(1000 * 2 ** attempt, 30_000); // 2. backoff
        setTimeout(() => retry(attempt + 1, MAX), delay);
    }
};
```

### Responsive en Vue/Tailwind — checklist móvil

Antes de marcar una página como "completa", verificar en 390px:

- [ ] Headers de vista: ¿usan `flex-col sm:flex-row`?
- [ ] Toolbars de botones: ¿tienen `flex-wrap` y `size="sm"`?
- [ ] Tablas anchas: ¿su contenedor tiene `overflow-x-auto` y la tabla `min-w-[Npx]`?
- [ ] Filas con 4+ columnas + botones: ¿se apilan correctamente?
- [ ] Columnas fijas (`w-N`): ¿usan variantes `sm:w-N` para desktop?
- [ ] Modales: ¿su ancho no supera el viewport (`max-w-[calc(100vw-1rem)]`)?
- [ ] `scrollWidth === clientWidth` en el `document.documentElement`.

### Rate-limiter en ambiente de desarrollo

El rate-limiter de producción también aplica en desarrollo. Si el E2E script o las pruebas automatizadas disparan muchas requests:

1. Reducir `windowMs` en dev (añadir variable de entorno `RATE_LIMIT_DISABLED=true`).
2. O bien, añadir las IPs/cookies de dev a una allowlist en el middleware.
3. Nunca hacer retry sin backoff desde el frontend.

---

*Última actualización: 2026-04-25*
