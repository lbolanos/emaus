# Jessy — Inventario por foto o audio

Extensión del bot interno **Jessy** (`apps/api/src/services/aiChatService.ts`) para registrar inventario del retiro a partir de una foto o un mensaje de voz. El bot extrae items + cantidades, los matchea contra el inventario actual y deja que el coordinador confirme antes de aplicar.

Complementa el feature de **foto de lista de asistencia** (`jessy-attendance-photo.md`): mismo patrón multimodal (`files: [{ type: 'file', mediaType, url: dataUrl }]` en `chat.sendMessage`), misma conmutación a vision model cuando hay imagen, mismo flujo de preview + confirmación.

## Por qué

Hasta ahora el coordinador capturaba inventario uno-a-uno en la UI web (`InventoryView.vue`) o vía import de Excel. Con esta extensión:

- Toma una foto de la caja/mesa con productos → el bot enumera cada artículo y lo registra.
- Graba un mensaje de voz ("llegaron 5 jabones y 3 detergentes") → el bot detecta intent incremental vs snapshot y actualiza.

## Tools nuevas

Tres tools agregadas al bot en `aiChatService.ts` (líneas ~600+):

### `findInventoryItem(retreatId, query)`

Matching fuzzy del nombre del item dentro del inventario del retiro (`getRetreatInventory`). Mismo algoritmo que `findCommunityMember`:

- Normaliza diacríticos (`Bolaños` → `bolanos`).
- Tokeniza el query y exige que **todos** los tokens estén en el haystack `name` del item (catálogo o ad-hoc).
- Score 0–1 por item: fracción de tokens que aparecen.
- Si no hay matches exactos (score=1), devuelve **matches parciales** (`score ≥ 0.5`) con `isPartialMatch: true` ordenados desc.
- Cada resultado trae: `retreatInventoryId`, `inventoryItemId` (o `null` si es ad-hoc), `name`, `unit`, `currentQuantity`, `requiredQuantity`, `isSufficient`, `isCustom`, `matchScore`.

### `updateInventoryQuantity(retreatId, retreatInventoryId, quantity, mode, notes?)`

Actualiza `currentQuantity` en `retreat_inventory`. **Dos modos**:

- `mode: 'set'` → sobrescribe con `quantity`. Típico de foto ("tengo 5 jabones").
- `mode: 'increment'` → lee el `currentQuantity` actual y suma `quantity` (puede ser negativo para restar). Típico de audio ("llegan 3 jabones más").

Internamente llama a `inventoryService.updateRetreatInventory` que ya audita el cambio en `retreat_inventory_history` automáticamente con el `userId` del request.

### `addCustomInventoryItem(retreatId, customName, currentQuantity, customUnit?, requiredQuantity?, notes?)`

Crea un item **ad-hoc** en el retiro (no toca el catálogo global de `InventoryItem`). Llama a `inventoryService.addCustomItemToRetreat`. Útil cuando el coordinador menciona un producto que no estaba en la lista del retiro.

## Flujo conversacional (system prompt)

Sección "IMPORTANTE — Foto o audio de inventario" en `buildSystemPrompt`. Pasos:

1. **Enumeración (memoria de trabajo)**. El bot **describe item por item ANTES de matchear**:

   > "veo: 1 bolígrafo Bic blanco con franja azul, 1 bolígrafo metálico plateado con clip, 1 marcatextos lila Office Depot, 1 caja de clips, 5 hojas carta"

   Reglas:
   - Cada producto con marca/color/modelo distintos = **una línea propia**. NO agrupar productos diferentes bajo un nombre genérico.
   - Solo agrupa **unidades idénticas del mismo producto** (5 Bic azules iguales = "Plumas Bic azules: 5").
   - En duda, **separa**. Es preferible más granularidad que perder información.
   - Items ilegibles se marcan con `[?]` y se pide aclaración antes de seguir.

2. **Detecta intent (snapshot vs incremento)** — crítico para no romper el conteo:

   - **Foto** → `mode='set'` por default (snapshot de lo que hay AHORA).
   - **Audio con verbos de agregar** ("llegan", "agrega", "trajeron", "X más") → `mode='increment'`.
   - **Audio con verbos de estado** ("hay", "tengo", "son", "pon") → `mode='set'`.
   - Ante duda, asume `set` y lo dice en el preview para que el coordinador corrija.

3. **Identifica el retiro**: usa `retreatId` del contexto (selector UI) o llama `getRetreats` y pregunta.

4. **Match con el inventario actual** (sin tomar decisión automática):
   - Para **cada** artículo enumerado, llama `findInventoryItem(retreatId, <nombre>)`.
   - Si no hay match con el nombre completo, prueba variantes (sin adjetivos: "Bolígrafo azul" → "Bolígrafo").
   - Muestra el resultado: match exacto, parciales o ninguno.
   - **Importante**: NO agrupa automáticamente artículos distintos bajo un mismo item del catálogo. Cada artículo es una línea propia en el preview, con su propio match propuesto.

