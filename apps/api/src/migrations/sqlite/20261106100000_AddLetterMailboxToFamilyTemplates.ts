import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cartas de familias (specs/letters-email): informa el buzón
 * `carta.{CODE}@emaus.cc` de cada caminante en las plantillas de cara a
 * familia, vía la variable nueva `{participant.letterMailbox}` (hidratada
 * desde retreat_participants en participantRetreatHydration + el listado).
 *
 * Plantillas tocadas (globals + sus clones por retiro, mismo texto):
 *  - WALKER_WELCOME, PRE_RETREAT_REMINDER, WALKER_CONFIRMATION: línea de
 *    "cartas de tu familia" junto a fecha/llegada.
 *  - PALANCA_REQUEST, PALANCA_REMINDER: el canal de entrega de la palanca
 *    pasa a ser el buzón del caminante (antes solo el correo compartido de
 *    palancas).
 *  - PALANCA_DEFINITION: el buzón personal como canal primario; el correo
 *    compartido queda de respaldo.
 *  - FAMILY_CLOSING_INVITATION_WHATSAPP/EMAIL: línea de cartas.
 *
 * Patrón conservador de la casa (20260914120000 / 20251025181628): solo
 * actualiza cuando `message` coincide EXACTO con el texto seed vigente; las
 * plantillas personalizadas por la comunidad no se tocan. Idempotente: con el
 * texto nuevo ya no matchea el viejo. `down()` revierte con los mismos guards.
 */
export class AddLetterMailboxToFamilyTemplates20261106100000 implements MigrationInterface {
	name = 'AddLetterMailboxToFamilyTemplates20261106100000';
	timestamp = '20261106100000';

