import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reformat the WhatsApp-bound message templates to WhatsApp syntax, and apply
 * them to the "Buen Despacho" (Del Valle II) retreat.
 *
 * Why a content-only migration: the drip engine sends WhatsApp messages as the
 * RAW resolved template text (`sm.resolvedContent = content` in
 * messageSequenceService) — the HTML stripping that exists in that file is
 * only for the email `text` part. Every sequence step of the global pack and
 * of the retreat is channel `whatsapp`, so the 20 templates written in HTML
 * (`<p>`, `<ul>`, `<strong>`) reached recipients with visible tags. This
 * migration rewrites those texts (plus polishes the plain-text ones) using
 * WhatsApp markup: `*bold*`, emoji bullets, one idea per paragraph, and a
 * self-contained first line (long messages collapse behind "Leer más").
 *
 * Scope:
 * - 25 global templates rewritten (by type), including the legacy
 *   PALANCA_DEFINITION (same text as the retreat's local copy).
 * - The same 25 applied to Buen Despacho's per-retreat copies, EXCEPT the
 *   Palanca trio (REQUEST/REMINDER/DEFINITION): that retreat carries the
 *   coordinator's own local flow (palanquero greeting + reminder + full
 *   explanation with the palancas inbox email), which is reformatted IN
 *   PLACE, never overwritten with the global text.
 * - Left untouched: the 4 email-legacy types (FAMILY_CLOSING_INVITATION_EMAIL,
 *   PASSWORD_RESET, USER_INVITATION, RETREAT_SHARED_NOTIFICATION — HTML is
 *   correct for email), every SYS_* system email, and
 *   FAMILY_CLOSING_INVITATION_WHATSAPP (already WhatsApp-formatted).
 *
 * Guard philosophy (same as the 2026-09-10 shirt migration's `down()`):
 * `up()` rewrites globals/retreat copies by type, but the local Palanca rows
 * only update WHERE the message still equals the captured old text — if the
 * prod copy drifted from what we captured, it stays intact (and must be
 * reformatted by hand). `down()` restores only rows still carrying OUR text,
 * so a coordinator edit made after this migration is never clobbered.
 *
 * No `transaction = false`: there is no PRAGMA and no table recreate here,
 * plain UPDATEs only. No imports beyond typeorm/uuid — migrations that run in
 * prod must not import workspace packages with a `.ts` main entry.
 */
export class FormatWhatsappMessageTemplates20260914120000 implements MigrationInterface {
	name = 'FormatWhatsappMessageTemplates20260914120000';
	timestamp = '20260914120000';

	/** Retreat "Buen Despacho" (Del Valle II, 16–18 Oct 2026). */
	private readonly BUEN_DESPACHO_ID = 'e9b3c568-050a-4d66-a99d-305f287a59df';

	private static readonly TYPES = [
		'BIRTHDAY_MESSAGE',
		'CANCELLATION_CONFIRMATION',
		'PALANCA_DEFINITION',
		'EMERGENCY_CONTACT_VALIDATION',
		'GENERAL',
		'PALANCA_REMINDER',
		'PALANCA_REQUEST',
		'PALANQUERO_NEW_WALKER',
		'PAYMENT_REMINDER',
		'POST_RETREAT_MESSAGE',
		'PRE_RETREAT_REMINDER',
		'PRIVACY_DATA_DELETE',
		'SERVER_CONVOCATION',
		'SERVER_SHIRT_CONFIRMATION',
		'SERVER_SHIRT_CONFIRMATION_REMINDER',
		'SERVER_WELCOME',
		'TABLE_LEADER_BRIEFING',
		'WALKER_CONFIRMATION',
		'WALKER_FOLLOWUP_MONTH_1',
		'WALKER_FOLLOWUP_MONTH_3',
		'WALKER_FOLLOWUP_MONTH_6',
		'WALKER_FOLLOWUP_WEEK_1',
		'WALKER_FOLLOWUP_YEAR_1',
		'WALKER_REUNION_INVITATION',
		'WALKER_WELCOME',
	] as const;

	/** The Palanca trio is applied to the retreat as a LOCAL edit, not as a copy. */
	private static readonly RETREAT_EXCLUDED = new Set(['PALANCA_REQUEST', 'PALANCA_REMINDER', 'PALANCA_DEFINITION']);

	/** New WhatsApp-syntax text, one entry per type in TYPES. */
	private static readonly NEW_TEXTS: Record<string, string> = {
		BIRTHDAY_MESSAGE: `¡Feliz cumpleaños, {participant.nickname}! 🎂

Que este día venga con gente buena, momentos sencillos y mucha paz. Y que sigas notando, en lo de todos los días, la cercanía del Señor.

Un abrazo de tus hermanos. ¡Que tengas un día bonito!`,
		CANCELLATION_CONFIRMATION: `Hola {participant.nickname}

Recibimos tu aviso de cancelación. Una pena que no puedas venir esta vez; quedamos con la espera de tenerte en otro momento.

Cuídate mucho. Aquí estamos cuando sea el tiempo 🤗`,
		PALANCA_DEFINITION: `El regalo sorpresa son unas cartas de amor, admiración y apoyo para él 💌

Nosotros les llamamos «palancas».

Te pedimos que puedas pedir estas cartas a su familia y amigos: pídele a las personas importantes para él. Las de su familia son las más importantes, pero entre más le consigas, mejor.

Pueden ser cartas, fotos, dibujos ✍️

📅 *Estas cartas tienen que estar listas a más tardar el {retreat.startDate}.*

Para hacerlas llegar tenemos este correo:
📧 emaus.palancas.mex@gmail.com

Es importante poner en el título del correo el nombre y apellido de {participant.firstName}, para poder identificarlas y entregarlas correctamente.

Muchas gracias por tu apoyo. Estoy a tus órdenes para cualquier duda.

{participant.palanqueroName}`,
		EMERGENCY_CONTACT_VALIDATION: `Hola {participant.nickname}, todo bien por aquí 🙂

Antes del retiro queremos confirmar contigo un dato importante: tu contacto de emergencia.

Lo que tenemos registrado:
👤 *Nombre:* {participant.emergencyContact1Name}
📱 *Teléfono:* {participant.emergencyContact1CellPhone}

Si está correcto, respóndenos *CONFIRMADO*. Si algo cambió, mándanos los datos nuevos.

Gracias por la ayuda 🙏`,
		GENERAL: `Hola {participant.nickname} ✉️

{custom_message}

Un abrazo.`,
		PALANCA_REMINDER: `Hola {participant.recipientFirstName}, un recordatorio: la palanca para {participant.firstName} 💌

Te recordamos con cariño esa carta breve y positiva que leerá durante su retiro este fin de semana (la sorpresa de cartas de aliento que preparan sus seres queridos).

Aún estás a tiempo. No necesita ser larga ni perfecta: unas líneas sinceras con tu cariño, ánimo y buenos deseos serán un regalo enorme.

⚠️ Recuerda evitar cualquier cosa negativa (reproches, problemas o temas tristes): la idea es que {participant.firstName} se sienta querido y animado.

📅 *Fecha límite: {retreat.startDate}.*

Y es una sorpresa: no le comentes nada 🤫

¡Gracias!`,
		PALANCA_REQUEST: `Hola {participant.recipientFirstName}, te escribimos por el retiro de {participant.firstName} 💌

{participant.firstName} participará este fin de semana en un retiro espiritual, una experiencia muy especial. Como parte del retiro, las personas más cercanas preparan en secreto unas cartas de cariño que llamamos «palancas».

Una palanca es simplemente *un mensaje breve, escrito desde el corazón*, que {participant.firstName} leerá en un momento muy emotivo del fin de semana. Tus palabras pueden significar muchísimo.

*¿Qué puedes escribir?*
- Lo que más aprecias y admiras de {participant.firstName}
- Un recuerdo bonito que compartan, o por qué es importante en tu vida
- Palabras de cariño, ánimo y tus mejores deseos

Por favor, que sea un mensaje *totalmente positivo*. Es un regalo de amor: evita reproches, críticas, quejas, problemas, temas tristes o de dinero, o cualquier cosa que pueda doler. La intención es que {participant.firstName} sienta todo tu cariño y apoyo.

No tiene que ser largo ni perfecto: unas pocas líneas sinceras bastan.

📅 *Haz llegar tu palanca antes del inicio del retiro: {retreat.startDate}.*

Es una sorpresa: te pedimos no comentarle nada a {participant.firstName}. ¡Gracias por ser parte de esto! 🙏`,
		PALANQUERO_NEW_WALKER: `Se registró un caminante nuevo en el retiro de *{retreat.parish}* 📋

👤 {participant.firstName} {participant.lastName}
📧 {participant.email}
📱 {participant.cellPhone}
🤝 Invitado por: {participant.invitedBy}

Si quieres, escríbele primero a su invitador para conocer un poco la historia antes de contactarlo.

Gracias por tu servicio 🙏`,
		PAYMENT_REMINDER: `Hola {participant.nickname}, ¿cómo vas? Un recordatorio de tu aporte del retiro 💰

Tu aporte de *{retreat.cost}* aún está pendiente. La cuota cubre hospedaje, comidas y materiales.

Datos para depósito:
{retreat.paymentInfo}

Si ya lo hiciste, pasa por alto este mensaje. Y si tienes alguna dificultad, escríbenos con confianza: tu presencia importa más que la cuota 🙏`,
		POST_RETREAT_MESSAGE: `¡Felicidades por tu Cuarto Día, {participant.nickname}! 🎉

¡Cristo ha resucitado! Apenas empieza el camino bueno.

Lo que viviste no se queda atrás. La gracia del retiro la sigues recibiendo en el día a día: en tu oración, en cómo tratas a los tuyos, en lo que decides perdonar.

Te esperamos en la próxima reunión de perseverancia:
📅 {retreat.next_meeting_date}

Un abrazo fuerte, peregrino 🙏`,
		PRE_RETREAT_REMINDER: `Ya casi, {participant.nickname} 🙌

Falta poco para tu retiro. Lo importante:

📅 {retreat.startDate}
⏰ Llegada: {retreat.walkerArrivalTime} (caminantes) · {retreat.serverArrivalTimeFriday} (servidores)
📍 Encuentro: {participant.pickupLocation}

🎒 *Qué llevar:*
{retreat.thingsToBringNotes}

Ven ligero y sin expectativas. Nos vemos pronto.`,
		PRIVACY_DATA_DELETE: `Hola {participant.firstName}

Como parte de nuestro compromiso con la protección de tus datos personales, te recordamos que puedes eliminar toda tu información de nuestra plataforma en cualquier momento 🔒

Para eliminar tus datos, haz clic en el siguiente enlace:
{participant.dataDeleteUrl}

Este enlace es único y personal. Al confirmar, todos tus datos personales serán eliminados de forma permanente.

Si tienes preguntas sobre el tratamiento de tus datos, consulta nuestro aviso de privacidad.

Saludos,
Retiros Emaús`,
		SERVER_CONVOCATION: `Hola {participant.firstName}, ¿te late servir en el próximo retiro? 🙋

Es *{retreat.parish}*, del {retreat.startDate} al {retreat.endDate}.

Si quieres estar, regístrate aquí:
🔗 {retreat.serverRegistrationLink}

Cualquier duda me dices. ¡Sería un gusto tenerte en el equipo!`,
		SERVER_SHIRT_CONFIRMATION: `Hola {participant.firstName}, ya vamos a pedir las prendas del equipo para el retiro de *{retreat.parish}* ({retreat.startDate}) 👕

Lo que tenemos registrado para ti:

{participant.shirtOrderSummary}

💰 Total de prendas: *{participant.shirtCharge}*
Tu saldo total, prendas incluidas, queda en *{participant.paymentRemaining}*.

⚠️ Recuerda que si es la primera vez que sirves, es requisito indispensable llevar estas prendas para estar uniformado con todos los servidores.

Si todo está bien, respóndeme *confirmándomelo*. Si falta algo o hay que cambiar una talla, dime y lo corregimos.`,
		SERVER_SHIRT_CONFIRMATION_REMINDER: `Hola {participant.firstName}, un recordatorio: falta confirmar tus prendas para el retiro de *{retreat.parish}* del {retreat.startDate} 👕

Lo que tenemos registrado para ti:

{participant.shirtOrderSummary}

💰 Total de prendas: *{participant.shirtCharge}*
Tu saldo total, prendas incluidas, es de *{participant.paymentRemaining}*.

⚠️ Recuerda que si es la primera vez que sirves, es requisito indispensable llevar estas prendas para estar uniformado con todos los servidores.

*¿Me confirmas que está correcto o qué hay que cambiar?* ✅`,
		SERVER_WELCOME: `{participant.nickname}, gracias por decir "sí" a este retiro 🙏

Tu servicio y tu oración son lo que sostiene el fin de semana. Estamos contentos de tenerte en el equipo.

Datos para tu llegada:
📅 {retreat.startDate}
⏰ {retreat.serverArrivalTimeFriday}

Que el Señor te dé fuerza y luz. Nos vemos pronto.

¡Jesucristo ha resucitado!`,
		TABLE_LEADER_BRIEFING: `Hola {participant.firstName}, esta es la información de tu mesa *{table.name}* 📋

Caminantes ({table.walkersCount}):
{table.walkersRoster}

*Mensaje sugerido para cada caminante:*

Hola, ¿hablo con [nombre del caminante]? Te escribo de parte del Retiro de Emaús de {retreat.parish}, para confirmar tu asistencia y darte la bienvenida. ¿Contamos contigo este fin de semana?

Solo recuerda llevar: {retreat.thingsToBringNotes}

Es importante que llegues directamente a la casa de retiro, a más tardar a las {retreat.walkerArrivalTime}. No hay transporte organizado y, de preferencia, que alguien te lleve porque no hay estacionamiento. ¿Sabes cómo llegar o te paso la dirección?

Cualquier duda, aquí estoy para apoyarte. Nos vemos el fin de semana. ¡Que Dios te bendiga! 🙏`,
		WALKER_CONFIRMATION: `Hola, ¿hablo con {participant.firstName}? 🙂

Te escribo de parte del Retiro de Emaús de {retreat.parish}, para confirmar tu asistencia y darte la bienvenida.

*¿Contamos contigo este fin de semana?*

Recuerda llevar:
🎒 {retreat.thingsToBringNotes}

Es importante que llegues directamente a la casa de retiro, a más tardar a las *{retreat.walkerArrivalTime}*. No hay transporte organizado y, de preferencia, que alguien te lleve porque no hay estacionamiento.

¿Sabes cómo llegar o te paso la dirección?

Cualquier duda, aquí estoy para apoyarte. Nos vemos el fin de semana. ¡Que Dios te bendiga! 🙏`,
		WALKER_FOLLOWUP_MONTH_1: `{participant.firstName}, primer mes del Cuarto Día 🙏

Ha pasado un mes. Es normal que el "subidón" del retiro vaya bajando: justo ahora empieza lo bueno, el Cuarto Día real, no el del fin de semana.

Pregunta honesta: ¿sigues orando, aunque sea poco? ¿Te conectaste con alguien de la mesa? ¿Has notado pequeños cambios en cómo respondes a los tuyos?

Si algo de eso te falta, no pasa nada: se pide otra vez. La gracia se renueva cuando se busca.

*¿Conversamos un día?*

De Cristo Resucitado, ¡siempre!`,
		WALKER_FOLLOWUP_MONTH_3: `{participant.firstName}, ya van tres meses 🙏

A los tres meses del retiro suelen aparecer las preguntas reales: ¿esto era para mí?, ¿cómo lo llevo en lo cotidiano?, ¿con quién camino?

Justo para eso existe el grupo. Te invitamos a:
- Volver a la próxima reunión, aunque vayas sin ganas
- Pensar si te animas a servir en el próximo retiro
- Pensar en alguien a quien podrías invitar: a veces ese paso le cambia la vida

Cuéntanos cómo va. Nos importa.

De Cristo Resucitado, ¡siempre!`,
		WALKER_FOLLOWUP_MONTH_6: `{participant.firstName}, medio año ya 🙏

Seis meses desde tu retiro. ¿Recuerdas cómo te sentiste el domingo del cierre? A veces vale la pena volver a esa imagen: es un buen termómetro.

A los seis meses suelen ayudarte dos cosas:
1. *Volver a contarlo*: hablar con alguien que también lo vivió ayuda a no perder el hilo
2. *Servir*: el siguiente retiro está cerca. Servir consolida lo que recibiste

Si te animas, escríbenos. Y si necesitas espacio también está bien: solo no te pierdas del todo.

De Cristo Resucitado, ¡siempre!`,
		WALKER_FOLLOWUP_WEEK_1: `{participant.firstName}, ¿cómo va la semana? 🙏

Ya pasó una semana desde tu retiro. Ahora viene el Cuarto Día, y suele ser donde empieza a notarse de verdad lo que recibiste.

Tres cosas para esta semana:
- Mantener algo de oración diaria, aunque sea cinco minutos
- Escribirle a alguien de tu mesa, aunque sea solo para saludar
- Apartar la fecha de la primera reunión del grupo: esa red es la que va a sostenerte

Si necesitas hablar, escríbenos. Aquí estamos.

De Cristo Resucitado, ¡siempre!`,
		WALKER_FOLLOWUP_YEAR_1: `¡Feliz aniversario, {participant.firstName}! 🎉

Hace un año hiciste tu retiro de Emaús. Es una fecha que vale la pena agradecer: hoy eres distinto a quien fue al retiro hace 12 meses, aunque a veces no se note.

Tres ideas para hoy:
- Diez minutos de oración para agradecer
- Escribirle a un compañero de mesa
- Pensar a quién podrías invitar al próximo retiro

Si quieres servir, hablar, regresar o simplemente saludar, aquí estamos. Tu grupo te espera.

De Cristo Resucitado, ¡siempre!`,
		WALKER_REUNION_INVITATION: `{participant.firstName}, te esperamos en la reunión del grupo 🤝

Te escribimos del grupo de *{community.name}*. Tenemos próxima reunión y queremos contar contigo.

Es un espacio sencillo, sin protocolo: para compartir cómo va el Cuarto Día, orar juntos y caminar acompañados.

No importa si has fallado a las anteriores. No necesitas preparar nada. *Solo ven.*

Si quieres confirmar fecha, hora o lugar, escríbenos.

De Cristo Resucitado, ¡siempre!`,
		WALKER_WELCOME: `{participant.nickname}, qué gusto saber que vienes al retiro 🙏

Ya quedó apartado tu lugar. Estamos preparando todo con cariño para recibirte.

Para que lo tengas a la mano:
📅 {retreat.startDate}
⏰ Llegada: {retreat.walkerArrivalTime}

Te pedimos llegar puntual para que el registro fluya. Ven sin expectativas: el resto lo pone el Señor.

Nos vemos pronto.`,
	};

	/**
	 * Previous texts (HTML or plain), captured verbatim from the database so
	 * `down()` can undo exactly what `up()` changed.
	 */
	private static readonly OLD_TEXTS: Record<string, string> = {
				'BIRTHDAY_MESSAGE': "<p>¡Feliz cumpleaños, {participant.nickname}!</p>\n<p>Que este día venga con gente buena, momentos sencillos y mucha paz. Y que sigas notando, en lo de todos los días, la cercanía del Señor.</p>\n<p>Un abrazo de tus hermanos. ¡Que tengas un día bonito!</p>",
		'CANCELLATION_CONFIRMATION': "<p>Hola {participant.nickname},</p>\n<p>Recibimos tu aviso de cancelación. Una pena que no puedas venir esta vez — quedamos con la espera de tenerte en otro momento.</p>\n<p>Cuídate mucho. Aquí estamos cuando sea el tiempo.</p>",
		'PALANCA_DEFINITION': "<p style=\"text-align: left;\">El regalo SORPRESA!! son unas cartas de amor, admiración y apoyo para él.&nbsp;</p><p style=\"text-align: left;\">Nosotros le llamamos ¨Palancas.¨&nbsp;</p><p style=\"text-align: left;\">Te pedimos si puedes pedir estas cartas a su familia y amigos, pídele a las personas importantes para él. Obviamente las de su familia son las más importantes. Pero entre más le consigas mejor!!!&nbsp;</p><p style=\"text-align: left;\">Pueden ser cartas, fotos, dibujos!!!&nbsp;</p><p style=\"text-align: left;\"><em>Estas cartas tienen que estar listas a más tardar el {retreat.startDate}</em></p><p style=\"text-align: left;\">**Para hacer llegar las cartas tenemos este correo:</p><p style=\"text-align: left;\"><a target=\"_blank\" rel=\"noopener noreferrer nofollow\" href=\"mailto:emaus.palancas.mex@gmail.com\">emaus.palancas.mex@gmail.com</a>&nbsp;</p><p style=\"text-align: left;\">Es importante poner en el título del correo el nombre y apellido de {participant.firstName} para que podamos identificarlas y entregarlas correctamente.</p><p style=\"text-align: left;\">Muchas gracias por tu apoyo, estoy a tus órdenes para cualquier duda que pueda surgir.</p><p style=\"text-align: left;\">&nbsp;{participant.palanqueroName}</p>",
		'EMERGENCY_CONTACT_VALIDATION': "<p>Hola {participant.nickname}, todo bien por aquí.</p>\n<p>Antes del retiro queremos confirmar contigo un dato importante: tu contacto de emergencia.</p>\n<p><strong>Lo que tenemos registrado:</strong></p>\n<ul>\n  <li><strong>Nombre:</strong> {participant.emergencyContact1Name}</li>\n  <li><strong>Teléfono:</strong> {participant.emergencyContact1CellPhone}</li>\n</ul>\n<p>Si está correcto, respóndenos <strong>CONFIRMADO</strong>. Si algo cambió, mándanos los datos nuevos.</p>\n<p>Gracias por la ayuda.</p>",
		'GENERAL': "<p>Hola {participant.nickname},</p>\n<p>{custom_message}</p>\n<p>Un abrazo.</p>",
		'PALANCA_REMINDER': "<p>Hola {participant.recipientFirstName}, ¿cómo estás?</p>\n<p>Te recordamos con cariño la <strong>palanca</strong> para {participant.firstName}: esa carta breve y positiva que leerá durante su retiro este fin de semana (es la sorpresa de cartas de aliento que preparan sus seres queridos).</p>\n<p>Aún estás a tiempo. No necesita ser larga ni perfecta; unas líneas sinceras con tu cariño, ánimo y buenos deseos serán un regalo enorme. Recuerda <strong>evitar cualquier cosa negativa</strong> —reproches, problemas o temas tristes—: la idea es que {participant.firstName} se sienta querido y animado.</p>\n<p><strong>Fecha límite: {retreat.startDate}.</strong> Y recuerda que es una sorpresa, no le comentes nada. ¡Gracias!</p>",
		'PALANCA_REQUEST': "<p>Hola {participant.recipientFirstName}, ¿cómo estás?</p>\n<p>Te escribimos porque {participant.firstName} participará este fin de semana en un retiro espiritual, una experiencia muy especial. Como parte del retiro, las personas más cercanas preparan en secreto unas cartas de cariño que llamamos <strong>«palancas»</strong>.</p>\n<p>Una palanca es simplemente <strong>un mensaje breve, escrito desde el corazón</strong>, que {participant.firstName} leerá en un momento muy emotivo del fin de semana. Tus palabras pueden significar muchísimo.</p>\n<p><strong>¿Qué puedes escribir?</strong></p>\n<ul>\n  <li>Lo que más aprecias y admiras de {participant.firstName}.</li>\n  <li>Un recuerdo bonito que compartan, o por qué es importante en tu vida.</li>\n  <li>Palabras de cariño, ánimo y tus mejores deseos.</li>\n</ul>\n<p><strong>Por favor, que sea un mensaje totalmente positivo.</strong> Es un regalo de amor: evita reproches, críticas, quejas, problemas, temas tristes o de dinero, o cualquier cosa que pueda doler. La intención es que {participant.firstName} sienta todo tu cariño y apoyo.</p>\n<p>No tiene que ser largo ni perfecto: unas pocas líneas sinceras bastan. <strong>Haz llegar tu palanca antes del inicio del retiro: {retreat.startDate}.</strong></p>\n<p>Es una sorpresa, así que te pedimos no comentarle nada a {participant.firstName}. ¡Gracias por ser parte de esto!</p>",
		'PALANQUERO_NEW_WALKER': "<p>Hola,</p>\n<p>Se registró un caminante nuevo en el retiro de <strong>{retreat.parish}</strong>.</p>\n<ul>\n  <li><strong>Nombre:</strong> {participant.firstName} {participant.lastName}</li>\n  <li><strong>Email:</strong> {participant.email}</li>\n  <li><strong>Teléfono:</strong> {participant.cellPhone}</li>\n  <li><strong>Invitado por:</strong> {participant.invitedBy}</li>\n</ul>\n<p>Si quieres, escríbele primero a su invitador para conocer un poco la historia antes de contactarlo. Gracias por tu servicio.</p>",
		'PAYMENT_REMINDER': "<p>Hola {participant.nickname}, ¿cómo vas?</p>\n<p>Solo un recordatorio: tu aporte de <strong>{retreat.cost}</strong> aún está pendiente. La cuota nos ayuda a cubrir hospedaje, comidas y los materiales del retiro.</p>\n<p>Aquí los datos:<br>{retreat.paymentInfo}</p>\n<p>Si ya lo hiciste, pasa por alto este mensaje. Y si tienes alguna dificultad, escríbenos con confianza — tu presencia importa más que la cuota.</p>",
		'POST_RETREAT_MESSAGE': "<p>{participant.nickname}, ¡felicidades por tu Cuarto Día!</p>\n<p>¡Cristo ha resucitado! Apenas empieza el camino bueno.</p>\n<p>Lo que viviste no se queda atrás. La gracia del retiro la sigues recibiendo en el día a día — en tu oración, en cómo tratas a los tuyos, en lo que decides perdonar.</p>\n<p>Te esperamos en la próxima reunión de perseverancia: <strong>{retreat.next_meeting_date}</strong>.</p>\n<p>Un abrazo fuerte, peregrino.</p>",
		'PRE_RETREAT_REMINDER': "<p>Ya casi, {participant.nickname}.</p>\n<p>Falta poco para tu retiro. Te recordamos lo importante:</p>\n<ul>\n  <li><strong>Fecha:</strong> {retreat.startDate}</li>\n  <li><strong>Hora de llegada:</strong> {retreat.walkerArrivalTime} (caminantes) · {retreat.serverArrivalTimeFriday} (servidores)</li>\n  <li><strong>Lugar de encuentro:</strong> {participant.pickupLocation}</li>\n</ul>\n<p><strong>Qué llevar:</strong><br>{retreat.thingsToBringNotes}</p>\n<p>Ven ligero y sin expectativas. Nos vemos pronto.</p>",
		'PRIVACY_DATA_DELETE': "Hola {participant.firstName},\n\nComo parte de nuestro compromiso con la protección de tus datos personales, te recordamos que puedes eliminar toda tu información de nuestra plataforma en cualquier momento.\n\nPara eliminar tus datos, haz clic en el siguiente enlace:\n{participant.dataDeleteUrl}\n\nEste enlace es único y personal. Al confirmar, todos tus datos personales serán eliminados de forma permanente.\n\nSi tienes preguntas sobre el tratamiento de tus datos, consulta nuestro aviso de privacidad.\n\nSaludos,\nRetiros Emaús",
		'SERVER_CONVOCATION': "Hola {participant.firstName}, ¿te late servir en el próximo retiro?\n\nEs {retreat.parish}, del {retreat.startDate} al {retreat.endDate}.\n\nSi quieres estar, regístrate aquí: {retreat.serverRegistrationLink}\n\nCualquier duda me dices. ¡Sería un gusto tenerte en el equipo!",
		'SERVER_SHIRT_CONFIRMATION': "Hola {participant.firstName}, ya vamos a pedir las prendas del equipo para el retiro de {retreat.parish} ({retreat.startDate}).\n\nLo que tenemos registrado para ti:\n\n{participant.shirtOrderSummary}\n\nEl valor de tus prendas se suma a tu cuenta: {participant.shirtCharge}.\n\nTu saldo total, prendas incluidas, queda en {participant.paymentRemaining}.\n\nSi todo está bien, respóndeme confirmándome. Si falta algo o hay que cambiar una talla, dime y lo corregimos.",
		'SERVER_SHIRT_CONFIRMATION_REMINDER': "Hola {participant.firstName}, un recordatorio: falta confirmar tus prendas para el retiro de {retreat.parish} del {retreat.startDate}.\n\n{participant.shirtOrderSummary}\n\nTotal de prendas: {participant.shirtCharge}.\nTu saldo total, prendas incluidas, es de {participant.paymentRemaining}.\n\n¿Me confirmas que está correcto o qué hay que cambiar?",
		'SERVER_WELCOME': "<p style=\"text-align: left;\">{participant.nickname}, gracias por decir \"sí\" en este retiro.</p><p style=\"text-align: left;\">Tu servicio y tu oración son lo que sostiene el fin de semana. Estamos contentos de tenerte en el equipo.</p><p style=\"text-align: left;\">Datos para tu llegada:</p><ul><li><p style=\"text-align: left;\"><strong>Inicio:</strong> {retreat.startDate}</p></li><li><p style=\"text-align: left;\"><strong>Hora:</strong> {retreat.serverArrivalTimeFriday}</p></li></ul><p style=\"text-align: left;\">Que el Señor te dé fuerza y luz. Nos vemos pronto.</p><p style=\"text-align: left;\">¡Jesucristo ha resucitado!</p>",
		'TABLE_LEADER_BRIEFING': "<p>Hola {participant.firstName}, esta es la información de tu mesa <strong>{table.name}</strong>.</p>\n<p><strong>Caminantes ({table.walkersCount}):</strong></p>\n<p>{table.walkersRoster}</p>\n<hr>\n<p><strong>Mensaje a enviar a cada caminante:</strong></p>\n<p>Hola, ¿hablo con [nombre del caminante]? Te escribo de parte del Retiro de Emaús de {retreat.parish}. Te contacto para confirmar tu asistencia y darte la bienvenida. ¿Contamos contigo este fin de semana?</p>\n<p>Solo recuerda llevar: {retreat.thingsToBringNotes}</p>\n<p>Es importante que llegues directamente a la casa de retiro, a más tardar a las {retreat.walkerArrivalTime}. Toma en cuenta que no hay transporte organizado, y de preferencia que alguien te lleve porque no hay estacionamiento. ¿Sabes cómo llegar o te paso la dirección?</p>\n<p>Cualquier duda que tengas, aquí estoy para apoyarte. Nos vemos el fin de semana. ¡Que Dios te bendiga!</p>",
		'WALKER_CONFIRMATION': "<p>Hola, ¿hablo con {participant.firstName}? Te escribo de parte del Retiro de Emaús de {retreat.parish}.</p>\n<p>Te contacto para confirmar tu asistencia y darte la bienvenida. ¿Contamos contigo este fin de semana?</p>\n<p>Solo recuerda llevar: {retreat.thingsToBringNotes}</p>\n<p>Es importante que llegues directamente a la casa de retiro, a más tardar a las {retreat.walkerArrivalTime}. Toma en cuenta que no hay transporte organizado, y de preferencia que alguien te lleve porque no hay estacionamiento. ¿Sabes cómo llegar o te paso la dirección?</p>\n<p>Cualquier duda que tengas, aquí estoy para apoyarte. Nos vemos el fin de semana. ¡Que Dios te bendiga!</p>",
		'WALKER_FOLLOWUP_MONTH_1': "<h2>{participant.firstName}, primer mes del Cuarto Día</h2>\n<p>Ha pasado un mes. Es normal que el \"subidón\" del retiro vaya bajando — justo ahora empieza lo bueno: el Cuarto Día real, no el del fin de semana.</p>\n<p>Pregunta honesta: ¿sigues orando, aunque sea poco? ¿Te conectaste con alguien de la mesa? ¿Has notado pequeños cambios en cómo respondes a los tuyos?</p>\n<p>Si algo de eso te falta, no pasa nada: se pide otra vez. La gracia se renueva cuando se busca.</p>\n<p>¿Conversamos un día?</p>\n<p>De Cristo Resucitado, ¡siempre!</p>",
		'WALKER_FOLLOWUP_MONTH_3': "<h2>{participant.firstName}, ya van tres meses</h2>\n<p>A los tres meses del retiro suelen aparecer las preguntas reales: <em>¿esto era para mí?, ¿cómo lo llevo en lo cotidiano?, ¿con quién camino?</em></p>\n<p>Justo para eso existe el grupo. Te invitamos a:</p>\n<ul>\n  <li>Volver a la próxima reunión — aunque vayas sin ganas.</li>\n  <li>Pensar si te animas a servir en el próximo retiro.</li>\n  <li>Pensar en alguien a quien podrías invitar — a veces ese paso le cambia la vida.</li>\n</ul>\n<p>Cuéntanos cómo vas. Nos importa.</p>\n<p>De Cristo Resucitado, ¡siempre!</p>",
		'WALKER_FOLLOWUP_MONTH_6': "<h2>{participant.firstName}, medio año ya</h2>\n<p>Seis meses desde tu retiro. ¿Recuerdas cómo te sentiste el domingo del cierre? A veces vale la pena volver a esa imagen — es un buen termómetro.</p>\n<p>A los seis meses suelen ayudarte dos cosas:</p>\n<ol>\n  <li><strong>Volver a contarlo</strong> — hablar con alguien que también lo vivió ayuda a no perder el hilo.</li>\n  <li><strong>Servir</strong> — el siguiente retiro está cerca. Servir consolida lo que recibiste.</li>\n</ol>\n<p>Si te animas, escríbenos. Y si necesitas espacio también está bien — solo no te pierdas del todo.</p>\n<p>De Cristo Resucitado, ¡siempre!</p>",
		'WALKER_FOLLOWUP_WEEK_1': "<h2>{participant.firstName}, ¿cómo va la semana?</h2>\n<p>Ya pasó una semana desde tu retiro. Ahora viene el Cuarto Día — y suele ser donde empieza a notarse de verdad lo que recibiste.</p>\n<p>Tres cosas para esta semana:</p>\n<ul>\n  <li>Mantener algo de oración diaria, aunque sea cinco minutos.</li>\n  <li>Escribirle a alguien de tu mesa, aunque sea solo para saludar.</li>\n  <li>Apartar la fecha de la primera reunión del grupo — esa red es la que va a sostenerte.</li>\n</ul>\n<p>Si necesitas hablar, escríbenos. Aquí estamos.</p>\n<p>De Cristo Resucitado, ¡siempre!</p>",
		'WALKER_FOLLOWUP_YEAR_1': "<h2>¡Feliz aniversario, {participant.firstName}!</h2>\n<p>Hace un año hiciste tu retiro de Emaús. Es una fecha que vale la pena agradecer: hoy eres distinto a quien fue al retiro hace 12 meses, aunque a veces no se note.</p>\n<p>Tres ideas para hoy:</p>\n<ul>\n  <li>Diez minutos de oración para agradecer.</li>\n  <li>Escribirle a un compañero de mesa.</li>\n  <li>Pensar a quién podrías invitar al próximo retiro.</li>\n</ul>\n<p>Si quieres servir, hablar, regresar o simplemente saludar, aquí estamos. Tu grupo te espera.</p>\n<p>De Cristo Resucitado, ¡siempre!</p>",
		'WALKER_REUNION_INVITATION': "<h2>{participant.firstName}, te esperamos</h2>\n<p>Te escribimos del grupo de <strong>{community.name}</strong>. Tenemos próxima reunión y queremos contar contigo.</p>\n<p>Es un espacio sencillo, sin protocolo: para compartir cómo va el Cuarto Día, orar juntos y caminar acompañados.</p>\n<p>No importa si has fallado a las anteriores. No necesitas preparar nada. Solo ven.</p>\n<p>Si quieres confirmar fecha, hora o lugar, escríbenos.</p>\n<p>De Cristo Resucitado, ¡siempre!</p>",
		'WALKER_WELCOME': "<p>{participant.nickname}, qué gusto saber que vienes.</p>\n<p>Ya quedó apartado tu lugar para el retiro. Estamos preparando todo con cariño para recibirte.</p>\n<p>Para que lo tengas a la mano:</p>\n<ul>\n  <li><strong>Fecha:</strong> {retreat.startDate}</li>\n  <li><strong>Hora de llegada:</strong> {retreat.walkerArrivalTime}</li>\n</ul>\n<p>Te pedimos llegar puntual para que el registro fluya. Ven sin expectativas — el resto lo pone el Señor.</p>\n<p>Nos vemos pronto.</p>",
	};

	/**
	 * Buen Despacho's local Palanca flow (rowid order in the captured DB):
	 * 0 = PALANCA_REQUEST palanquero greeting, 1 = PALANCA_REMINDER local
	 * copy, 2 = PALANCA_DEFINITION full explanation (palancas inbox email).
	 */
	private static readonly LOCAL_TYPES = [
		'PALANCA_REQUEST',
		'PALANCA_REMINDER',
		'PALANCA_DEFINITION',
	] as const;

	private static readonly OLD_LOCAL_TEXTS: string[] = [
				"<p style=\"text-align: left;\">Hola {participant.emergencyContactName}, buen dia.</p><p style=\"text-align: left;\">Te Saluda {participant.palanqueroName} del grupo EMAUS.&nbsp;</p><p style=\"text-align: left;\">Te escribo del retiro de Emaús por que {participant.firstName} nos va a acompañar el próximo {retreat.startDate} al retiro y te queremos pedir un regalo SORPRESA para él.&nbsp;</p><p style=\"text-align: left;\">Te puedo llamar o prefieres que te mande un whatsapp con la explicación?&nbsp;</p><p style=\"text-align: left;\">estoy pendiente de tu respuesta.&nbsp;</p><p style=\"text-align: left;\">{participant.palanqueroName}</p><p style=\"text-align: left;\"></p>",
		"<p style=\"text-align: left;\">Hola {participant.emergencyContactName}, ¿cómo estás?</p><p style=\"text-align: left;\">Te recordamos con cariño la <strong>palanca</strong> para {participant.firstName}: esa carta breve y positiva que leerá durante su retiro este fin de semana (es la sorpresa de cartas de aliento que preparan sus seres queridos).</p><p style=\"text-align: left;\">Aún estás a tiempo. No necesita ser larga ni perfecta; unas líneas sinceras con tu cariño, ánimo y buenos deseos serán un regalo enorme. Recuerda <strong>evitar cualquier cosa negativa</strong> —reproches, problemas o temas tristes—: la idea es que {participant.firstName} se sienta querido y animado.</p><p style=\"text-align: left;\"><strong>Fecha límite: {retreat.startDate}.</strong> Y recuerda que es una sorpresa, no le comentes nada. ¡Gracias!</p>",
		"<p style=\"text-align: left;\">El regalo SORPRESA!! son unas cartas de amor, admiración y apoyo para él.&nbsp;</p><p style=\"text-align: left;\">Nosotros le llamamos ¨Palancas.¨&nbsp;</p><p style=\"text-align: left;\">Te pedimos si puedes pedir estas cartas a su familia y amigos, pídele a las personas importantes para él. Obviamente las de su familia son las más importantes. Pero entre más le consigas mejor!!!&nbsp;</p><p style=\"text-align: left;\">Pueden ser cartas, fotos, dibujos!!!&nbsp;</p><p style=\"text-align: left;\"><em>Estas cartas tienen que estar listas a más tardar el {retreat.startDate}</em></p><p style=\"text-align: left;\">**Para hacer llegar las cartas tenemos este correo:</p><p style=\"text-align: left;\"><a target=\"_blank\" rel=\"noopener noreferrer nofollow\" href=\"mailto:emaus.palancas.mex@gmail.com\">emaus.palancas.mex@gmail.com</a>&nbsp;</p><p style=\"text-align: left;\">Es importante poner en el título del correo el nombre y apellido de {participant.firstName} para que podamos identificarlas y entregarlas correctamente.</p><p style=\"text-align: left;\">Muchas gracias por tu apoyo, estoy a tus órdenes para cualquier duda que pueda surgir.</p><p style=\"text-align: left;\">&nbsp;{participant.palanqueroName}</p>",
	];

	private static readonly NEW_LOCAL_TEXTS: string[] = [
		`Hola {participant.emergencyContactName}, buen día 🙂

Te saluda {participant.palanqueroName}, del grupo Emaús.

Te escribo porque {participant.firstName} nos va a acompañar al retiro el próximo {retreat.startDate}, y te queremos pedir un regalo sorpresa para él.

¿Te puedo llamar o prefieres que te mande un whatsapp con la explicación?

Quedo pendiente de tu respuesta.

{participant.palanqueroName}`,
		`Hola {participant.emergencyContactName}, un recordatorio: la palanca para {participant.firstName} 💌

Te recordamos con cariño esa carta breve y positiva que leerá durante su retiro este fin de semana (la sorpresa de cartas de aliento que preparan sus seres queridos).

Aún estás a tiempo. No necesita ser larga ni perfecta: unas líneas sinceras con tu cariño, ánimo y buenos deseos serán un regalo enorme.

⚠️ Recuerda evitar cualquier cosa negativa (reproches, problemas o temas tristes): la idea es que {participant.firstName} se sienta querido y animado.

📅 *Fecha límite: {retreat.startDate}.*

Y es una sorpresa: no le comentes nada 🤫

¡Gracias!`,
		`El regalo sorpresa son unas cartas de amor, admiración y apoyo para él 💌

Nosotros les llamamos «palancas».

Te pedimos que puedas pedir estas cartas a su familia y amigos: pídele a las personas importantes para él. Las de su familia son las más importantes, pero entre más le consigas, mejor.

Pueden ser cartas, fotos, dibujos ✍️

📅 *Estas cartas tienen que estar listas a más tardar el {retreat.startDate}.*

Para hacerlas llegar tenemos este correo:
📧 emaus.palancas.mex@gmail.com

Es importante poner en el título del correo el nombre y apellido de {participant.firstName}, para poder identificarlas y entregarlas correctamente.

Muchas gracias por tu apoyo. Estoy a tus órdenes para cualquier duda.

{participant.palanqueroName}`,
	];

	public async up(queryRunner: QueryRunner): Promise<void> {
		// 1. Globals: the reusable pack is ours — rewrite by type.
		for (const type of FormatWhatsappMessageTemplates20260914120000.TYPES) {
			await queryRunner.query(
				`UPDATE "global_message_templates" SET "message" = ?, "updatedAt" = datetime('now') WHERE "type" = ?`,
				[FormatWhatsappMessageTemplates20260914120000.NEW_TEXTS[type], type],
			);
		}

		// 2. Apply to Buen Despacho's per-retreat copies (also covers duplicate
		// rows of the same type). The Palanca pair is skipped: local content.
		for (const type of FormatWhatsappMessageTemplates20260914120000.TYPES) {
			if (FormatWhatsappMessageTemplates20260914120000.RETREAT_EXCLUDED.has(type)) continue;
			await queryRunner.query(
				`UPDATE "message_templates" SET "message" = ?, "updatedAt" = datetime('now') WHERE "retreatId" = ? AND "type" = ?`,
				[FormatWhatsappMessageTemplates20260914120000.NEW_TEXTS[type], this.BUEN_DESPACHO_ID, type],
			);
		}

		// 3. Local Palanca flow: reformat in place, guarded by the exact old
		// text so a prod copy that drifted from the capture stays untouched.
		// No `type` in the WHERE: the explanation row was renamed from
		// PALANCA_REQUEST (duplicate) to PALANCA_DEFINITION in dev shortly
		// before this migration was captured, and prod may still carry either
		// name — the 1229-char exact-text guard is unique either way.
		for (let i = 0; i < FormatWhatsappMessageTemplates20260914120000.LOCAL_TYPES.length; i++) {
			await queryRunner.query(
				`UPDATE "message_templates" SET "message" = ?, "updatedAt" = datetime('now')
				 WHERE "retreatId" = ? AND "message" = ?`,
				[
					FormatWhatsappMessageTemplates20260914120000.NEW_LOCAL_TEXTS[i],
					this.BUEN_DESPACHO_ID,
					FormatWhatsappMessageTemplates20260914120000.OLD_LOCAL_TEXTS[i],
				],
			);
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Restore only rows still carrying OUR text: a coordinator edit made
		// after this migration ran is theirs and survives the revert.
		for (const type of FormatWhatsappMessageTemplates20260914120000.TYPES) {
			await queryRunner.query(
				`UPDATE "global_message_templates" SET "message" = ?, "updatedAt" = datetime('now') WHERE "type" = ? AND "message" = ?`,
				[FormatWhatsappMessageTemplates20260914120000.OLD_TEXTS[type], type, FormatWhatsappMessageTemplates20260914120000.NEW_TEXTS[type]],
			);
			if (FormatWhatsappMessageTemplates20260914120000.RETREAT_EXCLUDED.has(type)) continue;
			await queryRunner.query(
				`UPDATE "message_templates" SET "message" = ?, "updatedAt" = datetime('now') WHERE "retreatId" = ? AND "type" = ? AND "message" = ?`,
				[FormatWhatsappMessageTemplates20260914120000.OLD_TEXTS[type], this.BUEN_DESPACHO_ID, type, FormatWhatsappMessageTemplates20260914120000.NEW_TEXTS[type]],
			);
		}
		for (let i = 0; i < FormatWhatsappMessageTemplates20260914120000.LOCAL_TYPES.length; i++) {
			await queryRunner.query(
				`UPDATE "message_templates" SET "message" = ?, "updatedAt" = datetime('now')
				 WHERE "retreatId" = ? AND "message" = ?`,
				[
					FormatWhatsappMessageTemplates20260914120000.OLD_LOCAL_TEXTS[i],
					this.BUEN_DESPACHO_ID,
					FormatWhatsappMessageTemplates20260914120000.NEW_LOCAL_TEXTS[i],
				],
			);
		}
	}
}
