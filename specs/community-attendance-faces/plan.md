# Plan: asistencia de comunidad con fotos, reconocimiento facial y voz

> SDD plan — versión 1.1 (2026-10-22). Cómo se construye lo de [spec.md](spec.md), sobre lo
> verificado en [research.md](research.md). v1.1: el motor pasa de AWS Rekognition a Gemini (D2).

## Alternativas evaluadas

### Motor de reconocimiento (D2)

Medido el 2026-10-22 con personas no famosas (galería de 36, 10 miembros, 4 intrusos;
detalle en research.md):

| Opción | Resultado | Veredicto |
|---|---|---|
| **Gemini 3.5 Flash**, foto de grupo + galería en una llamada | 9/10 miembros bien; 14/14 caras; a intrusos les asigna un miembro; confianza no calibrada | **Elegida** (Leonardo): ya integrado (`@ai-sdk/google`, clave en el `.env`), sin infraestructura nueva, una llamada por foto |
| Z.ai `glm-4.6v` / `glm-4.5v` (plan de coding) | 14/14 caras, pero identifica 1–4/10; filtro de contenido que a veces bloquea fotos; el endpoint compatible con Anthropic no pasa las imágenes | Descartada para identificar |
| AWS Rekognition | No medida (requiere IAM). Hecha para esto: similitud calibrada y rechazo de desconocidos | Plan B si la prueba de campo de Gemini sale mal |
| Reconocimiento en el navegador (`face-api` / `human`) | No medida: modelos de 6–10 MB, caras chicas, riesgo en Safari iOS | Descartada |

### Voz (D5)

| Opción | Veredicto |
|---|---|
| **Web Speech API** (`useSpeechRecognition`, `es-MX`) + **campo con autocompletado** donde no exista (el teclado del iPhone dicta) | **Elegida**: cero costo, no sale audio a ningún servidor, ya existe el composable |
| Transcribir en el servidor (Gemini con el audio, o Deepgram) | Fuera de v1; plan B si el iPhone no basta |

## Diseño

```
Subir/reemplazar portada (lista de reuniones, modal, o vista de asistencia)
 ├─ portada 1600 px → setMeetingPhoto (como hoy)
 └─ si la comunidad tiene la función encendida:
      versión 3200 px (≤ 3.4 MB, no se guarda)
        └─ POST …/meetings/:meetingId/face-match
             faceMatchService.analyze:
               galería numerada (sharp, fotos de perfil, D11)
               1 llamada Gemini: [foto, galería] → {faces:[{box, match, confidence}]}
               número → memberId, deduplicar (FR-16), recortes por cara (sharp)
        └─ GroupPhotoAttendanceDialog: sugerencias (preseleccionadas) → sin identificar (voz)
             → Confirmar → POST …/face-match/confirm
                  asistencia (upsert, sin borrar a nadie) + foto de perfil si no tenía

CommunityAttendanceView: toque local + cola sin señal (M1/M2), avatar → MemberPhotoDialog
```

## Capa 1 — Vista de asistencia (M1)

- **Toque sin recarga (FR-1)**: `toggleAttendance` actualiza `member.attended` y no llama
  `fetchMembers`. Un refresco de fondo con *debounce* de 4 s tras el último toque trae los porcentajes;
  el orden no se recalcula en ese refresco si el orden activo es «asistencia» (se recalcula al cambiar
  de orden o al recargar), para que la tarjeta no salte (CA-1).
- **Conservar la URL (FR-2)**: `mergeMembers(prev, next)` en `utils/communityAttendanceList.ts`: si
  la URL nueva y la vieja apuntan al mismo objeto (misma ruta antes de `?`), se queda la vieja. Pura,
  con tests.
- **Firmas caducadas (FR-3)**: `MemberAvatar` emite `error`. La vista pide la lista con firmas nuevas
  como mucho una vez por minuto, y ese refresco sí reemplaza las URLs.
- **Avatar → foto (FR-4)**: el avatar va en un `<button>` con `@click.stop` (no marca asistencia) que
  abre `MemberPhotoDialog`; `saved` reemplaza la fila.
- **«Sin foto» (FR-5)**: filtro `photo: 'all' | 'with' | 'without'` en `AttendanceListOptions`.
- **Móvil (FR-6)**: bajo `md`, los `Select` van en un panel plegable; el botón dice «Filtros (n)».
- **Recordar (FR-7)**: `localStorage` `emaus:community-attendance:<communityId>` con
  `{status, retreat, frequency, photo, sort}`; lectura y escritura en `try/catch` (Safari privado).

## Capa 1a — Página de miembros (M1a, hecha)

