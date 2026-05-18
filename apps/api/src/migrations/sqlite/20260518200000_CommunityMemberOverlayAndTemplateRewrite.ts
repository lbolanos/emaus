import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration consolidada que aplica 4 cambios relacionados con el feature de
 * "overlay de perfil por-comunidad" y reescritura de plantillas seed:
 *
 *  1. **Schema** — agrega columnas opcionales `firstName/lastName/email/cellPhone`
 *     a `community_member` para que cada comunidad pueda tener su propia
 *     versión del nombre/contacto de un miembro sin tocar el `Participant`
 *     global. Elimina el vector de account takeover donde un community admin
 *     podía cambiar `participants.email` y heredar el User linkeado.
 *
 *  2. **Normalización de variables** — los 4 community templates seed
 *     (`COMMUNITY_MEETING_INVITATION`, `_MEMBER_APPROVED`, `_JOIN_REQUEST_ADMIN`,
 *     `_LINK_REQUEST_CONFIRM`) se sembraron con sintaxis mustache `{{firstName}}`
 *     pero el resto del sistema usa la sintaxis canónica `{scope.var}`
 *     (`{participant.firstName}`, `{community.name}`, ...). Convierte el contenido
 *     a la sintaxis canónica para que el variable picker del editor y el
 *     replacement de mensajes funcionen.
 *
 *  3. **Reescritura de plantillas seed con voz más personal** — los 25
 *     templates seed (walker/server welcome, palanca request/reminder,
 *     post-retiro, community, family-closing, etc.) tenían un tono
 *     corporativo y emojis decorativos. Se reescriben con voz cálida,
 *     directa, sin frases "AI/plastic". También reemplaza el genérico
 *     "tu comunidad de Emaús" por `{community.name}` donde aplique.
 *
 *  4. **Fix variable fantasma** — `PALANCA_REQUEST` usaba el placeholder
 *     inexistente `{retreat.fecha_limite_palanca}`. Se cambia por
 *     `{retreat.startDate}` (que sí resuelve).
 *
 * **Conservadora**: cada UPDATE incluye `WHERE message = '<expected old body>'`
 * — si el usuario editó la plantilla aunque sea un espacio, queda intacta.
 * Reversible (excepto el ALTER TABLE — SQLite no soporta DROP COLUMN sin
 * recreate-table; el rollback se loggea como warning).
 */
