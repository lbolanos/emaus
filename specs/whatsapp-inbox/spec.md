# Inbox WhatsApp de solo lectura durante el retiro

> SDD spec — versión 1.0 (2026-11-05), decisiones confirmadas por Leo el 2026-11-05
> (D3 consolidada, D7 con voluntariedad, D9 multimedia pospuesta, D12 tope 2 en prod);
> **v1.1 (2026-11-06)**: D13 activación por retiro solo-superadmin, D14 terminar
> servidores del puente, y comprobantes→pagos diseñado (depende del merge de
> `payment-receipt-photo`). Implementada hasta M7 + video.
> **v1.2 (2026-11-07, feedback QA de Leo)**: D16 thumbnails de imágenes SIEMPRE
> visibles en el hilo (lote con un solo ciclo stop/restart del sync + caché
> server-side 30 min / 12 imgs; tope 10 MB por foto ya no choca con el límite
> de 2 MB de los assets subidos) y D17 los mensajes ENTRANTES de WhatsApp
> aparecen en el historial de mensajes del caminante (mismo permiso
> `whatsappInbox:read`, merge cronológico con lo enviado).
> **v1.3 (2026-11-08, revisión + pedido de Leo)**: D18 se guardan también las
> respuestas del equipo (para «respondió X»), D19 documentos y notas de voz bajo
> demanda (PDF → imagen en el navegador), D20 «agregar como carta» (texto de
> impresión), D21 guarda contra pagos duplicados. Robustez: borrado explícito
> sin depender del CASCADE, watchdog de sesiones en `error`, ingesta paginada.
> **v1.4 (2026-11-08, pedido de Leo)**: D22 se capturan también los chats de los
> **contactos de emergencia** de los caminantes (son quienes mandan cartas y a
> veces pagos), solo visibles con `participant:health`; D23 la lista se agrupa
> **por caminante**; D24 pestañas Mensajes / Configuración, división arrastrable
> y «Ampliar conversación»; D25 agregar el WhatsApp de un contacto desde el hilo,
> con backfill del historial del chat nuevo. Corrige además que el poller nunca
> emitía `inbox:changed` (ver FR26).
> **v1.5 (2026-11-08, pregunta de Leo: «¿qué pasa si envían pdf, pptx, docx u
> otros?»)**: D26 visor de archivos dentro de la app y descarga para lo que el
> navegador no muestra, con el mismo criterio de tipos que las cartas
> (letters-email); cierra un hueco de seguridad de v1.3.
> Artefactos hermanos: [research.md](research.md) (estado actual y verificaciones),
> [plan.md](plan.md) (diseño técnico), [tasks.md](tasks.md) (milestones).

## Problema

Durante un retiro, los caminantes resuelven sus dudas por WhatsApp escribiendo al teléfono
personal de algún logístico o palanquero (llegada, qué llevar, dirección de la casa). Esos
mensajes quedan atrapados en el teléfono de cada quien:

1. El resto del staff no los ve: si el caminante escribió al número equivocado, la pregunta
   se pierde o se responde dos veces.
2. No hay respaldo: el historial vive solo en el teléfono de un voluntario.
3. Cuando el retiro termina, no queda nada consolidado en el sistema.

La app ya resuelve el **envío** de forma asistida (deep links desde el teléfono de cada
coordinador — ver `specs/sequences-inbox-filters/spec.md`, y su HU3 ya abrió el camino de
*leer* el chat por fuera). Lo que falta es el lado de **lectura compartida**: que los
mensajes que llegan *de caminantes* a los teléfonos del staff sean visibles para todo el
equipo autorizado, solo durante la ventana del retiro.

## Decisiones de dominio

