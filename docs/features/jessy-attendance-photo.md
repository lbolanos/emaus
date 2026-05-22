# Jessy — Foto de lista de asistencia

Extensión del bot interno **Jessy** (`apps/api/src/services/aiChatService.ts`) para procesar fotografías de listas de asistencia escritas a mano o impresas. El bot extrae los nombres de la imagen, identifica miembros existentes vs nuevos en la comunidad, pide confirmación y aplica los cambios.

Complementa las herramientas previas de comunidad (`ai-chat-community-tools.md`): no agrega tools nuevas, solo amplía el system prompt y habilita imágenes en el widget.

## Por qué

El coordinador anotaba la asistencia en papel durante la reunión y luego tenía que capturar nombre por nombre en la UI web. Con esta extensión, manda la foto al chat y Jessy se encarga del resto en un solo flujo conversacional.

## Cómo funciona — flujo end-to-end

1. **Adjuntar foto en el widget** (`AiChatWidget.vue`):
   - **Móvil**: dos botones lado a lado. El primero (ícono de cámara con `capture="environment"`) abre directo la cámara trasera para tomar una foto en el momento. El segundo (ícono de paisaje) abre la galería / archivos.
   - **Desktop**: solo el botón de paisaje (galería/archivo) — el de cámara queda oculto vía `md:hidden`.
   - Soporta también: pegar (Ctrl/Cmd+V), arrastrar y soltar sobre el área de mensajes.
   - Validaciones cliente: `mimeType` empieza con `image/`, tamaño bruto < 15 MB.
   - **Resize cliente**: la imagen se reescala a máximo **1600 px** en el lado largo y se reencodea como **JPEG quality 0.85** usando `<canvas>` (compatible Safari iOS — no `OffscreenCanvas`). Reduce ~10× el payload.
   - Preview en miniatura antes de enviar, con botón "✕" para quitarla.
   - El usuario puede agregar contexto opcional ("la asistencia de ayer") o enviar la imagen sola — en ese caso el texto default es `"Foto de lista de asistencia"`.

2. **Envío multimodal**: el widget llama `chat.sendMessage({ text, files: [{ type: 'file', mediaType: 'image/jpeg', url: dataUrl }] })`. Mismo patrón que ya usaba para mensajes de voz. Vercel AI SDK serializa el archivo en `UIMessage.parts` y `convertToModelMessages` lo entrega al provider multimodal configurado (`config.ai.provider`).

3. **Identificación de comunidad** (system prompt L96 en adelante):
   - Si el usuario está navegando una vista de comunidad, el frontend ya inyecta `communityId` en el body del request (vía `useCommunityStore().currentCommunity?.id`). Jessy lo usa por default.
   - Si NO hay `communityId`, Jessy llama `getMyAdminCommunities` y pide al usuario elegir explícitamente. **Nunca asume.**

4. **Identificación de la reunión**: Jessy pregunta al usuario "¿a qué reunión corresponde?". El usuario responde en lenguaje natural ("la de ayer", "la del 15 de mayo", "la de hace 2 semanas"). Jessy llama `listCommunityMeetings` y mapea la respuesta a una reunión concreta. Si hay ambigüedad pide confirmación con título + fecha.

5. **Preview consolidado (sin mutar)** — flujo **phone-first** con cascada de fallback por nombre:

   ```
   a) findCommunityMember(<teléfono 10 dígitos>)    ← más fiable (OCR de números rara vez falla)
   b) findCommunityMember(<nombre completo>)         ← si tel falló
   c) findCommunityMember(<apellido solo>)           ← ej. "Bolaños"
   d) findCommunityMember(<primer nombre solo>)      ← último recurso
   ```

   La tool `findCommunityMember` tokeniza el query (`["hector", "bolanos"]`), normaliza NFD/sin diacríticos, y matchea **todos los tokens en el haystack** `firstName + lastName + fullName`. Si no hay match exacto, devuelve **matches parciales** (score ≥ 0.5) con `isPartialMatch=true`, ordenados por score desc — el modelo los muestra como sugerencias para que el coordinador confirme. Cada resultado trae `matchScore` y `matchedBy` (`phone`|`email`|`name`).

   Caso ejemplo (real): "Hector Bolaños" del OCR matchea contra `firstName="Hector Leonardo"` + `lastName="Bolanos Munoz"` aunque la cadena no aparezca literal en ningún campo, porque los tokens normalizados sí caen ambos en el haystack concatenado.

   Después de los lookups, Jessy construye un resumen:

   ```
   Leí 12 nombres de la foto.
   Reunión: Reunión semanal — 14 de mayo 2026.
   Marcaré asistencia de 9 existentes: Juan Pérez, María López, …
   Crearé 3 nuevos como pending_verification: Pedro Ramírez, …
   ⚠ Ambiguo (elige): "Ana" → Ana García (ana@x.com) | Ana Sánchez (555-1234)
   ¿Confirmas? Sí / cambios.
   ```

   Si algún nombre quedó parcialmente ilegible, Jessy lo marca con `[?]` y NO inventa la parte faltante.

