# Research: asistencia de comunidad con fotos, reconocimiento facial y voz

> Estado actual verificado el 2026-10-22 sobre `80be2d96` + la entrega de M0 (sin commitear).
> Rutas relativas a la raíz del repo. Lo marcado **Gap** es lo que falta y entra en el plan.

## Resumen

- La vista de asistencia recarga a todos los miembros en cada toque, y cada recarga trae URLs de
  foto firmadas de nuevo: el navegador vuelve a bajar todas las fotos.
- La foto de perfil del miembro ya existe (S3 privado, firmada al leer, cuadrado de 512 px en WebP),
  con su diálogo de subida reutilizable.
- La foto de portada de la reunión ya es una foto de grupo (se dejó de recortar por eso).
- La cola sin conexión existe y es extensible por "kinds"; las comunidades quedaron fuera a propósito.
- Ya hay un composable de reconocimiento de voz (`es-MX`) con respaldo para iPhone.
- AWS: SDK de S3 instalado; el usuario IAM `emaus-app` solo tiene permisos de S3. Rekognition no
  está ni instalado ni autorizado.

## Vista de asistencia (con la entrega de M0)

- `apps/web/src/views/CommunityAttendanceView.vue`
  - `toggleAttendance` llama `communityStore.recordSingleAttendance` y luego
    `communityStore.fetchMembers(props.id)` **en cada toque**, y reconstruye `membersWithAttendance`
    desde `members.value` (objetos nuevos).
  - Filtros y orden viven en `apps/web/src/utils/communityAttendanceList.ts` (función pura con tests).
  - Barra fija: `sticky -top-14 md:-top-4` compensa el padding de `<main>` en
    `apps/web/src/layouts/AppLayout.vue` (`pt-14` en móvil, `p-4` desde `md`); la cabecera móvil se
    oculta con `scrollTop > 20`.
- `apps/web/src/stores/communityStore.ts:136` `fetchMembers` reemplaza `members.value` entero con
  `api.getCommunityMembers`.
- `apps/web/src/components/community/MemberAvatar.vue`: si la imagen falla (`@error`), cae a
  iniciales; no avisa al padre. **Gap** FR-3: emitir el fallo para pedir firmas nuevas.

## Fotos de miembro

- Subida: `POST /api/communities/:id/members/:memberId/photo` (`requireCommunityAccess`, no
  owner-only; `apps/api/src/routes/communityRoutes.ts:196`), `communityService.setMemberPhoto`
  (`apps/api/src/services/communityService.ts:676`): `imageService.processAvatar` (recorte cuadrado
  512 px) → `s3Service.uploadCommunityMemberPhoto` → `community-members/<memberId>.webp`.
- Borrado: `deleteMemberPhoto` (`:711`).
- Lectura: `getMembersForViewer` firma con `s3Service.presignPrivateUrl` (`apps/api/src/services/s3Service.ts:454`).
  No hay caché: cada lectura genera otra firma (otra URL). `photoS3Key` no viaja al cliente.
- Diálogo: `apps/web/src/components/community/MemberPhotoDialog.vue` — props `open`, `communityId`,
  `memberId`, `memberName`, `currentPhotoUrl`; emite `update:open` y `saved(member)`. Reduce en el
  navegador con `resizeImageToDataUrl`. Hoy solo se abre desde `CommunityMembersView.vue`.
- Datos de dev (copia del 2026-10-22): Buen despacho 112 miembros, 25 con foto; Tlalpan 4, 0 con
  foto. 13 reuniones con portada.
- En dev la URL firmada responde **403 AccessDenied**: las credenciales del API local no leen el
  prefijo privado. **Gap**: probar el reconocimiento en local exige credenciales con permiso (ver
  Infra).

## Página de miembros (`apps/web/src/views/CommunityMembersView.vue`)