| # | Decisión | Por qué |
| --- | --- | --- |
| D1 | **Solo lectura estructural**: no existe en el código ninguna invocación de envío; las lecturas al motor corren con su modo read-only. La bandeja jamás muta la cola de salida existente | Coherente con la regla D1 de `sequences-inbox-filters` (leer no marca ni despacha). Un puente que escribe además multiplica el riesgo de baneo |
| D2 | Cada staff vincula **su propia cuenta** escaneando un QR en la app (como un WhatsApp Web más); el vínculo es por usuario y por retiro (`UNIQUE(userId, retreatId)`) | Los caminantes ya tienen los números del staff; no se estrena número nuevo. El vínculo propio evita que un staff gestione la cuenta de otro |
| D3 | La bandeja es **consolidada por retiro**: los mensajes de caminantes que llegan a *cualquier* teléfono vinculado se ven por todo el que tenga el permiso de lectura | Decisión del usuario (2026-11-05): la coordinación importa más que la privacidad entre staff. El mensaje "varado" en el teléfono equivocado deja de ser un problema |
| D4 | El filtro "solo caminantes" se aplica **en la ingesta** (server-side, whitelist de números), no en la UI | Lo que no pasa el filtro jamás se persiste: la base de datos del sistema solo contiene mensajes de caminantes del retiro activo |
| D5 | **Ventana temporal**: vincular solo desde `startDate − 7 días` hasta `endDate` (zona del retiro); sesiones y mensajes se purgan tras `endDate + 15 días` | El puente solo vive durante el retiro (uso estacional, no 24/7): menos exposición de datos y menos superficie de baneo. No hay campo `status` en `Retreat`: la ventana se deriva de fechas, igual que `findActiveRetreats` |
| D6 | Motor = binario **`wacli`** (el mismo engine ya auditado para el MCP local de Leo) corriendo **nativo en el servidor**, un hijo persistente por cuenta vinculada, supervisado por el API de Node. Sin Docker | El servidor de prod no tiene Docker y tiene 914 MB de RAM (~323 MB libres). Un hijo wacli ≈ 40 MB; un daemon Docker + un servidor Python por cuenta no caben. El binario Go single-file es la forma más liviana |
| D7 | **Consentimiento explícito** exigido server-side antes de mostrar el QR: aviso de que los chats de la cuenta transitan el servidor durante la ventana (aunque solo se persistan los filtrados), que el historial de emparejamiento queda en disco temporalmente con tope, del riesgo de baneo de Meta para el número personal, y de que **vincular es voluntario**: nadie del equipo está obligado; quien no quiera, participa de la bandeja como lector | El staff está exponiendo datos de su vida privada; el consentimiento documentado es condición ética y legal (datos personales, LFPDPPP), no un checkbox de adorno. Confirmado por Leo el 2026-11-05 |
| D8 | Ingesta v1 por **polling** (lecturas one-shot cada ~45 s); el webhook HMAC de wacli queda como upgrade futuro | Superficie mínima para una primera temporada: ningún endpoint nuevo expuesto, ninguna firma que mantener. La latencia de ≤45 s es irrelevante para dudas de logística |
| D9 | **Multimedia no se descarga ni se persiste**: los mensajes con media se muestran como "📎 Multimedia" | Reduce storage, exposición de datos y RAM; una duda de logística es texto en el 99% de los casos |
| D10 | Responder = **deep link desde el teléfono propio del staff** (`buildWhatsAppChatLink`), nunca desde el puente | El envío por el puente contradiría D1 y dispara el baneo. Cada quien responde desde su número, como lo hacen hoy |
| D11 | Badges de no-leído **por usuario** en la app (`read_state` por usuario/chat); el puente no marca "visto" en WhatsApp (presence quiet) | La lectura de otro staff no debe ensuciar la bandeja ajena ni mentirle al caminante con un visto que nadie leyó |
| D12 | Tope duro de sesiones simultáneas por env (`WA_BRIDGE_MAX_SESSIONS`, default 3 en código, **2 en prod al inicio**) | Presupuesto de RAM del servidor medido 2026-11-05: 914 MB con ~323 libres; 2 sesiones ≈ 80 MB. Subir el tope solo tras medir 48 h |
| D13 | **Activación POR RETIRO, solo superadmin** (v1.1): nueva bandera `retreat.whatsappInboxEnabled`; sin ella nadie vincula, no se respawnea ningún hijo y el poller ignora el retiro | Decisión de Leo (2026-11-06): el puente consume RAM por cuenta vinculada — decidir qué retiro paga ese costo es del superadmin, no un permiso de plantilla |
| D14 | **El superadmin termina los servidores del puente** (v1.1): desvinculación forzada de cualquier vínculo (ya existía) + "terminar todo" del retiro (stop + logout + wipe + purga + desactivación) | Decisión de Leo (2026-11-06): los stores son llaves de sesión de cuentas personales; un retiro apagado no puede dejar sesiones vivas |
| D15 | **Comprobantes de pago desde WhatsApp** (v1.1, DISEÑADO — bloqueado): los mensajes con imagen ofrecen "Registrar como pago"; la media se descarga bajo demanda (`wacli media download`, tope) y se entrega como data-URL al modal de pago existente. **DEPENDENCIA**: `specs/payment-receipt-photo` (otra sesión, sin merge) — `Payment.receiptUrl` + `receiptPhoto` no existen aún en esta base | Decisión de Leo (2026-11-06). No descargar media masivamente (D9 sigue); solo bajo demanda, porque el servidor tiene 1 GB |
| D16 | **Thumbnails de imágenes en el hilo, siempre visibles** (v1.2): al abrir un chat, el frontend pide en UN lote las imágenes pendientes (`POST /wa-bridge/retreat/:id/media`, máx 30 ids); el server descarga con `wacli media download --read-only` — **sin tomar el lock del store** (descubierto en QA: wacli lo documenta en su propio error) — así la descarga corre junto al sync vivo, SIN el ciclo stop/restart que dejaba la bandeja muerta. Caché thumb (webp 320) + large (webp 1600) por 30 min (máx 12 en RAM). Una imagen rota (403 del CDN) se salta sin tumbar el lote; imágenes de vínculos purgados quedan como placeholder 📎 definitivo (su media se borró con el store, D9). Tap en la burbuja = visor grande | Feedback Leo (2026-11-07): «en la lista de mensajes debería poder ver un thumbnail de la imagen» + «se demora mucho» — causas: stop/restart del sync POR imagen, tope de 2 MB de `processPhoto`, y lote no resiliente |
| D17 | **Mensajes entrantes en el historial del caminante** (v1.2): `GET /participant-communications/participant/:id` mezcla cronológicamente los mensajes recibidos por WhatsApp (por JID del teléfono del caminante, `direction: 'inbound'`, id prefijado `wa-inbox:`) SOLO para usuarios con `whatsappInbox:read` — el mismo permiso que la bandeja. Las entradas no abren el dialog de mensajes enviados | Feedback Leo (2026-11-07): «los mensajes no se ven en el historial de mensajes del caminante» — el historial solo registraba lo que enviamos |
| D18 | **Respuestas del equipo guardadas** (v1.3): el poller persiste también los mensajes `fromMe` de los chats que pasan la whitelist (nunca de otros chats). La lista muestra «Sin responder» / «Respondió X» y el hilo las alinea a la derecha con su autor (dueño del vínculo). No cuentan como no leídos. El consentimiento lo dice explícitamente | Revisión 2026-11-08: con la bandeja consolidada, varios logísticos contestaban al mismo caminante sin saberlo |
| D19 | **Documentos y notas de voz bajo demanda** (v1.3): `POST /wa-bridge/messages/:id/raw-media` (tope 10 MB documento, 8 MB audio, sin caché). El navegador reproduce el audio, abre el documento en pestaña nueva y, si es PDF, renderiza la primera página a JPEG con pdf.js (build legacy, carga diferida) para pagos y cartas. El servidor nunca parsea PDF | Pedido de Leo (2026-11-08): «o si se recibe un documento»; pagos y cartas solo aceptan imágenes (confirmado con la sesión letters-email) |
| D20 | **Agregar como carta** (v1.3): `POST /wa-bridge/messages/:id/letter` crea una `Letter` (specs/letters-email) del participante elegido, `approved` (la eligió el staff), con el texto editable y la imagen como adjunto imprimible; dedupe por `messageId = whatsapp:<id>`. Función hermana de `ingestLetter` en `services/waBridge/waLetterService.ts` (no toca letterService). Requiere `whatsappInbox:read` + `letter:update` | Pedido de Leo: «que un mensaje se pueda agregar como texto de impresión»; el concepto existente es la carta del buzón |
| D21 | **Guarda contra pagos duplicados** (v1.3): al guardar el pago, `PaymentManagement` emite `payment-saved` y la bandeja lo enlaza (`POST /wa-bridge/messages/:id/payment`, mismo retiro). La burbuja muestra «Pago registrado por X» y registrar otra vez pide confirmación. `PaymentManagement` gana `embedded` (sin cargar todos los pagos) y `prefill`: API compartida con letters-email | Revisión 2026-11-08: dos logísticos podían registrar el mismo comprobante |
| D22 | **Contactos de emergencia** (v1.4): la whitelist (D4) suma los teléfonos `emergencyContact{1,2}{Cell,Home,Work}Phone` de cada caminante no cancelado, normalizados con el país **del caminante** (el contacto no tiene país propio; mismo criterio que la audiencia «familia» de secuencias). Un solo índice (`getSenderIndex`) resuelve número → caminantes y/o «contacto de emergencia de X»; si el número es de un caminante, gana caminante (pareja que se puso de contacto); un contacto de varios caminantes (hermanos) lista a todos. La identidad se resuelve al leer: sin columna nueva. Esos chats **solo existen** para quien tiene `participant:health` (nombre, parentesco y teléfono del contacto son `SENSITIVE_HEALTH_FIELDS`): sin ese permiso, lista, badge y búsqueda los omiten y todo endpoint del mensaje responde 403. Un chat que ya no resuelve a nadie (caminante cancelado, teléfono editado) se oculta para todos (404) | Pedido de Leo (2026-11-08): «los contactos de emergencia son los que envían las cartas y a veces los pagos» |
| D23 | **Agrupado por caminante** (v1.4): en el cliente, cada caminante es una entrada con su chat y los de sus contactos; una pareja con teléfono compartido es una sola entrada («Ana y Beto») y los contactos de ambos se suman; un contacto de dos hermanos aparece bajo los dos (mismo chat). Grupos abiertos si tienen no leídos o el chat activo; un grupo de un solo chat lo abre directo. El grupo desde el que se abrió decide el caminante del pago, la carta y el perfil (`activeWalkerId`) | Elección de Leo entre «agrupado por caminante» y una lista plana con etiqueta |
| D24 | **Pestañas y división ajustable** (v1.4): Mensajes / Configuración (tablero, «Vincular mi WhatsApp», controles del superadmin), con la pestaña en la URL (`?tab=config`). En escritorio, la división lista \| hilo se arrastra (260–560 px, flechas ±20, Home/End, doble clic restablece, `role="separator"`), el botón «Ampliar conversación» oculta la lista, ambos se recuerdan en `localStorage`, y los paneles llenan el alto disponible con scroll interno. Sin dependencia nueva: reka-ui trae Splitter, pero `apps/web` no depende de reka-ui directo y envolverlo en `@repo/ui` obliga a reconstruir su dist en cada worktree | Pedido de Leo: «un tab de configuración y otro de la bandeja; una forma de ampliar la conversación o de mover la división» |
| D26 | **Archivos: verlos en grande o abrirlos con su aplicación** (v1.5). El servidor descarga el archivo bajo demanda y decide su tipo **por los bytes**, con el clasificador de las cartas (`classifyAttachment` de `letterService`, exportado): imágenes y PDF por firma; Word/PowerPoint/Excel (OOXML y binarios), OpenDocument y texto por contenedor + extensión; **rechaza** macros (.docm/.pptm/.xlsm, `vbaProject.bin`, VBA/Basic), ejecutables, comprimidos, HTML y SVG (415, con el porqué). El MIME que declara quien manda se ignora. Cada respuesta trae `previewKind`: imagen, PDF (páginas con pdf.js, hasta 20), texto y video (mp4/mov, tope 16 MB) se ven **dentro de la app**; lo demás (Word, PowerPoint, Excel, HEIC…) se ofrece como **descarga con su nombre real**, y el equipo lo abre con su aplicación (en el celular, con la vista previa). «Agregar como carta» acepta cualquier documento y puede **guardar el original** junto a la carta (no se imprime; queda en la carpeta, como en el buzón) | Pregunta de Leo (2026-11-08). Hueco de v1.3: «Abrir documento» navegaba a un blob con el tipo declarado — un `.html` mandado por WhatsApp corría con el origen de la app |
| D25 | **Agregar el WhatsApp de un contacto desde el hilo** (v1.4): la cabecera del hilo trae el editor rápido de teléfonos existente (`ParticipantQuickPhoneEditor`, `PATCH /participants/:id/phones`, `participant:update`, validación por país) para el caminante activo: celular propio y celulares de contacto 1 y 2. Cuando un chat entra por primera vez a la whitelist de un vínculo (sin mensajes guardados), el poller trae sus **últimos 500 mensajes** (`messages list` sin `--asc`: wacli ordena del más reciente) en vez de solo lo nuevo, así aparece también lo que esa persona ya había escrito. Vale igual para inscripciones tardías. El backfill no dispara aviso | Pedido de Leo durante v1.4: «agregar un número WhatsApp a contacto de caminante fácilmente» |