export class CommunityMemberOverlayAndTemplateRewrite20260518200000
	implements MigrationInterface
{
	name = 'CommunityMemberOverlayAndTemplateRewrite';
	timestamp = '20260518200000';

	// =========================================================================
	// SECCIÓN 1: Schema — community_member ADD COLUMN x4
	// =========================================================================

	private async addOverlayColumns(queryRunner: QueryRunner): Promise<void> {
		const tableInfo = await queryRunner.query(`PRAGMA table_info("community_member")`);
		const existingColumns = new Set(tableInfo.map((col: any) => col.name));

		if (!existingColumns.has('firstName')) {
			await queryRunner.query(
				`ALTER TABLE "community_member" ADD COLUMN "firstName" varchar(100)`,
			);
		}
		if (!existingColumns.has('lastName')) {
			await queryRunner.query(
				`ALTER TABLE "community_member" ADD COLUMN "lastName" varchar(100)`,
			);
		}
		if (!existingColumns.has('email')) {
			await queryRunner.query(
				`ALTER TABLE "community_member" ADD COLUMN "email" varchar(254)`,
			);
		}
		if (!existingColumns.has('cellPhone')) {
			await queryRunner.query(
				`ALTER TABLE "community_member" ADD COLUMN "cellPhone" varchar(30)`,
			);
		}

		// Partial unique index (communityId, LOWER(email)) WHERE email IS NOT NULL.
		// Defense in depth contra race condition entre dos requests concurrentes
		// que pasen el check de colisión scoped-a-community y persistan el mismo
		// email en dos rows distintas. Solo aplica cuando email overlay no es null.
		await queryRunner.query(
			`CREATE UNIQUE INDEX IF NOT EXISTS "uq_community_member_overlay_email"
			 ON "community_member" ("communityId", LOWER("email"))
			 WHERE "email" IS NOT NULL`,
		);
	}

	// =========================================================================
	// SECCIÓN 2: Normalización mustache → canonical en community templates
	// =========================================================================

	private static readonly MUSTACHE_TO_CANONICAL: Record<string, string> = {
		'{{firstName}}': '{participant.firstName}',
		'{{communityName}}': '{community.name}',
		'{{meetingTitle}}': '{community.meetingTitle}',
		'{{meetingDate}}': '{community.meetingDate}',
		'{{attendanceLink}}': '{community.attendanceLink}',
		'{{requesterName}}': '{community.requesterName}',
		'{{requesterEmail}}': '{community.requesterEmail}',
		'{{requesterPhone}}': '{community.requesterPhone}',
		'{{userEmail}}': '{community.userEmail}',
		'{{acceptUrl}}': '{community.acceptUrl}',
	};

	private static readonly COMMUNITY_TYPES = [
		'COMMUNITY_MEETING_INVITATION',
		'COMMUNITY_MEMBER_APPROVED',
		'COMMUNITY_JOIN_REQUEST_ADMIN',
		'COMMUNITY_LINK_REQUEST_CONFIRM',
	];

	private rewriteMessage(message: string, map: Record<string, string>): string {
		let out = message;
		for (const [from, to] of Object.entries(map)) {
			out = out.split(from).join(to);
		}
		return out;
	}

	private async normalizeCommunityTemplateVars(
		queryRunner: QueryRunner,
		direction: 'up' | 'down',
	): Promise<void> {
		const map =
			direction === 'up'
				? CommunityMemberOverlayAndTemplateRewrite20260518200000.MUSTACHE_TO_CANONICAL
				: Object.fromEntries(
						Object.entries(
							CommunityMemberOverlayAndTemplateRewrite20260518200000.MUSTACHE_TO_CANONICAL,
						).map(([k, v]) => [v, k]),
					);
		const types = CommunityMemberOverlayAndTemplateRewrite20260518200000.COMMUNITY_TYPES;
		const placeholders = types.map(() => '?').join(',');
		const rows: Array<{ id: string; message: string }> = await queryRunner.query(
			`SELECT id, message FROM message_templates
			 WHERE scope = 'community' AND communityId IS NULL AND type IN (${placeholders})`,
			types,
		);
		for (const row of rows) {
			const next = this.rewriteMessage(row.message, map);
			if (next !== row.message) {
				await queryRunner.query(
					`UPDATE message_templates SET message = ?, updatedAt = datetime('now') WHERE id = ?`,
					[next, row.id],
				);
			}
		}
	}

	// =========================================================================
	// SECCIÓN 3: Reescritura de templates con voz cálida
	// =========================================================================

	private static readonly OLD: Record<string, string> = {
		WALKER_WELCOME:
			'<p>¡Hola, <strong>{participant.nickname}</strong>!</p><p>Con mucho gusto confirmamos tu lugar para la experiencia de fin de semana. Todo el equipo organizador está preparando los detalles para recibirte.</p><p><strong>Datos importantes para tu llegada:</strong><br>* <strong>Fecha de encuentro:</strong> {retreat.startDate}<br>* <strong>Hora de llegada:</strong> {retreat.walkerArrivalTime}</p><p>Te pedimos ser puntual para facilitar el registro de todos. ¡Estamos muy contentos de que participes! Nos vemos pronto.</p>',

		SERVER_WELCOME:
			'<p>¡Hermano/a <strong>{participant.nickname}</strong>! ✝️</p><p>¡Gracias por tu "sí" generoso al Señor! Es una verdadera bendición contar contigo en el equipo para preparar el camino a nuestros hermanos caminantes. Tu servicio y tu oración son el corazón de este retiro.</p><p><strong>Información clave para tu servicio:</strong><br>* <strong>Fecha de inicio de misión:</strong> {retreat.startDate}<br>* <strong>Hora de llegada:</strong> {retreat.serverArrivalTimeFriday}</p><p>Que el Señor te ilumine y fortalezca en esta hermosa misión que te encomienda. ¡Unidos en oración y servicio!</p><p>¡Cristo ha resucitado!</p>',

		PRE_RETREAT_REMINDER:
			'<p>¡Hola, <strong>{participant.nickname}</strong>!</p><p>¡Ya falta muy poco para el inicio de la experiencia! Estamos preparando los últimos detalles para recibirte.</p><p><strong>Te recordamos algunos puntos importantes:</strong><br>* <strong>Fecha:</strong> {retreat.startDate}<br>* <strong>Hora de llegada:</strong> {retreat.walkerArrivalTime} (caminantes) / {retreat.serverArrivalTimeFriday} (servidores)<br>* <strong>Lugar de encuentro:</strong> {participant.pickupLocation}</p><p><strong>Sugerencias sobre qué llevar:</strong><br>{retreat.thingsToBringNotes}</p><p>Ven con la mente abierta y sin expectativas, ¡prepárate para un fin de semana diferente!</p><p>Un saludo.</p>',

		PAYMENT_REMINDER:
			'<p>Hola <strong>{participant.nickname}</strong>, ¿cómo estás?</p><p>Te escribimos del equipo de organización. Para poder cerrar los detalles administrativos, te recordamos que está pendiente tu aporte de <strong>{retreat.cost}</strong>.</p><p>Aquí te dejamos la información para realizarlo:<br>{retreat.paymentInfo}</p><p>Si ya lo realizaste, por favor ignora este mensaje. Si tienes alguna dificultad, no dudes en contactarnos con toda confianza. ¡Tu presencia es lo más importante!</p><p>Saludos.</p>',

		POST_RETREAT_MESSAGE:
			'<p>¡Bienvenido a tu Cuarto Día, <strong>{participant.nickname}</strong>! 🎉</p><p>¡Cristo ha resucitado! ¡En verdad ha resucitado!</p><p>El retiro ha terminado, pero tu verdadero camino apenas comienza. Jesús resucitado camina contigo, no lo olvides nunca. La comunidad de Emaús está aquí para apoyarte.</p><p>Te esperamos en nuestras reuniones de perseverancia para seguir creciendo juntos en la fe. La próxima es el <strong>{retreat.next_meeting_date}</strong>.</p><p>¡Ánimo, peregrino! Un fuerte abrazo.</p>',

		CANCELLATION_CONFIRMATION:
			'<p>Hola, <strong>{participant.nickname}</strong>.</p><p>Hemos recibido tu notificación de cancelación. Lamentamos que no puedas acompañarnos en esta ocasión y esperamos que te encuentres bien.</p><p>Las puertas siempre estarán abiertas para cuando sea el momento adecuado para ti. Te enviamos nuestros mejores deseos.</p><p>Un saludo cordial.</p>',

		EMERGENCY_CONTACT_VALIDATION:
			'<p>Hola <strong>{participant.nickname}</strong>, esperamos que estés muy bien.</p><p>Estamos preparando todos los detalles para que tu fin de semana sea seguro. Para ello, necesitamos validar un dato importante.</p><p><strong>Contacto de Emergencia Registrado:</strong><br>* <strong>Nombre:</strong> {participant.emergencyContact1Name}<br>* <strong>Teléfono:</strong> {participant.emergencyContact1CellPhone}</p><p>Por favor, ayúdanos respondiendo a este mensaje con la palabra <strong>CONFIRMADO</strong> si los datos son correctos. Si hay algún error, simplemente envíanos la información correcta.</p><p>¡Muchas gracias por tu ayuda!</p>',

		PALANCA_REQUEST:
			'<p>¡Hola, hermano/a <strong>{participant.nickname}</strong>! ✨</p><p>Te invitamos a ser parte del motor espiritual de este retiro. Tu <strong>palanca</strong> es mucho más que una carta: es una oración hecha palabra, un tesoro de amor y ánimo para un caminante que la recibirá como un regalo del cielo en el momento justo.</p><p>El Señor quiere usar tus manos para escribir un mensaje que toque un corazón.</p><p>* <strong>Fecha límite para enviar tu palanca:</strong> {retreat.fecha_limite_palanca}</p><p>Que el Espíritu Santo inspire cada una de tus palabras. ¡Contamos contigo y con tu oración!</p>',

		PALANCA_REMINDER:
			'<p>¡Paz y Bien, <strong>{participant.nickname}</strong>! 🙏</p><p>Este es un recordatorio amistoso y lleno de cariño. Un caminante está esperando esas palabras de aliento que el Señor ha puesto en tu corazón; esa oración que solo tú puedes escribirle. ¡No dejes pasar la oportunidad de ser luz en su camino!</p><p>* <strong>La fecha límite para enviar tu palanca es el:</strong> {retreat.startDate}</p><p>Gracias por tu generosidad y por sostener este retiro con tu oración.</p>',

		PALANQUERO_NEW_WALKER:
			'<p>¡Hola!</p>\n<p>Se ha registrado un nuevo caminante en el retiro <strong>{retreat.parish}</strong>.</p>\n<p><strong>Datos del caminante:</strong></p>\n<ul>\n<li>Nombre: {participant.firstName} {participant.lastName}</li>\n<li>Email: {participant.email}</li>\n<li>Teléfono: {participant.cellPhone}</li>\n<li>Invitado por: {participant.invitedBy}</li>\n</ul>',

		BIRTHDAY_MESSAGE:
			'<p>¡Feliz cumpleaños, <strong>{participant.nickname}</strong>! 🎂🎉</p><p>Que este día tan especial esté lleno de alegría, bendiciones y momentos inolvidables junto a tus seres queridos.</p><p>Que Dios te conceda muchos años más de vida, salud y felicidad. Que cada nuevo año que comiences esté lleno de sueños cumplidos y metas alcanzadas.</p><p>La comunidad de Emaús te envía nuestros mejores deseos en tu cumpleaños. ¡Que tengas un día maravilloso!</p><p>Un abrazo fuerte y ¡feliz cumpleaños!</p>',

		GENERAL:
			'<p>Hola <strong>{participant.nickname}</strong>, te escribimos de parte del equipo del Retiro de Emaús.</p><p>{custom_message}</p><p>Que tengas un día muy bendecido. Te tenemos presente en nuestras oraciones.</p><p>Un abrazo en Cristo Resucitado.</p>',

		WALKER_FOLLOWUP_WEEK_1: `<h2>Hola {participant.firstName}</h2>
<p>Ya pasó una semana desde que terminaste tu retiro de Emaús. ¿Cómo te sientes en este nuevo cuarto día?</p>
<p>Recuerda que no estás solo. Tu comunidad de retiro y los servidores estamos pendientes de ti. Te recomendamos:</p>
<ul>
  <li>Mantener tus oraciones diarias.</li>
  <li>Conectar con los caminantes de tu mesa, si aún no lo has hecho.</li>
  <li>Asistir a la primera reunión de tu comunidad de Emaús.</li>
</ul>
<p>Si necesitas hablar con alguien o tienes dudas, escríbenos. Estamos aquí.</p>
<p>De Cristo Resucitado, ¡siempre!</p>`,

		WALKER_FOLLOWUP_MONTH_1: `<h2>{participant.firstName}, ¿cómo va tu cuarto día?</h2>
<p>Ha pasado un mes desde tu retiro. Es normal que la "burbuja" del retiro vaya bajando — es justamente ahora cuando empieza el verdadero cuarto día.</p>
<p>Algunas señales de que vas bien:</p>
<ul>
  <li>Sigues orando, aunque sea poco.</li>
  <li>Te conectas con tu comunidad o con tus compañeros de mesa.</li>
  <li>Vas notando pequeños cambios en cómo respondes a los demás.</li>
</ul>
<p>Si alguno te falta, está bien — pídelo de nuevo. La gracia se renueva cuando se pide. ¿Te gustaría que conversemos?</p>
<p>De Cristo Resucitado, ¡siempre!</p>`,

		WALKER_FOLLOWUP_MONTH_3: `<h2>{participant.firstName}, tres meses ya</h2>
<p>Tres meses desde tu retiro de Emaús. Para muchos, este es el punto donde el entusiasmo inicial baja y aparecen las preguntas reales: <em>¿esto es para mí?, ¿cómo lo llevo en mi día a día?, ¿con quién comparto el camino?</em></p>
<p>Buenas noticias: es exactamente para eso que existe la <strong>comunidad</strong>. Te invitamos a:</p>
<ul>
  <li>Asistir a la próxima reunión de tu comunidad — con o sin entusiasmo.</li>
  <li>Pensar si te gustaría servir en un próximo retiro como servidor.</li>
  <li>Invitar a alguien cercano a hacer su retiro.</li>
</ul>
<p>Cuéntanos cómo va. Nos importa.</p>
<p>De Cristo Resucitado, ¡siempre!</p>`,

		WALKER_FOLLOWUP_MONTH_6: `<h2>{participant.firstName}, medio año de tu retiro</h2>
<p>Han pasado 6 meses. ¿Recuerdas cómo te sentiste el último día del retiro? Vale la pena volver a esa imagen de vez en cuando — es buen termómetro.</p>
<p>Después de medio año, los caminantes que seguimos de cerca suelen necesitar dos cosas:</p>
<ol>
  <li><strong>Volver a contar la experiencia.</strong> Hablar con alguien que también lo vivió ayuda a no perderlo.</li>
  <li><strong>Servir.</strong> El siguiente retiro está cerca y tú podrías ser parte. Servir consolida lo que recibiste.</li>
</ol>
<p>Si te animas a alguno de los dos, escríbenos. Si necesitas espacio, también está bien — solo no te pierdas del todo.</p>
<p>De Cristo Resucitado, ¡siempre!</p>`,

		WALKER_FOLLOWUP_YEAR_1: `<h2>¡Feliz aniversario, {participant.firstName}!</h2>
<p>Hace un año hiciste tu retiro de Emaús. Es una fecha que vale la pena agradecer: hoy eres distinto a quien fue al retiro hace 12 meses, aunque a veces no se note.</p>
<p>Para celebrar este aniversario te proponemos:</p>
<ul>
  <li>Tomarte 10 minutos hoy para agradecer en oración.</li>
  <li>Escribirle a un compañero de mesa para saber cómo está.</li>
  <li>Pensar a quién podrías invitar al próximo retiro — ese paso suele cambiarle la vida a alguien.</li>
</ul>
<p>Si quieres servir, hablar, regresar o simplemente saludar, aquí estamos. Tu comunidad te espera.</p>
<p>De Cristo Resucitado, ¡siempre!</p>`,

		WALKER_REUNION_INVITATION: `<h2>{participant.firstName}, te esperamos</h2>
<p>Estás invitado a la próxima reunión de tu comunidad de Emaús. Es un espacio sencillo, en confianza, para compartir, orar juntos y caminar acompañados.</p>
<p>No necesitas haber estado en las reuniones anteriores. No necesitas tener nada preparado. Solo ven.</p>
<p>Si tienes alguna duda sobre fecha, lugar u horario, escríbenos y te confirmamos.</p>
<p>Hasta pronto.</p>
<p>De Cristo Resucitado, ¡siempre!</p>`,

		// Community templates: OLD ya en formato canonical (post-normalización).
		// La sección 2 se ejecuta ANTES de la 3, así que para el momento en que
		// hagamos match de community templates aquí, ya estarán en canonical.
		COMMUNITY_MEETING_INVITATION:
			'Hola {participant.firstName},\n\nHay una nueva reunión programada en {community.name}: {community.meetingTitle} el {community.meetingDate}.\n\nConfirma tu asistencia: {community.attendanceLink}\n\nRetiros Emaús',

		COMMUNITY_MEMBER_APPROVED:
			'¡Bienvenido a {community.name}, {participant.firstName}!\n\nLos coordinadores aprobaron tu solicitud. Ya formas parte de la comunidad. Te enviaremos avisos cuando haya reuniones próximas.\n\nRetiros Emaús',

		COMMUNITY_JOIN_REQUEST_ADMIN:
			'Nueva solicitud de unión a {community.name}\n\nNombre: {community.requesterName}\nEmail: {community.requesterEmail}\nTeléfono: {community.requesterPhone}\n\nEl nuevo miembro fue agregado con estado pendiente de verificación.',

		COMMUNITY_LINK_REQUEST_CONFIRM:
			'Alguien creó una cuenta usando el correo {community.userEmail} — el mismo registrado como contacto de {community.name}. Si fuiste tú, acepta el acceso: {community.acceptUrl}. Si no, ignora este correo.',

		FAMILY_CLOSING_INVITATION_EMAIL: `<h2>Te invitamos a la Misa de Clausura</h2>
<p>Hola,</p>
<p>Con mucho cariño te invitamos a la <strong>Misa de Clausura</strong> del retiro de <strong>{retreat.parish}</strong>.</p>
<ul>
  <li><strong>Fecha:</strong> {retreat.endDate}</li>
  <li><strong>Iglesia:</strong> {retreat.closingChurchName}</li>
  <li><strong>Dirección:</strong> {retreat.closingChurchAddress}</li>
</ul>
<p>
  <a href="{retreat.closingChurchMapsUrl}">Abrir en Maps</a> &nbsp;·&nbsp;
  <a href="{retreat.closingChurchWazeUrl}">Abrir en Waze</a>
</p>
<p>¡Te esperamos!</p>`,

		FAMILY_CLOSING_INVITATION_WHATSAPP: `Hola, queremos invitarte con mucho cariño a la *Misa de Clausura* del retiro de *{retreat.parish}*.

📅 {retreat.endDate}
⛪ {retreat.closingChurchName}
📍 {retreat.closingChurchAddress}

🗺️ Cómo llegar (Maps): {retreat.closingChurchMapsUrl}
🚗 En Waze: {retreat.closingChurchWazeUrl}

¡Te esperamos! 🙏`,
	};

	private static readonly NEW: Record<string, string> = {
		WALKER_WELCOME: `<p>{participant.nickname}, qué gusto saber que vienes.</p>
<p>Ya quedó apartado tu lugar para el retiro. Estamos preparando todo con cariño para recibirte.</p>
<p>Para que lo tengas a la mano:</p>
<ul>
  <li><strong>Fecha:</strong> {retreat.startDate}</li>
  <li><strong>Hora de llegada:</strong> {retreat.walkerArrivalTime}</li>
</ul>
<p>Te pedimos llegar puntual para que el registro fluya. Ven sin expectativas — el resto lo pone el Señor.</p>
<p>Nos vemos pronto.</p>`,

		SERVER_WELCOME: `<p>{participant.nickname}, gracias por decir "sí" en este retiro.</p>
<p>Tu servicio y tu oración son lo que sostiene el fin de semana. Estamos contentos de tenerte en el equipo.</p>
<p>Datos para tu llegada:</p>
<ul>
  <li><strong>Inicio:</strong> {retreat.startDate}</li>
  <li><strong>Hora:</strong> {retreat.serverArrivalTimeFriday}</li>
</ul>
<p>Que el Señor te dé fuerza y luz. Nos vemos pronto.</p>
<p>¡Cristo ha resucitado!</p>`,

		PRE_RETREAT_REMINDER: `<p>Ya casi, {participant.nickname}.</p>
<p>Falta poco para tu retiro. Te recordamos lo importante:</p>
<ul>
  <li><strong>Fecha:</strong> {retreat.startDate}</li>
  <li><strong>Hora de llegada:</strong> {retreat.walkerArrivalTime} (caminantes) · {retreat.serverArrivalTimeFriday} (servidores)</li>
  <li><strong>Lugar de encuentro:</strong> {participant.pickupLocation}</li>
</ul>
<p><strong>Qué llevar:</strong><br>{retreat.thingsToBringNotes}</p>
<p>Ven ligero y sin expectativas. Nos vemos pronto.</p>`,

		PAYMENT_REMINDER: `<p>Hola {participant.nickname}, ¿cómo vas?</p>
<p>Solo un recordatorio: tu aporte de <strong>{retreat.cost}</strong> aún está pendiente. La cuota nos ayuda a cubrir hospedaje, comidas y los materiales del retiro.</p>
<p>Aquí los datos:<br>{retreat.paymentInfo}</p>
<p>Si ya lo hiciste, pasa por alto este mensaje. Y si tienes alguna dificultad, escríbenos con confianza — tu presencia importa más que la cuota.</p>`,

		POST_RETREAT_MESSAGE: `<p>{participant.nickname}, ¡felicidades por tu Cuarto Día!</p>
<p>¡Cristo ha resucitado! Apenas empieza el camino bueno.</p>
<p>Lo que viviste no se queda atrás. La gracia del retiro la sigues recibiendo en el día a día — en tu oración, en cómo tratas a los tuyos, en lo que decides perdonar.</p>
<p>Te esperamos en la próxima reunión de perseverancia: <strong>{retreat.next_meeting_date}</strong>.</p>
<p>Un abrazo fuerte, peregrino.</p>`,

		CANCELLATION_CONFIRMATION: `<p>Hola {participant.nickname},</p>
<p>Recibimos tu aviso de cancelación. Una pena que no puedas venir esta vez — quedamos con la espera de tenerte en otro momento.</p>
<p>Cuídate mucho. Aquí estamos cuando sea el tiempo.</p>`,

		EMERGENCY_CONTACT_VALIDATION: `<p>Hola {participant.nickname}, todo bien por aquí.</p>
<p>Antes del retiro queremos confirmar contigo un dato importante: tu contacto de emergencia.</p>
<p><strong>Lo que tenemos registrado:</strong></p>
<ul>
  <li><strong>Nombre:</strong> {participant.emergencyContact1Name}</li>
  <li><strong>Teléfono:</strong> {participant.emergencyContact1CellPhone}</li>
</ul>
<p>Si está correcto, respóndenos <strong>CONFIRMADO</strong>. Si algo cambió, mándanos los datos nuevos.</p>
<p>Gracias por la ayuda.</p>`,

		// PALANCA_REQUEST: NEW directamente con {retreat.startDate} (incorpora el
		// fix de la antigua migration 20260518181652 — saltamos el paso intermedio
		// con {retreat.fecha_limite_palanca}).
		PALANCA_REQUEST: `<p>Hola {participant.nickname}, ¡paz y bien!</p>
<p>Te invitamos a escribir una <strong>palanca</strong> para uno de los caminantes del próximo retiro. No es una carta cualquiera: es una oración convertida en palabras, algo que el caminante leerá en un momento clave del fin de semana.</p>
<p>No te preocupes porque suene "bonita" — el Señor usa lo simple. Cuenta lo que Él te haya puesto en el corazón.</p>
<p><strong>La palanca debe llegar antes del inicio del retiro:</strong> {retreat.startDate}.</p>
<p>Gracias por sostener este retiro con tu oración. Contamos contigo.</p>`,

		PALANCA_REMINDER: `<p>Hola {participant.nickname}, ¡paz y bien!</p>
<p>Un recordatorio cariñoso: la fecha límite para tu palanca es <strong>{retreat.startDate}</strong>.</p>
<p>Hay un caminante esperando tus palabras. No necesita un texto largo ni perfecto — solo lo que el Señor te haya puesto en el corazón para él.</p>
<p>Gracias por acompañar este retiro con tu oración.</p>`,

		PALANQUERO_NEW_WALKER: `<p>Hola,</p>
<p>Se registró un caminante nuevo en el retiro de <strong>{retreat.parish}</strong>.</p>
<ul>
  <li><strong>Nombre:</strong> {participant.firstName} {participant.lastName}</li>
  <li><strong>Email:</strong> {participant.email}</li>
  <li><strong>Teléfono:</strong> {participant.cellPhone}</li>
  <li><strong>Invitado por:</strong> {participant.invitedBy}</li>
</ul>
<p>Si quieres, escríbele primero a su invitador para conocer un poco la historia antes de contactarlo. Gracias por tu servicio.</p>`,

		BIRTHDAY_MESSAGE: `<p>¡Feliz cumpleaños, {participant.nickname}!</p>
<p>Que este día venga con gente buena, momentos sencillos y mucha paz. Y que sigas notando, en lo de todos los días, la cercanía del Señor.</p>
<p>Un abrazo de tus hermanos. ¡Que tengas un día bonito!</p>`,

		GENERAL: `<p>Hola {participant.nickname},</p>
<p>{custom_message}</p>
<p>Un abrazo.</p>`,

		WALKER_FOLLOWUP_WEEK_1: `<h2>{participant.firstName}, ¿cómo va la semana?</h2>
<p>Ya pasó una semana desde tu retiro. Ahora viene el Cuarto Día — y suele ser donde empieza a notarse de verdad lo que recibiste.</p>
<p>Tres cosas para esta semana:</p>
<ul>
  <li>Mantener algo de oración diaria, aunque sea cinco minutos.</li>
  <li>Escribirle a alguien de tu mesa, aunque sea solo para saludar.</li>
  <li>Apartar la fecha de la primera reunión del grupo — esa red es la que va a sostenerte.</li>
</ul>
<p>Si necesitas hablar, escríbenos. Aquí estamos.</p>
<p>De Cristo Resucitado, ¡siempre!</p>`,

		WALKER_FOLLOWUP_MONTH_1: `<h2>{participant.firstName}, primer mes del Cuarto Día</h2>
<p>Ha pasado un mes. Es normal que el "subidón" del retiro vaya bajando — justo ahora empieza lo bueno: el Cuarto Día real, no el del fin de semana.</p>
<p>Pregunta honesta: ¿sigues orando, aunque sea poco? ¿Te conectaste con alguien de la mesa? ¿Has notado pequeños cambios en cómo respondes a los tuyos?</p>
<p>Si algo de eso te falta, no pasa nada: se pide otra vez. La gracia se renueva cuando se busca.</p>
<p>¿Conversamos un día?</p>
<p>De Cristo Resucitado, ¡siempre!</p>`,

		WALKER_FOLLOWUP_MONTH_3: `<h2>{participant.firstName}, ya van tres meses</h2>
<p>A los tres meses del retiro suelen aparecer las preguntas reales: <em>¿esto era para mí?, ¿cómo lo llevo en lo cotidiano?, ¿con quién camino?</em></p>
<p>Justo para eso existe el grupo. Te invitamos a:</p>
<ul>
  <li>Volver a la próxima reunión — aunque vayas sin ganas.</li>
  <li>Pensar si te animas a servir en el próximo retiro.</li>
  <li>Pensar en alguien a quien podrías invitar — a veces ese paso le cambia la vida.</li>
</ul>
<p>Cuéntanos cómo vas. Nos importa.</p>
<p>De Cristo Resucitado, ¡siempre!</p>`,

		WALKER_FOLLOWUP_MONTH_6: `<h2>{participant.firstName}, medio año ya</h2>
<p>Seis meses desde tu retiro. ¿Recuerdas cómo te sentiste el domingo del cierre? A veces vale la pena volver a esa imagen — es un buen termómetro.</p>
<p>A los seis meses suelen ayudarte dos cosas:</p>
<ol>
  <li><strong>Volver a contarlo</strong> — hablar con alguien que también lo vivió ayuda a no perder el hilo.</li>
  <li><strong>Servir</strong> — el siguiente retiro está cerca. Servir consolida lo que recibiste.</li>
</ol>
<p>Si te animas, escríbenos. Y si necesitas espacio también está bien — solo no te pierdas del todo.</p>
<p>De Cristo Resucitado, ¡siempre!</p>`,

		WALKER_FOLLOWUP_YEAR_1: `<h2>¡Feliz aniversario, {participant.firstName}!</h2>
<p>Hace un año hiciste tu retiro de Emaús. Es una fecha que vale la pena agradecer: hoy eres distinto a quien fue al retiro hace 12 meses, aunque a veces no se note.</p>
<p>Tres ideas para hoy:</p>
<ul>
  <li>Diez minutos de oración para agradecer.</li>
  <li>Escribirle a un compañero de mesa.</li>
  <li>Pensar a quién podrías invitar al próximo retiro.</li>
</ul>
<p>Si quieres servir, hablar, regresar o simplemente saludar, aquí estamos. Tu grupo te espera.</p>
<p>De Cristo Resucitado, ¡siempre!</p>`,

		WALKER_REUNION_INVITATION: `<h2>{participant.firstName}, te esperamos</h2>
<p>Te escribimos del grupo de <strong>{community.name}</strong>. Tenemos próxima reunión y queremos contar contigo.</p>
<p>Es un espacio sencillo, sin protocolo: para compartir cómo va el Cuarto Día, orar juntos y caminar acompañados.</p>
<p>No importa si has fallado a las anteriores. No necesitas preparar nada. Solo ven.</p>
<p>Si quieres confirmar fecha, hora o lugar, escríbenos.</p>
<p>De Cristo Resucitado, ¡siempre!</p>`,

		COMMUNITY_MEETING_INVITATION: `Hola {participant.firstName},

Te escribimos del grupo de {community.name}. Tenemos próxima reunión:

📌 {community.meetingTitle}
🗓️ {community.meetingDate}

Si vas a venir, ayúdanos confirmando aquí: {community.attendanceLink}

¡Te esperamos!`,

		COMMUNITY_MEMBER_APPROVED: `¡Bienvenido(a) a {community.name}, {participant.firstName}!

Los coordinadores aceptaron tu solicitud y ya formas parte del grupo. Te avisaremos cuando haya próxima reunión.

Cualquier duda, nos escribes.

Un abrazo.`,

		COMMUNITY_JOIN_REQUEST_ADMIN: `Nueva solicitud para unirse a {community.name}

Nombre: {community.requesterName}
Email: {community.requesterEmail}
Teléfono: {community.requesterPhone}

Quedó registrado como miembro pendiente de verificación. Cuando puedan, le marcan o le escriben para conocerlo.`,

		COMMUNITY_LINK_REQUEST_CONFIRM: `Hola,

Alguien creó una cuenta en Retiros Emaús usando {community.userEmail} — el mismo correo registrado como contacto de {community.name}.

Si fuiste tú, confirma el acceso aquí: {community.acceptUrl}

Si no fuiste tú, simplemente ignora este mensaje.`,

		FAMILY_CLOSING_INVITATION_EMAIL: `<h2>Misa de Clausura del retiro</h2>
<p>Hola,</p>
<p>Te invitamos con mucho cariño a la <strong>Misa de Clausura</strong> del retiro de Emaús de <strong>{retreat.parish}</strong>. Es el momento donde cerramos el fin de semana en familia.</p>
<ul>
  <li><strong>Fecha:</strong> {retreat.endDate}</li>
  <li><strong>Iglesia:</strong> {retreat.closingChurchName}</li>
  <li><strong>Dirección:</strong> {retreat.closingChurchAddress}</li>
</ul>
<p>
  <a href="{retreat.closingChurchMapsUrl}">Abrir en Google Maps</a> &nbsp;·&nbsp;
  <a href="{retreat.closingChurchWazeUrl}">Abrir en Waze</a>
</p>
<p>Tu presencia significa muchísimo para tu hermano(a). Ahí nos vemos.</p>`,

		FAMILY_CLOSING_INVITATION_WHATSAPP: `Hola, te invitamos con mucho cariño a la *Misa de Clausura* del retiro de Emaús de *{retreat.parish}*. Es donde cerramos el fin de semana en familia.

🗓️ {retreat.endDate}
⛪ {retreat.closingChurchName}
📍 {retreat.closingChurchAddress}

Cómo llegar:
• Google Maps: {retreat.closingChurchMapsUrl}
• Waze: {retreat.closingChurchWazeUrl}

Tu presencia significa mucho para él/ella. ¡Ahí nos vemos!`,
	};

	private async swapTemplateBodies(
		queryRunner: QueryRunner,
		direction: 'up' | 'down',
	): Promise<void> {
		const types = Object.keys(
			CommunityMemberOverlayAndTemplateRewrite20260518200000.OLD,
		);
		for (const type of types) {
			const from =
				direction === 'up'
					? CommunityMemberOverlayAndTemplateRewrite20260518200000.OLD[type]
					: CommunityMemberOverlayAndTemplateRewrite20260518200000.NEW[type];
			const to =
				direction === 'up'
					? CommunityMemberOverlayAndTemplateRewrite20260518200000.NEW[type]
					: CommunityMemberOverlayAndTemplateRewrite20260518200000.OLD[type];

			// global_message_templates — solo si body todavía matchea el seed.
			await queryRunner.query(
				`UPDATE global_message_templates
				 SET message = ?, updatedAt = datetime('now')
				 WHERE type = ? AND message = ?`,
				[to, type, from],
			);

			// message_templates — copias per-retreat + community-globals.
			await queryRunner.query(
				`UPDATE message_templates
				 SET message = ?, updatedAt = datetime('now')
				 WHERE type = ? AND message = ?`,
				[to, type, from],
			);
		}
	}

	// =========================================================================
	// up / down
	// =========================================================================

	public async up(queryRunner: QueryRunner): Promise<void> {
		// 1. Schema: agregar columnas de overlay
		await this.addOverlayColumns(queryRunner);

		// 2. Normalizar variables mustache → canonical en community templates
		//    (debe ejecutarse ANTES de swapTemplateBodies porque los OLD bodies
		//    de COMMUNITY_* en swapTemplateBodies están en canonical).
		await this.normalizeCommunityTemplateVars(queryRunner, 'up');

		// 3. Reescribir bodies con voz cálida (incluye fix de phantom var en
		//    PALANCA_REQUEST como parte del NEW — saltamos el paso intermedio).
		await this.swapTemplateBodies(queryRunner, 'up');
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Reversa estricta del up().

		// 3. Revertir bodies a la versión original (fría)
		await this.swapTemplateBodies(queryRunner, 'down');

		// 2. Revertir community templates a mustache
		await this.normalizeCommunityTemplateVars(queryRunner, 'down');

		// 1a. Sí podemos revertir el unique index (SQLite sí soporta DROP INDEX).
		await queryRunner.query(`DROP INDEX IF EXISTS "uq_community_member_overlay_email"`);

		// 1b. SQLite no soporta DROP COLUMN sin recreate-table. Rollback de
		//     schema requeriría copiar la tabla — la regla del proyecto es
		//     evitar ese patrón cuando no es estrictamente necesario.
		console.warn(
			'[CommunityMemberOverlayAndTemplateRewrite] Rollback de columnas firstName/lastName/email/cellPhone no implementado — SQLite no permite DROP COLUMN directamente.',
		);
	}
}
