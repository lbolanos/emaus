# Tasks: community-attendance-faces

> SDD tasks — versión 1.1 (2026-10-22; M3–M5 rehechos para Gemini). Al cerrar cada milestone se marcan los items y se añade
> una línea `**Done**:` con fecha. Toda desviación va en `### Desviaciones <fecha>` al pie del
> milestone. `[P]` = paralelizable con el milestone marcado igual.

## M0 — worktree, entrega base y specs SDD

- [x] Worktree `.claude/worktrees/community-attendance-faces`, branch
      `worktree-community-attendance-faces` (base `origin/master` `80be2d96`)
- [x] Entrega del 2026-10-22 movida del árbol principal al worktree (respaldo en parche; árbol
      principal limpio): foto en la tarjeta, `sourceRetreatId` + migración, filtros, orden, barra fija
- [x] `spec.md` (D1–D10 con defaults propuestos)
- [x] `research.md`
- [x] `plan.md`
- [x] `tasks.md`
- [x] `pnpm install --frozen-lockfile --offline` y `packages/ui/dist` clonado del main
      (`cp -ac`); los 13 tests web de la entrega base pasan en el worktree
- [x] DB aislada (`database.worktree.sqlite`) y puertos paralelos para probar en navegador (skill
      `worktree-testing`): 3003/5175, porque 3002/5174 los usa `worktree-community-import-hardening`
- [x] **Gate** (2026-10-22): D1 «cada vez que se sube la foto de la reunión»; D2 Gemini tras
      evaluar Z.ai y Gemini (research.md); D3 consentimiento dado en la inscripción al retiro; el
      resto como se recomendó. Nivel gratuito de Gemini aceptado.
- [x] Commit de la entrega base + M1a + specs (OK de Leonardo: «comit»)

### Desviaciones 2026-10-22

- D2 cambió de AWS Rekognition (propuesta v1.0) a Gemini por decisión de Leonardo, tras medir:
  Z.ai identifica 1–4 de 10; Gemini 3.5 Flash 8–9 de 10, pero sugiere miembros para no miembros. Se
  van con eso: la colección de caras, la tabla `community_member_face`, IAM, el prefijo por entorno
  y el barrido de borrados. D4 deja de usar porcentaje (la confianza de Gemini no está calibrada).

## M1a — Página de miembros con menú ⋮ (pedido directo, adelantado al gate)

- [x] Encabezado: «Crear miembro» + ⋮ (Importar, Exportar, Duplicados, Plantillas); contador de
      duplicados sobre el ⋮ (owner); quitar el `TooltipTrigger` con dos hijos
- [x] `MemberActions`: «Mensajes» + ⋮ (Registrar asistencia, Marcar/Quitar contactado, Notas,
      Historial, Foto; owner: Editar, Eliminar)
- [x] Check verde de contactado junto al nombre (escritorio y móvil)
- [x] Test de `MemberActions` (qué queda visible y qué emite cada ítem): 5/5; suites web de
      comunidad 196/196; `vue-tsc` sin errores en los archivos tocados
- [x] Verificación en navegador (1280 px y 390 px, dev del worktree en 3003/5175): Duplicados y
      Registrar asistencia abren su diálogo desde el menú y al cerrarlo `body` queda sin
      `pointer-events`; marcar contactado pinta el check y aparece «Reiniciar marcas»

**Done**: 2026-10-22

### Desviaciones 2026-10-22

- El contador de duplicados va solo sobre el ⋮, no también dentro del ítem: el contenido del menú se
  monta al abrirlo y repetirlo pedía el conteo al API en cada apertura.
- «Plantillas de mensajes» queda en el menú aunque sobre: la sesión `community-sidebar-tabs` agrega
  pestañas de comunidad (`CommunityNav`) en el árbol principal, sin commitear. Si su cambio llega a
  master, el ítem se puede quitar. Su bloque y el mío no se solapan (coordinado por mensaje).
- Arreglado de paso: el icono `Users` de «Duplicados» no estaba importado (no se pintaba).
- Arreglado tras el reporte de Leo (doble barra de scroll vertical en móvil, ya existía antes): cada
  `Select` de reka-ui deja un `<select>` nativo oculto con `position: absolute`; sin ancestro
  posicionado dentro de `<main>` (el contenedor con scroll), los de las tarjetas móviles se
  ubicaban respecto a `<body>` y estiraban el documento a 3618 px en una pantalla de 844. Fix: `relative`
  en el contenedor raíz de la vista. Medido: documento = alto de la pantalla en 390 px y 1280 px; las
  otras 6 vistas de comunidad no tenían el problema.

