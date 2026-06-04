# Estado "en vivo" del retiro en el Dashboard (TZ-safe)

El dashboard del retiro (`RetreatDashboardView.vue`) muestra ciertas secciones
operativas — **Minuto a Minuto**, **Recepción**, **Santísimo** — solo cuando el
retiro está "en vivo", y un badge con la cuenta regresiva de días. La lógica de
fechas vive en `apps/web/src/utils/retreatLiveStatus.ts` para poder testearla en
aislamiento.

## Reglas de negocio

- Un retiro se considera **en vivo** desde **1 día antes** de su `startDate`
  (día de gracia para la preparación final, p. ej. el jueves para un retiro que
  inicia el viernes) hasta el `endDate` **inclusive**.
- La constante es `RETREAT_GRACE_DAYS_BEFORE = 1`.
- El "hoy" y el cálculo de días se evalúan en la **timezone del retiro**
  (`retreat.timezone`), con fallback a `America/Mexico_City`.

## API del util (`retreatLiveStatus.ts`)

| Función | Qué hace |
| --- | --- |
| `toYmd(value)` | Normaliza `string`/`Date` a `"YYYY-MM-DD"` sin shift de TZ (lee componentes UTC de los `Date`). |
| `todayYmdInTz(tz, now?)` | Día calendario actual en la zona dada, vía `Intl.DateTimeFormat('en-CA')`. |
| `ymdToUtcMillis(ymd)` | `"YYYY-MM-DD"` → ms de su medianoche UTC. |
| `addDaysYmd(ymd, days)` | Suma/resta días calendario a un `"YYYY-MM-DD"`. |
| `isRetreatLive(retreat, now?)` | `boolean` — aplica día de gracia + rango, en la TZ del retiro. |
| `daysUntilRetreat(retreat, now?)` | `number \| null` — días hasta el inicio (0 = hoy, negativo = ya pasó). |

`now` es inyectable para tests (default `new Date()`).

## El bug que esto corrige (off-by-one de timezone)

La versión anterior comparaba fechas así:

```ts
const start = new Date(r.startDate); // "2026-06-05" → medianoche UTC
start.setHours(0, 0, 0, 0);          // pero setHours opera en hora LOCAL (CDMX, UTC-6)
start.setDate(start.getDate() - 1);  // día de gracia
```

`new Date("2026-06-05")` se parsea como `2026-06-05T00:00:00Z`, que en CDMX es el
**jueves 4 a las 18:00**. Al aplicar `setHours(0,0,0,0)` en hora local, el valor
"se pega" a la medianoche del **jueves 4**, no del viernes 5 — todo corre un día
hacia atrás. Consecuencias visibles:

- El retiro se mostraba **en vivo desde el miércoles** (no el jueves).
- `daysUntilRetreat` daba **0** el jueves → el badge decía **"Aplica hoy mismo"**
  cuando faltaba 1 día.

### Por qué la solución es correcta

Se trabaja con strings `"YYYY-MM-DD"` (ancho fijo, zero-padded) que se comparan
**lexicográficamente en orden cronológico**, y el "hoy" se resuelve con
`Intl.DateTimeFormat` en la timezone del retiro. No se construyen `Date` que
dependan de la hora local del proceso/navegador. Es el patrón de la
**Regla N°4** del skill `timezone-handling`.

## Comportamiento (retiro viernes→domingo, San Agustín)

| Día (CDMX) | `isRetreatLive` | `daysUntilRetreat` | Badge |
| --- | --- | --- | --- |
| Miércoles | `false` | 2 | "faltan 2 días" |
| Jueves (gracia) | `true` | 1 | "falta 1 día" |
| Viernes (inicio) | `true` | 0 | "Aplica hoy mismo" |
| Sábado | `true` | -1 | — |
| Domingo (fin) | `true` | -2 | — |
| Lunes | `false` | -3 | "El retiro terminó hace 3 días" |

## Tests

`apps/web/src/utils/__tests__/retreatLiveStatus.test.ts` (29 tests):
- Escenario San Agustín (jueves en vivo por gracia, miércoles NO, jueves 9 PM
  CDMX no se adelanta pese a estar cerca de la medianoche UTC).
- Timezones configurables (Bogotá UTC-5, Madrid UTC+2 con DST, fallback a CDMX).
- `startDate`/`endDate` como `string` o `Date`.
- Guards (null/undefined, falta de fechas) y edge cases de fin de mes/año.

Las aserciones usan instantes UTC absolutos (`new Date('...Z')`) e inyectan `now`,
así son estables sin importar la TZ del runner de CI.

## Archivos

| Archivo | Rol |
| --- | --- |
| `apps/web/src/utils/retreatLiveStatus.ts` | Lógica TZ-safe (util puro). |
| `apps/web/src/views/RetreatDashboardView.vue` | Consume el util en `isRetreatLive` / `daysUntilRetreat` / `liveBadgeMessage`. |
| `apps/web/src/utils/__tests__/retreatLiveStatus.test.ts` | Tests. |
