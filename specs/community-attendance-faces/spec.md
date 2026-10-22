# Spec: asistencia de comunidad con fotos, reconocimiento facial y voz

> SDD spec — versión 1.1 (2026-10-22). Estado: **decisiones cerradas con Leonardo** (D1, D2, D3
> y el resto como se recomendaron). Artefactos: [spec.md](spec.md) (qué y por qué) →
> [research.md](research.md) (estado actual verificado y evaluación de motores) →
> [plan.md](plan.md) (cómo) → [tasks.md](tasks.md) (desglose por milestones).

**Branch**: `worktree-community-attendance-faces` (worktree
`.claude/worktrees/community-attendance-faces`, base `origin/master` = `80be2d96`) ·
**Fecha**: 2026-10-22

## Contexto: lo que ya trae la rama (M0)

La rama arranca con la entrega del 2026-10-22, que se movió del árbol principal a este worktree
antes de commitearla:

- Foto del miembro (`MemberAvatar`) en cada tarjeta de `CommunityAttendanceView`.
- Retiro de origen del miembro: columna `community_member.sourceRetreatId` (migración
  `20261022100000_AddCommunityMemberSourceRetreat`, con relleno aproximado desde
  `participants.retreatId`), etiqueta «Retiro: Buen Despacho · oct 2026».
- Filtros (asistencia, retiro, frecuencia), orden (nombre, asistencia, retiro, ingreso) y la barra
  de búsqueda y filtros fija arriba al hacer scroll.

Esta spec cubre lo que sigue sobre esa base.

## Problema

1. **Cada toque vuelve a bajar todas las fotos.** Al marcar a alguien, la vista recarga la lista
   completa de miembros. El API firma la URL de cada foto en cada lectura (`presignPrivateUrl`, sin
   caché), así que la URL cambia en cada recarga y el celular vuelve a descargar todas las fotos. Con
   mala señal, marcar 30 personas descarga 30 veces las mismas fotos. Además las firmas caducan en
   una hora: con la pantalla abierta más tiempo, las fotos pasan a iniciales.
2. **Casi nadie tiene foto.** En Buen despacho, 25 de 112 miembros. La reunión es justo cuando la
   gente está enfrente, pero desde la vista de asistencia no se puede tomar la foto.
3. **Sin señal, marcar falla.** El toque es una llamada directa al API; con la señal intermitente de
   un salón parroquial falla, avisa con un toast y se revierte. La cola sin conexión que la app ya
   tiene (`apps/web/src/offline/`) dejó las comunidades fuera de alcance.
4. **Marcar a 40 personas una por una es lento**, y a la gente nueva no se le reconoce. Se toma una
   foto de grupo en casi todas las reuniones (es la foto de la reunión), pero no se aprovecha para la
   asistencia.
5. **La página de miembros tiene demasiados botones** (cinco en el encabezado, tres más el ⋮ en cada
   fila).

## Decisiones de dominio