6. **Confirmación explícita**: Jessy solo ejecuta mutaciones cuando el usuario responde con un afirmativo claro ("sí", "confirmo", "ok", "dale", "adelante"). Ante cualquier ambigüedad o "no", se detiene y espera instrucciones.

7. **Aplicación**:
   1. `addCommunityMembersBulk(communityId, nuevos, 'pending_verification')` — cada miembro nuevo lleva en su campo `notes` el texto `"Agregado desde foto de asistencia — verificar ortografía del nombre"` para que el coordinador haga seguimiento.
   2. `recordMeetingAttendance(communityId, meetingId, todos)` — marca asistencia de existentes + recién creados. La tool ya implementa matching fuzzy (NFD sin diacríticos, tokens, email, últimos 10 dígitos de teléfono).

8. **Resumen final** al usuario con cuántos marcados, cuántos nuevos, cuántos ambiguos sin resolver.

## Cambios técnicos

| Archivo | Cambio |
| --- | --- |
| `apps/api/src/services/aiChatService.ts` | Sección "IMPORTANTE — Foto de lista de asistencia" en `buildSystemPrompt`. `stopWhen: stepCountIs(5) → stepCountIs(8)` para acomodar el flujo (extract → identify community/meeting → preview → confirm → addBulk → recordAttendance → resumen). Nueva línea en lista de capacidades. |
| `apps/web/src/components/AiChatWidget.vue` | Botón adjuntar (cámara), `<input type=file>` oculto, helpers `resizeImage` / `attachImageFile` / `onPaste` / `onDragOver` / `onDrop`, preview con botón quitar, render de imagen en burbuja del usuario (`getImageParts`), drag-zone visual sobre `messagesContainer`. `filterMessagesForStorage` extendido: imágenes guardan como `"(imagen)"` en localStorage. `handleSubmit` admite envío con imagen sin texto. Botón help en header + panel `showHelp`. |
| `apps/api/src/tests/services/aiChat.simple.test.ts` | 7 asserts nuevos validando presencia de la sección del prompt, herramientas referenciadas, `pending_verification`, nota fija y `stepCountIs(8)`. |

## Modelos de IA — chat vs visión

El bot ahora usa **dos modelos distintos** según el tipo de mensaje. La lógica de conmutación está en `createChatStream` (`aiChatService.ts`):

```ts
const hasImage = modelMessages.some((m) =>
  Array.isArray(m.content) && m.content.some((c) => c?.type === 'image')
);
const activeModel = hasImage ? getVisionModel() : getModel();
```

| Caso | Variable env | Default sugerido | Razón |
|---|---|---|---|
| Texto puro | `AI_PROVIDER`+`AI_MODEL` | `anthropic`/`glm-4.7` (vía z.ai) | Barato y suficiente para conversación + tool calls de texto |
| Mensaje con imagen o audio | `AI_VISION_PROVIDER`+`AI_VISION_MODEL` | `google`/`gemini-3-pro-preview` | Multimodal con tool calling, ~4 s, 11/11 teléfonos en benchmark |

### Por qué Gemini 3 Pro Preview

Benchmark con foto manuscrita real (mayo 2026, ver `apps/api/test-vision-models.mjs`):

| Modelo | Latencia | Tels OK | Nombres OK |
|---|---:|---:|---:|
| **gemini-3-pro-preview** | **4 s** | **11/11** | 6/11 |
| gemini-3.5-flash | 16 s | 8/11 | 9/11 |
| gemini-3-flash-preview | 30 s | 8/11 | 9/11 |
| gemini-2.5-pro | 34 s | 9/11 | 5/11 |
| gemini-2.5-flash (antiguo default) | 19 s | 6/11 | 2/11 (incluye falso "Tom Bree" del encabezado) |
| gemini-3.1-flash-lite | 2.8 s | 11/11 | 6/11 pero UPPERCASE todo |

