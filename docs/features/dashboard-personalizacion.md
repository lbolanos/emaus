# Personalización del Dashboard del Retiro

Permite a cada usuario configurar qué secciones ver, en qué orden y con qué nivel de detalle en el dashboard de un retiro. Los cambios se guardan automáticamente en `localStorage` y persisten entre sesiones.

---

## Acceso

`/app/retreats/:id/dashboard` — Botón ⚙ en la esquina superior derecha del encabezado del retiro.

---

## Funcionalidades

### 1. Visibilidad de secciones (per-retiro)

Cada sección del dashboard puede ocultarse o mostrarse individualmente. La configuración se guarda **por separado para cada retiro**, de modo que ocultar "Palancas" en un retiro no afecta a los demás.

**Secciones configurables:**

| Clave | Nombre en UI | Descripción |
|-------|-------------|-------------|
| `registrationLinks` | Links de registro | URLs y QR de registro de caminantes y servidores |
| `primaryStats` | Participantes | Conteo de caminantes, servidores, en espera y angelitos |
| `responsibilities` | Responsabilidades | Asignación de responsabilidades del retiro |
| `tableAssignments` | Mesas | Estado de asignación de caminantes a mesas |
| `assignmentStats` | Habitaciones | Camas asignadas, participantes sin cama, pisos usados |
| `reception` | Recepción | Check-in de caminantes (llegaron / faltan) |
| `palancas` | Palancas | Estado de palancas solicitadas y recibidas |
| `bagsReport` | Reporte de bolsas | Bolsas realizadas vs pendientes |
| `additionalInfo` | Información adicional | Notas, pagos y recuerdos del retiro |
| `inventoryAlerts` | Alertas de inventario | Ítems con déficit de inventario |

**Comportamiento:**
- **Toggle apagado**: la sección desaparece del dashboard
- **Cambio de retiro**: se carga la configuración guardada para ese retiro; si es la primera vez se muestran todas
- **Restablecer todo**: vuelve todas las secciones a visibles y restaura el orden y colapso por defecto

---

### 2. Colapsar secciones

Cada sección tiene un chevron (`∨`) en su cabecera. Al hacer click la sección se colapsa mostrando solo el título — el dato sigue disponible sin hacer scroll. El estado colapsado es **global** (no por retiro).

**Diferencia con ocultar:** colapsar mantiene el espacio del título visible; ocultar elimina la sección completamente.

---

### 3. Reordenar secciones (drag & drop)

En el panel de personalización, cada fila tiene un ícono `⠿` a la izquierda. Se puede arrastrar para cambiar el orden de las secciones en el dashboard. El nuevo orden se aplica en tiempo real via CSS `order` y persiste en `localStorage`.

---

### 4. Mini-stats bar fija

Al hacer scroll más allá de la sección "Participantes", aparece una barra fija en la parte superior de la página con los datos clave:

```
Resumen  | 38 / 54 caminantes  |  28 / 24 servidores
```

La barra desaparece automáticamente si la sección "Participantes" está oculta en el panel de personalización.

---

### 5. Refresh manual + timestamp

El encabezado del retiro muestra cuándo se actualizaron los datos por última vez (`Actualizado hace N min`). El ícono ↺ junto a este texto fuerza una recarga de todos los datos del retiro sin mostrar el spinner de carga completo — en su lugar cada sección muestra su propio skeleton mientras carga.

---

### 6. Skeletons de carga por sección

Cada card muestra un placeholder animado (`animate-pulse`) mientras su fuente de datos está cargando. Los flags de carga son independientes:

| Flag | Secciones afectadas |
|------|-------------------|
| `loadingParticipants` | Participantes, Palancas, Bolsas |
| `loadingTables` | Mesas |
| `loadingBeds` | Habitaciones |
| `loadingResponsibilities` | Responsabilidades |
| `loadingReception` | Recepción |
| `loadingInventory` | Alertas de inventario |

---

### 7. Scroll directo a sección

En el panel de personalización, cada fila tiene un botón `↓` (título: "Ir a esta sección"). Al hacer click:
1. El panel se cierra
2. La página hace scroll suave hasta esa sección

---

## Arquitectura técnica

### Frontend

```
apps/web/src/
├── stores/
│   └── dashboardSettingsStore.ts      # Estado central de personalización
├── components/
│   ├── DashboardCustomizePanel.vue    # Drawer lateral de configuración
│   └── DashboardMiniStats.vue         # Barra fija de estadísticas
└── views/
    └── RetreatDashboardView.vue       # Vista principal del dashboard
```

**`dashboardSettingsStore.ts`** — Pinia store con:
- `visible: Record<SectionKey, boolean>` — persistido en `dashboard:visible-sections:{retreatId}`
- `collapsed: Record<SectionKey, boolean>` — persistido en `dashboard:collapsed-sections`
- `sectionOrder: SectionKey[]` — persistido en `dashboard:section-order`
- `loadVisibilityForRetreat(id)` — carga configuración por retiro
- `toggleVisible(key)` / `toggleCollapsed(key)` / `moveSection(from, to)` / `resetToDefaults()`

**`DashboardCustomizePanel.vue`** — Slide-over desde la derecha con:
- Lista draggable generada desde `store.sectionOrder`
- Drag nativo HTML5 (sin dependencias externas)
- Scroll anchor via `document.getElementById`
- Transiciones CSS (`fade` + `slide-right`)

**`RetreatDashboardView.vue`** — Secciones envueltas en `<div class="flex flex-col gap-6">`:
- Cada sección tiene `id="ds-section-{key}"` para scroll anchors
- Cada sección tiene `:style="{ order: sectionOrder.indexOf(key) }"` para reordenamiento
- `IntersectionObserver` en la grid de participantes activa el mini-stats bar
- `loadVisibilityForRetreat(retreatId)` llamado al cambiar de retiro

### localStorage

| Clave | Tipo | Descripción |
|-------|------|-------------|
| `dashboard:visible-sections:{retreatId}` | `Record<SectionKey, boolean>` | Visibilidad por retiro |
| `dashboard:collapsed-sections` | `Record<SectionKey, boolean>` | Estado colapsado (global) |
| `dashboard:section-order` | `SectionKey[]` | Orden de secciones (global) |

---

## Tests

```
apps/web/src/stores/__tests__/dashboardSettingsStore.test.ts
apps/web/src/components/__tests__/DashboardCustomizePanel.test.ts
```

**Cobertura del store:**
- Estado inicial (visible, collapsed, order)
- `toggleVisible` / `toggleCollapsed` con persistencia en localStorage
- `moveSection` (orden correcto, misma longitud, persistencia)
- `loadVisibilityForRetreat` (carga, guarda anterior, independencia entre retiros)
- `resetToDefaults` (restaura los 3 estados)
- Restauración desde localStorage al inicializar (incluyendo JSON inválido)

**Cobertura del componente:**
- Panel visible/oculto según `isOpen`
- Renderiza secciones desde `sectionOrder`
- Switches reflejan estado del store y llaman `toggleVisible`
- Botón restablecer llama `resetToDefaults`
- Drag: `moveSection` llamado con índices correctos, limpieza en dragend
- Scroll: emite `close` y llama `scrollIntoView` en el elemento correcto

```bash
# Ejecutar todos los tests del dashboard
pnpm --filter web test dashboardSettings
pnpm --filter web test DashboardCustomizePanel
```