## Historias de usuario

- **HU1** — *Logístico vincula su número*: "Voy a la bandeja del retiro, acepto el aviso, escaneo
  el QR con mi WhatsApp y listo: mi número queda alimentando la bandeja solo hasta que termine
  el retiro."
- **HU2** — *Palanquero ve la bandeja*: "Abro la bandeja WhatsApp del retiro y veo en un solo
  lugar todos los mensajes que los caminantes les escribieron a mis compañeros y a mí, con
  quién habló cada uno y cuándo; puedo responder desde mi propio WhatsApp."
- **HU3** — *Admin gestiona los vínculos*: "Veo qué números están vinculados, desde cuándo y su
  estado; si alguien se fue del equipo, lo desvinculo. Si se llegó al tope de sesiones, sé
  quién está vinculado y por qué no cabe otro."
- **HU4** — *El sistema se limpia solo*: "Dos semanas después del retiro ya no queda rastro:
  sesiones desvinculadas, stores borrados, mensajes purgados — sin que nadie se acuerde de
  hacerlo."

## Requerimientos funcionales

- **FR1**: Vinculación con flujo consentimiento → QR → conectado, dentro de un modal. El
  consentimiento se exige server-side (sin flag, 400).
- **FR2**: Tablero de vínculos del retiro: dueño, estado (`pending|qr|connected|error|
  logged_out|expired`), última sincronización. El teléfono vinculado solo se muestra a su
  dueño (y superadmin).
