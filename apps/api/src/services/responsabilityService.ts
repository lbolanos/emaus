import { DataSource, Like, In } from 'typeorm';
import { AppDataSource } from '../data-source';
import { Responsability, ResponsabilityType } from '../entities/responsability.entity';
import { Retreat } from '../entities/retreat.entity';
import { Participant } from '../entities/participant.entity';
import { ScheduleTemplate } from '../entities/scheduleTemplate.entity';
import { getRepositories } from '../utils/repositoryHelpers';
import { v4 as uuidv4 } from 'uuid';
import { formatDate as formatDateUtil } from '@repo/utils';
import { syncResponsibilityToTeam } from './leaderSyncService';

export const findAllResponsibilities = async (retreatId?: string, dataSource?: DataSource) => {
	const repos = getRepositories(dataSource);
	const where = retreatId ? { retreatId } : {};
	return (
		repos.responsability?.find({
			where,
			relations: ['retreat', 'participant'],
		}) || []
	);
};

export const findPalanqueroAssignments = async (retreatId: string, dataSource?: DataSource) => {
	const repos = getRepositories(dataSource);
	return repos.responsability
		.createQueryBuilder('r')
		.leftJoin('r.participant', 'p')
		.select(['r.id', 'r.name', 'r.participantId', 'p.id', 'p.firstName', 'p.lastName'])
		.where('r.retreatId = :retreatId', { retreatId })
		.andWhere('r.name IN (:...names)', { names: ['Palanquero 1', 'Palanquero 2', 'Palanquero 3'] })
		.getMany();
};

export const findResponsabilityById = async (id: string, dataSource?: DataSource) => {
	const repos = getRepositories(dataSource);
	return repos.responsability.findOne({
		where: { id },
		relations: ['retreat', 'participant'],
	});
};

export const createResponsability = async (
	responsabilityData: {
		name: string;
		description?: string;
		retreatId: string;
		responsabilityType?: string;
	},
	dataSource?: DataSource,
) => {
	const repos = getRepositories(dataSource);
	const newResponsability = repos.responsability.create({
		...responsabilityData,
		id: uuidv4(),
	});
	return repos.responsability.save(newResponsability);
};

export const updateResponsability = async (
	id: string,
	responsabilityData: Partial<{ name: string; description?: string }>,
	dataSource?: DataSource,
) => {
	const repos = getRepositories(dataSource);
	const responsability = await repos.responsability.findOne({ where: { id } });
	if (!responsability) return null;
	Object.assign(responsability, responsabilityData);
	return repos.responsability.save(responsability);
};

export const deleteResponsability = async (id: string, dataSource?: DataSource) => {
	const repos = getRepositories(dataSource);
	await repos.responsability.delete(id);
};

export const assignResponsabilityToParticipant = async (
	responsabilityId: string,
	participantId: string,
	dataSource?: DataSource,
) => {
	const repos = getRepositories(dataSource);

	const responsability = await repos.responsability.findOne({
		where: { id: responsabilityId },
		relations: ['participant'],
	});
	const participant = await repos.participant.findOne({ where: { id: participantId } });

	if (!responsability || !participant) return null;

	responsability.participant = participant;
	const saved = await repos.responsability.save(responsability);
	await syncResponsibilityToTeam(responsability.name, responsability.retreatId, participantId, dataSource);
	return saved;
};

export const removeResponsabilityFromParticipant = async (
	responsabilityId: string,
	participantId: string,
	dataSource?: DataSource,
) => {
	const repos = getRepositories(dataSource);
	const responsability = await repos.responsability.findOne({
		where: { id: responsabilityId },
		relations: ['participant'],
	});

	if (!responsability || responsability.participantId !== participantId) return null;

	responsability.participant = undefined;
	responsability.participantId = undefined;
	const saved = await repos.responsability.save(responsability);
	await syncResponsibilityToTeam(responsability.name, responsability.retreatId, null, dataSource);
	return saved;
};

export const getResponsibilitiesForParticipant = async (
	participantId: string,
	dataSource?: DataSource,
) => {
	const repos = getRepositories(dataSource);
	return repos.responsability.find({
		where: { participantId },
		relations: ['retreat'],
	});
};

export const getParticipantsForResponsability = async (
	responsabilityId: string,
	dataSource?: DataSource,
) => {
	const repos = getRepositories(dataSource);
	const responsability = await repos.responsability.findOne({
		where: { id: responsabilityId },
		relations: ['participant'],
	});
	return responsability?.participant ? [responsability.participant] : [];
};