- Encabezado con **cinco botones** que en 1280 px se parten en dos renglones: Plantillas de mensajes
  (repite la pestaña «Plantillas» de la comunidad), Exportar, Crear miembro, Importar miembros y
  Duplicados (con `DuplicateCountBadge`, solo owner).
- Defectos de paso: el icono de «Duplicados» (`Users`) **no está importado** y no se pinta (deja el
  hueco); y un `TooltipTrigger as-child` envuelve **dos** botones (Importar y Duplicados) cuando
  `as-child` espera un hijo.
- Fila: `components/community/MemberActions.vue` con tres iconos sueltos (contactado, registrar
  asistencia, mensajes) más un ⋮ (notas, historial, foto; owner: editar, eliminar) que ya usa
  `deferOpen` con `poll: false` (el polling vive en la vista).
- La marca «ya contactado» es solo del navegador (`useContactedMarks`, `localStorage`).
- Sin tests de la vista ni de `MemberActions`. El mock global de `@repo/ui` **no** define
  `DropdownMenu*` y el de `lucide-vue-next` no trae `CheckCircle2` ni `Circle`: un test que monte el
  menú los mockea localmente (patrón de `components/__tests__/ParticipantList.test.ts`).

## Foto de la reunión (foto de grupo)

- `communityService.setMeetingPhoto` (`:1776`) usa `imageService.processPhoto` (sin recorte, 1600 px,
  WebP) — el comentario dice que se cambió porque el recorte cortaba a la gente de las orillas de las
  fotos de grupo. Spec: `specs/meeting-photo-resize/` (D1: el navegador reduce a 1600 px antes de
  subir; D3: original hasta 30 MB).
- Rutas: `POST/DELETE /api/communities/meetings/:id/photo` (`communityRoutes.ts:249,257`).
- Subida desde `apps/web/src/views/CommunityMeetingsView.vue` (`triggerPhotoUpload`) y desde el modal
  de la reunión.
- A 1600 px, una cara en una foto de 30 personas queda en ~40–60 px: en el límite de lo que detecta
  Rekognition. **Gap**: el reconocimiento necesita una versión más grande que no se guarde (D1).

## Asistencia: API

- `POST /api/communities/:id/meetings/:meetingId/attendance/single` (`communityRoutes.ts:321`,
  `requireCommunityAccess`), `recordSingleAttendance` (`communityService.ts:2601`): verifica que el
  miembro sea de la comunidad y hace upsert de `attended` con `recordedAt = now`. No valida que la
  reunión sea de la comunidad. **Gap** (FR-23).
- `POST /api/communities/:id/meetings/:meetingId/attendance` (`recordAttendance`, `:2191`) **borra toda
  la asistencia de la reunión** y la reescribe: no sirve para sumar presentes desde una foto.

## Cola sin conexión (`apps/web/src/offline/`)

- `outboxKinds.ts`: lista cerrada `OutboxKind` (`reception.*`, `beds.assign`, `tables.*`, …); cada
  kind declara método, patrón de URL, ids, `retreatId`, rutas de caché que modifica y un reductor.
- `services/api.ts:206`: el interceptor de request reconoce la escritura con `matchQueueable`, le pone
  `Idempotency-Key` y `X-Client-Time`; sin señal la encola sin intentar; con timeout de red (10 s) la
  encola con la misma clave. Responde 202 `queued: true`.
- `flag.ts`: `isOfflineModeEnabled()` global (runtime config `offlineMode !== false`).
- Servidor: middleware `apps/api/src/middleware/idempotency.ts`, aplicado por ruta (pagos,
  participantes); servicio `idempotencyService` con limpieza programada (migración
  `20261020120000_CreateIdempotencyKeys`).
- UI de pendientes y conflictos: `components/offline/ConnectivityChip.vue` y el `Sidebar`.
- `specs/offline-mode/spec.md` deja fuera "modo sin conexión … en comunidades". **Gap**: kind nuevo
  `community.attendance` (sin rutas de caché: la vista no se guarda para abrirse sin señal) e
  idempotencia en la ruta.