## M1 — Vista de asistencia [P con M2-servidor]

- [x] `mergeMembers(prev, next)` en `utils/communityAttendanceList.ts` (conserva URL de foto del mismo
      objeto) + tests
- [x] `toggleAttendance` sin `fetchMembers`; refresco de fondo con debounce de 4 s que no reordena
      (con orden «asistencia» congela el orden visible hasta cambiar de orden)
- [x] `MemberAvatar` emite `error`; la vista pide firmas nuevas como mucho una vez por minuto
- [x] Avatar como botón (`@click.stop`) → `MemberPhotoDialog`; `saved` reemplaza la fila
- [x] Filtro «Sin foto» (`photo: all | with | without`) + tests
- [x] Móvil: filtros plegables con «Filtros (n)»
- [x] Orden y filtros en `localStorage` por comunidad (try/catch); un retiro recordado que ya no
      existe vuelve a «todos»
- [x] Tests de la vista: un toque no llama `fetchMembers`; el avatar no marca asistencia. 40/40 en
      los tres archivos; 197/197 en las suites de comunidad
- [x] Verificación en navegador (dev del worktree): un toque hace solo `POST attendance/single`; a los
      4 s, un único `GET members`; ninguna descarga de foto (CA-1). 1280 px y 390 px revisados

**Done**: 2026-10-22 (agente A en paralelo; verificación en navegador por la sesión principal)

### Desviaciones 2026-10-22

- Los helpers de preferencias (`loadAttendancePrefs` / `saveAttendancePrefs`) viven en
  `communityAttendanceList.ts`, con sus propios tests.
- Ícono `SlidersHorizontal` para «Filtros (n)»: agregado a la allowlist de lucide en
  `apps/web/src/test/setup.ts` para que otros tests que monten la vista no se rompan.
- Las clases de ancho de los `Select` pasaron de `sm:` a `md:` (el plegado empieza en `md`).

## M2 — Asistencia sin señal

- [x] Servidor [P con M1]: esquema Zod de `attendance/single` (+ `occurredAt`), middleware
      `idempotency`, chequeo de que la reunión es de la comunidad, `recordedAt` desde `occurredAt`
- [x] Tests API: reenvío con la misma clave no duplica; reunión de otra comunidad → 404;
      `occurredAt` futuro se ignora (en `communityFaceRecognition.test.ts`)
- [x] Kind `community.attendance` en `outboxKinds.ts` + tests de `matchQueueable` (52/52 en
      `outboxKinds.test.ts`); texto `offline.ops.communityAttendance` en es/en
- [x] Nombre del miembro en la lista de pendientes: `enqueue` acepta `meta` local y `api.ts` lo toma de
      `config.offlineMeta` (`recordSingleCommunityAttendance(..., { memberName })`); no viaja en el
      cuerpo (test en `outbox.test.ts`)
- [x] Indicador «Pendiente» en la tarjeta: por la respuesta `queued: true` o por una operación
      `community.attendance` en `outbox.ops` (sobrevive a recargar); un toque encolado no se revierte
- [x] E2E chromium (`tests/e2e/offline-community-attendance.spec.ts`, detrás de
      `E2E_OFFLINE_WRITES=1` como `offline-outbox.spec.ts` porque escribe en la base): sin señal, 3
      toques quedan «Pendiente» sin ninguna petición al servidor; al volver la señal se mandan 3 con
      `Idempotency-Key` y la base tiene exactamente una fila `attended=true` por miembro (CA-3). Pasa
      en ~3 s contra el dev del worktree

## M3 — Datos y servicio de Gemini

- [x] Migración `20261022120000_AddCommunityFaceRecognition` (ADD COLUMN + tabla de etiquetas de M7,
      idempotente; `transaction = false` por el `DROP TABLE` del `down()`, que exige el guard)
- [x] Entities + tipos en `@repo/types`; `AI_FACE_MODEL` en `config.ts` y `.env.example`
- [x] `faceModelClient` (única llamada a Gemini, abort a 45 s) + `faceMatchService` (galería con
      caché de 10 min invalidada por foto/exclusión/toggle, post-proceso, recortes, degradado)