export const exportResponsibilitiesToDocx = async (retreatId: string, dataSource?: DataSource) => {
	const {
		Document,
		Packer,
		Paragraph,
		TextRun,
		Table: DocxTable,
		TableRow,
		TableCell,
		WidthType,
		AlignmentType,
		BorderStyle,
		ShadingType,
	} = await import('docx');
	type ParagraphType = InstanceType<typeof Paragraph>;

	const repos = getRepositories(dataSource);

	const responsibilities = await findAllResponsibilities(retreatId, dataSource);
	const retreat = await repos.retreat.findOneBy({ id: retreatId });
	if (!retreat) throw new Error('Retreat not found');

	const formatDate = (date: Date | string): string => {
		if (!date) return 'Fecha no disponible';
		return formatDateUtil(date);
	};

	const retreatDates = `${formatDate(retreat.startDate)} - ${formatDate(retreat.endDate)}`;
	const generationTime = new Date().toLocaleString('es-ES');

	const children: ParagraphType[] = [];

	// Header
	children.push(
		new Paragraph({
			children: [
				new TextRun({ text: 'EMAUS - RETIRO ESPIRITUAL', bold: true, size: 24, color: '2C5282' }),
			],
			alignment: AlignmentType.CENTER,
			spacing: { after: 200 },
		}),
	);

	children.push(
		new Paragraph({
			children: [
				new TextRun({ text: retreat.parish.toUpperCase(), bold: true, size: 28, color: '1A365D' }),
			],
			alignment: AlignmentType.CENTER,
			spacing: { after: 100 },
		}),
	);

	children.push(
		new Paragraph({
			children: [new TextRun({ text: retreatDates, size: 20, color: '4A5568' })],
			alignment: AlignmentType.CENTER,
			spacing: { after: 100 },
		}),
	);

	children.push(
		new Paragraph({
			children: [
				new TextRun({ text: `Generado: ${generationTime}`, size: 16, italics: true, color: '718096' }),
			],
			alignment: AlignmentType.CENTER,
			spacing: { after: 400 },
		}),
	);

	children.push(
		new Paragraph({
			children: [
				new TextRun({
					text: 'RESPONSABILIDADES DEL RETIRO',
					bold: true,
					size: 22,
					color: '2D3748',
				}),
			],
			alignment: AlignmentType.CENTER,
			spacing: { before: 300, after: 400 },
			border: {
				bottom: { color: 'CBD5E0', size: 2, style: BorderStyle.SINGLE },
			},
		}),
	);

	// Table header row
	const headerRow = new TableRow({
		children: [
			new TableCell({
				children: [
					new Paragraph({
						children: [new TextRun({ text: 'Responsabilidad', bold: true, size: 20, color: 'FFFFFF' })],
						alignment: AlignmentType.CENTER,
					}),
				],
				width: { size: 50, type: WidthType.PERCENTAGE },
				shading: { type: ShadingType.SOLID, color: '2C5282' },
			}),
			new TableCell({
				children: [
					new Paragraph({
						children: [new TextRun({ text: 'Servidor Asignado', bold: true, size: 20, color: 'FFFFFF' })],
						alignment: AlignmentType.CENTER,
					}),
				],
				width: { size: 50, type: WidthType.PERCENTAGE },
				shading: { type: ShadingType.SOLID, color: '2C5282' },
			}),
		],
	});

	const dataRows = responsibilities.map((resp, index) => {
		const participantName = resp.participant
			? `${resp.participant.firstName} ${resp.participant.lastName}`
			: 'Sin asignar';
		const bgColor = index % 2 === 0 ? 'F7FAFC' : 'FFFFFF';

		return new TableRow({
			children: [
				new TableCell({
					children: [
						new Paragraph({
							children: [new TextRun({ text: resp.name, size: 18 })],
						}),
					],
					width: { size: 50, type: WidthType.PERCENTAGE },
					shading: { type: ShadingType.SOLID, color: bgColor },
				}),
				new TableCell({
					children: [
						new Paragraph({
							children: [
								new TextRun({
									text: participantName,
									size: 18,
									italics: !resp.participant,
									color: resp.participant ? '000000' : '718096',
								}),
							],
						}),
					],
					width: { size: 50, type: WidthType.PERCENTAGE },
					shading: { type: ShadingType.SOLID, color: bgColor },
				}),
			],
		});
	});

	const table = new DocxTable({
		rows: [headerRow, ...dataRows],
		width: { size: 100, type: WidthType.PERCENTAGE },
	});

	children.push(table as unknown as ParagraphType);

	// Summary stats
	const assignedCount = responsibilities.filter((r) => r.participant).length;
	const unassignedCount = responsibilities.filter((r) => !r.participant).length;

	children.push(
		new Paragraph({
			children: [],
			spacing: { before: 400 },
		}),
	);

	children.push(
		new Paragraph({
			children: [
				new TextRun({ text: `Total: ${responsibilities.length}`, bold: true, size: 20 }),
				new TextRun({ text: '    |    ', size: 20, color: '718096' }),
				new TextRun({ text: `Asignadas: ${assignedCount}`, size: 20, color: '38A169' }),
				new TextRun({ text: '    |    ', size: 20, color: '718096' }),
				new TextRun({ text: `Sin asignar: ${unassignedCount}`, size: 20, color: 'D69E2E' }),
			],
			alignment: AlignmentType.CENTER,
			spacing: { before: 200 },
		}),
	);

	const doc = new Document({
		sections: [{ children }],
	});

	return Packer.toBuffer(doc);
};