## Voz

- `apps/web/src/composables/useSpeechRecognition.ts`: Web Speech API `es-MX` (`continuous`,
  `interimResults`); si no existe (iPhone según el código), cae a `MediaRecorder` y deja un `Blob`.
- `components/AiChatWidget.vue` es el único usuario: el blob de iPhone se manda a Gemini como archivo
  multimodal. Para nombres, D5 evita mandar audio: en iPhone se usa el dictado del teclado.
- No hay búsqueda difusa de nombres reutilizable. **Gap**: matcher sin acentos por tokens sobre
  `resolveMemberProfile(m).fullName`.

## Borrado y fusión (puntos donde tienen que borrarse caras)

- `participantService.anonymizeParticipantByToken` (`apps/api/src/services/participantService.ts`,
  ~`:5668–5715`) ya borra las fotos de rostro de la persona en todas sus comunidades.
- `communityService.removeMember` (`:1443`) borra la fila de `community_member` (borrado duro).
- `participantMergeService.ts`: política `merge-member` para `community_member` (`:71`): fusiona las
  filas de miembro de dos participantes y mueve la asistencia.
- `deleteMemberPhoto` (`:711`).

## Infra AWS

- `apps/api/package.json`: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `sharp`. Están en
  `rollupOptions.external` de `apps/api/vite.config.ts`. **Gap**: `@aws-sdk/client-rekognition`
  (instalar y externalizar; solo `pnpm build` detecta el olvido, ver `apps/api/CLAUDE.md`).
- Credenciales: `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (`apps/api/.env.example`).
- Usuario IAM `emaus-app`: `GetObject/PutObject/DeleteObject` sobre prefijos de `emaus-media`
  (`.ruler/skills/secrets-management/SKILL.md`). **Gap**: política para Rekognition, acotada a
  colecciones con el prefijo de prod.
- Créditos de AWS vigentes hasta el 2027-01-12 (memoria del proyecto).
- **Riesgo**: la base de dev es copia de prod, con los mismos ids de comunidad. Si dev y prod usan las
  mismas credenciales y el mismo nombre de colección, una prueba local escribiría en la colección de
  prod. **Gap** FR-24: prefijo por entorno.

## Rekognition (hechos del servicio que condicionan el diseño)

- Formatos de entrada: **JPEG y PNG**. Las fotos de perfil están en WebP: hay que convertirlas con
  `sharp` antes de indexarlas.
- Imagen por bytes: hasta 5 MB; desde S3: hasta 15 MB.
- `DetectFaces` devuelve cajas de todas las caras; `SearchFacesByImage` busca **solo la cara más
  grande** de la imagen que recibe: para una foto de grupo hay que recortar cada cara y buscarla por
  separado (1 + N llamadas por foto).
- `IndexFaces` con `ExternalImageId` (caracteres `[a-zA-Z0-9_.\-:]`, sirve un uuid); `DeleteFaces`
  por `FaceId`; `DeleteCollection`.
- Tamaño mínimo de cara detectable: del orden de 40×40 px en una imagen de 1920×1080.
- Costo: del orden de US$0.001 por imagen analizada y centésimas de centavo por cara guardada al
  mes. **A confirmar** en la página de precios antes del deploy; con los créditos no es relevante a
  esta escala (una foto de 30 caras ≈ 31 llamadas).

## Evaluación de Z.ai para reconocer caras (2026-10-22, pedida por Leonardo)

Método: imágenes públicas del dataset de investigación LFW (Hugging Face `logasja/lfw`), nunca caras
de miembros. 10 personas con 3 fotos distintas cada una (galería / foto de grupo / prueba) + 30
personas con una sola foto (26 de relleno en la galería, 4 intrusos). Galería numerada de 36 caras;
foto de grupo de 1800×900 con 14 caras. Scripts en el scratchpad de la sesión
(`facetest/eval_faces.mjs`, `fetch_lfw.py`); la clave sale de `apps/api/.env` y no se imprime.
**Sesgo a favor del modelo**: LFW son sobre todo personas famosas; con miembros desconocidos el
resultado sería igual o peor.

Hallazgos de acceso con la cuenta actual (plan de coding de Z.ai):

- `https://api.z.ai/api/anthropic/v1` (el que usa el chat de la app): **no le pasa la imagen a
  `glm-4.6v`**; el modelo contesta que no puede verla e inventa. Una primera corrida por ahí dio 0/10
  y no vale como medición.