- [x] Endpoints: encender/apagar (owner), exclusión por miembro, `face-match` (6/min por usuario, 403
      si apagado, 404 antes que 403 para reuniones ajenas), `face-match/confirm`
- [x] Tests API con Gemini mockeado: 26/26 en `communityFaceRecognition.test.ts`; 200/200 en las
      cuatro suites de comunidad; 35/35 suites de migraciones. Bundle `pnpm --filter api build` sin
      `__dirname`/`require` nuevos
- [x] UI: ajuste en el modal de edición de `CommunityListView` (owner/superadmin, con confirmación
      que dice que las caras van a Gemini) e ítem «Excluir / Incluir en el reconocimiento facial» en el
      ⋮ del miembro (solo con la función encendida). Verificado en navegador

### Desviaciones 2026-10-22 (agente B, revisadas por la sesión principal)

- Modo degradado ante **cualquier** fallo del modelo (`reason`: `busy` | `quota` | `timeout` |
  `error`), no solo 503/429/timeout (D12).
- Los números de la galería se dibujan como rectángulos de 7 segmentos en SVG: un Linux sin
  fuentes pintaría el texto vacío.
- `confirm` ignora `photos` y `tags` de miembros que no están en `present` (no sirve para cambiar
  fotos de cualquiera); devuelve 404 sin escribir nada si algún miembro es de otra comunidad.
- La validación Zod del data URL revisa solo el prefijo (una regex sobre MBs revienta el stack en
  Node 20/Linux); el formato real lo valida `sharp`.
- `recordSingleAttendance` valida la reunión para todos los llamadores, también la asistencia
  pública, que ahora responde 404 a una reunión de otra comunidad.
- **Corregido en la revisión**: el derecho de eliminación (`anonymizeParticipantByToken`) no
  borraba las etiquetas de la persona en las fotos de grupo, y el álbum público la habría mostrado
  como «(eliminado)» sobre su cara. Ahora se borran sus etiquetas y el álbum excluye a quien tenga
  `dataDeletedAt` (test nuevo).

## M4 — Revisión desde la portada

- [x] Cliente: versión de 3200 px con compresión progresiva a ≤ 3.4 MB (`resizeImageForAnalysis`)
- [x] `useMeetingPhotoUpload`: sube la portada y, con la función encendida, corre el análisis
- [x] Conectar los puntos de subida: lista de reuniones, modal de la reunión (evento `photo-saved`) y
      botón «Subir foto de la reunión» en la vista de asistencia
- [x] `GroupPhotoAttendanceDialog.vue` (+ `FaceMemberPicker.vue`): sugerencias preseleccionadas con el
      recorte junto a la foto de perfil, «Sin identificar» con selector, «Agregar a mano», degradado;
      slot `voice` para M5
- [x] Tests: post-proceso, confirm, diálogo con el endpoint mockeado. Web completo 3913/3913
- [ ] Medición con galerías de 48 y 96 antes de fijar el tope de D11

**Prueba de punta a punta (2026-10-22, dev del worktree, Gemini real)**: con
`AI_FACE_MODEL=gemini-flash-lite-latest` (la cuota gratuita diaria de `gemini-3.5-flash` estaba
agotada) y 10 miembros con fotos de perfil del set de rostros uzbekos, subir la foto de grupo dio en
dos corridas 9/10 y 10/10 sugerencias correctas, con los 4 intrusos en «sin identificar»; confirmar
marcó los presentes y guardó las etiquetas; el álbum publicado mostró los 10 nombres sobre los rostros
correctos. El dev guarda fotos en la base (`AVATAR_STORAGE` = `base64` por defecto): nada se escribió
en S3.

### Desviaciones 2026-10-22 (segunda tanda)

- Recortes más ceñidos y cuadrados (margen 30 %, sin mínimo de 160 px): en la foto de grupo el recorte
  traía las caras vecinas y no se sabía a quién se refería la sugerencia. Gemini lite devuelve cajas
  amplias, así que aún pueden asomar vecinos; en la revisión el recorte se muestra a 80 px.
- Botones de álbum como iconos en la lista de reuniones (no hay ⋮ ahí), visibles para quien abre la
  lista; un no-admin recibiría el 403 del servidor.