- **FR3**: Bandeja consolidada: lista de chats de caminantes + hilo por chat, ordenados por
  hora del retiro, con badge de no leídos por usuario y actualización en vivo por socket.io.
- **FR4**: Ingesta filtrada: solo chats 1:1 cuyo número coincide con un caminante del retiro
  (participantes `type='walker'` no cancelados ni borrados); grupos y desconocidos jamás se
  persisten. El índice de números se recalcula en cada ciclo (captura inscripciones tardías).
- **FR5**: Ventana y tope: fuera de ventana o con tope alcanzado, la UI muestra el motivo
  claro (fuera de ventana / tope alcanzado / feature apagada / ya vinculado).
- **FR6**: Desvinculación por el dueño (o superadmin): logout de la sesión en WhatsApp,
  borrado del store en disco y del historial persistido.
- **FR7**: Retención automática diaria: para cada retiro con `endDate + 15 días` cumplidos,
  logout + borrado de stores + purga de mensajes y vínculos, con auditoría. Corre aunque el
  bridge esté apagado por kill switch.
- **FR8**: Botón "Responder desde mi WhatsApp" por chat (deep link, patrón existente).
- **FR9**: Kill switch `WA_BRIDGE_ENABLED=false`: no vincula, no levanta hijos, la UI no
  ofrece vincular.