- `https://api.z.ai/api/paas/v4`: `1113 Insufficient balance` (sin saldo por tokens).
- `glm-5v-turbo`: `1311 Your current subscription plan does not yet include access`.
- `https://api.z.ai/api/coding/paas/v4` (OpenAI-compatible): **sí recibe imágenes**, con filtro de
  contenido `1301 «contenido sensible»`: bloqueó 2 de 60 fotos sueltas y, en la primera corrida, la
  foto de grupo entera.

Resultados por el endpoint de coding (9 personas tras quitar las 2 fotos bloqueadas):

| Prueba | `glm-4.6v` | `glm-4.5v` |
|---|---|---|
| Detección de caras en la foto de grupo | **13/13**, 0 falsas | **13/13**, 0 falsas |
| Identificar una cara contra la galería de 36 | **0/9** (contesta «ninguna» casi siempre); intrusos 4/4 rechazados | **3/9**; 6 equivocadas **con 90–98 % de confianza**; intrusos 3/4 |
| Foto de grupo + galería en una sola llamada | 2/13 bien, 11 mal | 7/13 bien (incluye intrusos rechazados), 2 mal |

Gemini (referencia), tercera corrida el mismo día con el mismo set:

- `gemini-flash-latest` (el modelo de visión que usa la app): `503` saturado otra vez.
- `gemini-3-flash-preview`: **acertó 4 de 4** identificaciones (confianza 95–100) antes de que la
  clave llegara al límite de cuota gratuita (`429 You exceeded your current quota`); las otras 9
  pruebas (5 personas y los 4 intrusos) no se midieron. Su detección dio 4/13, pero probablemente es
  un artefacto del formato de caja (Gemini usa `[ymin, xmin, ymax, xmax]` y el prompt pedía
  `[x1, y1, x2, y2]`), no una medida válida.
- `gemini-3.1-pro-preview`: `429` de cuota desde la primera llamada.

Prometedor pero no concluyente: 4 casos, caras famosas (Gemini puede reconocerlas por fama, lo que
infla más su resultado que el de GLM), y sin medir el rechazo de intrusos.

### Segunda medición: personas no famosas (2026-10-22)

Set: dataset de rostros uzbekos en Hugging Face (`IlhomRustamov/Uzbek-faces-dataset-for-face-recognition`,
65 personas, fotos de redes sociales con cambios de peinado, maquillaje y resolución). Mismo diseño:
galería de 36 (10 «miembros» + 26 de relleno), una foto distinta de cada miembro como prueba, otra
en la foto de grupo (14 caras), 4 intrusos. Recorte centrado en la zona más llamativa de la foto
(`sharp` `position: attention`); a Gemini las cajas se le piden en su formato `[ymin, xmin, ymax, xmax]`.
El filtro de Z.ai no bloqueó ninguna de las 60 fotos.

| Prueba | `glm-4.6v` | `glm-4.5v` | `gemini-3.5-flash` | `gemini-flash-lite-latest` |
|---|---|---|---|---|
| Caras encontradas (14) | 14, 0 falsas | 14, 0 falsas | 14, 1 extra | 14, 1 extra |
| Identificar 1 cara contra 36 (10 miembros) | 1/10 | 4/10 | **8/10** | 7/10 |
| Errores con confianza alta | 3 | 9 | 2 (90–95 %) | 6 (95–98 %) |
| Intrusos rechazados | 3/4 | 1/4 | 1/2 medidos (2 sin cuota) | 1/4 |
| Foto de grupo + galería en 1 llamada: miembros bien | 2/10 | 4/10 | **9/10** | 8/10 |
| Ídem: intrusos rechazados / errores | 1/4 · 11 | 0/4 · 9 | 1/4 · 4 | 4/4 · 0 |

