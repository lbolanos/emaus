import { DataSource, Like } from 'typeorm';
import { AppDataSource } from '../data-source';
import { Responsability, ResponsabilityType } from '../entities/responsability.entity';
import { Retreat } from '../entities/retreat.entity';
import { Participant } from '../entities/participant.entity';
import { getRepositories } from '../utils/repositoryHelpers';
import { v4 as uuidv4 } from 'uuid';
import { formatDate as formatDateUtil } from '@repo/utils';

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
	return repos.responsability.save(responsability);
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
	return repos.responsability.save(responsability);
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
		'Oración',
		'Palanquitas',
		'Santísmo',
		'Campanero',
		'Continua',
	];

	const responsibilities = defaultResponsibilities.map((name) =>
		repos.responsability.create({
			id: uuidv4(),
			name,
			retreatId: retreat.id,
			retreat,
		}),
	);

	// Add default charlas/dinámicas
	const defaultCharlas = getDefaultCharlas();
	const charlaEntities = defaultCharlas.map((charla) =>
		repos.responsability.create({
			id: uuidv4(),
			name: charla.name,
			description: charla.anexo,
			responsabilityType: ResponsabilityType.CHARLISTA,
			retreatId: retreat.id,
			retreat,
		}),
	);

	return repos.responsability.save([...responsibilities, ...charlaEntities]);
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
	{ name: 'Texto: Reflexión sobre Lucas 24, 13-35', anexo: 'A-2-10' },
	{ name: 'Texto: Historia de los Retiros de Emaús', anexo: 'A-2-11' },
	{ name: 'Texto: Explicación del Lema "Jesucristo Ha Resucitado"', anexo: 'A-2-12' },
	{ name: 'Texto: Explicación de la Confidencialidad', anexo: 'A-2-13' },
	{ name: 'Texto: Explicación de La Palanca', anexo: 'A-2-14' },
	{ name: 'Texto: Explicación del Ágape', anexo: 'A-2-15' },
	{ name: 'Texto: Dinámica Examen de Conciencia', anexo: 'A-2-16' },
	{ name: 'Charla: De la Confianza', anexo: 'A-2-17' },
	{ name: 'Texto: Dinámica de la Pared', anexo: 'A-2-18' },
	{ name: 'Texto: Lavado de Manos', anexo: 'A-2-19' },
];

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
			`CASE WHEN p.retreatId = '${retreatId}' THEN 0 ELSE 1 END`,
			'ASC',
		);
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

	// Re-fetch with relations
	return repos.responsability.findOne({
		where: { id: saved.id },
		relations: ['retreat', 'participant'],
	});
};