- **FR10**: Auditoría de dominio de cada transición: inicio de vinculación, vinculado,
  desvinculado, purga, errores de sync (rate-limited), intentos fuera de ventana.
- **FR11**: Permisos: `whatsappInbox:read` (ver bandeja y tablero) y `whatsappInbox:manage`
  (vincular/desvincular la propia cuenta), otorgados a superadmin, admin, logistics y
  communications; rutas y sala de socket protegidas por ambos niveles (permiso + acceso al
  retiro).
- **FR12 (v1.1)**: Activación por retiro: `PATCH /wa-bridge/retreat/:id/enabled` — solo
  superadmin; sin activación: vinculación rechazada (`not_enabled`), sin respawn ni
  ingesta. Switch en la bandeja visible solo para superadmin; auditado.
- **FR13 (v1.1)**: Terminar servidores: `POST /wa-bridge/retreat/:id/terminate-all`
  (solo superadmin) — stop + logout + wipe + purga de todos los vínculos del retiro y
  desactivación; auditado por vínculo. El superadmin también puede desvincular cualquier
  vínculo individual desde el tablero.
- **FR14 (v1.1, bloqueado)**: Comprobantes: botón "Registrar como pago" en mensajes con
  imagen → descarga bajo demanda → data-URL al modal de pago existente
  (`receiptPhoto`). Espera el merge de `payment-receipt-photo`.
- **FR15 (v1.2)**: Thumbnails: las imágenes del hilo abierto se traen en un lote
  (`POST /wa-bridge/retreat/:id/media`) y se muestran dentro de la burbuja
  (webp 320, `object-cover`); sin thumbnail cargado queda el placeholder 📎. El
  visor grande y el registro de pago reutilizan la variante large (1600).