5. **Preview hablable** (apto para TTS):
   - Con match único específico: `"<artículo>: ¿match con <catálogo> (actualmente X)? → propongo set/incremento a Y"`.
   - Con match genérico/parcial: `"<artículo>: ¿lo cuento bajo <catálogo>? o ¿lo creo ad-hoc independiente?"`.
   - Sin match: `"<artículo>: no encontré nada parecido. Lo crearé como '<nombre>' con Y <unidad>"`.
   - **Caso clave** — si varios artículos distintos matchean al mismo item genérico:
     > "Detecté 4 artículos diferentes que podrían contar como 'Marcadores y Plumas'. ¿Los sumo todos a ese item (4 unidades) o creo 4 ad-hoc separados con sus nombres específicos?"

   El bot NO decide por su cuenta; el coordinador elige.

6. **Aplicar** tras confirmación explícita (`"sí"`, `"confirmo"`, etc.):
   - Para cada match aceptado → `updateInventoryQuantity(...)` con `notes: "Cargado desde foto"` o `"Reportado por voz"`.
   - Para cada ad-hoc → `addCustomInventoryItem(...)` con el nombre específico que se leyó.

7. **Resumen final** hablable: `"Actualicé X items y agregué Y nuevos al inventario del retiro."`

## Audio: cómo funciona

El widget (`AiChatWidget.vue`) ya envía audio por dos rutas (`useSpeechRecognition.ts`):

- **Web Speech API** (Chrome/desktop): transcribe en cliente → llega al backend como texto. El modelo de chat (`AI_MODEL`, ej. `glm-4.7`) lo procesa.
- **MediaRecorder fallback** (Safari iOS): envía `audio/webm` como `files` multimodal → el modelo de visión (`AI_VISION_MODEL`, Gemini 3 Pro Preview) lo transcribe + entiende contexto en un solo paso.

En ambos casos el system prompt detecta el verbo y elige `mode='set'` vs `mode='increment'`.

## Decisiones de diseño

- **Items nuevos = ad-hoc en el retiro** (no se promueven al catálogo global). El catálogo global es responsabilidad del admin; los items detectados por foto pueden tener errores de OCR, así que ad-hoc es seguro.
- **Anti-agrupación bajo nombres genéricos**: el catálogo del proyecto tiene items genéricos tipo "Marcadores y Plumas". Si la foto tiene 4 productos distintos que matchean ahí, el bot **pregunta al coordinador** si unifica o separa — no decide solo.
- **Confirmación obligatoria** antes de cualquier mutación. El bot construye preview con todos los lookups hechos, espera "sí" del coordinador y solo entonces aplica.
- **Historial automático**: cada `updateRetreatInventory` registra en `retreat_inventory_history` con `userId`, `oldValue` y `newValue` (ya existía).

## Verificación

Benchmark con foto real (5 artículos de oficina, ver `apps/api/test-inventory-photo.mjs`):

| Modelo | Latencia | Items detectados |
|---|---:|---:|
| gemini-3-pro-preview | 18 s | **5/5** ✓ |
| gemini-3.5-flash | **8 s** | **5/5** ✓ |

Antes del fix del prompt (versión inicial que decía "extrae los items"), el bot reportaba **2 items** agrupando incorrectamente. Después de reforzar con "enumera primero item por item" + "NO agrupes productos distintos", ambos modelos detectan los 5 reales.

## Tests

- `apps/api/src/tests/services/aiChat.simple.test.ts`:
  - 7 asserts validan que el system prompt incluye la sección "Foto o audio de inventario", las 3 tools, la detección snapshot/incremento y la regla de matching propositiva (pregunta al usuario).
  - Tests unitarios de matching fuzzy (`scoreNameMatch`, `tokenizeQuery`, `normalizeForMatch`) — la misma lógica que usa `findInventoryItem`.

- Manual (no automatizado por costo del LLM real):
  1. `pnpm dev`, login con un usuario admin de retiro.
  2. Abrir Jessy en una vista de retiro (para que inyecte `retreatId`).
  3. Adjuntar foto con varios productos → debe enumerar uno por uno, ofrecer matches y pedir confirmación.
  4. Probar audio: "llegaron 3 cajas de jabón" → debe detectar `mode='increment'`.

## Archivos relevantes

| Archivo | Rol |
|---|---|
| `apps/api/src/services/aiChatService.ts` | Tools `findInventoryItem`, `updateInventoryQuantity`, `addCustomInventoryItem` + sección del prompt |
| `apps/api/src/services/inventoryService.ts` | Funciones backend: `updateRetreatInventory`, `addCustomItemToRetreat`, `getRetreatInventory` |
| `apps/api/src/entities/retreatInventory.entity.ts` | Tabla pivote retreat × item con `currentQuantity` |
| `apps/api/src/entities/retreatInventoryHistory.entity.ts` | Audit log automático de cada cambio |
| `apps/web/src/components/AiChatWidget.vue` | Widget multimodal (foto + audio) — ya existía para asistencia, sin cambios para inventario |
