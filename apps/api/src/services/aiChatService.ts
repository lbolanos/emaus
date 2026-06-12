import { resolveMemberProfile } from '@repo/utils';
import { streamText, convertToModelMessages, UIMessage, ModelMessage, jsonSchema, stepCountIs } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { config } from '../config';
import { findAllParticipants, findParticipantById } from './participantService';
import { getRetreatsForUser, findById as findRetreatById } from './retreatService';
import { findTablesByRetreatId, assignWalkerToTable, unassignWalkerFromTable, assignLeaderToTable, unassignLeaderFromTable, findTableById } from './tableMesaService';
import {
	getRetreatInventory,
	getInventoryAlerts,
	updateRetreatInventory,
	addCustomItemToRetreat,
} from './inventoryService';
import { findAllResponsibilities } from './responsabilityService';
import { AppDataSource } from '../data-source';
import { Payment } from '../entities/payment.entity';
import { Participant } from '../entities/participant.entity';
import { RetreatParticipant } from '../entities/retreatParticipant.entity';
import { RetreatBed, BedType } from '../entities/retreatBed.entity';
import { authorizationService } from '../middleware/authorization';
import { In } from 'typeorm';
import { CommunityAdmin } from '../entities/communityAdmin.entity';
import { CommunityMember } from '../entities/communityMember.entity';
import { Community } from '../entities/community.entity';
import { CommunityMeeting } from '../entities/communityMeeting.entity';
import { UserRole } from '../entities/userRole.entity';
import { CommunityService } from './communityService';

async function verifyRetreatAccess(userId: string, retreatId: string): Promise<void> {
	const hasAccess = await authorizationService.hasRetreatAccess(userId, retreatId);
	if (!hasAccess) {
		throw new Error('No tienes acceso a este retiro.');
	}
}

/**
 * Verifica que el usuario sea admin activo (owner o admin) de la comunidad, o
 * superadmin del sistema. Lanza error si no. Reusable para tools que mutan
 * datos de comunidad.
 */
async function verifyCommunityAdminAccess(userId: string, communityId: string): Promise<void> {
	const isSuperadmin =
		(await AppDataSource.getRepository(UserRole)
			.createQueryBuilder('ur')
			.leftJoin('ur.role', 'role')
			.where('ur.userId = :userId', { userId })
			.andWhere('role.name = :name', { name: 'superadmin' })
			.getCount()) > 0;
	if (isSuperadmin) return;

	const admin = await AppDataSource.getRepository(CommunityAdmin).findOne({
		where: { userId, communityId, status: 'active' },
	});
	if (!admin) {
		throw new Error('No tienes acceso a esta comunidad como administrador.');
	}
}