Encabezado con «Crear miembro» + ⋮; fila con «Mensajes» + ⋮; check de contactado junto al nombre;
`relative` en el contenedor raíz para que los `<select>` ocultos de reka-ui no estiren el documento.
Detalle y desviaciones en tasks.md.

## Capa 2 — Asistencia sin señal (M2)

- **Kind `community.attendance`** en `apps/web/src/offline/outboxKinds.ts`: `post`,
  `^/communities/([^/]+)/meetings/([^/]+)/attendance/single$`, `retreatId: null`, `routes: []`
  (no hay respuestas guardadas que modificar), `stampBody: true` (manda `occurredAt`), meta con
  `memberId` y el nombre para la lista de pendientes.
- **Servidor**: la ruta suma `idempotency` y un esquema Zod (`memberId` uuid, `attended` boolean,
  `occurredAt` opcional). `recordSingleAttendance` valida que la reunión sea de la comunidad (FR-23)
  y usa `occurredAt` como `recordedAt` si es válido y no está en el futuro.
- **Indicador «pendiente» (FR-8)**: la vista guarda los `memberId` cuya respuesta llegó con
  `queued: true`, y los limpia observando `outbox.ops` (reactivo) cuando la operación sale de la cola.
- **Orden (FR-9)**: la cola ya envía en orden de creación; marcar y desmarcar sin señal termina en el
  último estado.

## Capa 3 — Datos y servicio de Gemini (M3)

### Migración (una): `AddCommunityFaceRecognition`

- `community`: `faceRecognitionEnabled` boolean default 0.
- `community_member`: `faceRecognitionOptOut` boolean default 0.
- Solo `ADD COLUMN`, idempotente (guarda con `PRAGMA table_info`). Sin tablas nuevas: no hay
  vectores ni índices de caras.

### `apps/api/src/services/faceMatchService.ts`

- **Modelo**: `config.ai.faceModel` = `AI_FACE_MODEL` (default `gemini-3.5-flash`), siempre con
  `@ai-sdk/google`. Independiente de `AI_VISION_MODEL` (`gemini-flash-latest`), que el día de la
  evaluación estuvo saturado.
- **Galería (FR-13, D11)**: miembros con foto y sin exclusión; si son más de 48, los de asistencia más
  reciente. Cada foto se lee de S3 (o del data-URI en modo base64), se recorta con
  `sharp(...).resize(140, 160, { fit: 'cover', position: 'attention' })` y se compone en una
  cuadrícula de 6 columnas con el número debajo (como en la evaluación). El mapa número → `memberId`
  vive solo en la llamada. Caché en memoria por comunidad, invalidada por `setMemberPhoto` /
  `deleteMemberPhoto` / exclusión.
- **Llamada (FR-14)**: `generateObject` con esquema Zod
  `{faces: [{box: [ymin, xmin, ymax, xmax] (0–1000), match: number | null, confidence: number}]}`,
  imágenes `[foto, galería]` y el prompt de la evaluación (comparar rasgos, no ropa ni fondo).
  Timeout de 45 s.
- **Post-proceso**: número fuera de rango → `null`; un `memberId` en dos caras → las dos a `null`
  (FR-16); recorte por caja con 40 % de margen y lado mínimo 160 px, JPEG ≤ 512 px.
- **Fallos (D12, FR-22)**: `503`, `429` o timeout → `{ faces: [], degraded: true, reason }`; la
  ruta responde 200 para que la UI abra en modo manual.
- **Mock en tests**: `jest.mock` del módulo que hace la llamada (patrón de `visionAssignmentService`).

### Endpoints

| Ruta | Permiso | Qué |
|---|---|---|
| `PATCH /api/communities/:id/face-recognition` `{enabled}` | owner/superadmin | Enciende/apaga (FR-11) |
| `PATCH /api/communities/:id/members/:memberId/face-recognition` `{optOut}` | acceso | Exclusión (FR-12) |
| `POST /api/communities/:id/meetings/:meetingId/face-match` `{image}` | acceso, rate limit, función encendida | Análisis (FR-14) |
| `POST /api/communities/:id/meetings/:meetingId/face-match/confirm` `{present: memberId[], photos: [{memberId, crop}]}` | acceso | Asistencia (upsert `attended = true`, sin borrar a nadie, a diferencia de `recordAttendance`) + `setMemberPhoto` con el recorte solo si no tenía foto y no está excluido |

Todas validan que la reunión y los miembros pertenezcan a la comunidad de la ruta (FR-23).

## Capa 4 — Revisión desde la portada (M4)

- **Cliente**: al elegir la portada, además de la versión de 1600 px que se guarda, se genera una de
  3200 px JPEG; si pasa de 3.4 MB baja la calidad (0.85 → 0.7 → 0.55), porque `express.json` acepta
  5 MB y base64 suma un tercio. El original nunca se sube (D7).