- **FR16 (v1.2)**: Historial del caminante: los mensajes entrantes de WhatsApp
  aparecen mezclados cronológicamente en
  `GET /participant-communications/participant/:id` con `direction:'inbound'`;
  solo para usuarios con `whatsappInbox:read` y si el caminante tiene teléfono
  con país resoluble. El historial de comunidad NO los incluye.
- **FR17 (v1.3)**: Respuestas del equipo (D18): `fromMe` en el hilo con autor;
  conversación con `awaitingReply`, `lastReplyAt`, `lastReplyByName`.
- **FR18 (v1.3)**: Documentos y notas de voz (D19) con raw-media; PDF a imagen
  en el navegador para pagos y cartas.
- **FR19 (v1.3)**: Agregar como carta (D20) con destinatario elegible
  (default: el caminante del chat), texto editable e imagen opcional.
- **FR20 (v1.3)**: Anti-duplicados de pago (D21).
- **FR21 (v1.3)**: Teléfono compartido (parejas): la conversación nombra a todos
  los caminantes del número; el pago se prellena con el más reciente y el
  selector permite cambiarlo.
- **FR22 (v1.4)**: Contactos de emergencia (D22). `WaConversationDto` gana
  `senderKind`, `contact {name, relation, slot}` y `forWalkers`; la búsqueda
  devuelve `senderKind`, `contactName`, `contactRelation`, `participantId` y
  encuentra al contacto por su nombre, su parentesco o el nombre del caminante.
  «Agregar como carta» firma como «Mamá — María (contacto de Juan Pérez)».
  «Responder con plantilla» no se ofrece en el chat de un contacto (el diálogo
  apunta al teléfono del caminante); «Responder desde mi WhatsApp» sí.
- **FR23 (v1.4)**: Historial del participante: con `participant:health`, mezcla
  también los mensajes de sus contactos de emergencia, rotulados
  («Recibido de: Mamá — María (contacto de emergencia)»); sin ese permiso no
  aparecen.
- **FR24 (v1.4)**: Aviso en vivo: `inbox:changed` lleva `contactCount` (solo un
  número; la sala la comparten usuarios sin `participant:health`). El aviso con
  nombre y vista previa es solo para mensajes de caminantes; el de contactos
  («N mensajes nuevos de contactos de emergencia») lo muestra el cliente solo a
  quien tiene el permiso.
- **FR25 (v1.4)**: Lista agrupada (D23), pestañas y división (D24), editor de
  teléfonos y backfill (D25).
- **FR27 (v1.5)**: `POST /wa-bridge/messages/:id/raw-media` sirve audio, video
  y documentos con tipo verificado y `previewKind`; 413 sobre el tope, 415 para
  macros o tipos no permitidos. El visor (`WaFileViewer`) nunca navega a un
  blob ni usa iframe, y los blobs solo llevan tipos seguros (`safeBlobType`).
  `POST …/letter` acepta `includeDocument`: el servidor descarga, verifica y
  adjunta el original (`isBrowserSafeImage` solo si es imagen).
- **FR26 (v1.4, corrección)**: el poller contaba los insertados con
  `InsertResult.raw.changes`, que con better-sqlite3 no existe (`raw` es el
  `lastInsertRowid`): siempre daba 0 y `inbox:changed` nunca se emitía después
  de una ingesta. Ahora detecta los mensajes nuevos antes de insertar
  (consulta por `waMessageId`) e inserta en lotes de 50.

## Criterios de aceptación

> Verificación: en la DB desechable del worktree se siembran un retiro activo con fechas
> alrededor de hoy, sus caminantes con teléfonos (incluyendo formatos con lada/prefijo
> `044`), y un `wacli` de prueba apuntando a un store simulado. Los CAs de flujo real (CA7,
> CA8) se verifican en QA manual con una cuenta de staff real (ver tasks M5).

- **CA1**: Un mensaje de un número de caminante sembrado en el store de prueba aparece en la
  bandeja tras un ciclo de polling; un mensaje del mismo chat que llegó antes de vincular el
  filtro (retroactivo, dentro del lookback) aparece una sola vez (dedupe por id).
- **CA2**: Un chat de grupo y un chat con un número que no es caminante, sembrados en el
  mismo store, nunca aparecen en la bandeja ni en la base (verificable con SQL directo).