	/** [type, texto viejo, texto nuevo] — corre sobre globals Y clones por retiro. */
	private static readonly UPDATES: { type: string; from: string; to: string }[] = [
		{
			type: 'WALKER_WELCOME',
			from: `{participant.nickname}, qué gusto saber que vienes al retiro 🙏

Ya quedó apartado tu lugar. Estamos preparando todo con cariño para recibirte.

Para que lo tengas a la mano:
📅 {retreat.startDate}
⏰ Llegada: {retreat.walkerArrivalTime}

Te pedimos llegar puntual para que el registro fluya. Ven sin expectativas: el resto lo pone el Señor.

Nos vemos pronto.`,
			to: `{participant.nickname}, qué gusto saber que vienes al retiro 🙏

Ya quedó apartado tu lugar. Estamos preparando todo con cariño para recibirte.

Para que lo tengas a la mano:
📅 {retreat.startDate}
⏰ Llegada: {retreat.walkerArrivalTime}

💌 ¿Quieres que le lleguen cartas? Tu familia puede escribirlas a {participant.letterMailbox} y las entregamos impresas durante el retiro.

Te pedimos llegar puntual para que el registro fluya. Ven sin expectativas: el resto lo pone el Señor.

Nos vemos pronto.`,
		},
		{
			type: 'WALKER_WELCOME',
			from: `<p>{participant.nickname}, qué gusto saber que vienes.</p>
<p>Ya quedó apartado tu lugar para el retiro. Estamos preparando todo con cariño para recibirte.</p>
<p>Para que lo tengas a la mano:</p>
<ul>
  <li><strong>Fecha:</strong> {retreat.startDate}</li>
  <li><strong>Hora de llegada:</strong> {retreat.walkerArrivalTime}</li>
</ul>
<p>Te pedimos llegar puntual para que el registro fluya. Ven sin expectativas — el resto lo pone el Señor.</p>
<p>Nos vemos pronto.</p>`,
			to: `<p>{participant.nickname}, qué gusto saber que vienes.</p>
<p>Ya quedó apartado tu lugar para el retiro. Estamos preparando todo con cariño para recibirte.</p>
<p>Para que lo tengas a la mano:</p>
<ul>
  <li><strong>Fecha:</strong> {retreat.startDate}</li>
  <li><strong>Hora de llegada:</strong> {retreat.walkerArrivalTime}</li>
  <li><strong>Cartas de tu familia:</strong> pueden enviarlas a {participant.letterMailbox} y las entregamos impresas durante el retiro.</li>
</ul>
<p>Te pedimos llegar puntual para que el registro fluya. Ven sin expectativas — el resto lo pone el Señor.</p>
<p>Nos vemos pronto.</p>`,
		},
		{
			type: 'PRE_RETREAT_REMINDER',
			from: `Ya casi, {participant.nickname} 🙌

Falta poco para tu retiro. Lo importante:

📅 {retreat.startDate}
⏰ Llegada: {retreat.walkerArrivalTime} (caminantes) · {retreat.serverArrivalTimeFriday} (servidores)
📍 Encuentro: {participant.pickupLocation}

🎒 *Qué llevar:*
{retreat.thingsToBringNotes}

Ven ligero y sin expectativas. Nos vemos pronto.`,
			to: `Ya casi, {participant.nickname} 🙌

Falta poco para tu retiro. Lo importante:

📅 {retreat.startDate}
⏰ Llegada: {retreat.walkerArrivalTime} (caminantes) · {retreat.serverArrivalTimeFriday} (servidores)
📍 Encuentro: {participant.pickupLocation}

💌 Las cartas de tu familia pueden enviarse a {participant.letterMailbox} — las imprimimos y las entregamos durante el retiro.

🎒 *Qué llevar:*
{retreat.thingsToBringNotes}

Ven ligero y sin expectativas. Nos vemos pronto.`,
		},
		{
			type: 'PRE_RETREAT_REMINDER',
			from: `<p>Ya casi, {participant.nickname}.</p>
<p>Falta poco para tu retiro. Te recordamos lo importante:</p>
<ul>
  <li><strong>Fecha:</strong> {retreat.startDate}</li>
  <li><strong>Hora de llegada:</strong> {retreat.walkerArrivalTime} (caminantes) · {retreat.serverArrivalTimeFriday} (servidores)</li>
  <li><strong>Lugar de encuentro:</strong> {participant.pickupLocation}</li>
</ul>
<p><strong>Qué llevar:</strong><br>{retreat.thingsToBringNotes}</p>
<p>Ven ligero y sin expectativas. Nos vemos pronto.</p>`,
			to: `<p>Ya casi, {participant.nickname}.</p>
<p>Falta poco para tu retiro. Te recordamos lo importante:</p>
<ul>
  <li><strong>Fecha:</strong> {retreat.startDate}</li>
  <li><strong>Hora de llegada:</strong> {retreat.walkerArrivalTime} (caminantes) · {retreat.serverArrivalTimeFriday} (servidores)</li>
  <li><strong>Lugar de encuentro:</strong> {participant.pickupLocation}</li>
  <li><strong>Cartas de tu familia:</strong> pueden enviarse a {participant.letterMailbox} — las imprimimos y las entregamos durante el retiro.</li>
</ul>
<p><strong>Qué llevar:</strong><br>{retreat.thingsToBringNotes}</p>
<p>Ven ligero y sin expectativas. Nos vemos pronto.</p>`,
		},
		{
			type: 'WALKER_CONFIRMATION',
			from: `Hola, ¿hablo con {participant.firstName}? 🙂

Te escribo de parte del Retiro de Emaús de {retreat.parish}, para confirmar tu asistencia y darte la bienvenida.

*¿Contamos contigo este fin de semana?*

Recuerda llevar:
🎒 {retreat.thingsToBringNotes}

Es importante que llegues directamente a la casa de retiro, a más tardar a las *{retreat.walkerArrivalTime}*. No hay transporte organizado y, de preferencia, que alguien te lleve porque no hay estacionamiento.

¿Sabes cómo llegar o te paso la dirección?

Cualquier duda, aquí estoy para apoyarte. Nos vemos el fin de semana. ¡Que Dios te bendiga! 🙏`,
			to: `Hola, ¿hablo con {participant.firstName}? 🙂

Te escribo de parte del Retiro de Emaús de {retreat.parish}, para confirmar tu asistencia y darte la bienvenida.

*¿Contamos contigo este fin de semana?*

Recuerda llevar:
🎒 {retreat.thingsToBringNotes}

Es importante que llegues directamente a la casa de retiro, a más tardar a las *{retreat.walkerArrivalTime}*. No hay transporte organizado y, de preferencia, que alguien te lleve porque no hay estacionamiento.

Un detalle: si tu familia quiere mandarte cartas durante el retiro, puede enviarlas a {participant.letterMailbox} y te las entregamos impresas.

¿Sabes cómo llegar o te paso la dirección?

Cualquier duda, aquí estoy para apoyarte. Nos vemos el fin de semana. ¡Que Dios te bendiga! 🙏`,
		},
		{
			type: 'WALKER_CONFIRMATION',
			from: `<p>Hola, ¿hablo con {participant.firstName}? Te escribo de parte del Retiro de Emaús de {retreat.parish}.</p>
<p>Te contacto para confirmar tu asistencia y darte la bienvenida. ¿Contamos contigo este fin de semana?</p>
<p>Solo recuerda llevar: {retreat.thingsToBringNotes}</p>
<p>Es importante que llegues directamente a la casa de retiro, a más tardar a las {retreat.walkerArrivalTime}. Toma en cuenta que no hay transporte organizado, y de preferencia que alguien te lleve porque no hay estacionamiento. ¿Sabes cómo llegar o te paso la dirección?</p>
<p>Cualquier duda que tengas, aquí estoy para apoyarte. Nos vemos el fin de semana. ¡Que Dios te bendiga!</p>`,
			to: `<p>Hola, ¿hablo con {participant.firstName}? Te escribo de parte del Retiro de Emaús de {retreat.parish}.</p>
<p>Te contacto para confirmar tu asistencia y darte la bienvenida. ¿Contamos contigo este fin de semana?</p>
<p>Solo recuerda llevar: {retreat.thingsToBringNotes}</p>
<p>Un detalle: si tu familia quiere mandarte cartas durante el retiro, puede enviarlas a {participant.letterMailbox} y te las entregamos impresas.</p>
<p>Es importante que llegues directamente a la casa de retiro, a más tardar a las {retreat.walkerArrivalTime}. Toma en cuenta que no hay transporte organizado, y de preferencia que alguien te lleve porque no hay estacionamiento. ¿Sabes cómo llegar o te paso la dirección?</p>
<p>Cualquier duda que tengas, aquí estoy para apoyarte. Nos vemos el fin de semana. ¡Que Dios te bendiga!</p>`,
		},
		{
			type: 'FAMILY_CLOSING_INVITATION_WHATSAPP',
			from: `Hola {participant.recipientFirstName}, {participant.firstName} está viviendo este fin de semana un retiro espiritual muy especial. Te invitamos con mucho cariño a la *Misa de Clausura* del retiro de Emaús de *{retreat.parish}*: el momento en que lo recibimos de vuelta y celebramos en familia.

🗓️ {retreat.endDate}
⛪ {retreat.closingChurchName}
📍 {retreat.closingChurchAddress}

Cómo llegar:
• Google Maps: {retreat.closingChurchMapsUrl}
• Waze: {retreat.closingChurchWazeUrl}

Tu presencia será una hermosa sorpresa y significará muchísimo para {participant.firstName}. ¡Ahí nos vemos!`,
			to: `Hola {participant.recipientFirstName}, {participant.firstName} está viviendo este fin de semana un retiro espiritual muy especial. Te invitamos con mucho cariño a la *Misa de Clausura* del retiro de Emaús de *{retreat.parish}*: el momento en que lo recibimos de vuelta y celebramos en familia.

🗓️ {retreat.endDate}
⛪ {retreat.closingChurchName}
📍 {retreat.closingChurchAddress}

Cómo llegar:
• Google Maps: {retreat.closingChurchMapsUrl}
• Waze: {retreat.closingChurchWazeUrl}

💌 ¿Quieres mandarle cartas? Envíalas a {participant.letterMailbox} y las entregamos impresas durante el retiro.

Tu presencia será una hermosa sorpresa y significará muchísimo para {participant.firstName}. ¡Ahí nos vemos!`,
		},
		{
			type: 'FAMILY_CLOSING_INVITATION_EMAIL',
			from: `<h2>Misa de Clausura del retiro</h2>
<p>Hola {participant.recipientFirstName},</p>
<p>{participant.firstName} está viviendo este fin de semana un retiro espiritual muy especial, y queremos invitarte con mucho cariño a la <strong>Misa de Clausura</strong> del retiro de Emaús de <strong>{retreat.parish}</strong>: el momento en que recibimos de vuelta a {participant.firstName} y celebramos en familia el cierre de la experiencia.</p>
<ul>
  <li><strong>Fecha:</strong> {retreat.endDate}</li>
  <li><strong>Iglesia:</strong> {retreat.closingChurchName}</li>
  <li><strong>Dirección:</strong> {retreat.closingChurchAddress}</li>
</ul>
<p>
  <a href="{retreat.closingChurchMapsUrl}">Abrir en Google Maps</a> &nbsp;·&nbsp;
  <a href="{retreat.closingChurchWazeUrl}">Abrir en Waze</a>
</p>
<p>Tu presencia será una hermosa sorpresa y significará muchísimo para {participant.firstName}. ¡Ahí nos vemos!</p>`,
			to: `<h2>Misa de Clausura del retiro</h2>
<p>Hola {participant.recipientFirstName},</p>
<p>{participant.firstName} está viviendo este fin de semana un retiro espiritual muy especial, y queremos invitarte con mucho cariño a la <strong>Misa de Clausura</strong> del retiro de Emaús de <strong>{retreat.parish}</strong>: el momento en que recibimos de vuelta a {participant.firstName} y celebramos en familia el cierre de la experiencia.</p>
<ul>
  <li><strong>Fecha:</strong> {retreat.endDate}</li>
  <li><strong>Iglesia:</strong> {retreat.closingChurchName}</li>
  <li><strong>Dirección:</strong> {retreat.closingChurchAddress}</li>
  <li><strong>Cartas:</strong> puedes enviarlas a {participant.letterMailbox} y las imprimimos para entregarlárselas durante el retiro.</li>
</ul>
<p>
  <a href="{retreat.closingChurchMapsUrl}">Abrir en Google Maps</a> &nbsp;·&nbsp;
  <a href="{retreat.closingChurchWazeUrl}">Abrir en Waze</a>
</p>
<p>Tu presencia será una hermosa sorpresa y significará muchísimo para {participant.firstName}. ¡Ahí nos vemos!</p>`,
		},
		{
			type: 'PALANCA_REQUEST',
			from: `Hola {participant.recipientFirstName}, te escribimos por el retiro de {participant.firstName} 💌

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
			to: `Hola {participant.recipientFirstName}, te escribimos por el retiro de {participant.firstName} 💌

{participant.firstName} participará este fin de semana en un retiro espiritual, una experiencia muy especial. Como parte del retiro, las personas más cercanas preparan en secreto unas cartas de cariño que llamamos «palancas».

Una palanca es simplemente *un mensaje breve, escrito desde el corazón*, que {participant.firstName} leerá en un momento muy emotivo del fin de semana. Tus palabras pueden significar muchísimo.

*¿Qué puedes escribir?*
- Lo que más aprecias y admiras de {participant.firstName}
- Un recuerdo bonito que compartan, o por qué es importante en tu vida
- Palabras de cariño, ánimo y tus mejores deseos

Por favor, que sea un mensaje *totalmente positivo*. Es un regalo de amor: evita reproches, críticas, quejas, problemas, temas tristes o de dinero, o cualquier cosa que pueda doler. La intención es que {participant.firstName} sienta todo tu cariño y apoyo.

No tiene que ser largo ni perfecto: unas pocas líneas sinceras bastan.

💌 *¿Cómo hacerla llegar?* Envíala por correo a {participant.letterMailbox}: llega directo a la bandeja del retiro y nosotros la imprimimos para entregarla a {participant.firstName}.

📅 *Haz llegar tu palanca antes del inicio del retiro: {retreat.startDate}.*

Es una sorpresa: te pedimos no comentarle nada a {participant.firstName}. ¡Gracias por ser parte de esto! 🙏`,
		},
		{
			type: 'PALANCA_REMINDER',
			from: `Hola {participant.recipientFirstName}, un recordatorio: la palanca para {participant.firstName} 💌

Te recordamos con cariño esa carta breve y positiva que leerá durante su retiro este fin de semana (la sorpresa de cartas de aliento que preparan sus seres queridos).

Aún estás a tiempo. No necesita ser larga ni perfecta: unas líneas sinceras con tu cariño, ánimo y buenos deseos serán un regalo enorme.

⚠️ Recuerda evitar cualquier cosa negativa (reproches, problemas o temas tristes): la idea es que {participant.firstName} se sienta querido y animado.

📅 *Fecha límite: {retreat.startDate}.*

Y es una sorpresa: no le comentes nada 🤫

¡Gracias!`,
			to: `Hola {participant.recipientFirstName}, un recordatorio: la palanca para {participant.firstName} 💌

Te recordamos con cariño esa carta breve y positiva que leerá durante su retiro este fin de semana (la sorpresa de cartas de aliento que preparan sus seres queridos).

Aún estás a tiempo. No necesita ser larga ni perfecta: unas líneas sinceras con tu cariño, ánimo y buenos deseos serán un regalo enorme.

💌 La puedes enviar por correo a {participant.letterMailbox} y nosotros la imprimimos para entregarla.

⚠️ Recuerda evitar cualquier cosa negativa (reproches, problemas o temas tristes): la idea es que {participant.firstName} se sienta querido y animado.

📅 *Fecha límite: {retreat.startDate}.*

Y es una sorpresa: no le comentes nada 🤫

¡Gracias!`,
		},
		{
			type: 'PALANCA_DEFINITION',
			from: `El regalo sorpresa son unas cartas de amor, admiración y apoyo para él 💌

Nosotros les llamamos «palancas».

Te pedimos que puedas pedir estas cartas a su familia y amigos: pídele a las personas importantes para él. Las de su familia son las más importantes, pero entre más le consigas, mejor.

Pueden ser cartas, fotos, dibujos ✍️

📅 *Estas cartas tienen que estar listas a más tardar el {retreat.startDate}.*

Para hacerlas llegar tenemos este correo:
📧 emaus.palancas.mex@gmail.com

Es importante poner en el título del correo el nombre y apellido de {participant.firstName}, para poder identificarlas y entregarlas correctamente.

Muchas gracias por tu apoyo. Estoy a tus órdenes para cualquier duda.

{participant.palanqueroName}`,
			to: `El regalo sorpresa son unas cartas de amor, admiración y apoyo para él 💌

Nosotros les llamamos «palancas».

Te pedimos que puedas pedir estas cartas a su familia y amigos: pídele a las personas importantes para él. Las de su familia son las más importantes, pero entre más le consigas, mejor.

Pueden ser cartas, fotos, dibujos ✍️

📅 *Estas cartas tienen que estar listas a más tardar el {retreat.startDate}.*

Para hacerlas llegar, {participant.firstName} tiene su propio buzón:
📧 {participant.letterMailbox}

Los correos llegan directo a la bandeja del retiro y nosotros las imprimimos para entregarlas. Si prefieren el correo general, pueden usar emaus.palancas.mex@gmail.com poniendo en el título el nombre y apellido de {participant.firstName}.

Muchas gracias por tu apoyo. Estoy a tus órdenes para cualquier duda.

{participant.palanqueroName}`,
		},
	];

	public async up(queryRunner: QueryRunner): Promise<void> {
		for (const update of AddLetterMailboxToFamilyTemplates20261106100000.UPDATES) {
			// Globals (fuente de los clones futuros) y copias por retiro ya creadas:
			// mismo guard por texto exacto. Personalizadas (texto distinto) se respetan.
			for (const table of ['global_message_templates', 'message_templates']) {
				const result = await queryRunner.query(
					`UPDATE "${table}" SET "message" = ? WHERE "type" = ? AND "message" = ?`,
					[update.to, update.type, update.from],
				);
				const changes = (result as { changes?: number })?.changes ?? 0;
				if (changes > 0) {
					console.log(
						`  💌 ${table}.${update.type}: plantilla actualizada con {participant.letterMailbox}`,
					);
				}
			}
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		for (const update of AddLetterMailboxToFamilyTemplates20261106100000.UPDATES) {
			for (const table of ['global_message_templates', 'message_templates']) {
				await queryRunner.query(
					`UPDATE "${table}" SET "message" = ? WHERE "type" = ? AND "message" = ?`,
					[update.from, update.type, update.to],
				);
			}
		}
	}
}