- **Seguridad, corregido en la revisión**: `POST /:id/meetings` y `PUT /meetings/:id` solo validaban;
  el controlador pasaba `req.body` crudo al repositorio, así que un admin podía cambiar `communityId`
  (mover la reunión a otra comunidad), `photoUrl` o el token del álbum. Ahora usan
  `assignParsedBody` (test `communityMeetingWriteRoutes.simple.test.ts`). `faceRecognitionEnabled`,
  `albumToken` y `albumPublishedAt` se omiten de los esquemas de escritura.

## M5 — Identificar por voz

- [x] `utils/nameMatcher.ts` + tests (acentos, solo nombre, apellidos compuestos, homónimos): 9/9;
      `matchNames(spoken, candidates, {limit=3, minScore=0.8})`, Jaro-Winkler por token, sin
      partículas «de/del/la/las/los/y», +0.05 si coincide el nombre de pila. `minScore` sin calibrar
      con voz real
- [x] Paso «sin identificar» con micrófono (`FaceVoiceIdentifier.vue` en el slot `voice` del
      diálogo): «Decir nombre», 3 candidatos con su foto de perfil, «saltar»/«siguiente» y «no es de la
      comunidad» por voz, mensajes de permiso y de «no encontré a nadie»
- [x] Respaldo sin Web Speech: campo con autocompletado (`FaceMemberPicker`) y la indicación de usar el
      micrófono del teclado; el audio grabado nunca se usa (D5)
- [x] Confirmar → `present` + `photos` (excluidos solo `present`): lo decide el diálogo
- [ ] Verificación con voz real en Chrome desktop, Android y iPhone (dictado del teclado). En el
      navegador automatizado se verificó con un `SpeechRecognition` simulado: «luis» → 3 candidatos
      libres con avatar, sin los que ya estaban sugeridos

**Done** (salvo la prueba con voz real): 2026-10-22. Tests: 9 de `FaceVoiceIdentifier`, 247 en las
suites de comunidad.

## M7 — Álbum público de la reunión (pedido 2026-10-22)

- [x] Datos (en la migración de M3): tabla `community_meeting_photo_tag` y columnas de publicación
      en `community_meeting`; `face-match/confirm` guarda etiquetas; reemplazar/borrar portada las borra
- [x] Endpoints publicar/despublicar (admins de la comunidad; 409 si la reunión no tiene foto; volver a
      publicar conserva el enlace) y `GET /public/album/:token` (60/min por IP, `no-store`,
      `X-Robots-Tag: noindex`, 404 idéntico para token desconocido, mal formado o despublicado)
- [x] Vista pública `/album/:token` (D16) + botón «Publicar álbum / Copiar enlace» en la reunión
- [x] Tests: token inválido → 404; excluidos y no confirmados no salen; sin datos de contacto
- [x] Verificación en navegador (escritorio y 390 px): con datos simulados y con el álbum real
      publicado en el dev del worktree. Corregido tras revisarlo: etiqueta de rostros en la orilla
      (abajo y alineada al borde), sin barra de scroll a 100 %, flecha de la lista en el mismo renglón,
      marcador nativo del `<summary>` oculto

## M6 — Cierre

- [x] Ayuda in-app (`docs/es` y `docs/en` de comunidades): foto de grupo, voz, exclusión, sin señal,
      álbum; y las instrucciones que el menú ⋮ había dejado viejas (Importar, Duplicados, Eliminar,
      Registrar asistencia por miembro)
- [x] Skill `community-overlay`: exclusión del reconocimiento y etiquetas del álbum
- [x] Skill `troubleshooting` #39: «doble barra de scroll» = `<select>` oculto de reka-ui sin ancestro
      posicionado dentro de `<main>` (síntoma, cómo medirlo, fix con `relative`)
- [ ] Prueba de campo en una reunión real (CA-9); anotar aciertos y sugerencias equivocadas aquí
- [ ] Reconcile de criterios CA-1..CA-9 en `spec.md`
- [ ] PRs: M0–M2 por un lado; M3–M5 después, con la secuencia de despliegue de plan.md

## Paralelismo

- M1 y la parte servidor de M2 son independientes. M2-web depende de M1 (misma vista).
- M3 (servidor) es independiente de M1/M2.
- M4 depende de M3. M5 depende de M4 (vive dentro del diálogo), salvo `nameMatcher`, que es puro y
  puede ir en paralelo desde el principio.
- Tandas: (1) M1 + M2-servidor + M3 + `nameMatcher`; (2) M2-web + M4; (3) M5; (4) M6.