- **CA3**: Un número sembrado con lada/prefijos (`+52 55…`, `044 55…`) matchea contra el JID
  `521…@s.whatsapp.net` del caminante (normalización de ambos lados).
- **CA4**: Fuera de ventana (retiro con `endDate` en el pasado y otro con `startDate` a más de
  7 días), `POST /link` responde con motivo `outside_window` y no se crea vínculo ni store.
- **CA5**: Con el tope de sesiones alcanzado (sembrando links `connected` hasta el tope), el
  intento responde `cap_reached` con mensaje claro; al desvincular uno, volver a intentar
  funciona.
- **CA6**: Desvincular borra el directorio del store del disco y las filas de mensajes
  asociadas; la auditoría registra `unlinked` con el usuario actor.
- **CA7** *(QA manual)*: Un caminante real escribe al WhatsApp de un staff vinculado → el
  mensaje aparece en la bandeja de todos los usuarios autorizados del retiro en ≤1 ciclo de
  polling; el staff NO aparece "en línea" ni marca visto ante el caminante.
- **CA8** *(QA manual)*: Tras `pm2 restart`, la sesión vinculada se reconecta sola (sin
  re-escanear QR); tras `endDate + 15 días` simulado (`performRetention()` invocado a mano),
  no queda rastro del vínculo ni de los mensajes.

## Fuera de alcance (esta versión)

- **Envío** de mensajes por el puente (jamás; ver D1/D10).
- **Multimedia**: imágenes, audios, stickers, PDFs — solo se indica el tipo (D9).
- **Meta Cloud API / número oficial de la comunidad** (alternativa evaluada y postergada;
  si algún día se contrata, la bandeja de esta spec puede alimentarse de ese webhook sin
  rehacer la UI).
- **Ingesta por webhook HMAC** de wacli (upgrade futuro documentado en plan.md §6).
- **IA** sobre los mensajes (resúmenes, clasificación): los mensajes son datos, nunca
  instrucciones; sin IA mientras no exista un diseño de sanitización.
- **Múltiples retiros activos simultáneos** como caso de uso soportado (el diseño es
  por-retiro y lo toleraría, pero no se prueba ni se promete).
- Notificaciones push / correo por mensaje nuevo (la bandeja se actualiza en vivo dentro de
  la app; nada sale de ella).

## Riesgos y limitaciones

| Riesgo | Consecuencia práctica | Mitigación en esta spec |
| --- | --- | --- |
| (v1.4) Un contacto de emergencia es familiar del propio staff vinculado | Su chat personal con ese familiar entra a la bandeja | El aviso de consentimiento lo dice (bullets 1 y 5) y esos chats solo los ve quien tiene `participant:health`. Futuro, fuera de alcance: «excluir este chat» por el dueño del vínculo |
| (v1.4) El contacto vive en otro país que el caminante | Su número no matchea (se normaliza con el país del caminante) | Limitación documentada; mismo criterio que la audiencia «familia» de secuencias |
| Baneo de Meta al número personal del staff | Un voluntario pierde su WhatsApp personal | Divulgado en el consentimiento (D7); solo lectura, presence quiet, uso estacional |
| Privacidad del staff: sus chats personales transitan y quedan en disco durante la ventana | Datos personales de un voluntario en el servidor | Consentimiento (D7), historial de emparejamiento acotado por flags, stores 0700 fuera del web root, purga automática (FR7) |
| RAM del servidor (914 MB) | Degradación de prod en picos del retiro | Tope duro de sesiones (D12), start con 2, monitoreo 48 h antes de subir |
| Protocolo no oficial no controlado por Meta | Un cambio de WhatsApp puede romper el puente en medio de un retiro | El staff conserva su teléfono como medio primario (la bandeja es una mejora, no un punto único de falla) |

## Decisiones abiertas

- **Subcomandos exactos de `wacli` v0.21.0** para listar chats/mensajes y los nombres de los
  eventos NDJSON del supervisor: verificados contra `--help` del binario local (ver
  research.md §4), pero se re-verificarán contra el binario fijado para prod en el momento de
  implementar (research.md §4.4).
- **Semántica exacta de `--history-days` / `--history-max-per-chat`** en `auth` (qué pide el
  teléfono exactamente): probado en QA manual del M5; ajustar el valor elegido según el
  resultado.
