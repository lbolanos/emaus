# Búsqueda de participantes

Todas las pantallas que buscan personas comparten un único módulo:
`apps/web/src/utils/participantSearch.ts`. Antes cada vista tenía su propia
copia, y todas fallaban de la misma forma.

## El problema que resuelve

Dos fallos que se repetían en cada copia:

1. **Nombre y apellido son campos separados.** Comparar la consulta contra cada
   campo por su cuenta (`firstName.includes(q) || lastName.includes(q)`) hace que
   `"juan perez"` no encuentre a nadie: ningún campo suelto contiene esa cadena.
2. **Los acentos.** `"josé".includes("jose")` es `false`. En la puerta del retiro
   se teclea sin acentos y con prisa, así que `perez` no encontraba a `PÉREZ`.

Una tercera variante apareció en equipos de servicio: comparar contra
`` `${firstName} ${lastName}` `` como una sola cadena arregla el caso simple,
pero `"jose garcia"` sigue sin encontrar a `"José Luis García Ramírez"` porque
lleva un nombre en medio.

## Cómo funciona

La consulta se parte en palabras y **todas** deben aparecer en el texto del
participante, sin importar el orden:

```ts
import { participantMatchesTokens, searchTokens } from '@/utils/participantSearch';

const tokens = searchTokens(query);            // [] si la consulta está vacía
const found = list.filter(p => participantMatchesTokens(p, tokens));
```

El texto contra el que se compara (`participantHaystack`) es el número de
retiro, nombre, apellido y apodo, todo normalizado (sin acentos, en minúsculas).

| Consulta | Encuentra a "17 ADAN BAUTISTA PÉREZ" |
|---|---|
| `perez` | sí |
| `adan perez` | sí |
| `perez adan` | sí (el orden da igual) |
| `17` | sí (número de retiro) |
| `adan lopez` | no (deben coincidir **todas** las palabras) |

### El correo es opcional

`participantMatchesTokens(p, tokens, { includeEmail: true })` añade el correo al
texto buscable. Sólo lo usa la lista de participantes, que es administrativa. En
el tablero de mesas o en la puerta añadiría ruido: cualquier `gmail` coincidiría
con todo el mundo.

### Dos convenciones para el número de retiro

El util acepta `id_on_retreat` (el nombre en las entidades) y `idOnRetreat` (el
que usa el payload de recepción), así que ninguna vista necesita mapear nada.

## Dónde se usa

| Pantalla | Archivo | Particularidad |
|---|---|---|
| Mesas | `apps/web/src/views/TablesView.vue` | resaltado + atenuado + navegación |
| Recepción | `apps/web/src/views/RecepcionView.vue` | dos listas: pendientes y llegados |
| Lista de participantes | `apps/web/src/components/ParticipantList.vue` | con `includeEmail` |
| Asignación de camas | `apps/web/src/views/BedAssignmentsView.vue` | busca camas **y** personas |
| Equipos de servicio | `apps/web/src/views/ServiceTeamsView.vue` | equipos por líder o miembros |
| Responsabilidades | `apps/web/src/views/ResponsabilitiesView.vue` | por nombre o por servidor |
| Desplegable buscable | `apps/web/src/components/form/SearchableSelect.vue` | sólo `normalizeText` |

**Regla al mezclar cosas que no son personas** (camas, nombres de equipo, de
responsabilidad): esos campos se comparan contra la consulta **entera**, no por
palabras. Una habitación `12-B` no son dos palabras, y trocear la consulta
produciría coincidencias absurdas. Ver `BedAssignmentsView.vue` como referencia.

## Lo que NO es este módulo

`RetreatModal.vue` tiene una función que empieza igual (`normalize('NFD')…`) pero
termina con `.replace(/[^a-z0-9]/g, '')`: es un *slugify* para URLs, no una
búsqueda. No debe migrarse aquí.

## El buscador de mesas

`TablesView` añade sobre la búsqueda una capa de navegación y de lectura visual:

- **Estado único**: la vista calcula `matchingIds`, `currentMatchId` y `searching`
  una sola vez y los baja a `TableCard` y `ServerDropZone` como un objeto
  (`SearchHighlight`). Cada zona pinta a partir de ese estado, nunca calculando
  el suyo. *(Antes cada tarjeta derivaba un índice local y lo comparaba con un
  índice global publicado en `window`, así que varias mesas marcaban a la vez su
  propia coincidencia como "la actual".)*
- **Tres estados visuales**: coincidencia actual (anillo amarillo + rebote), otra
  coincidencia (fondo amarillo pálido), y el resto **atenuado al 40%**. El
  atenuado convierte el tablero en un mapa: dónde quedó una familia o cómo se
  repartió una parroquia se ve de un vistazo.
- **Navegación**: `Enter` avanza, `Shift+Enter` retrocede, y ambos extremos dan
  la vuelta como en `Ctrl+F`. El scroll sólo se mueve si la burbuja está fuera de
  pantalla, descontando la cabecera pegajosa.
- **Cancelados**: no están en el tablero, así que buscarlos daría cero sin
  explicación. Se piden aparte (`getCancelledParticipants`) y se anuncian bajo el
  buscador, fuera del contador, porque no se puede navegar hasta ellos.

## Tests

| Qué fija | Archivo |
|---|---|
| Reglas del util (palabras, acentos, orden, correo, resaltado, atenuado) | `apps/web/src/utils/__tests__/participantSearch.test.ts` |
| Mesas: ciclo, contador, atenuado, aviso de cancelados | `apps/web/src/views/__tests__/TablesViewSearch.test.ts` |
| Recepción: nombre completo, acentos, apodo, número | `apps/web/src/views/__tests__/RecepcionView.search.test.ts` |
| Camas: personas y camas a la vez, resaltado | `apps/web/src/views/__tests__/BedAssignmentsSearch.test.ts` |
| Equipos de servicio: servidores, equipos, líder, miembros | `apps/web/src/views/__tests__/ServiceTeamsSearch.test.ts` |
| Responsabilidades: por nombre y por servidor | `apps/web/src/views/__tests__/ResponsabilitiesSearch.test.ts` |
| Lista de participantes: nombre completo, acentos, correo | `apps/web/src/components/__tests__/ParticipantList.test.ts` |
| Desplegable buscable (acentos, espacios, lista recortada) | `apps/web/src/components/form/__tests__/SearchableSelect.test.ts` |
| El apodo viaja en el payload de recepción | `apps/api/src/tests/services/receptionNickname.integration.test.ts` |

### Montar una vista grande en un test

`TablesView`, `BedAssignmentsView`, `ServiceTeamsView` y `ResponsabilitiesView`
se pueden montar mockeando `@repo/ui` y `lucide-vue-next` con un `Proxy` que
responda a cualquier export. **La trampa `has: () => true` es obligatoria**: sin
ella vitest rechaza el mock con *"No X export is defined on the mock"*, porque
comprueba la existencia del export antes de leerlo.

```ts
vi.mock('@repo/ui', () => new Proxy({}, {
  get: (_t, name) => {
    const n = String(name);
    if (n === '__esModule') return false;
    if (n === 'useToast') return () => ({ toast: vi.fn() });
    if (n.startsWith('use')) return () => ({});
    return { name: n, template: '<div><slot /></div>' };
  },
  has: () => true,
}));
```

Con `@repo/ui` mockeado así, `Input` no es un `<input>` real: para escribir en el
buscador se asigna `wrapper.vm.searchQuery` directamente. Y si la vista carga sus
datos en un watcher que el test no dispara (las camas en `BedAssignmentsView`),
se pueblan a mano: `wrapper.vm.beds = beds`.