export const createDefaultResponsibilitiesForRetreat = async (
	retreat: Retreat,
	dataSource?: DataSource,
) => {
	const repos = getRepositories(dataSource);
	const defaultResponsibilities = [
		'Palanquero 1',
		'Palanquero 2',
		'Palanquero 3',
		'Logistica',
		'Inventario',
		'Tesorero',
		'Sacerdotes',
		'Mantelitos',
		'Snacks',
		'Compras',
		'Transporte',
		'Música',
		'Comedor',
		'Salón',
		'Cuartos',
		'Oración de Intercesión',
		'Palanquitas',
		'Santísimo',
		'Campanero',
		'Continua',
		'Biblias',
		'Explicación Rosario y entrega',
		'Bolsas',
		'Resumen del día',
		'Recepción',
		'Reglamento de la Casa',
		'Despedida',
	];

	const responsibilities = defaultResponsibilities.map((name) =>
		repos.responsability.create({
			id: uuidv4(),
			name,
			retreatId: retreat.id,
			retreat,
		}),
	);

	// Las charlas/textos NO se crean aquí: se generan al materializar el
	// minuto-a-minuto en `ensureCharlaResponsibilitiesFromTemplateSet`,
	// derivadas del TemplateSet escogido (Sta. Clara, Polanco, etc.).
	return repos.responsability.save(responsibilities);
};

export const getDefaultCharlas = () => [
	{ name: 'Charla: De la Rosa', anexo: 'A-2-1' },
	{ name: 'Charla: Conociendo a Dios a través del Conocimiento Personal (Las Máscaras)', anexo: 'A-2-2' },
	{ name: 'Charla: Conociendo a Dios a través de la Escrituras', anexo: 'A-2-3' },
	{ name: 'Charla: Conociendo a Dios a través de la Oración', anexo: 'A-2-4' },
	{ name: 'Charla: Conociendo a Dios a través de los Sacramentos', anexo: 'A-2-5' },
	{ name: 'Charla: Las Cargas que Llevamos', anexo: 'A-2-6' },
	{ name: 'Charla: Sanación de los Recuerdos (Sanando Heridas)', anexo: 'A-2-7' },
	{ name: 'Charla: Conociendo a Dios a través de la Familia y Amigos', anexo: 'A-2-8' },
	{ name: 'Charla: Amando a Dios a través del Servicio', anexo: 'A-2-9' },
	{ name: 'Texto: Explicación del Lema "Jesucristo Ha Resucitado"', anexo: 'A-2-12' },
	{ name: 'Texto: Explicación de la Confidencialidad', anexo: 'A-2-13' },
	{ name: 'Texto: Explicación de La Palanca', anexo: 'A-2-14' },
	{ name: 'Texto: Explicación del Ágape', anexo: 'A-2-15' },
	{ name: 'Texto: Quema de Pecados', anexo: 'A-2-16' },
	{ name: 'Charla: De la Confianza', anexo: 'A-2-17' },
	{ name: 'Texto: Dinámica de la Pared', anexo: 'A-2-18' },
	{ name: 'Texto: Lavado de Manos', anexo: 'A-2-19' },
	{ name: 'Texto: Carta de Jesús', anexo: 'A-2-20' },
	{ name: 'Texto: Oración al Espíritu Santo', anexo: 'A-2-21' },
	{ name: 'Charla: Conocerte a Ti Mismo', anexo: 'A-2-22' },
	{ name: 'Texto: Dinámica de Sanación', anexo: 'A-2-23' },
];

/**
 * Crea las Responsabilidades de tipo CHARLISTA que el TemplateSet escogido
 * requiere y que aún no existen en el retiro. Idempotente.
 *
 * Filtra ScheduleTemplate con `type IN ('charla','testimonio')` y
 * `responsabilityName` definido. Compara contra Responsabilidades del retiro
 * por nombre normalizado (lowercase + trim) — misma lógica que el
 * `relinkResponsibilities` de RetreatScheduleService — y crea las faltantes.
 *
 * Si el `responsabilityName` matchea el catálogo de `getDefaultCharlas()`,
 * la Responsabilidad se crea con `description = anexo` (ej. 'A-2-1').
 */