No se pudieron medir: `gemini-flash-latest` (el alias que usa la app; `503` saturado durante 4 min
de reintentos), `gemini-3-flash-preview` y `gemini-3.1-pro-preview` (cuota diaria gratuita agotada;
Google pidió esperar ~13 h). `gemini-3.5-flash` también agotó su cuota diaria a mitad de la corrida.
El nivel gratuito da del orden de 20 llamadas por modelo al día.

Conclusiones:

- **Z.ai no sirve para identificar** (1–4 de 10), ni con caras famosas ni sin ellas. Sí para detectar.
- **Gemini 3.5 Flash acierta 8–9 de 10 miembros**, y el modo de una sola llamada por foto (foto de grupo
  + galería) es el mejor y el más barato.
- **Ningún modelo de lenguaje rechaza bien a quien no es miembro**: a un visitante le asigna un
  miembro, con 90–98 % de «confianza». La confianza que declaran no está calibrada: no sirve como
  umbral. Con estos motores la revisión humana de cada coincidencia es obligatoria (D4 cambia).
- Muestra chica (10 miembros + 4 intrusos) y collage artificial: falta la prueba con una foto real de
  una reunión antes de dar por buena la tasa de aciertos.
- Para producción: el nivel gratuito (≈20 llamadas diarias por modelo y `503` frecuentes hoy) no da
  confiabilidad; el de pago además deja de usar lo enviado para entrenar.

Conclusión: los modelos de visión de Z.ai **sí sirven para encontrar las caras** (cajas precisas), **no
para decir de quién es cada una**. La confianza que declaran no está calibrada, así que un umbral no
filtra los errores. No es un defecto del prompt: no son modelos de reconocimiento facial (no producen
vectores de identidad), y los proveedores además los restringen para identificar personas.

## Tests disponibles

- API: Jest con SQLite de test (`apps/api/src/tests/test-setup.ts`); servicios de AWS se mockean
  (`s3Service` en los tests de fotos). La base de test no tiene los índices de las migraciones.
- Web: Vitest + `happy-dom`; mocks globales de `@repo/ui`, `lucide-vue-next` (allowlist) y
  `vue-i18n` en `apps/web/src/test/setup.ts`.
- E2E: Playwright en `apps/web/tests/e2e/`; los de offline (`offline-*.spec.ts`) sirven de modelo
  para FR-8.

## Gaps (lo que falta para el spec)

> v1.1: con D2 = Gemini, los gaps 5 y 8 de AWS (Rekognition, IAM, prefijo por entorno, borrado de
> vectores) ya no aplican; quedan como registro de la alternativa evaluada. Las secciones «Infra AWS»
> y «Rekognition» de arriba tampoco aplican, salvo el 403 de las fotos en dev.

1. Toque sin recarga + conservar URL de foto + firmas nuevas al caducar (FR-1..3).
2. Avatar que abre `MemberPhotoDialog` y filtro «Sin foto» (FR-4, FR-5).
3. Filtros plegables en móvil y recordados (FR-6, FR-7).
4. Kind `community.attendance` + idempotencia + indicador «pendiente» (FR-8..10).
5. Ajuste por comunidad, bandera por miembro, tabla de caras, cliente de Rekognition, IAM, prefijo
   por entorno (FR-11..13, FR-24).
6. Análisis de foto de grupo y pantalla de revisión (FR-14..18).
7. Matcher de nombres y flujo de voz (FR-19..21).
8. Borrado de caras en los cinco puntos de D8, con reintento (FR-22).
9. Validar que la reunión pertenezca a la comunidad en las rutas de asistencia (FR-23).