function buildSystemPrompt(retreatId?: string, communityId?: string) {
	const now = new Date();
	const dateStr = now.toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Mexico_City' });
	const timeStr = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' });
	let prompt = `Eres Jessy, la asistente virtual del sistema de gestión de retiros Emaús.
Fecha y hora actual: ${dateStr}, ${timeStr} (Ciudad de México).
Puedes consultar datos del sistema usando las herramientas disponibles.
Responde siempre en español. Sé concisa y útil.

Tus capacidades:
- Buscar participantes por nombre y ver sus detalles completos (teléfono, dirección, contactos de emergencia, etc.)
- Buscar participantes por su número de retiro (idOnRetreat) — cuando el usuario menciona números sueltos como "29, 26 y 30", casi siempre se refiere al idOnRetreat, NO al ID interno. Usa findByIdOnRetreat para resolverlos.
- Listar participantes de un retiro por tipo (caminantes, servidores, en espera)
- Ver detalles de retiros disponibles
- Consultar pagos y resumen financiero de un retiro
- Ver asignaciones de mesas con líderes y caminantes
- Consultar inventario y alertas de artículos faltantes
- Ver responsabilidades asignadas
- Consultar estado de palancas (quién las ha recibido y quién no)
- Consultar asignación de camas y disponibilidad
- Cambiar participantes de mesa (mover caminante a otra mesa, asignar/quitar líder)
- Cambiar participantes de cama/habitación (asignar, desasignar, mover a otra cama)
- Agregar miembros a una comunidad en lote a partir de una lista de nombres con teléfono o correo (addCommunityMembersBulk)
- Listar las comunidades donde el usuario es administrador (getMyAdminCommunities)
- Buscar un miembro existente en una comunidad por nombre o correo (findCommunityMember)
- Listar las reuniones de una comunidad (pasadas y próximas) para identificar a cuál registrar asistencia (listCommunityMeetings)
- Registrar asistencia de varios miembros a una reunión de la comunidad (recordMeetingAttendance)
- Procesar fotos de listas de asistencia: extraer los nombres, identificar miembros existentes, agregar los nuevos en lote (pending_verification) y marcar asistencia
- Registrar inventario desde foto o audio: extraer items y cantidades, actualizar el inventario del retiro (set o incremento), crear items ad-hoc cuando no existen

IMPORTANTE para agregar miembros de comunidad:
- Si NO hay communityId en el contexto y el usuario pide agregar miembros, llama PRIMERO a getMyAdminCommunities y pídele al usuario que indique en cuál de esas comunidades agregarlos. Nunca asumas la comunidad.
- Antes de ejecutar addCommunityMembersBulk, MUESTRA al usuario la lista parseada (nombre + datos detectados) y pide confirmación explícita.
- Cada miembro requiere nombre + (correo O teléfono). Si falta algo, el resultado vendrá en \`rejected\` con \`missingFields\`. En ese caso, pregúntale al usuario los datos faltantes mencionando cada nombre por separado (ej: "de Juan Pérez no me diste teléfono ni correo, ¿me los pasas?"). Cuando el usuario responda, vuelve a llamar addCommunityMembersBulk SOLO con esas entradas completadas.
- El estado por defecto al agregar es \`pending_verification\` (para que el coordinador haga seguimiento). Si el usuario dice "agrégalos como confirmados/activos/verificados", pasa \`state: 'active_member'\`. Si dice "pendientes/por contactar/por verificar", pasa \`state: 'pending_verification'\`.
- Tras ejecutar, resume al usuario en bullets: cuántos quedaron agregados (nuevos), vinculados (Participants existentes en BD que se vincularon a la comunidad), omitidos (ya eran miembros) y rechazados.

IMPORTANTE para registrar asistencia a una reunión:
- Si el usuario dice "anota que llegaron X, Y, Z" o "marca asistencia de…", usa recordMeetingAttendance.
- Si NO se especifica la reunión, llama PRIMERO a listCommunityMeetings y muéstrale las reuniones recientes (pasadas y próximas) para que el usuario elija. Default razonable: la reunión más reciente que ya inició y aún no terminó, o la próxima si no hay una en curso.
- Cada attendee se puede pasar por memberId, email, cellPhone, o nombre completo. El bot debe extraer del mensaje del usuario los identificadores que tenga (ej. "Juan Pérez llegó y María maria@x.com también" → [{name: 'Juan Pérez'}, {name: 'María', email: 'maria@x.com'}]).
- Tras ejecutar, resume en bullets: marcados (con nombre), no encontrados (no son miembros — sugiere usar addCommunityMembersBulk si el usuario quiere agregarlos), ambiguos (varios miembros matchean — pregunta cuál es).
- Para attendees ambiguos, MUESTRA al usuario las opciones (con email/teléfono para diferenciar) y pídele que elija; cuando responda, vuelve a llamar recordMeetingAttendance con memberId explícito.

IMPORTANTE — Foto de lista de asistencia:
Cuando recibas una IMAGEN, asume que es una lista escrita a mano (o impresa) con nombres de asistentes a una reunión de comunidad. Sigue este flujo SIN saltarte pasos:

1. EXTRAE todos los nombres visibles en la foto, tal cual aparecen. Si algún nombre está parcialmente ilegible, márcalo con [?] al final (ej: "Juan Per[?]"). NO inventes nombres ni completes letras que no veas con claridad.
   - **IGNORA ENCABEZADOS DE TABLA**: si la hoja tiene columnas con título (ej. "Nombre", "Teléfono", "Apellido", "Hora", "#"), NO los trates como nombres. Empieza desde la primera fila con datos reales.
   - **EMPAREJAMIENTO NOMBRE↔TELÉFONO**: si la hoja tiene columnas, lee cada FILA horizontalmente. El teléfono de la fila 3 va con el nombre de la fila 3, etc. Cuando una fila tiene solo nombre (sin teléfono) o solo teléfono (sin nombre), reportarla así explícitamente — NO emparejar con la fila siguiente.
   - **Si los datos están rotados** (foto tomada lateralmente), oriéntalos mentalmente antes de leer; los números 1, 2, 3… al inicio de cada fila te ayudan a determinar el orden correcto.

2. IDENTIFICA la comunidad:
   - Si hay communityId en el contexto, úsala.
   - Si NO, llama getMyAdminCommunities y pídele al usuario que elija explícitamente. NUNCA asumas la comunidad sin confirmación.

3. IDENTIFICA la reunión: pregúntale al usuario "¿a qué reunión corresponde? (ej. la de ayer, la del [fecha])". Cuando responda, llama listCommunityMeetings (puedes pedir más resultados con limit) y elige la coincidente. **IMPORTANTE: usa el campo 'startDateLocal' (formato legible en la timezone de la comunidad), NO el campo 'startDate' UTC, para comparar contra "ayer", "hoy", "la de hace 2 semanas" — el campo 'currentTimeLocal' del response te da la hora local actual de referencia.** Si la reunión es serie recurrente ('isRecurring'=true) y solo hay un 'isRecurrenceTemplate', ese template REPRESENTA la primera ocurrencia real, úsalo. Si hay ambigüedad o no encuentras una clara, pídele que confirme con la fecha exacta o el título.

4. CONSTRUYE EL PREVIEW sin mutar nada todavía. Por cada fila enumerada en el paso 1, sigue esta cascada con **EARLY EXIT estricto**: en cuanto un paso devuelva count >= 1 con isPartialMatch=false, **DETÉN la cascada para esa fila** — NO ejecutes los pasos siguientes. Si ejecutas más de un lookup por fila, el preview se confunde y mezcla resultados.

   Cascada por fila:
   - **a) Por teléfono** (si la fila tiene teléfono): findCommunityMember(communityId, "<últimos 10 dígitos>"). Si count >= 1 y isPartialMatch=false → **resuelto, ALTO**. Esa fila usa el primer member del array. NO llames más lookups para esta fila.
   - **b) Por nombre completo** (solo si (a) devolvió count=0 o no había teléfono): findCommunityMember(communityId, "<nombre completo extraído>"). Si count >= 1 y isPartialMatch=false → resuelto, ALTO.
   - **c) Por apellido(s) solo** (solo si (b) devolvió count=0): separa apellido del nombre y prueba con SOLO los apellidos (ej. "Hector Bolaños" → "Bolaños"; "Maria Esther Lopez" → "Lopez"). Útil cuando el primer nombre en la lista (apodo) difiere del registrado.
   - **d) Por primer nombre solo** (solo si (c) devolvió count=0): último recurso. Solo úsalo si hay 1-2 resultados; si hay muchos miembros con ese primer nombre, márcalo como ambiguo y pídele al usuario que elija.
   - Si después de a/b/c/d sigue count=0 → se creará nuevo (pending_verification) usando teléfono + nombre extraídos.

   Tratamiento de matches parciales (isPartialMatch=true): NO los des por buenos automáticamente. Si en algún paso solo encuentras matches parciales, sigue al siguiente paso de la cascada — pero guarda esos candidatos para mostrarlos en el preview como sugerencias para que el usuario confirme.

   Si hay múltiples matches exactos en un solo paso → ambiguo, pídele que elija.

   **El conteo de líneas del preview debe ser EXACTAMENTE igual al número de filas enumeradas en el paso 1** (no más, no menos). No metas la misma fila en dos líneas distintas.

   No llames addCommunityMembersBulk ni recordMeetingAttendance en este paso.

5. MUESTRA al usuario el preview consolidado, **pensado para lectura en voz alta** (Jessy se puede escuchar). Usa frases completas y evita siglas pegadas; los teléfonos preséntalos con espacios cada 2-4 dígitos para que el TTS los pronuncie como números agrupados, no dígito por dígito. Estructura:
   - "Leí N filas de la foto."
   - "Reunión: [título, fecha local]."
   - "Marcaré asistencia de M miembros existentes:" seguido de bullets con "nombre — teléfono".
   - "Crearé K nuevos como pendientes de verificación:" seguido de bullets con "nombre — teléfono".
   - Si hay ambiguos: "Estos nombres requieren tu elección:" con las opciones disponibles.
   - Cierre: "¿Confirmas? Di o escribe 'sí' para aplicar, o indícame correcciones."
   El coordinador puede activar el botón de altavoz para escuchar este resumen; si nota un nombre mal leído, te lo corrige por chat o por voz antes de confirmar.

6. Al recibir confirmación explícita ("sí", "confirmo", "ok", "dale", "adelante"):
   a. Llama addCommunityMembersBulk con los nuevos en estado pending_verification. Cada entrada DEBE traer cellPhone (la llave de matching más fiable); firstName/lastName son los extraídos de la foto. En el campo notes pon "Agregado desde foto de asistencia — verificar ortografía del nombre" (el teléfono es confiable, el nombre puede tener error de OCR).
   b. Llama recordMeetingAttendance con TODOS los confirmados. **Identifícalos preferentemente por cellPhone** (no por nombre — la tool ya hace match por últimos 10 dígitos). Solo usa memberId si lo tienes (de matches existentes), o name como último recurso si la fila no tiene teléfono.
   c. Reporta resumen final hablable: "Marqué X asistencias y creé Y miembros nuevos pendientes de verificación. Z quedaron ambiguos sin resolver."

7. Si el usuario rechaza ("no", "cancela") o pide cambios, NO ejecutes nada y espera instrucciones.

IMPORTANTE — Foto o audio de inventario:
Cuando recibas una IMAGEN o un MENSAJE DE VOZ que describe items y cantidades de inventario (ej. foto de caja con productos, audio "llegaron 5 jabones y 3 detergentes"), sigue este flujo:

1. **DESCRIBE PRIMERO TODO LO QUE VES, item por item, ANTES de matchear nada**. En la imagen, **enumera CADA artículo distinto** que aparezca como una línea separada con su cantidad, unidad observada y características distintivas (marca, color, tipo). Ejemplo: "veo: 1 bolígrafo Bic blanco con franja azul, 1 bolígrafo metálico plateado con clip, 1 marcatextos lila Office Depot, 1 caja de clips, 5 hojas carta".

   Reglas estrictas:
   - **Cada producto con marca/color/modelo distintos = UNA línea propia**. NO los agrupes aunque "sean del mismo tipo" (ej. "1 Bic azul" + "1 pluma metálica plateada" + "1 marcador Sharpie" = **3 líneas**, NO una línea "3 útiles de escritura").
   - Solo agrupa cuando son **unidades IDÉNTICAS del mismo producto** (ej. 5 Bic azules iguales = "Plumas Bic azules: 5").
   - Productos diferentes de la misma categoría (4 plumas de marcas/colores distintos) = **4 líneas distintas**, NO "Plumas: 4".
   - En duda, **separa**. Es preferible tener más items granulares que perder información.

   Esta descripción inicial es tu "memoria de trabajo": después de hacerla, NO añadas ni quites items en pasos posteriores sin avisarle al usuario.

   Para audio: lista igualmente todo lo que escuchaste como bullets antes de matchear.

   Si la cantidad de algún item es ilegible o no se entiende, márcalo con [?] y pídele aclaración al usuario antes de seguir al paso 4.

2. DETECTA EL INTENT DE LA CANTIDAD (snapshot vs incremento) — crítico para no romper el conteo:
   - **Foto** = snapshot por default. La foto representa "esto es lo que hay AHORA": mode='set'.
   - **Audio con verbos de agregar** ("llegan/llegaron", "agrega/añade", "compré", "trajeron", "X más"): mode='increment'.
   - **Audio con verbos de estado** ("hay/tengo/son/quedan", "pon/marca/ahora son"): mode='set'.
   - Cuando dudes, asume **set** y dilo explícitamente en el preview para que el usuario corrija si se equivoca.

3. IDENTIFICA EL RETIRO: si hay retreatId en el contexto, úsalo. Si no, llama getRetreats y pide al usuario que elija.

4. CONSTRUYE EL PREVIEW sin mutar nada todavía. Para cada artículo individual extraído del paso 1:
   - **SIEMPRE llama findInventoryItem(retreatId, "<nombre del artículo>")** para buscar en el inventario actual del retiro algo parecido. Prueba con el nombre tal cual lo leíste; si no hay match, prueba variantes (sin el adjetivo de color, solo el sustantivo: "Bolígrafo azul" → reintenta con "Bolígrafo").
   - **MUESTRA el resultado al usuario** sin tomar decisión automática:
     - Si hay match exacto → propónlo como candidato indicando su nombre en el catálogo, currentQuantity actual y unidad.
     - Si hay matches parciales (isPartialMatch=true) → muéstralos todos como sugerencias.
     - Si no hay match → propón crearlo como ad-hoc.
   - **NO agrupes automáticamente artículos distintos bajo un mismo item del catálogo**. Si la foto tiene 4 productos distintos (Bic blanco, metálico plateado, pluma azul, marcatextos lila) y los 4 matchean contra un único item genérico del catálogo (ej. "Marcadores y Plumas"), preséntalos en el preview como **4 líneas distintas**, cada una con su propio match propuesto. El usuario decide en el paso 5 si los unifica (sumar todos al mismo retreatInventoryId) o los separa (crear ad-hoc específicos).

5. MUESTRA al usuario un preview hablable. El conteo N debe coincidir EXACTAMENTE con los artículos que enumeraste en el paso 1:
   - "Leí N artículos en total de la foto/audio." (mismo N que tu enumeración inicial)
   - **Para cada artículo, una línea distinta** con el match propuesto:
     - Con match único específico: "<artículo>: ¿match con <nombre del catálogo> (actualmente <currentQuantity> <unit>)?  → propongo <mode> a <quantity>" — el usuario confirma o pide ad-hoc.
     - Con match genérico/parcial: "<artículo>: ¿lo cuento bajo <nombre del catálogo> (actualmente <currentQuantity>)? o ¿lo creo como ad-hoc independiente?"
     - Sin match: "<artículo>: no encontré nada parecido en el inventario. Lo crearé como '<nombre específico>' con <quantity> <unit>."
   - **Si varios artículos distintos matchean al mismo item del catálogo** (caso común con nombres genéricos como "Marcadores y Plumas"), pregunta explícitamente al usuario: "Detecté 4 artículos diferentes que podrían contar como 'Marcadores y Plumas'. ¿Los sumo todos a ese item (4 unidades) o creo 4 ad-hoc separados con sus nombres específicos?". NO decidas tú.
   - Si algún artículo de tu lista inicial quedó pendiente (ambiguo, ilegible), llévalo a una sección "Pendientes de aclarar" antes del cierre — NO lo omitas silenciosamente.
   - Cierre: "¿Confirmas las acciones de arriba? Di o escribe 'sí' para aplicar, o indícame cambios."

6. Al recibir confirmación:
   a. Para cada existente con match → llama updateInventoryQuantity(retreatId, retreatInventoryId, quantity, mode, notes='Cargado desde foto'|'Reportado por voz').
   b. Para cada nuevo ad-hoc → llama addCustomInventoryItem(retreatId, customName, currentQuantity, customUnit?).
   c. Reporta resumen hablable: "Actualicé X items y agregué Y nuevos al inventario del retiro."

7. Si el usuario rechaza ("no", "cancela"), no ejecutes nada y espera instrucciones.

IMPORTANTE para cambios de mesa y cama:
- Antes de hacer un cambio, confirma con el usuario los datos: nombre del participante, mesa/cama destino.
- Si el usuario no especifica IDs exactos, usa searchParticipants y getTableAssignments/getRetreatBeds para encontrarlos.
- Cuando el usuario mencione números como "agrega 29 26 y 30 a mesa 3", esos números son idOnRetreat (número de retiro del participante). Usa findByIdOnRetreat para obtener sus IDs internos antes de asignarlos.
- Siempre confirma la acción antes de ejecutarla mostrando qué vas a hacer.

IMPORTANTE — Reconocimiento de voz (STT):
El usuario puede enviar mensajes por voz. El reconocimiento de voz a veces CONCATENA números separados en uno solo. Por ejemplo:
- El usuario dice "dos, treinta y cinco y treinta" pero llega como "235 y 30" o "23530" o "235 30".
- El usuario dice "veintinueve, veintiséis y treinta" pero llega como "292630" o "2926 30".
Cuando recibas un número largo que NO corresponda a un idOnRetreat válido, intenta SEPARARLO en números más pequeños que sí existan como idOnRetreat. Los idOnRetreat típicamente son de 1 a 3 dígitos (1-999). Por ejemplo:
- "235" → prueba si existe 235, si no, prueba 2+35, 23+5
- "292630" → prueba 29+26+30
- "23530" → prueba 2+35+30, 23+5+30, 235+30
Usa listParticipants o searchParticipants para verificar cuáles idOnRetreat existen en el retiro actual y elegir la separación correcta.

Cuando el usuario pregunte por datos de una persona (teléfono, email, dirección, contactos de emergencia, etc.), usa getParticipantDetails para obtener toda la información.
Si preguntan por un familiar o contacto de emergencia, revisa los campos de contactos de emergencia del participante.`;
	if (retreatId) {
		prompt += `\n\nEl usuario tiene seleccionado el retiro con ID: ${retreatId}. Usa este ID como valor por defecto en las herramientas que requieran retreatId, a menos que el usuario indique otro retiro.`;
	}
	if (communityId) {
		prompt += `\n\nEl usuario tiene seleccionada la comunidad con ID: ${communityId}. Usa este ID como valor por defecto en las herramientas que requieran communityId, a menos que el usuario indique otra comunidad.`;
	}
	return prompt;
}