export const ensureCharlaResponsibilitiesFromTemplateSet = async (
	retreatId: string,
	templateSetId?: string,
	dataSource?: DataSource,
): Promise<{ created: number; alreadyExisting: number }> => {
	const ds = dataSource || AppDataSource;
	const templateRepo = ds.getRepository(ScheduleTemplate);
	const repos = getRepositories(dataSource);

	const where: any = {
		isActive: true,
		type: In(['charla', 'testimonio']),
	};
	if (templateSetId) where.templateSetId = templateSetId;
	const templates = await templateRepo.find({ where });

	// Dedupe por nombre normalizado dentro del propio set (varios items pueden
	// compartir responsabilityName).
	const wantedByNorm = new Map<string, string>();
	for (const t of templates) {
		const name = t.responsabilityName?.trim();
		if (!name) continue;
		wantedByNorm.set(name.toLowerCase(), name);
	}

	if (wantedByNorm.size === 0) {
		return { created: 0, alreadyExisting: 0 };
	}

	const existing = await repos.responsability.find({ where: { retreatId } });
	const existingNorm = new Set(existing.map((r) => r.name.toLowerCase().trim()));

	const anexoByNorm = new Map(
		getDefaultCharlas().map((c) => [c.name.toLowerCase().trim(), c.anexo] as const),
	);

	const toCreate: Responsability[] = [];
	let alreadyExisting = 0;
	for (const [norm, name] of wantedByNorm.entries()) {
		if (existingNorm.has(norm)) {
			alreadyExisting++;
			continue;
		}
		const anexo = anexoByNorm.get(norm) ?? null;
		toCreate.push(
			repos.responsability.create({
				id: uuidv4(),
				name,
				description: anexo,
				responsabilityType: ResponsabilityType.CHARLISTA,
				retreatId,
			}),
		);
	}

	if (toCreate.length) {
		await repos.responsability.save(toCreate);
	}

	return { created: toCreate.length, alreadyExisting };
};

export const searchSpeakers = async (query: string, retreatId?: string, dataSource?: DataSource) => {
	const repos = getRepositories(dataSource);
	const q = `%${query}%`;

	const qb = repos.participant.createQueryBuilder('p');
	qb.where(
		'(p.firstName LIKE :q OR p.lastName LIKE :q OR p.cellPhone LIKE :q OR p.email LIKE :q)',
		{ q },
	);
	if (retreatId) {
		qb.orderBy(
			`CASE WHEN p.retreatId = :orderRetreatId THEN 0 ELSE 1 END`,
			'ASC',
		);
		qb.setParameter('orderRetreatId', retreatId);
	}
	qb.addOrderBy('p.firstName', 'ASC');
	qb.take(20);

	return qb.getMany();
};

export const createAndAssignSpeaker = async (
	responsabilityId: string,
	speakerData: {
		firstName: string;
		lastName: string;
		cellPhone?: string;
		email?: string;
		retreatId: string;
	},
	dataSource?: DataSource,
) => {
	const repos = getRepositories(dataSource);

	const responsability = await repos.responsability.findOne({
		where: { id: responsabilityId },
	});
	if (!responsability) return null;

	// Create a minimal participant as server in this retreat
	const newParticipant = repos.participant.create({
		id: uuidv4(),
		firstName: speakerData.firstName,
		lastName: speakerData.lastName,
		cellPhone: speakerData.cellPhone || '',
		email: speakerData.email || `charlista-${Date.now()}@emaus.temp`,
		type: 'server',
		retreatId: speakerData.retreatId,
		birthDate: new Date('1990-01-01'),
		registrationDate: new Date(),
		lastUpdatedDate: new Date(),
		maritalStatus: 'S',
		street: '',
		houseNumber: '',
		postalCode: '',
		neighborhood: '',
		city: '',
		state: '',
		country: '',
		occupation: '',
		snores: false,
		hasMedication: false,
		hasDietaryRestrictions: false,
		sacraments: [],
		emergencyContact1Name: '',
		emergencyContact1Relation: '',
		emergencyContact1CellPhone: '',
	});

	const savedParticipant = await repos.participant.save(newParticipant);

	// Assign the new participant to the responsibility
	responsability.participant = savedParticipant;
	responsability.participantId = savedParticipant.id;
	const saved = await repos.responsability.save(responsability);
	await syncResponsibilityToTeam(responsability.name, responsability.retreatId, savedParticipant.id, dataSource);

	// Re-fetch with relations
	return repos.responsability.findOne({
		where: { id: saved.id },
		relations: ['retreat', 'participant'],
	});
};