- **Puntos de subida**: `CommunityMeetingsView` (botón de la lista y modal) y un botón «Subir foto de
  la reunión» en `CommunityAttendanceView`. Un composable `useMeetingPhotoUpload` hace las dos
  cosas: sube la portada y, si la función está encendida, corre el análisis y abre la revisión (en
  la vista de asistencia; desde la lista de reuniones navega a ella con la foto en un store de
  memoria).
- **`GroupPhotoAttendanceDialog.vue`** (pantalla completa en móvil): analizando → sugerencias
  (preseleccionadas, recorte junto a la foto de perfil, D4) → sin identificar (voz, M5) → resumen y
  «Confirmar N presentes». En modo degradado (D12) salta directo a «sin identificar» con un aviso.

## Capa 5 — Voz (M5)

- **`apps/web/src/utils/nameMatcher.ts`** (puro, con tests): normaliza (NFD sin acentos, minúsculas,
  sin puntuación), parte en tokens, y puntúa cada candidato emparejando cada token dicho con el mejor
  token del nombre (Jaro-Winkler), con bonificación si el primer token coincide con el nombre de pila.
  Devuelve los 3 mejores sobre un umbral. Candidatos: `resolveMemberProfile(m).fullName` de los
  miembros que aún no salieron en esta revisión.
- **Paso «sin identificar»**: recorte grande; micrófono (`useSpeechRecognition`); al terminar la
  frase, 3 botones de candidato; «No es de la comunidad», «Saltar». Las palabras «saltar» y
  «siguiente» dichas solas saltan la cara. Sin Web Speech: `Input` con autocompletado sobre el mismo
  matcher.
- Confirmar un candidato lo agrega a `present` y, si no tiene foto y no está excluido, a `photos`
  (FR-20/21).

## Contratos nuevos (resumen)

| Qué | Dónde |
|---|---|
| Endpoints de la tabla de Capa 3 | `communityRoutes.ts` |
| `attendance/single`: + `idempotency`, + `occurredAt`, + chequeo de reunión | M2 |
| `community.faceRecognitionEnabled`, `community_member.faceRecognitionOptOut` | migración M3 |
| `AI_FACE_MODEL` (default `gemini-3.5-flash`) | `.env.example`; prod opcional |
| Kind de cola `community.attendance` | web |

## Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Sugiere a un miembro para alguien que no lo es (medido: le pasa con casi todos los intrusos) | Revisión obligatoria con recorte junto a la foto de perfil; nada se guarda sin «Confirmar» |
| La confianza del modelo engaña | No se usa como umbral (D4) |
| Galería grande (100+ miembros con foto) baja la precisión | Tope de 48 (D11) y medición con galerías más grandes en M4 antes de subirlo |
| Saturación (`503`) o cuota diaria gratuita (~20 llamadas por modelo) | Una llamada por foto; modo degradado (D12); modelo configurable para cambiar sin deploy de código |
| Caras chicas en fotos de grupo reales | Versión de 3200 px; la voz cubre el resto; prueba de campo (CA-9) |
| Cuerpo JSON > 5 MB | Compresión progresiva en el cliente a ≤ 3.4 MB |
| Safari iOS sin Web Speech | Campo con autocompletado + dictado del teclado (D5) |
| Nivel gratuito: Google puede usar lo enviado para mejorar sus productos | Aceptado por Leonardo (D2); el aviso de privacidad debería mencionarlo (D3) |

## Verificación

- Unitarios: `mergeMembers`, filtro «sin foto», `nameMatcher` (acentos, solo nombre, apellidos
  compuestos, homónimos), post-proceso de la respuesta de Gemini (fuera de rango, duplicados).
- API (Jest, Gemini mockeado): encender/apagar (owner), exclusión fuera de la galería (CA-7),
  `face-match` con la función apagada → 403, reunión de otra comunidad → 404, `503` → degradado
  (CA-8), `confirm` no pisa fotos existentes ni guarda la de un excluido.
- E2E (chromium): asistencia en modo avión con la cola (modelo: `offline-*.spec.ts`); revisión con el
  endpoint interceptado.
- Medición: re-correr la evaluación con galerías de 48 y 96 (scripts de la sesión, research.md).
- Campo (CA-9): una reunión real de Buen despacho.

## Despliegue

1. **M0 + M1a + M1 + M2** pueden salir antes (sin dependencias nuevas).
2. M3–M5: deploy normal (migración de dos columnas). La clave de Gemini ya está en prod si
   `AI_VISION_PROVIDER=google` (verificar con el skill `secrets-management` antes del deploy);
   `AI_FACE_MODEL` solo si se quiere otro modelo. El owner enciende la función en Buen despacho y se
   hace la prueba de campo.