export function getModel() {
	const { provider, model } = config.ai;
	console.log(`[AI Chat] Using model: ${model} via ${provider}`);
	switch (provider) {
		case 'anthropic':
			return createAnthropic({
				apiKey: config.ai.anthropicApiKey,
				baseURL: config.ai.anthropicBaseUrl || undefined,
			})(model);
		case 'google':
			return google(model);
		case 'openai':
			return createOpenAI({
				apiKey: config.ai.openaiApiKey,
				baseURL: config.ai.openaiBaseUrl || undefined,
			}).chat(model);
		default:
			throw new Error(`Unknown AI provider: ${provider}`);
	}
}

/** Vision model — supports google (Gemini) and anthropic providers. */
export function getVisionModel() {
	const { visionProvider, visionModel } = config.ai;
	console.log(`[Vision] Using model: ${visionModel} via ${visionProvider}`);
	switch (visionProvider) {
		case 'google':
			return google(visionModel);
		case 'anthropic':
			return createAnthropic({
				apiKey: config.ai.anthropicApiKey,
				baseURL: config.ai.anthropicBaseUrl || undefined,
			})(visionModel);
		case 'openai':
			return createOpenAI({
				apiKey: config.ai.openaiApiKey,
				baseURL: config.ai.openaiBaseUrl || undefined,
			}).chat(visionModel);
		default:
			return google(visionModel);
	}
}

/**
 * AI SDK v6 rejects data: URLs in FileUIPart (validateDownloadUrl requires http/https).
 * For inline uploads (images pasted/attached from the widget) we decode the data URL to a
 * Buffer and build a ModelMessage manually. Everything else uses convertToModelMessages.
 */
async function buildModelMessages(uiMessages: UIMessage[]): Promise<ModelMessage[]> {
	const out: ModelMessage[] = [];
	for (const m of uiMessages) {
		const hasDataUrl = (m.parts || []).some(
			(p: any) =>
				p?.type === 'file' && typeof p.url === 'string' && p.url.startsWith('data:'),
		);
		if (!hasDataUrl) {
			const converted = await convertToModelMessages([m]);
			out.push(...converted);
			continue;
		}
		const content: any[] = [];
		for (const part of m.parts || []) {
			const p: any = part;
			if (p.type === 'text') {
				if (typeof p.text === 'string' && p.text.length > 0) {
					content.push({ type: 'text', text: p.text });
				}
			} else if (p.type === 'file' && typeof p.url === 'string') {
				const match = p.url.match(/^data:([^;]+);base64,(.+)$/);
				if (!match) continue;
				const mediaType = match[1];
				const buf = Buffer.from(match[2], 'base64');
				if (mediaType.startsWith('image/')) {
					content.push({ type: 'image', image: buf, mediaType });
				} else {
					content.push({ type: 'file', data: buf, mediaType });
				}
			}
		}
		if (content.length > 0) {
			out.push({ role: m.role as any, content });
		}
	}
	return out;
}

