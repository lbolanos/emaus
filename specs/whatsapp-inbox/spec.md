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
| D16 | **Thumbnails de imágenes en el hilo, siempre visibles** (v1.2): al abrir un chat, el frontend pide en UN lote las imágenes pendientes (`POST /wa-bridge/retreat/:id/media`, máx 30 ids); el server para/levanta el sync del link UNA vez por lote (el lock no se pelea por cada foto) y cachea thumb (webp 320) + large (webp 1600) por 30 min (máx 12 imágenes en RAM). Tap en la burbuja = visor grande | Feedback Leo (2026-11-07): «en la lista de mensajes debería poder ver un thumbnail de la imagen» + «se demora mucho» — la causa era stop/restart del sync POR imagen y el tope de 2 MB de `processPhoto` que reventaba fotos de teléfono |
| D17 | **Mensajes entrantes en el historial del caminante** (v1.2): `GET /participant-communications/participant/:id` mezcla cronológicamente los mensajes recibidos por WhatsApp (por JID del teléfono del caminante, `direction: 'inbound'`, id prefijado `wa-inbox:`) SOLO para usuarios con `whatsappInbox:read` — el mismo permiso que la bandeja. Las entradas no abren el dialog de mensajes enviados | Feedback Leo (2026-11-07): «los mensajes no se ven en el historial de mensajes del caminante» — el historial solo registraba lo que enviamos |

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