Decisión: priorizar **teléfonos perfectos** porque son la llave de matching contra miembros existentes. Los nombres se confirman por voz/chat con el coordinador.

### Thinking models y `AI_CHAT_MAX_TOKENS`

Los modelos Gemini 3.x son **thinking models**: consumen tokens internos en razonamiento antes de generar output o tool calls. El default `1024` se agota a la mitad y el stream se corta con `finishReason=length`.

```bash
# Subido en config.ts a 4096 como default; .env del proyecto a 16384.
AI_CHAT_MAX_TOKENS=16384
```

Si ves errores tipo `[AI Chat] streamText error: ... finishReason=length`, súbelo más.

### Compatibilidad de modelos

- ❌ `gpt-3.5-turbo` — text-only, fallaría como vision model.
- ❌ `glm-4.7` (z.ai) — text-only, NO debe ir en `AI_VISION_MODEL`.
- ✅ `gemini-3.x-pro-preview`, `gemini-3.x-flash-preview`, `gemini-3.5-flash`, `gemini-2.5-pro`/`flash`.
- ✅ `claude-sonnet-4-x`, `claude-opus-4-x` vision (no probados con este flujo pero deberían funcionar).
- ✅ `gpt-4o`, `gpt-4o-mini`.

### Fix técnico (mayo 2026) — AI SDK v6 + data URLs

`@ai-sdk/provider-utils@4.x` rechaza URLs no http(s) con `AI_DownloadError: URL scheme must be http or https, got data:`. El widget envía las imágenes como `data:image/jpeg;base64,...`. Solución en `buildModelMessages` (`aiChatService.ts`): decodifica el `data:` URL a `Buffer` y construye un `ModelMessage` manual con `{ type: 'image', image: <Buffer>, mediaType }`. Para el resto sigue usando `convertToModelMessages` normal.

## Edge cases manejados

- **Doble subida de la misma foto**: `bulkAddMembers` tiene `@Unique(['communityId', 'participantId'])` (`communityMember.entity.ts:17`). Los duplicados quedan en `skipped` sin error.
- **Mala caligrafía / nombres ilegibles**: el prompt instruye marcar con `[?]` y NO completar. El coordinador puede pedir reintento o aclarar en el chat.
- **Nombres ambiguos** (varios miembros con nombre parecido): se listan en el preview con email/teléfono para diferenciar; Jessy pide elegir antes de mutar.
- **Sin comunidad seleccionada**: forzar `getMyAdminCommunities` antes de cualquier cosa.
- **localStorage bloat**: las imágenes no se persisten en el historial local — se reemplazan por el placeholder `"(imagen)"` en `filterMessagesForStorage`.
- **Safari iOS**: usa `<canvas>` regular (no `OffscreenCanvas`) y dataURLs estándar.

## Cómo probarlo localmente

1. `pnpm dev` (api en `:3001`, web en `:5173`).
2. Login con `leonardo.bolanos@gmail.com` / `123456`.
3. Navegar a una comunidad donde seas admin → abrir Jessy (botón flotante azul).
4. Click en el botón de cámara, seleccionar una foto con 2-3 nombres (puede ser una nota tomada con tu celular). También funciona pegar (`Cmd+V`) o arrastrar.
5. Texto opcional: "esta es la asistencia de la reunión de ayer".
6. Verificar que: pregunta a qué reunión, presenta preview, espera "sí", y al final reporta cuántos marcados + creados.

## Verificación posterior en BD

```sql
-- Miembros nuevos creados desde fotos
SELECT id, firstName, lastName, state, notes, createdAt
FROM community_member
WHERE state = 'pending_verification'
  AND notes LIKE '%foto de asistencia%';

-- Asistencias marcadas en una reunión
SELECT COUNT(*) FROM community_attendance
WHERE meetingId = '<meeting-uuid>' AND attended = 1;
```

## Limitaciones conocidas

- **No automatizamos OCR fuera del LLM**: confiamos en la capacidad multimodal del provider configurado. Para listas muy largas (>50 nombres) la latencia puede subir a 10-20s y los tokens consumidos crecen rápido. Considerar partir la foto en hojas si es necesario.
- **No se persiste la imagen original**: ni en localStorage del cliente ni en BD del servidor. Solo el resultado conversacional queda en `ChatConversation.messages` como texto. Si el coordinador quiere consultar la foto después, no la tendrá.
- **Confirmación textual, no botones nativos**: el modelo espera respuestas de texto del usuario, no clicks. UX consistente con el resto del chat.