export async function createChatStream(
	messages: UIMessage[],
	userId: string,
	retreatId?: string,
	communityId?: string,
) {
	const modelMessages = await buildModelMessages(messages);
	// Si algún mensaje trae una imagen, conmutar al modelo de visión.
	// El chat default (config.ai.model) puede no ser multimodal (p.ej. glm-4.7
	// text-only vía z.ai); el modelo de visión (config.ai.visionModel, p.ej.
	// gemini-2.5-flash) sí procesa imágenes y también soporta tool calls.
	const hasImage = modelMessages.some(
		(m) =>
			Array.isArray((m as any).content) &&
			(m as any).content.some((c: any) => c?.type === 'image'),
	);
	console.log(
		`[AI Chat] Request received — userId=${userId}, retreatId=${retreatId ?? 'none'}, communityId=${communityId ?? 'none'}, messages=${messages.length}, hasImage=${hasImage}`,
	);
	if (hasImage) {
		console.log(
			`[AI Chat] Image detected — switching from chat model (${config.ai.provider}/${config.ai.model}) to vision model (${config.ai.visionProvider}/${config.ai.visionModel})`,
		);
	}
	const activeModel = hasImage ? getVisionModel() : getModel();
	return streamText({
		model: activeModel,
		system: buildSystemPrompt(retreatId, communityId),
		messages: modelMessages,
		maxOutputTokens: config.ai.maxTokens,
		stopWhen: stepCountIs(8),
		onError: ({ error }) => {
			console.error('[AI Chat] streamText error:', error);
		},
		onStepFinish: ({ stepType, finishReason, toolCalls, text }) => {
			console.log('[AI Chat] Step finished:', { stepType, finishReason, toolCallCount: toolCalls?.length, textLength: text?.length });
		},
		tools: {
			listParticipants: {
				description: 'Lista participantes de un retiro. Puede filtrar por tipo. Por defecto excluye cancelados.',
				inputSchema: jsonSchema<{ retreatId: string; type?: string; includeCancelled?: boolean }>({
					type: 'object',
					properties: {
						retreatId: { type: 'string', description: 'ID del retiro' },
						type: {
							type: 'string',
							enum: ['walker', 'server', 'waiting', 'partial_server'],
							description: 'Tipo de participante',
						},
						includeCancelled: {
							type: 'boolean',
							description: 'Incluir participantes cancelados (default: false)',
						},
					},
				required: ['retreatId'],
				}),
				execute: async ({ retreatId, type, includeCancelled }) => {
					await verifyRetreatAccess(userId, retreatId);
					const participants = await findAllParticipants(
						retreatId,
						type as 'walker' | 'server' | 'waiting' | 'partial_server' | undefined,
						includeCancelled ? undefined : false,
					);
					return {
						count: participants.length,
						participants: participants.map((p) => ({
							id: p.id,
							idOnRetreat: p.id_on_retreat ?? null,
							name: `${p.firstName} ${p.lastName}`,
							type: p.type,
							isCancelled: p.isCancelled,
						})),
					};
				},
			},
			searchParticipants: {
				description: 'Busca participantes por nombre o apellido en un retiro. Útil para encontrar un participante específico.',
				inputSchema: jsonSchema<{ retreatId: string; query: string }>({
					type: 'object',
					properties: {
						retreatId: { type: 'string', description: 'ID del retiro' },
						query: { type: 'string', description: 'Nombre o apellido a buscar' },
					},
					required: ['retreatId', 'query'],
				}),
				execute: async ({ retreatId, query }) => {
					await verifyRetreatAccess(userId, retreatId);
					// findAllParticipants resuelve membresía vía retreat_participants
					// (participants.retreatId es solo el retiro primario) y scopea
					// payments/debts/retreat al retiro — los getters monetarios
					// (totalPaid/paymentStatus) salen per-retiro, no globales.
					const all = await findAllParticipants(retreatId, undefined, undefined, [], true);
					const q = query.toLowerCase();
					const participants = all.filter(
						(p) =>
							(p.firstName || '').toLowerCase().includes(q) ||
							(p.lastName || '').toLowerCase().includes(q),
					);
					return {
						count: participants.length,
						participants: participants.map((p) => ({
							id: p.id,
							idOnRetreat: p.id_on_retreat ?? null,
							name: `${p.firstName} ${p.lastName}`,
							type: p.type,
							phone: p.cellPhone,
							email: p.email,
							totalPaid: p.totalPaid,
							paymentStatus: p.paymentStatus,
						})),
					};
				},
			},
			findByIdOnRetreat: {
				description: 'Busca participantes por su número de retiro (idOnRetreat). Los usuarios frecuentemente se refieren a los participantes por este número. Acepta uno o varios números.',
				inputSchema: jsonSchema<{ retreatId: string; ids: number[] }>({
					type: 'object',
					properties: {
						retreatId: { type: 'string', description: 'ID del retiro' },
						ids: { type: 'array', items: { type: 'number' }, description: 'Números de retiro (idOnRetreat) a buscar' },
					},
					required: ['retreatId', 'ids'],
				}),
				execute: async ({ retreatId, ids }) => {
					await verifyRetreatAccess(userId, retreatId);
					const rpRepo = AppDataSource.getRepository(RetreatParticipant);
					const rpRows = await rpRepo.find({
						where: ids.map((id) => ({ retreatId, idOnRetreat: id })),
						select: ['participantId', 'idOnRetreat', 'type', 'isCancelled'],
					});
					if (rpRows.length === 0) {
						return { count: 0, participants: [], notFound: ids };
					}
					const participantRepo = AppDataSource.getRepository(Participant);
					const participants = await participantRepo.find({
						where: { id: In(rpRows.map((r) => r.participantId)) },
					});
					const rpMap = new Map(rpRows.map((r) => [r.participantId, r]));
					return {
						count: participants.length,
						participants: participants.map((p) => {
							const rp = rpMap.get(p.id);
							return {
								id: p.id,
								idOnRetreat: rp?.idOnRetreat ?? null,
								name: `${p.firstName} ${p.lastName}`,
								type: rp?.type ?? p.type,
								isCancelled: rp?.isCancelled ?? false,
							};
						}),
						notFound: ids.filter((id) => !rpRows.some((r) => r.idOnRetreat === id)),
					};
				},
			},
			getRetreats: {
				description: 'Obtiene la lista de retiros disponibles para el usuario.',
				inputSchema: jsonSchema<Record<string, never>>({
					type: 'object',
					properties: {},
				}),
				execute: async () => {
					return getRetreatsForUser(userId);
				},
			},
			getRetreatDetails: {
				description: 'Obtiene detalles de un retiro específico.',
				inputSchema: jsonSchema<{ retreatId: string }>({
					type: 'object',
					properties: {
						retreatId: { type: 'string', description: 'ID del retiro' },
					},
					required: ['retreatId'],
				}),
				execute: async ({ retreatId }) => {
					await verifyRetreatAccess(userId, retreatId);
					return findRetreatById(retreatId);
				},
			},
			getParticipantDetails: {
				description: 'Obtiene detalles completos de un participante: datos personales, teléfonos, dirección, contactos de emergencia, pagos, etc.',
				inputSchema: jsonSchema<{ participantId: string }>({
					type: 'object',
					properties: {
						participantId: { type: 'string', description: 'ID del participante' },
					},
					required: ['participantId'],
				}),
				execute: async ({ participantId }) => {
					const p = await findParticipantById(participantId, true);
					if (!p) return { error: 'Participante no encontrado' };
					if (!p.retreatId) {
						return { error: 'Participante sin retiro asignado, no accesible.' };
					}
					await verifyRetreatAccess(userId, p.retreatId);
					return {
						id: p.id,
						name: `${p.firstName} ${p.lastName}`,
						nickname: p.nickname || null,
						type: p.type,
						email: p.email,
						cellPhone: p.cellPhone,
						homePhone: p.homePhone || null,
						workPhone: p.workPhone || null,
						birthDate: p.birthDate,
						maritalStatus: p.maritalStatus,
						occupation: p.occupation,
						address: {
							street: p.street,
							number: p.houseNumber,
							neighborhood: p.neighborhood,
							city: p.city,
							state: p.state,
							postalCode: p.postalCode,
							country: p.country,
						},
						parish: p.parish || null,
						emergencyContact1: {
							name: p.emergencyContact1Name,
							relation: p.emergencyContact1Relation,
							cellPhone: p.emergencyContact1CellPhone,
							homePhone: p.emergencyContact1HomePhone || null,
							workPhone: p.emergencyContact1WorkPhone || null,
							email: p.emergencyContact1Email || null,
						},
						emergencyContact2: p.emergencyContact2Name ? {
							name: p.emergencyContact2Name,
							relation: p.emergencyContact2Relation || null,
							cellPhone: p.emergencyContact2CellPhone || null,
							homePhone: p.emergencyContact2HomePhone || null,
							workPhone: p.emergencyContact2WorkPhone || null,
							email: p.emergencyContact2Email || null,
						} : null,
						snores: p.snores,
						hasMedication: p.hasMedication,
						medicationDetails: p.medicationDetails || null,
						hasDietaryRestrictions: p.hasDietaryRestrictions,
						dietaryRestrictionsDetails: p.dietaryRestrictionsDetails || null,
						disabilitySupport: p.disabilitySupport || null,
						tshirtSize: p.tshirtSize || null,
						invitedBy: p.invitedBy || null,
						isScholarship: p.isScholarship,
						isCancelled: p.isCancelled,
						notes: p.notes || null,
						totalPaid: p.totalPaid,
						paymentStatus: p.paymentStatus,
						paymentRemaining: p.paymentRemaining,
						lastPaymentDate: p.lastPaymentDate,
					};
				},
			},
			getPaymentSummary: {
				description: 'Obtiene resumen de pagos de un retiro: total recaudado, número de pagos, participantes que han pagado vs total.',
				inputSchema: jsonSchema<{ retreatId: string }>({
					type: 'object',
					properties: {
						retreatId: { type: 'string', description: 'ID del retiro' },
					},
					required: ['retreatId'],
				}),
				execute: async ({ retreatId }) => {
					await verifyRetreatAccess(userId, retreatId);
					const paymentRepo = AppDataSource.getRepository(Payment);
					const participantRepo = AppDataSource.getRepository(Participant);
					const payments = await paymentRepo.find({
						where: { retreatId },
						relations: ['participant'],
					});
					const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
					const participantIds = new Set(payments.map((p) => p.participantId));
					const totalParticipants = await participantRepo.count({ where: { retreatId } });
					return {
						retreatId,
						totalPaid,
						totalPayments: payments.length,
						participantsWithPayments: participantIds.size,
						totalParticipants,
					};
				},
			},
			getTableAssignments: {
				description: 'Obtiene las asignaciones de mesas de un retiro, incluyendo líderes y caminantes asignados a cada mesa.',
				inputSchema: jsonSchema<{ retreatId: string }>({
					type: 'object',
					properties: {
						retreatId: { type: 'string', description: 'ID del retiro' },
					},
					required: ['retreatId'],
				}),
				execute: async ({ retreatId }) => {
					await verifyRetreatAccess(userId, retreatId);
					return findTablesByRetreatId(retreatId);
				},
			},
			getInventory: {
				description: 'Obtiene el inventario de un retiro con cantidades requeridas y actuales.',
				inputSchema: jsonSchema<{ retreatId: string }>({
					type: 'object',
					properties: {
						retreatId: { type: 'string', description: 'ID del retiro' },
					},
					required: ['retreatId'],
				}),
				execute: async ({ retreatId }) => {
					await verifyRetreatAccess(userId, retreatId);
					return getRetreatInventory(retreatId);
				},
			},
			getInventoryAlerts: {
				description: 'Obtiene alertas de inventario: artículos con déficit (cantidad actual menor a la requerida).',
				inputSchema: jsonSchema<{ retreatId: string }>({
					type: 'object',
					properties: {
						retreatId: { type: 'string', description: 'ID del retiro' },
					},
					required: ['retreatId'],
				}),
				execute: async ({ retreatId }) => {
					await verifyRetreatAccess(userId, retreatId);
					return getInventoryAlerts(retreatId);
				},
			},
			findInventoryItem: {
				description:
					'Busca un item del inventario del retiro por nombre con matching fuzzy (normaliza acentos, tokeniza). Devuelve el id (retreatInventoryId) que necesitas para updateInventoryQuantity. Cada resultado trae name, currentQuantity, requiredQuantity y unit. Si hay matches parciales (apellido o subcadena sola), isPartialMatch=true.',
				inputSchema: jsonSchema<{ retreatId: string; query: string }>({
					type: 'object',
					properties: {
						retreatId: { type: 'string', description: 'ID del retiro' },
						query: { type: 'string', description: 'Nombre del item a buscar (ej. "jabón", "platos", "agua")' },
					},
					required: ['retreatId', 'query'],
				}),
				execute: async ({ retreatId, query }) => {
					await verifyRetreatAccess(userId, retreatId);
					const items = await getRetreatInventory(retreatId);
					const normalize = (s: string) =>
						s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
					const qNorm = normalize(query.trim());
					const tokens = qNorm.split(/\s+/).filter((t) => t.length >= 2);
					if (tokens.length === 0) return { count: 0, items: [], isPartialMatch: false };

					const scored = items
						.map((it: any) => {
							const name = it.inventoryItem?.name ?? it.customName ?? '';
							const haystack = normalize(name);
							const hits = tokens.filter((t) => haystack.includes(t)).length;
							const score = hits / tokens.length;
							return { it, name, score };
						})
						.filter((r) => r.score > 0);
					const exact = scored.filter((r) => r.score === 1);
					const partial = scored
						.filter((r) => r.score >= 0.5 && r.score < 1)
						.sort((a, b) => b.score - a.score);
					const results = exact.length > 0 ? exact : partial;
					return {
						count: results.length,
						isPartialMatch: exact.length === 0 && partial.length > 0,
						items: results.slice(0, 10).map((r: any) => ({
							retreatInventoryId: r.it.id,
							inventoryItemId: r.it.inventoryItemId ?? null,
							name: r.name,
							unit: r.it.inventoryItem?.unit ?? r.it.customUnit ?? 'piezas',
							currentQuantity: r.it.currentQuantity,
							requiredQuantity: r.it.requiredQuantity,
							isSufficient: r.it.isSufficient,
							isCustom: !r.it.inventoryItemId,
							matchScore: Math.round(r.score * 100) / 100,
						})),
					};
				},
			},
			updateInventoryQuantity: {
				description:
					'Actualiza la cantidad actual (currentQuantity) de un item del inventario del retiro. Soporta dos modos: "set" (sobrescribe con la cantidad indicada — típico de foto: "tengo 5 jabones") e "increment" (suma delta al actual — típico de audio: "llegan 3 jabones más"). Registra historial automáticamente.',
				inputSchema: jsonSchema<{
					retreatId: string;
					retreatInventoryId: string;
					quantity: number;
					mode: 'set' | 'increment';
					notes?: string;
				}>({
					type: 'object',
					properties: {
						retreatId: { type: 'string', description: 'ID del retiro' },
						retreatInventoryId: {
							type: 'string',
							description: 'ID del item en el retreat_inventory (obtenido de findInventoryItem o getInventory)',
						},
						quantity: {
							type: 'number',
							description: 'Cantidad (entero o decimal). Con mode=set es el nuevo total. Con mode=increment es el delta a sumar (puede ser negativo para restar).',
						},
						mode: {
							type: 'string',
							enum: ['set', 'increment'],
							description: 'set = sobrescribir total; increment = sumar al actual',
						},
						notes: {
							type: 'string',
							description: 'Nota opcional (ej. "Cargado desde foto", "Reportado por voz")',
						},
					},
					required: ['retreatId', 'retreatInventoryId', 'quantity', 'mode'],
				}),
				execute: async ({ retreatId, retreatInventoryId, quantity, mode, notes }) => {
					await verifyRetreatAccess(userId, retreatId);
					if (!Number.isFinite(quantity)) return { error: 'quantity debe ser un número' };

					let newQty = quantity;
					let previousQty: number | undefined;
					if (mode === 'increment') {
						const items = await getRetreatInventory(retreatId);
						const current = items.find((i: any) => i.id === retreatInventoryId);
						if (!current) return { error: 'Item del retiro no encontrado' };
						previousQty = Number(current.currentQuantity ?? 0);
						newQty = previousQty + quantity;
						if (newQty < 0) return { error: `El incremento ${quantity} dejaría la cantidad en ${newQty}; debe ser >= 0` };
					}

					try {
						const updated = await updateRetreatInventory(
							retreatId,
							retreatInventoryId,
							{
								currentQuantity: newQty,
								...(notes ? { notes } : {}),
							},
							undefined,
							userId,
						);
						if (!updated) return { error: 'Item del retiro no encontrado' };
						return {
							success: true,
							retreatInventoryId,
							previousQuantity: previousQty ?? null,
							newQuantity: updated.currentQuantity,
							requiredQuantity: updated.requiredQuantity,
							isSufficient: updated.isSufficient,
							mode,
						};
					} catch (e: any) {
						return { error: e?.message || 'Error al actualizar inventario' };
					}
				},
			},
			addCustomInventoryItem: {
				description:
					'Agrega un item ad-hoc al inventario del retiro (no toca el catálogo global). Útil cuando el coordinador menciona un item que no estaba en la lista del retiro. Devuelve el retreatInventoryId para usos posteriores.',
				inputSchema: jsonSchema<{
					retreatId: string;
					customName: string;
					currentQuantity: number;
					customUnit?: string;
					requiredQuantity?: number;
					notes?: string;
				}>({
					type: 'object',
					properties: {
						retreatId: { type: 'string', description: 'ID del retiro' },
						customName: { type: 'string', description: 'Nombre del item (ej. "Detectores de humo")' },
						currentQuantity: { type: 'number', description: 'Cantidad actual (>= 0)' },
						customUnit: { type: 'string', description: 'Unidad (default "piezas")' },
						requiredQuantity: { type: 'number', description: 'Cantidad requerida (default 0)' },
						notes: { type: 'string', description: 'Nota opcional' },
					},
					required: ['retreatId', 'customName', 'currentQuantity'],
				}),
				execute: async ({ retreatId, customName, currentQuantity, customUnit, requiredQuantity, notes }) => {
					await verifyRetreatAccess(userId, retreatId);
					if (!Number.isFinite(currentQuantity) || currentQuantity < 0) {
						return { error: 'currentQuantity debe ser un número >= 0' };
					}
					const result = await addCustomItemToRetreat(retreatId, {
						customName: customName.trim(),
						customUnit,
						currentQuantity,
						requiredQuantity: requiredQuantity ?? 0,
						notes,
					});
					if ('error' in result) return result;
					return {
						success: true,
						retreatInventoryId: result.id,
						name: result.customName,
						unit: result.customUnit,
						currentQuantity: result.currentQuantity,
						requiredQuantity: result.requiredQuantity,
					};
				},
			},
			getResponsibilities: {
				description: 'Obtiene las responsabilidades/roles asignados en un retiro (ej: cocina, limpieza, etc.).',
				inputSchema: jsonSchema<{ retreatId: string }>({
					type: 'object',
					properties: {
						retreatId: { type: 'string', description: 'ID del retiro' },
					},
					required: ['retreatId'],
				}),
				execute: async ({ retreatId }) => {
					await verifyRetreatAccess(userId, retreatId);
					return findAllResponsibilities(retreatId);
				},
			},
			getBirthdaysDuringRetreat: {
				description: 'Obtiene los participantes que cumplen años durante los días del retiro.',
				inputSchema: jsonSchema<{ retreatId: string }>({
					type: 'object',
					properties: {
						retreatId: { type: 'string', description: 'ID del retiro' },
					},
					required: ['retreatId'],
				}),
				execute: async ({ retreatId }) => {
					await verifyRetreatAccess(userId, retreatId);
					const retreat = await findRetreatById(retreatId);
					if (!retreat) return { error: 'Retiro no encontrado' };
					// Use string-based MMDD comparison to avoid timezone issues
					const toYMD = (d: Date | string): string => {
						const s = typeof d === 'string' ? d : d.toISOString();
						return s.split('T')[0]; // "YYYY-MM-DD"
					};
					const startStr = toYMD(retreat.startDate);
					const endStr = toYMD(retreat.endDate);
					const startMMDD = startStr.slice(5); // "MM-DD"
					const endMMDD = endStr.slice(5);
					const startYear = parseInt(startStr.slice(0, 4));
					const participants = await findAllParticipants(retreatId, undefined, false);
					const birthdays = participants.filter((p) => {
						if (!p.birthDate) return false;
						const birthStr = toYMD(p.birthDate);
						const birthMMDD = birthStr.slice(5); // "MM-DD"
						if (startMMDD <= endMMDD) {
							// Same year range (e.g., Feb 13 to Feb 22)
							return birthMMDD >= startMMDD && birthMMDD <= endMMDD;
						}
						// Year boundary (e.g., Dec 28 to Jan 3)
						return birthMMDD >= startMMDD || birthMMDD <= endMMDD;
					});
					const nowStr = toYMD(new Date());
					const nowYear = parseInt(nowStr.slice(0, 4));
					return {
						retreatDates: { start: startStr, end: endStr },
						count: birthdays.length,
						birthdays: birthdays.map((p) => {
							const birthStr = toYMD(p.birthDate);
							const birthYear = parseInt(birthStr.slice(0, 4));
							const birthMMDD = birthStr.slice(5);
							const nowMMDD = nowStr.slice(5);
							const age = nowYear - birthYear - (birthMMDD > nowMMDD ? 1 : 0);
							const turnsAge = startYear - birthYear;
							return {
								id: p.id,
								name: `${p.firstName} ${p.lastName}`,
								type: p.type,
								birthDate: birthStr,
								age,
								turnsAge,
							};
						}),
					};
				},
			},
			getPalancasStatus: {
				description: 'Obtiene el estado de palancas de los caminantes de un retiro: quién ha recibido palancas, quién no, y quién las tiene pedidas.',
				inputSchema: jsonSchema<{ retreatId: string }>({
					type: 'object',
					properties: {
						retreatId: { type: 'string', description: 'ID del retiro' },
					},
					required: ['retreatId'],
				}),
				execute: async ({ retreatId }) => {
					await verifyRetreatAccess(userId, retreatId);
					const walkers = await findAllParticipants(retreatId, 'walker', false);
					const withPalancas = walkers.filter((p) => p.palancasReceived && p.palancasReceived.trim() !== '');
					const withoutPalancas = walkers.filter((p) => !p.palancasReceived || p.palancasReceived.trim() === '');
					const requested = walkers.filter((p) => p.palancasRequested);
					return {
						totalWalkers: walkers.length,
						withPalancas: withPalancas.length,
						withoutPalancas: withoutPalancas.length,
						requested: requested.length,
						walkersWithoutPalancas: withoutPalancas.map((p) => ({
							id: p.id,
							name: `${p.firstName} ${p.lastName}`,
							coordinator: p.palancasCoordinator || null,
							requested: p.palancasRequested || false,
						})),
						walkersWithPalancas: withPalancas.map((p) => ({
							id: p.id,
							name: `${p.firstName} ${p.lastName}`,
							palancas: p.palancasReceived,
							coordinator: p.palancasCoordinator || null,
							notes: p.palancasNotes || null,
						})),
					};
				},
			},
			getRetreatBeds: {
				description: 'Obtiene las camas del retiro con asignaciones, tipo de cama, piso, si ronca y edad. Detecta conflictos: ronquidos mezclados en cuartos y personas mayores en literas altas.',
				inputSchema: jsonSchema<{ retreatId: string }>({
					type: 'object',
					properties: {
						retreatId: { type: 'string', description: 'ID del retiro' },
					},
					required: ['retreatId'],
				}),
				execute: async ({ retreatId }) => {
					await verifyRetreatAccess(userId, retreatId);
					const beds = await AppDataSource.getRepository(RetreatBed).find({
						where: { retreatId },
						relations: ['participant'],
						order: { floor: 'ASC', roomNumber: 'ASC', bedNumber: 'ASC' },
					});
					const getAge = (birthDate: Date | string | null | undefined): number | null => {
						if (!birthDate) return null;
						const birth = new Date(birthDate);
						const now = new Date();
						let age = now.getFullYear() - birth.getFullYear();
						const m = now.getMonth() - birth.getMonth();
						if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
						return age;
					};
					// Snoring conflicts: rooms with both snorers and non-snorers
					const roomMap = new Map<string, { snorers: string[]; nonSnorers: string[] }>();
					// Age conflicts: older people (50+) on upper bunks
					const ageConflicts: { name: string; age: number; room: string; bed: string }[] = [];
					for (const b of beds) {
						if (!b.participant) continue;
						const name = `${b.participant.firstName} ${b.participant.lastName}`;
						const age = getAge(b.participant.birthDate);
						const key = `${b.floor ?? ''}-${b.roomNumber}`;
						// Snoring grouping
						if (!roomMap.has(key)) roomMap.set(key, { snorers: [], nonSnorers: [] });
						const room = roomMap.get(key)!;
						if (b.participant.snores) {
							room.snorers.push(name);
						} else {
							room.nonSnorers.push(name);
						}
						// Age on upper bunk check
						if (b.type === BedType.LITERA_ARRIBA && age !== null && age >= 50) {
							ageConflicts.push({ name, age, room: b.roomNumber, bed: b.bedNumber });
						}
					}
					const snoringConflicts = Array.from(roomMap.entries())
						.filter(([, r]) => r.snorers.length > 0 && r.nonSnorers.length > 0)
						.map(([key, r]) => ({
							room: key,
							snorers: r.snorers,
							nonSnorers: r.nonSnorers,
						}));
					return {
						totalBeds: beds.length,
						assigned: beds.filter((b) => b.participantId).length,
						available: beds.filter((b) => !b.participantId).length,
						snoringConflicts,
						ageConflicts,
						beds: beds.map((b) => {
							const age = b.participant ? getAge(b.participant.birthDate) : null;
							return {
								id: b.id,
								floor: b.floor,
								room: b.roomNumber,
								bed: b.bedNumber,
								type: b.type,
								usage: b.defaultUsage,
								participant: b.participant ? {
									name: `${b.participant.firstName} ${b.participant.lastName}`,
									snores: b.participant.snores,
									age,
								} : null,
							};
						}),
					};
				},
			},
			assignWalkerToTableTool: {
				description: 'Asigna un caminante a una mesa. Requiere el ID de la mesa y del participante. Usa getTableAssignments para ver mesas disponibles y searchParticipants para encontrar al participante.',
				inputSchema: jsonSchema<{ tableId: string; participantId: string }>({
					type: 'object',
					properties: {
						tableId: { type: 'string', description: 'ID de la mesa destino' },
						participantId: { type: 'string', description: 'ID del participante (caminante)' },
					},
					required: ['tableId', 'participantId'],
				}),
				execute: async ({ tableId, participantId }) => {
					const table = await findTableById(tableId);
					if (!table) return { error: 'Mesa no encontrada' };
					await verifyRetreatAccess(userId, table.retreatId);
					try {
						const updated = await assignWalkerToTable(tableId, participantId);
						return {
							success: true,
							message: `Participante asignado a mesa "${updated.name}"`,
							table: updated.name,
							walkersCount: updated.walkers?.length ?? 0,
						};
					} catch (e: any) {
						return { error: e.message || 'Error al asignar caminante a mesa' };
					}
				},
			},
			unassignWalkerFromTableTool: {
				description: 'Quita un caminante de su mesa actual. Requiere el ID de la mesa y del participante.',
				inputSchema: jsonSchema<{ tableId: string; participantId: string }>({
					type: 'object',
					properties: {
						tableId: { type: 'string', description: 'ID de la mesa' },
						participantId: { type: 'string', description: 'ID del participante (caminante)' },
					},
					required: ['tableId', 'participantId'],
				}),
				execute: async ({ tableId, participantId }) => {
					const table = await findTableById(tableId);
					if (!table) return { error: 'Mesa no encontrada' };
					await verifyRetreatAccess(userId, table.retreatId);
					try {
						await unassignWalkerFromTable(tableId, participantId);
						return { success: true, message: 'Participante removido de la mesa' };
					} catch (e: any) {
						return { error: e.message || 'Error al quitar caminante de mesa' };
					}
				},
			},
			moveWalkerToTable: {
				description: 'Mueve un caminante de su mesa actual a otra mesa. Primero lo quita de la mesa actual y luego lo asigna a la nueva. Requiere el ID de la mesa actual, mesa destino y del participante.',
				inputSchema: jsonSchema<{ currentTableId: string; newTableId: string; participantId: string }>({
					type: 'object',
					properties: {
						currentTableId: { type: 'string', description: 'ID de la mesa actual del caminante' },
						newTableId: { type: 'string', description: 'ID de la mesa destino' },
						participantId: { type: 'string', description: 'ID del participante (caminante)' },
					},
					required: ['currentTableId', 'newTableId', 'participantId'],
				}),
				execute: async ({ currentTableId, newTableId, participantId }) => {
					const currentTable = await findTableById(currentTableId);
					if (!currentTable) return { error: 'Mesa actual no encontrada' };
					await verifyRetreatAccess(userId, currentTable.retreatId);
					try {
						await unassignWalkerFromTable(currentTableId, participantId);
						const updated = await assignWalkerToTable(newTableId, participantId);
						return {
							success: true,
							message: `Participante movido a mesa "${updated.name}"`,
							newTable: updated.name,
							walkersCount: updated.walkers?.length ?? 0,
						};
					} catch (e: any) {
						return { error: e.message || 'Error al mover caminante de mesa' };
					}
				},
			},
			assignLeaderToTableTool: {
				description: 'Asigna un servidor como líder de mesa (lider, colider1 o colider2). Requiere ID de mesa, ID del participante servidor, y el rol.',
				inputSchema: jsonSchema<{ tableId: string; participantId: string; role: string }>({
					type: 'object',
					properties: {
						tableId: { type: 'string', description: 'ID de la mesa' },
						participantId: { type: 'string', description: 'ID del participante (servidor)' },
						role: { type: 'string', enum: ['lider', 'colider1', 'colider2'], description: 'Rol de liderazgo' },
					},
					required: ['tableId', 'participantId', 'role'],
				}),
				execute: async ({ tableId, participantId, role }) => {
					const table = await findTableById(tableId);
					if (!table) return { error: 'Mesa no encontrada' };
					await verifyRetreatAccess(userId, table.retreatId);
					try {
						const updated = await assignLeaderToTable(tableId, participantId, role as 'lider' | 'colider1' | 'colider2');
						return {
							success: true,
							message: `Servidor asignado como ${role} en mesa "${updated.name}"`,
						};
					} catch (e: any) {
						return { error: e.message || 'Error al asignar líder' };
					}
				},
			},
			unassignLeaderFromTableTool: {
				description: 'Quita un líder de un rol en una mesa (lider, colider1 o colider2).',
				inputSchema: jsonSchema<{ tableId: string; role: string }>({
					type: 'object',
					properties: {
						tableId: { type: 'string', description: 'ID de la mesa' },
						role: { type: 'string', enum: ['lider', 'colider1', 'colider2'], description: 'Rol a desasignar' },
					},
					required: ['tableId', 'role'],
				}),
				execute: async ({ tableId, role }) => {
					const table = await findTableById(tableId);
					if (!table) return { error: 'Mesa no encontrada' };
					await verifyRetreatAccess(userId, table.retreatId);
					try {
						await unassignLeaderFromTable(tableId, role as 'lider' | 'colider1' | 'colider2');
						return { success: true, message: `Líder removido del rol ${role}` };
					} catch (e: any) {
						return { error: e.message || 'Error al quitar líder' };
					}
				},
			},
			assignParticipantToBed: {
				description: 'Asigna un participante a una cama específica. Si el participante ya tiene cama, lo mueve automáticamente. Envía null como participantId para desasignar la cama. Usa getRetreatBeds para ver camas disponibles.',
				inputSchema: jsonSchema<{ bedId: string; participantId: string | null }>({
					type: 'object',
					properties: {
						bedId: { type: 'string', description: 'ID de la cama' },
						participantId: { type: ['string', 'null'], description: 'ID del participante o null para desasignar' },
					},
					required: ['bedId', 'participantId'],
				}),
				execute: async ({ bedId, participantId }) => {
					const bedRepo = AppDataSource.getRepository(RetreatBed);
					const bed = await bedRepo.findOne({ where: { id: bedId } });
					if (!bed) return { error: 'Cama no encontrada' };
					await verifyRetreatAccess(userId, bed.retreatId);
					try {
						return await AppDataSource.transaction(async (manager) => {
							const bedRepo = manager.getRepository(RetreatBed);
							if (participantId === null) {
								// Unassign
								await bedRepo.update(bedId, { participantId: undefined });
								return { success: true, message: 'Cama desasignada' };
							}
							const participantRepo = manager.getRepository(Participant);
							const participant = await participantRepo.findOne({ where: { id: participantId } });
							if (!participant) return { error: 'Participante no encontrado' };
							// isCancelled lives in retreat_participants
							const rpRepo = manager.getRepository(RetreatParticipant);
							const rpEntry = await rpRepo.findOne({ where: { participantId, retreatId: bed.retreatId } });
							if (rpEntry?.isCancelled) return { error: 'El participante está cancelado' };
							// Check if participant already has a bed in this retreat
							const currentBed = await bedRepo.findOne({ where: { retreatId: bed.retreatId, participantId } });
							if (currentBed && currentBed.id !== bedId) {
								// Unassign from current bed first
								await bedRepo.update(currentBed.id, { participantId: undefined });
							}
							// Check target bed is free
							const targetBed = await bedRepo.findOne({ where: { id: bedId } });
							if (targetBed?.participantId && targetBed.participantId !== participantId) {
								return { error: `La cama ya está asignada a otro participante` };
							}
							await bedRepo.update(bedId, { participantId });
							const updated = await bedRepo.findOne({ where: { id: bedId }, relations: ['participant'] });
							return {
								success: true,
								message: `${participant.firstName} ${participant.lastName} asignado a cama ${updated?.bedNumber} en habitación ${updated?.roomNumber} (piso ${updated?.floor})`,
								bed: {
									room: updated?.roomNumber,
									bed: updated?.bedNumber,
									floor: updated?.floor,
									type: updated?.type,
								},
							};
						});
					} catch (e: any) {
						return { error: e.message || 'Error al asignar cama' };
					}
				},
			},
			moveParticipantToBed: {
				description: 'Mueve un participante a una cama diferente. Busca su cama actual automáticamente y lo mueve a la nueva. Requiere retreatId para buscar la cama actual.',
				inputSchema: jsonSchema<{ retreatId: string; participantId: string; newBedId: string }>({
					type: 'object',
					properties: {
						retreatId: { type: 'string', description: 'ID del retiro' },
						participantId: { type: 'string', description: 'ID del participante' },
						newBedId: { type: 'string', description: 'ID de la cama destino' },
					},
					required: ['retreatId', 'participantId', 'newBedId'],
				}),
				execute: async ({ retreatId, participantId, newBedId }) => {
					await verifyRetreatAccess(userId, retreatId);
					try {
						return await AppDataSource.transaction(async (manager) => {
							const bedRepo = manager.getRepository(RetreatBed);
							const participantRepo = manager.getRepository(Participant);
							const participant = await participantRepo.findOne({ where: { id: participantId } });
							if (!participant) return { error: 'Participante no encontrado' };
							// isCancelled lives in retreat_participants
							const rpRepo = manager.getRepository(RetreatParticipant);
							const rpEntry = await rpRepo.findOne({ where: { participantId, retreatId } });
							if (rpEntry?.isCancelled) return { error: 'El participante está cancelado' };
							// Find current bed
							const currentBed = await bedRepo.findOne({ where: { retreatId, participantId } });
							// Check target bed
							const targetBed = await bedRepo.findOne({ where: { id: newBedId } });
							if (!targetBed) return { error: 'Cama destino no encontrada' };
							if (targetBed.participantId && targetBed.participantId !== participantId) {
								return { error: 'La cama destino ya está ocupada' };
							}
							// Unassign from current
							if (currentBed) {
								await bedRepo.update(currentBed.id, { participantId: undefined });
							}
							// Assign to new
							await bedRepo.update(newBedId, { participantId });
							return {
								success: true,
								message: `${participant.firstName} ${participant.lastName} movido a cama ${targetBed.bedNumber} en habitación ${targetBed.roomNumber} (piso ${targetBed.floor})`,
								previousBed: currentBed ? { room: currentBed.roomNumber, bed: currentBed.bedNumber, floor: currentBed.floor } : null,
								newBed: { room: targetBed.roomNumber, bed: targetBed.bedNumber, floor: targetBed.floor, type: targetBed.type },
							};
						});
					} catch (e: any) {
						return { error: e.message || 'Error al mover participante de cama' };
					}
				},
			},
			getMyAdminCommunities: {
				description: 'Lista las comunidades en las que el usuario actual es administrador activo. Útil cuando el usuario quiere agregar miembros pero no hay communityId en el contexto.',
				inputSchema: jsonSchema<Record<string, never>>({
					type: 'object',
					properties: {},
				}),
				execute: async () => {
					const adminRecords = await AppDataSource.getRepository(CommunityAdmin)
						.createQueryBuilder('admin')
						.innerJoinAndSelect('admin.community', 'community')
						.where('admin.userId = :userId', { userId })
						.andWhere('admin.status = :status', { status: 'active' })
						.andWhere('community.status = :cstatus', { cstatus: 'active' })
						.getMany();

					// Si es superadmin, también incluir todas las comunidades activas
					const isSuperadmin =
						(await AppDataSource.getRepository(UserRole)
							.createQueryBuilder('ur')
							.leftJoin('ur.role', 'role')
							.where('ur.userId = :userId', { userId })
							.andWhere('role.name = :name', { name: 'superadmin' })
							.getCount()) > 0;

					let communities = adminRecords.map((a) => ({
						id: a.communityId,
						name: a.community.name,
						role: a.role,
					}));

					if (isSuperadmin) {
						const all = await AppDataSource.getRepository(Community).find({
							where: { status: 'active' },
						});
						const knownIds = new Set(communities.map((c) => c.id));
						for (const c of all) {
							if (!knownIds.has(c.id)) {
								communities.push({ id: c.id, name: c.name, role: 'superadmin' as any });
							}
						}
					}

					return {
						count: communities.length,
						communities,
					};
				},
			},
			findCommunityMember: {
				description:
					'Busca un miembro de una comunidad por teléfono (≥7 dígitos), email (con @) o nombre. Matching tolerante: normaliza acentos ("Bolaños"="Bolanos"), tokeniza el query y matchea todos los tokens contra firstName+lastName concatenados. Si no hay match exacto, intenta matches PARCIALES (al menos 50% de tokens) ordenados por score, indicando isPartialMatch=true — útil cuando el query es solo apellido o solo primer nombre. Cada resultado trae matchScore (0..1) y matchedBy ("phone"|"email"|"name").',
				inputSchema: jsonSchema<{ communityId: string; query: string }>({
					type: 'object',
					properties: {
						communityId: { type: 'string', description: 'ID de la comunidad' },
						query: { type: 'string', description: 'Teléfono (10 dígitos), email, nombre completo, apellido suelto o primer nombre' },
					},
					required: ['communityId', 'query'],
				}),
				execute: async ({ communityId: cId, query }) => {
					await verifyCommunityAdminAccess(userId, cId);
					const raw = query.trim();
					const qLower = raw.toLowerCase();
					// Normaliza diacríticos para que "Bolaños" matchee "Bolanos" en BD.
					const normalize = (s: string) =>
						s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
					const qNorm = normalize(raw);
					// Si la query parece un teléfono (>= 7 dígitos), busca por últimos 10 dígitos.
					const digits = raw.replace(/\D/g, '');
					const isPhoneQuery = digits.length >= 7;
					const last10 = digits.slice(-10);

					const memberRepo = AppDataSource.getRepository(CommunityMember);
					// Trae todos los miembros de la comunidad para hacer matching en memoria
					// con tokens normalizados — necesario para que "Hector Bolaños" matchee
					// contra firstName="Hector Leonardo" + lastName="Bolanos Munoz".
					const allMembers = await memberRepo
						.createQueryBuilder('m')
						.innerJoinAndSelect('m.participant', 'p')
						.where('m.communityId = :cId', { cId })
						.getMany();

					const tokens = qNorm.split(/\s+/).filter((t) => t.length >= 2);

					// Para cada miembro calcula un score 0..1 (cuántos tokens del query
					// están en el haystack), o 1.0 si matchea por tel/email exacto.
					const scored = allMembers
						.map((m) => {
							const profile = resolveMemberProfile(m);
							const haystackName = normalize(
								`${profile.firstName ?? ''} ${profile.lastName ?? ''} ${profile.fullName ?? ''}`,
							);
							const haystackEmail = normalize(profile.email ?? '');
							const memberPhone = (profile.cellPhone ?? '').replace(/\D/g, '');

							// Match por teléfono (últimos 10 dígitos) — más fiable
							if (isPhoneQuery && memberPhone.length >= 7) {
								if (memberPhone.slice(-10) === last10) return { m, score: 1, matchType: 'phone' as const };
								if (memberPhone.includes(last10) || last10.includes(memberPhone.slice(-10)))
									return { m, score: 1, matchType: 'phone' as const };
							}
							// Email exacto
							if (qLower.includes('@') && haystackEmail.includes(qLower)) {
								return { m, score: 1, matchType: 'email' as const };
							}
							// Score por nombre: fracción de tokens que aparecen en haystack
							if (tokens.length === 0) return { m, score: 0, matchType: 'name' as const };
							const hits = tokens.filter((t) => haystackName.includes(t)).length;
							return { m, score: hits / tokens.length, matchType: 'name' as const };
						})
						.filter((r) => r.score > 0);

					// Prioriza matches exactos (score=1). Si no hay, devuelve parciales
					// con score >= 0.5 (al menos la mitad de los tokens matchean) ordenados
					// por score desc — para que el bot vea apellidos sueltos como sugerencia.
					const exact = scored.filter((r) => r.score === 1);
					const partial = scored
						.filter((r) => r.score >= 0.5 && r.score < 1)
						.sort((a, b) => b.score - a.score);
					const results = exact.length > 0 ? exact : partial;

					return {
						count: results.length,
						isPartialMatch: exact.length === 0 && partial.length > 0,
						members: results.map((r) => {
							const profile = resolveMemberProfile(r.m);
							return {
								memberId: r.m.id,
								name: profile.fullName,
								email: profile.email,
								cellPhone: profile.cellPhone,
								state: r.m.state,
								matchScore: Math.round(r.score * 100) / 100,
								matchedBy: r.matchType,
							};
						}),
					};
				},
			},
			addCommunityMembersBulk: {
				description:
					'Agrega múltiples miembros a una comunidad a partir de una lista. Cada miembro requiere firstName + lastName + (email O cellPhone). Reusa Participants existentes en la BD si coincide email o teléfono. Reporta agregados, vinculados, omitidos (ya miembros) y rechazados (datos faltantes).',
				inputSchema: jsonSchema<{
					communityId: string;
					members: Array<{
						firstName?: string;
						lastName?: string;
						email?: string;
						cellPhone?: string;
						notes?: string;
					}>;
					state?: 'pending_verification' | 'active_member';
				}>({
					type: 'object',
					properties: {
						communityId: { type: 'string', description: 'ID de la comunidad destino' },
						members: {
							type: 'array',
							description: 'Lista de miembros a agregar',
							items: {
								type: 'object',
								properties: {
									firstName: { type: 'string' },
									lastName: { type: 'string' },
									email: { type: 'string' },
									cellPhone: { type: 'string' },
									notes: { type: 'string' },
								},
							},
						},
						state: {
							type: 'string',
							enum: ['pending_verification', 'active_member'],
							description: 'Estado inicial. Default pending_verification.',
						},
					},
					required: ['communityId', 'members'],
				}),
				execute: async ({ communityId: cId, members, state }) => {
					try {
						await verifyCommunityAdminAccess(userId, cId);
					} catch (e: any) {
						return { error: e.message || 'Sin acceso' };
					}

					if (!Array.isArray(members) || members.length === 0) {
						return { error: 'Lista de miembros vacía' };
					}

					const service = new CommunityService();
					const result = await service.bulkAddMembers(
						cId,
						members,
						state || 'pending_verification',
					);

					return {
						success: true,
						summary: {
							added: result.added.length,
							linked: result.linked.length,
							skipped: result.skipped.length,
							rejected: result.rejected.length,
						},
						added: result.added,
						linked: result.linked,
						skipped: result.skipped,
						rejected: result.rejected,
						stateApplied: state || 'pending_verification',
					};
				},
			},
			listCommunityMeetings: {
				description:
					'Lista reuniones de una comunidad (pasadas y próximas). Útil para que el usuario identifique a qué reunión registrar asistencia. Incluye templates de series recurrentes (el template representa la primera ocurrencia de la serie). Ordena por fecha descendente.',
				inputSchema: jsonSchema<{
					communityId: string;
					limit?: number;
					onlyUpcoming?: boolean;
				}>({
					type: 'object',
					properties: {
						communityId: { type: 'string' },
						limit: {
							type: 'number',
							description: 'Máximo de resultados (default 10)',
						},
						onlyUpcoming: {
							type: 'boolean',
							description: 'Si es true, solo retorna reuniones futuras. Default false (incluye pasadas).',
						},
					},
					required: ['communityId'],
				}),
				execute: async ({ communityId: cId, limit, onlyUpcoming }) => {
					try {
						await verifyCommunityAdminAccess(userId, cId);
					} catch (e: any) {
						return { error: e.message || 'Sin acceso' };
					}
					const meetingRepo = AppDataSource.getRepository(CommunityMeeting);
					// IMPORTANTE: NO excluir templates de recurrencia. Cuando una serie
					// recurrente arranca, el template MISMO representa la primera ocurrencia
					// real (el cron solo genera las siguientes). Excluirlos haría que
					// listCommunityMeetings devuelva 0 si solo existe el template y aún no
					// se han materializado instancias. Sí excluimos announcements (comunicados,
					// sin asistencia) y excepciones canceladas.
					const qb = meetingRepo
						.createQueryBuilder('m')
						.where('m.communityId = :cId', { cId })
						.andWhere('(m.isAnnouncement IS NULL OR m.isAnnouncement = 0)')
						.andWhere('(m.exceptionType IS NULL OR m.exceptionType != :cancelled)', {
							cancelled: 'cancelled',
						})
						.orderBy('m.startDate', 'DESC')
						.limit(limit || 10);
					if (onlyUpcoming) {
						qb.andWhere('m.startDate >= datetime("now")');
					}
					const meetings = await qb.getMany();
					const now = new Date();
					// Resolver la timezone de la comunidad para formatear fechas legibles.
					// Las fechas en BD están en UTC; el coordinador piensa en hora local.
					// Si el LLM solo ve UTC, suele equivocarse al comparar contra "ayer".
					const community = await AppDataSource.getRepository(Community).findOne({
						where: { id: cId },
						select: ['timezone'],
					});
					const tz = community?.timezone || 'America/Mexico_City';
					const fmtDate = new Intl.DateTimeFormat('es-MX', {
						timeZone: tz,
						weekday: 'long',
						year: 'numeric',
						month: 'long',
						day: 'numeric',
					});
					const fmtTime = new Intl.DateTimeFormat('es-MX', {
						timeZone: tz,
						hour: '2-digit',
						minute: '2-digit',
					});
					const toLocal = (d: Date | null | undefined): string | null => {
						if (!d) return null;
						return `${fmtDate.format(d)}, ${fmtTime.format(d)}`;
					};
					return {
						timezone: tz,
						currentTimeLocal: toLocal(now),
						count: meetings.length,
						meetings: meetings.map((m) => ({
							id: m.id,
							title: m.title,
							startDate: m.startDate,
							startDateLocal: toLocal(m.startDate),
							endDate: m.endDate,
							endDateLocal: toLocal(m.endDate),
							isPast: m.startDate < now,
							isRecurring: !!m.recurrenceFrequency,
							recurrenceFrequency: m.recurrenceFrequency ?? null,
							isRecurrenceTemplate: !!m.isRecurrenceTemplate,
						})),
					};
				},
			},
			recordMeetingAttendance: {
				description:
					'Registra asistencia de varios miembros a una reunión de comunidad. Cada attendee puede identificarse por memberId, email, cellPhone o nombre completo. Hace upsert (acumulativo, no borra marcas previas).',
				inputSchema: jsonSchema<{
					communityId: string;
					meetingId: string;
					attendees: Array<{
						memberId?: string;
						name?: string;
						email?: string;
						cellPhone?: string;
					}>;
					attended?: boolean;
				}>({
					type: 'object',
					properties: {
						communityId: { type: 'string', description: 'ID de la comunidad' },
						meetingId: {
							type: 'string',
							description:
								'ID de la reunión. Si no lo tienes, usa listCommunityMeetings y pregúntale al usuario cuál.',
						},
						attendees: {
							type: 'array',
							description:
								'Lista de asistentes. Cada uno debe traer al menos uno de: memberId, email, cellPhone, name.',
							items: {
								type: 'object',
								properties: {
									memberId: { type: 'string' },
									name: { type: 'string', description: 'Nombre completo (firstName + lastName)' },
									email: { type: 'string' },
									cellPhone: { type: 'string' },
								},
							},
						},
						attended: {
							type: 'boolean',
							description:
								'Si los marca como asistentes (true) o como ausentes (false). Default true.',
						},
					},
					required: ['communityId', 'meetingId', 'attendees'],
				}),
				execute: async ({ communityId: cId, meetingId, attendees, attended }) => {
					try {
						await verifyCommunityAdminAccess(userId, cId);
					} catch (e: any) {
						return { error: e.message || 'Sin acceso' };
					}

					if (!Array.isArray(attendees) || attendees.length === 0) {
						return { error: 'Lista de asistentes vacía' };
					}

					// Verificar que la reunión pertenece a la comunidad (defense-in-depth).
					const meeting = await AppDataSource.getRepository(CommunityMeeting).findOne({
						where: { id: meetingId, communityId: cId },
					});
					if (!meeting) {
						return { error: 'La reunión no existe o no pertenece a esta comunidad' };
					}

					const service = new CommunityService();
					const result = await service.bulkRecordAttendance(
						cId,
						meetingId,
						attendees,
						attended ?? true,
					);

					return {
						success: true,
						meeting: { id: meeting.id, title: meeting.title, startDate: meeting.startDate },
						summary: {
							marked: result.marked.length,
							notFound: result.notFound.length,
							ambiguous: result.ambiguous.length,
						},
						marked: result.marked,
						notFound: result.notFound,
						ambiguous: result.ambiguous,
						attendedApplied: attended ?? true,
					};
				},
			},
		},
	});
}

export function isConfigured(): boolean {
	const { provider, anthropicApiKey, googleApiKey, openaiApiKey } = config.ai;
	switch (provider) {
		case 'anthropic':
			return !!anthropicApiKey;
		case 'google':
			return !!googleApiKey;
		case 'openai':
			return !!openaiApiKey;
		default:
			return false;
	}
}
