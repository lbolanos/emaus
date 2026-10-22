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

- [ ] `mergeMembers(prev, next)` en `utils/communityAttendanceList.ts` (conserva URL de foto del mismo
      objeto) + tests
- [ ] `toggleAttendance` sin `fetchMembers`; refresco de fondo con debounce de 4 s que no reordena
- [ ] `MemberAvatar` emite `error`; la vista pide firmas nuevas como mucho una vez por minuto
- [ ] Avatar como botón (`@click.stop`) → `MemberPhotoDialog`; `saved` reemplaza la fila
- [ ] Filtro «Sin foto» (`photo: all | with | without`) + tests
- [ ] Móvil: filtros plegables con «Filtros (n)»
- [ ] Orden y filtros en `localStorage` por comunidad (try/catch)
- [ ] Tests de la vista: un toque no llama `fetchMembers`; el avatar no marca asistencia
- [ ] Verificación en navegador (desktop y 390 px): Network sin descargas de foto al marcar (CA-1)

## M2 — Asistencia sin señal

- [ ] Servidor [P con M1]: esquema Zod de `attendance/single` (+ `occurredAt`), middleware
      `idempotency`, chequeo de que la reunión es de la comunidad, `recordedAt` desde `occurredAt`
- [ ] Tests API: reenvío con la misma clave no duplica; reunión de otra comunidad → 404;
      `occurredAt` futuro se ignora
- [ ] Kind `community.attendance` en `outboxKinds.ts` + tests de `matchQueueable`
- [ ] Indicador «pendiente» en la tarjeta, limpiado al salir la operación de la cola
- [ ] E2E chromium: modo avión → 3 marcas pendientes → señal → guardadas una vez (CA-3)

## M3 — Datos y servicio de Gemini

- [ ] Migración `AddCommunityFaceRecognition` (skill `sqlite-migrations`; solo ADD COLUMN, idempotente):
      `community.faceRecognitionEnabled`, `community_member.faceRecognitionOptOut`
- [ ] Entities + tipos en `@repo/types`; `AI_FACE_MODEL` en `config.ts` y `.env.example`
- [ ] `faceMatchService`: galería numerada (D11, caché invalidada por foto/exclusión), una llamada
      `generateObject` con esquema Zod, post-proceso (fuera de rango, duplicados), recortes, modo
      degradado ante `503`/`429`/timeout
- [ ] Endpoints: encender/apagar (owner), exclusión por miembro, `face-match` (rate limit, 403 si
      apagado), `face-match/confirm` (upsert sin borrar; foto solo si no tenía y no está excluido)
- [ ] Tests API con Gemini mockeado (lista de Verificación de plan.md)
- [ ] UI: ajuste en la configuración de la comunidad (owner); interruptor «Excluir del
      reconocimiento» en el ⋮ del miembro

## M4 — Revisión desde la portada

- [ ] Cliente: versión de 3200 px con compresión progresiva a ≤ 3.4 MB
- [ ] `useMeetingPhotoUpload`: sube la portada y, con la función encendida, corre el análisis
- [ ] Conectar los puntos de subida: lista de reuniones, modal de la reunión y botón «Subir foto de la
      reunión» en la vista de asistencia
- [ ] `GroupPhotoAttendanceDialog.vue`: analizando → sugerencias (preseleccionadas, recorte junto a la
      foto de perfil) → resumen; modo degradado
- [ ] Tests: post-proceso, confirm, diálogo con el endpoint mockeado
- [ ] Medición con galerías de 48 y 96 antes de fijar el tope de D11

## M5 — Identificar por voz

- [ ] `utils/nameMatcher.ts` + tests (acentos, solo nombre, apellidos compuestos, homónimos)
- [ ] Paso «sin identificar» con micrófono (`useSpeechRecognition`), 3 candidatos, «saltar» por voz
- [ ] Respaldo sin Web Speech: campo con autocompletado
- [ ] Confirmar → `present` + `photos` (excluidos solo `present`)
- [ ] Verificación en Chrome desktop, Android y iPhone (dictado del teclado)

## M6 — Cierre

- [ ] Ayuda in-app (`docs/es` y `docs/en` de comunidades): foto de grupo, voz, exclusión, sin señal
- [ ] Skill `community-overlay`: exclusión del reconocimiento y galería de Gemini
- [ ] Skill `troubleshooting`: «doble barra de scroll» = `<select>` oculto de reka-ui sin ancestro
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