| # | Decisión | Resolución |
|---|----------|------------|
| D1 | **Dónde entra la foto de grupo** | **Leonardo, 2026-10-22: cada vez que se sube la foto de la reunión, se corre el reconocimiento.** Subir o reemplazar la portada (desde la lista de reuniones, el modal de la reunión o un botón «Subir foto de la reunión» en la vista de asistencia) dispara el análisis y abre la revisión. Reemplazarla vuelve a correrlo y solo **suma** presentes. El navegador manda para el análisis una versión de **3200 px** de lado mayor que **no se guarda**; la portada sigue guardándose a 1600 px como hoy. |
| D2 | **Motor de reconocimiento** | **Leonardo, 2026-10-22: Gemini** (`gemini-3.5-flash`, configurable). Una sola llamada por foto: la foto de grupo y una **galería numerada** con las fotos de perfil de los miembros; devuelve cada cara con su caja y el número de galería sugerido. Evaluado contra Z.ai y otros Gemini con personas no famosas ([research.md](research.md#segunda-medición-personas-no-famosas-2026-10-22)): 9/10 miembros bien en ese modo; Z.ai identifica 1–4/10 y queda descartado. Limitación medida: asigna un miembro a quien no lo es, con confianza alta. Nivel gratuito aceptado por Leonardo. |
| D3 | **Activación y consentimiento** | **Leonardo, 2026-10-22: el consentimiento se dio al inscribirse en el retiro.** El aviso de privacidad ya lista «Fotografía de rostro, cuando un coordinador de tu comunidad la registra para reconocerte en las reuniones» (`privacy.information.items.photo`). Se mantiene: la función se enciende por comunidad (owner) y cualquier miembro puede quedar **excluido del reconocimiento** si lo pide. Recomendado y pendiente de redactar con la organización: que el aviso diga que el reconocimiento es **automático** y lo hace un proveedor de IA. Dato verificado en la copia de dev: en Buen despacho solo **13 de 112** miembros tienen `acceptedPrivacyNoticeAt`; el resto entró antes de que existiera el campo, por Excel o a mano. |
| D4 | **Qué se marca solo** | Nada se guarda sin «Confirmar». Toda coincidencia que devuelve Gemini aparece como **sugerencia preseleccionada**, con el recorte de la cara junto a la foto de perfil del miembro, para quitar las equivocadas. **No se usa porcentaje como umbral**: la confianza que declara el modelo no está calibrada (dice 90–98 % también cuando se equivoca). |
| D5 | **Identificar por voz las caras que faltan** | Una cara a la vez, en grande. Botón de micrófono: se dice el nombre y aparecen las **3 mejores coincidencias** entre los miembros que aún no salieron en esta foto; un toque confirma. También «No es de la comunidad» y «Saltar». Donde el navegador no tiene reconocimiento de voz (iPhone, según `useSpeechRecognition`), un campo de texto con autocompletado: el micrófono del teclado del iPhone dicta igual. **No se manda audio a ningún servidor.** |
| D6 | **Qué se aprende de una cara identificada** | (a) Se marca la asistencia. (b) Si la persona **no tiene foto de perfil**, el recorte de la foto de grupo se vuelve su foto: entra a la galería y la próxima vez Gemini la puede reconocer. Si ya tiene foto, no se toca. No se guardan vectores ni índices de caras. |
| D7 | **Qué se guarda y qué sale** | El original en alta resolución no se guarda. Se guardan la portada a 1600 px y los recortes que se volvieron foto de perfil (D6b). A Gemini se le manda, en cada análisis, la foto de grupo y la galería; no queda nada guardado de nuestro lado fuera de la app. |
| D8 | **Exclusión y borrado** | Un miembro excluido no entra a la galería, su recorte nunca se vuelve su foto, y se le puede marcar presente a mano o por voz. Como no hay índice de caras, el derecho de eliminación y quitar al miembro ya cubren todo con el borrado de foto que existe. |
| D9 | **Asistencia sin señal** | El toque sin señal se guarda en el celular y se manda solo al volver la señal, con la cola que ya existe. La tarjeta muestra «pendiente» mientras tanto. Requiere haber abierto la pantalla con señal: en v1 la lista de miembros no se guarda para abrirla sin conexión. La asistencia con foto necesita señal. |
| D10 | **Orden y filtros recordados** | Por comunidad y por dispositivo. Al volver a la pantalla aparecen como se dejaron. La búsqueda no se recuerda. |
| D11 | **Quién entra a la galería** | Miembros con foto de perfil y no excluidos. Si pasan de **48**, entran los de asistencia más reciente (la evaluación se hizo con 36; con más se mide en M4 antes de subir el tope). |
| D12 | **Si Gemini falla** | Saturación (`503`), cuota (`429`) o tiempo agotado: la revisión abre sin sugerencias, con un aviso, y la asistencia se marca a mano o por voz. Ningún fallo del motor bloquea subir la portada. |
| D13 | **Álbum público: quién lo ve** (pedido y aprobado por Leonardo 2026-10-22, con D14 y D15) | Enlace **no listado** con token aleatorio (`/album/<token>`), `noindex`, para compartir por WhatsApp. Se publica por reunión (owner o admin) y se puede despublicar: el token deja de servir. Publica caras **con nombres** de personas: por eso no es automático. |
| D14 | **Álbum: qué nombre se muestra** (aprobado) | Nombre de pila y primer apellido del nombre efectivo (`resolveMemberProfile`). Nunca correo, teléfono ni datos de la ficha. |
| D15 | **Álbum: quién sale etiquetado** (aprobado) | Solo los rostros **confirmados** en la revisión de la foto (D4/D5) y de miembros no excluidos (D8). Las caras sin identificar quedan sin etiqueta. Reemplazar la portada borra las etiquetas hasta la nueva revisión. |
| D16 | **Álbum: diseño** | Como la referencia (`discipuloservidor.org/EMAUS`, segundo álbum): antetítulo «Comunidad · fecha», título «Conozcamos nuestros nombres», contador de integrantes, «Mostrar puntos», zoom, buscador por nombre; pasar el cursor o tocar un rostro muestra el nombre; lista desplegable que localiza a cada integrante. Pensado primero para celular. |

## Objetivo

Que tomar asistencia en una reunión tome segundos y no minutos: la foto de grupo sugiere a quienes
ya se conocen, la voz resuelve a los demás, y cada reunión deja más fotos de perfil para la
siguiente. Que marcar a mano siga funcionando con mala señal y sin gastar datos de más.

## Historias de usuario

- **H1 (servidor que toma asistencia)**: marco a 30 personas seguidas con mala señal; cada toque
  responde al instante, no se descargan fotos de nuevo, y lo que no llegó al servidor queda
  «pendiente» y se manda solo.
- **H2**: veo que Juan no tiene foto; toco su avatar, le tomo la foto con el celular y ya aparece.
- **H3**: al terminar la reunión subo la foto de la reunión; la app me muestra 22 sugerencias, cada
  cara junto a la foto de perfil del miembro, quito una que no era, y confirmo. Quedan 21 presentes.
- **H4**: quedan 6 caras sin identificar. Por cada una toco el micrófono y digo «Alfredo Kupfer»;
  la app me propone a Alfredo Kupfer Sierra, lo confirmo, y queda presente. Como no tenía foto, su
  cara de la foto de grupo es ahora su foto.
- **H5 (owner)**: enciendo el reconocimiento en la configuración de la comunidad. Un miembro pide no
  ser reconocido: lo excluyo y deja de entrar a la galería.
- **H6**: Gemini está saturado al subir la foto; la portada se guarda igual y la revisión me deja
  marcar a mano y por voz.

## Requerimientos

### Mejoras de la vista de asistencia

- **FR-1** Marcar o desmarcar actualiza solo la tarjeta tocada; no recarga la lista completa en
  cada toque. Los porcentajes de asistencia se refrescan en segundo plano, como mucho una vez cada
  pocos segundos, y la tarjeta no cambia de lugar mientras se toca.
- **FR-2** Al refrescar la lista, un miembro cuya foto no cambió conserva la URL que ya tenía, así
  el navegador no la vuelve a descargar.
- **FR-3** Si una foto falla al cargar (firma caducada), la vista pide la lista una sola vez para
  obtener firmas nuevas, y no entra en bucle si la foto sigue fallando.
- **FR-4** Tocar el avatar abre el diálogo de foto del miembro (tomar con la cámara o elegir). El
  resto de la tarjeta sigue marcando asistencia.
- **FR-5** Filtro **«Sin foto»** para ir completando fotos.
- **FR-6** En móvil, los filtros se pliegan detrás de un botón «Filtros» con el número de filtros
  activos; la búsqueda queda siempre visible en la barra fija.
- **FR-7** Orden y filtros se recuerdan por comunidad en el dispositivo (D10).

### Página de miembros: menos botones (pedido el 2026-10-22)

- **FR-25** Encabezado: queda visible solo **«Crear miembro»**; Importar miembros, Exportar,
  Duplicados y Plantillas de mensajes pasan a un menú **⋮**. El número de duplicados pendientes
  (solo owner) se ve sobre el botón ⋮ para que el aviso no se pierda.
- **FR-26** Fila de cada miembro: queda visible **«Mensajes»** y el ⋮. «Registrar asistencia» y
  «Marcar como contactado / Quitar marca» pasan al menú. La marca de contactado sigue a la vista
  como un check verde junto al nombre (escritorio y móvil).
- **FR-27** Los ítems del menú que abren un diálogo usan `deferOpen` (regla de reka-ui de
  `.claude/rules/frontend.md`); los que navegan o descargan no.

### Asistencia sin señal

- **FR-8** El toque de asistencia sin señal se encola con su clave de idempotencia y se envía solo
  al volver la señal (D9). La tarjeta queda marcada con un indicador «pendiente».
- **FR-9** El servidor acepta el reenvío de la misma operación sin duplicarla (middleware de
  idempotencia en la ruta), y respeta el orden: marcar y desmarcar sin señal termina desmarcado.
- **FR-10** Si el servidor rechaza la operación (miembro ya no existe), queda como conflicto en la
  lista de cambios pendientes que ya existe, con su mensaje.

### Reconocimiento con Gemini

- **FR-11** Ajuste de comunidad «Reconocimiento facial en la asistencia», solo owner o superadmin,
  apagado por defecto.
- **FR-12** Bandera por miembro «Excluir del reconocimiento facial» (owner o admin). Un miembro
  excluido no entra a la galería y su recorte nunca se vuelve su foto (D8).
- **FR-13** La galería se arma en el servidor con las fotos de perfil según D11, numerada; el número
  solo existe dentro de esa llamada y se traduce a `memberId` en el servidor.
- **FR-14** Endpoint de análisis: recibe la foto de grupo (≤ 3.4 MB tras la compresión del
  navegador), hace **una** llamada a Gemini con salida estructurada (caras con caja y número
  sugerido) y devuelve, por cara: recorte (JPEG ≤ 512 px), caja y miembro sugerido o ninguno. No
  guarda la imagen.
- **FR-15** Pantalla de revisión: sugerencias preseleccionadas (recorte junto a la foto de perfil,
  D4), quitar una sugerencia, y «Confirmar N presentes».
- **FR-16** Un miembro no puede quedar sugerido para dos caras de la misma foto; si pasa, las dos van
  a «sin identificar».
- **FR-17** Reemplazar la portada vuelve a correr el análisis; lo ya confirmado no se desmarca.
- **FR-18** El análisis corre al subir la portada desde cualquier lugar donde se suba, si la función
  está encendida (D1); si está apagada, la portada se sube como hoy.
- **FR-22** Si Gemini falla (D12), la revisión abre sin sugerencias y con aviso; la portada ya quedó
  guardada.
- **FR-24** Modelo configurable por variable de entorno (default `gemini-3.5-flash`); los tests
  mockean la llamada.

### Identificar por voz

- **FR-19** Por cada cara sin identificar: micrófono → transcripción en el navegador → 3 mejores
  candidatos (búsqueda difusa sin acentos sobre el nombre efectivo `resolveMemberProfile`, que tolera
  decir solo nombre y primer apellido). Sin reconocimiento de voz: campo de texto con autocompletado
  (D5).
- **FR-20** Confirmar un candidato marca la asistencia y, si no tenía foto, guarda el recorte como
  foto de perfil (D6b). «No es de la comunidad» y «Saltar» no guardan nada.
- **FR-21** Un miembro excluido sí puede marcarse presente por voz, pero su recorte no se vuelve su
  foto.

### Álbum público de la reunión (pedido 2026-10-22)

- **FR-28** Al confirmar la revisión se guardan las **etiquetas** de la foto: por cada miembro
  confirmado, su caja normalizada (0–1000) en la portada. Un miembro, una etiqueta por reunión.
- **FR-29** Reemplazar o borrar la portada borra sus etiquetas.
- **FR-30** «Publicar álbum» / «Despublicar» por reunión (owner o admin); publicar genera un token
  aleatorio; despublicar lo borra.
- **FR-31** `GET /api/communities/public/album/:token` (sin sesión): comunidad, título y fecha de la
  reunión, URL firmada de la portada y etiquetas `{name, box}` según D14/D15. Token inexistente o
  despublicado → 404, sin distinguir los dos casos.
- **FR-32** Vista pública `/album/:token` según D16, con `noindex`, accesible por teclado (cada
  rostro es un botón con su nombre) y usable en celular (tocar, acercar, buscar).
- **FR-33** El texto público cumple las reglas de la landing (sin palancas, cartas ni dinámicas
  internas; guard `landingPublicContent.test.ts` como referencia).

### Seguridad

- **FR-23** Todos los endpoints nuevos validan que el miembro y la reunión pertenecen a la comunidad
  de la ruta (`requireCommunityAccess` + chequeo en el servicio), y rechazan si la función está
  apagada.

## Criterios de aceptación (end-to-end)

- **CA-1** Marcar 10 miembros seguidos no dispara ninguna descarga de foto (pestaña Network del
  navegador) y ninguna tarjeta cambia de lugar.
- **CA-2** Con la pestaña abierta y la firma caducada (simulada), las fotos vuelven tras una sola
  recarga de la lista.
- **CA-3** En modo avión, marcar a 3 personas las deja «pendiente»; al volver la señal quedan
  guardadas en el servidor, una sola vez cada una.
- **CA-4** Con la función apagada, subir la portada no abre la revisión y el endpoint de análisis
  responde 403.
- **CA-5** Con una foto de grupo de prueba (Gemini mockeado en tests; real en la prueba de campo),
  las sugerencias salen preseleccionadas y confirmar las marca presentes.
- **CA-6** Identificar una cara por voz (o por texto en iPhone) marca a la persona y, si no tenía
  foto, le pone el recorte.
- **CA-7** Un miembro excluido no aparece en la galería que se manda a Gemini.
- **CA-8** Con Gemini fallando (`503` simulado), la portada se guarda y la revisión abre sin
  sugerencias.
- **CA-9** Prueba de campo con una foto real de una reunión de Buen despacho: se anotan aciertos,
  sugerencias equivocadas y caras sin sugerencia.

## Fuera de alcance (v1)

- Abrir la vista de asistencia sin señal (cache de lecturas de comunidades).
- Reconocimiento en retiros (recepción, mesas) o en la foto de recuerdo de mesa.
- Video o reconocimiento en vivo con la cámara.
- Crear un miembro nuevo desde una cara sin identificar o por voz.
- Mandar audio a un servicio de transcripción (alternativa a D5 si la voz del navegador no basta).
- Autoregistro público con foto (`PublicAttendanceView`).
- AWS Rekognition (evaluado como alternativa; queda como plan B si la prueba de campo de Gemini sale
  mal).
- Cerrar el hueco de `importFromRetreat` (personas que no están en el retiro): lo resuelve la rama
  `worktree-community-import-hardening` (specs/community-import-hardening/).

## Reconcile

2026-10-22, sobre `worktree-community-attendance-faces`. «Navegador» = dev del worktree (3003/5175,
base copia desechable, fotos en la base porque `AVATAR_STORAGE` es `base64` en dev).

| CA | Estado | Cómo se verificó |
|---|---|---|
| CA-1 | ✅ | Navegador: un toque hace solo `POST attendance/single`; a los 4 s, un `GET members`; ninguna descarga de foto. Test de la vista |
| CA-2 | ✅ (tests) | `MemberAvatar` emite `error` y la vista pide firmas nuevas como mucho una vez por minuto (test). No se simuló una firma caducada en el navegador |
| CA-3 | ✅ | E2E `offline-community-attendance.spec.ts` (chromium) |
| CA-4 | ✅ | Tests API (403 con la función apagada); la revisión no se abre si está apagada (tests web) |
| CA-5 | ✅ | Navegador con Gemini real (`gemini-flash-lite-latest`): 9/10, 10/10 y 10/10 sugerencias correctas en tres corridas, preseleccionadas; confirmar marcó los presentes |
| CA-6 | ✅ (parcial) | Asignar por texto y por voz con `SpeechRecognition` simulado en el navegador; tests. Falta voz real en celulares |
| CA-7 | ✅ | Test API: un excluido no entra a la galería ni a las etiquetas ni al álbum |
| CA-8 | ✅ | Test API: `503` → degradado con la portada guardada; diálogo en modo degradado (tests web) |
| CA-9 | ⏳ | Prueba de campo con una foto real de una reunión de Buen despacho, después del deploy |

Pendiente además: la medición con galerías de 48 y 96 (D11), que espera cuota de Gemini.
