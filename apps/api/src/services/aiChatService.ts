import { streamText, convertToModelMessages, UIMessage, jsonSchema, stepCountIs } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { config } from '../config';
import { findAllParticipants, findParticipantById } from './participantService';
import { getRetreatsForUser, findById as findRetreatById } from './retreatService';
import { findTablesByRetreatId, assignWalkerToTable, unassignWalkerFromTable, assignLeaderToTable, unassignLeaderFromTable, findTableById } from './tableMesaService';
import { getRetreatInventory, getInventoryAlerts } from './inventoryService';
import { findAllResponsibilities } from './responsabilityService';
import { AppDataSource } from '../data-source';
import { Payment } from '../entities/payment.entity';
import { Participant } from '../entities/participant.entity';
import { RetreatParticipant } from '../entities/retreatParticipant.entity';
import { RetreatBed, BedType } from '../entities/retreatBed.entity';
import { authorizationService } from '../middleware/authorization';
import { Like } from 'typeorm';

async function verifyRetreatAccess(userId: string, retreatId: string): Promise<void> {
	const hasAccess = await authorizationService.hasRetreatAccess(userId, retreatId);
	if (!hasAccess) {
		throw new Error('No tienes acceso a este retiro.');
	}
}

function buildSystemPrompt(retreatId?: string) {
	const now = new Date();
	const dateStr = now.toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Mexico_City' });
	const timeStr = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' });
	let prompt = `Eres Jessy, la asistente virtual del sistema de gestión de retiros Emaús.
Fecha y hora actual: ${dateStr}, ${timeStr} (Ciudad de México).
Puedes consultar datos del sistema usando las herramientas disponibles.
Responde siempre en español. Sé concisa y útil.

Tus capacidades:
- Buscar participantes por nombre y ver sus detalles completos (teléfono, dirección, contactos de emergencia, etc.)
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

IMPORTANTE para cambios de mesa y cama:
- Antes de hacer un cambio, confirma con el usuario los datos: nombre del participante, mesa/cama destino.
- Si el usuario no especifica IDs exactos, usa searchParticipants y getTableAssignments/getRetreatBeds para encontrarlos.
- Siempre confirma la acción antes de ejecutarla mostrando qué vas a hacer.

Cuando el usuario pregunte por datos de una persona (teléfono, email, dirección, contactos de emergencia, etc.), usa getParticipantDetails para obtener toda la información.
Si preguntan por un familiar o contacto de emergencia, revisa los campos de contactos de emergencia del participante.`;
	if (retreatId) {
		prompt += `\n\nEl usuario tiene seleccionado el retiro con ID: ${retreatId}. Usa este ID como valor por defecto en las herramientas que requieran retreatId, a menos que el usuario indique otro retiro.`;
	}
	return prompt;
}

function getModel() {
	const { provider, model } = config.ai;
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

export async function createChatStream(messages: UIMessage[], userId: string, retreatId?: string) {
	const modelMessages = await convertToModelMessages(messages);
	return streamText({
		model: getModel(),
		system: buildSystemPrompt(retreatId),
		messages: modelMessages,
		maxOutputTokens: config.ai.maxTokens,
		stopWhen: stepCountIs(5),
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
					const repo = AppDataSource.getRepository(Participant);
					const participants = await repo.find({
						where: [
							{ retreatId, firstName: Like(`%${query}%`) },
							{ retreatId, lastName: Like(`%${query}%`) },
						],
						relations: ['payments', 'retreat'],
					});
					return {
						count: participants.length,
						participants: participants.map((p) => ({
							id: p.id,
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
					if (p.retreatId) {
						await verifyRetreatAccess(userId, p.retreatId);
					}
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
