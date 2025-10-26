import { AppDataSource } from '../data-source';
import { TableMesa } from '../entities/tableMesa.entity';
import { Participant } from '../entities/participant.entity';
import { Retreat } from '../entities/retreat.entity';
import { v4 as uuidv4 } from 'uuid';
import { In } from 'typeorm';
import { tableMesaSchema } from '@repo/types';

const tableMesaRepository = AppDataSource.getRepository(TableMesa);
const participantRepository = AppDataSource.getRepository(Participant);

const MAX_WALKERS_PER_TABLE = 7;

export const findTablesByRetreatId = async (retreatId: string) => {
	const tables = await tableMesaRepository
		.createQueryBuilder('table')
		.leftJoinAndSelect('table.lider', 'lider')
		.leftJoinAndSelect('table.colider1', 'colider1')
		.leftJoinAndSelect('table.colider2', 'colider2')
		.leftJoinAndSelect('table.walkers', 'walkers')
		.leftJoinAndSelect('walkers.retreatBed', 'retreatBed')
		.where('table.retreatId = :retreatId', { retreatId })
		.orderBy('table.name', 'ASC')
		.getMany();

	return tableMesaSchema.array().parse(tables);
};

export const findTableById = async (id: string) => {
	return tableMesaRepository
		.createQueryBuilder('table')
		.leftJoinAndSelect('table.lider', 'lider')
		.leftJoinAndSelect('table.colider1', 'colider1')
		.leftJoinAndSelect('table.colider2', 'colider2')
		.leftJoinAndSelect('table.walkers', 'walkers')
		.leftJoinAndSelect('walkers.retreatBed', 'retreatBed')
		.where('table.id = :id', { id })
		.getOne();
};

export const createTable = async (tableData: { name: string; retreatId: string }) => {
	const newTable = tableMesaRepository.create({
		...tableData,
		id: uuidv4(),
	});
	return tableMesaRepository.save(newTable);
};

export const createDefaultTablesForRetreat = async (retreat: Retreat) => {
	for (let i = 1; i <= 5; i++) {
		const newTable = tableMesaRepository.create({
			id: uuidv4(),
			name: `Table ${i}`,
			retreatId: retreat.id,
		});
		await tableMesaRepository.save(newTable);
	}
};

export const updateTable = async (id: string, tableData: Partial<TableMesa>) => {
	const table = await tableMesaRepository.findOneBy({ id });
	if (!table) return null;
	tableMesaRepository.merge(table, tableData);
	return tableMesaRepository.save(table);
};

export const deleteTable = async (id: string) => {
	await tableMesaRepository.delete(id);
};

export const assignLeaderToTable = async (
	tableId: string,
	participantId: string,
	role: 'lider' | 'colider1' | 'colider2',
) => {
	const table = await findTableById(tableId);
	if (!table) throw new Error('Table not found');

	const participant = await participantRepository.findOneBy({ id: participantId });
	if (!participant) throw new Error('Participant not found');
	if (participant.type !== 'server') throw new Error('Only servers can be assigned as leaders.');
	if (participant.isCancelled) throw new Error('Cannot assign cancelled participants as leaders.');

	// Un-assign the participant from any other leader role they might have
	await AppDataSource.createQueryBuilder()
		.update(TableMesa)
		.set({ liderId: null })
		.where({ liderId: participantId })
		.execute();
	await AppDataSource.createQueryBuilder()
		.update(TableMesa)
		.set({ colider1Id: null })
		.where({ colider1Id: participantId })
		.execute();
	await AppDataSource.createQueryBuilder()
		.update(TableMesa)
		.set({ colider2Id: null })
		.where({ colider2Id: participantId })
		.execute();

	// Assign to the new role
	table[`${role}Id`] = participantId;
	await tableMesaRepository.save(table);
	return findTableById(tableId); // Return the table with all relations
};

export const unassignLeaderFromTable = async (
	tableId: string,
	role: 'lider' | 'colider1' | 'colider2',
) => {
	const table = await findTableById(tableId);
	if (!table) throw new Error('Table not found');

	// Use a direct update to set the foreign key to null, which is more reliable.
	await tableMesaRepository.update(tableId, { [`${role}Id`]: null });

	return findTableById(tableId); // Refetch to get the updated state with relations.
};

export const assignWalkerToTable = async (tableId: string, participantId: string) => {
	const participant = await participantRepository.findOneBy({ id: participantId });
	if (!participant) throw new Error('Participant not found');
	if (participant.type !== 'walker') throw new Error('Only walkers can be assigned to a table.');
	if (participant.isCancelled) throw new Error('Cannot assign cancelled participants to tables.');

	participant.tableId = tableId as string | null;
	await participantRepository.save(participant);
	return findTableById(tableId);
};

export const unassignWalkerFromTable = async (tableId: string, participantId: string) => {
	const participant = await participantRepository.findOneBy({ id: participantId });
	if (!participant) throw new Error('Participant not found');

	participant.tableId = null;
	await participantRepository.save(participant);
	return findTableById(tableId);
};

export const rebalanceTablesForRetreat = async (retreatId: string) => {
	console.log(`🔄 Rebalancing tables for retreat ${retreatId}...`);
	const walkers = await participantRepository.find({
		where: { retreatId, type: 'walker', isCancelled: false },
		order: { registrationDate: 'ASC' },
	});
	const tables = await tableMesaRepository.find({
		where: { retreatId },
		order: { name: 'ASC' },
	});

	const walkerCount = walkers.length;
	const tableCount = tables.length;

	const idealTableCount = Math.max(1, Math.ceil(walkerCount / MAX_WALKERS_PER_TABLE));

	if (tableCount < idealTableCount) {
		for (let i = tableCount + 1; i <= idealTableCount; i++) {
			const newTable = await createTable({ name: `Table ${i}`, retreatId });
			tables.push(newTable);
		}
	} else if (tableCount > idealTableCount && tableCount > 5) {
		const tablesToDelete = tables.slice(idealTableCount);
		const emptyTablesToDelete = tablesToDelete.filter((t) => {
			const walkersAtTable = walkers.filter((w) => w.tableId === t.id);
			return walkersAtTable.length === 0;
		});
		const tableIdsToDelete = emptyTablesToDelete.map((t) => t.id);
		if (tableIdsToDelete.length > 0) {
			await tableMesaRepository.delete({ id: In(tableIdsToDelete) });
		}
		// This splice is optimistic. A better approach would be to refetch.
		tables.splice(idealTableCount);
	}

	// Unassign all non-cancelled walkers in a single query
	await AppDataSource.createQueryBuilder()
		.update(Participant)
		.set({ tableId: null })
		.where({ retreatId, type: 'walker', isCancelled: false })
		.execute();

	// Distribute walkers
	if (walkers.length === 0 || tables.length === 0) {
		return;
	}

	const tableWalkerCounts: Record<string, number> = tables.reduce(
		(acc, t) => ({ ...acc, [t.id]: 0 }),
		{},
	);
	const walkerAssignments: { id: string; tableId: string | null }[] = [];
	const assignedWalkersByInviter: Record<string, string[]> = {}; // inviter -> tableId[]

	for (const walker of walkers) {
		let availableTables = [...tables];

		// If the walker was invited by someone, filter out tables where another walker invited by the same person already is.
		if (walker.invitedBy && assignedWalkersByInviter[walker.invitedBy]) {
			const tablesToExclude = assignedWalkersByInviter[walker.invitedBy];
			const filteredTables = availableTables.filter((t) => !tablesToExclude.includes(t.id));
			// If filtering leaves at least one table, use the filtered list. Otherwise, use all tables to ensure assignment.
			if (filteredTables.length > 0) {
				availableTables = filteredTables;
			}
		}

		// Sort available tables by the number of walkers they currently have, ascending.
		availableTables.sort((a, b) => tableWalkerCounts[a.id] - tableWalkerCounts[b.id]);

		// Assign the walker to the least populated table.
		const targetTable = availableTables[0];
		walkerAssignments.push({ id: walker.id, tableId: targetTable.id });
		tableWalkerCounts[targetTable.id]++;

		// Track the assignment for the inviter constraint.
		if (walker.invitedBy) {
			if (!assignedWalkersByInviter[walker.invitedBy]) {
				assignedWalkersByInviter[walker.invitedBy] = [];
			}
			assignedWalkersByInviter[walker.invitedBy].push(targetTable.id);
		}
	}

	await participantRepository.save(walkerAssignments);
};

export const exportTablesToDocx = async (retreatId: string) => {
	const {
		Document,
		Packer,
		Paragraph,
		TextRun,
		Table: DocxTable,
		TableRow,
		TableCell,
		WidthType,
		HeadingLevel,
		Header,
		Footer,
		AlignmentType,
		BorderStyle,
		ShadingType,
	} = await import('docx');
	type ParagraphType = InstanceType<typeof Paragraph>;

	// Get all tables with their participants
	const tables = await tableMesaRepository
		.createQueryBuilder('table')
		.leftJoinAndSelect('table.lider', 'lider')
		.leftJoinAndSelect('table.colider1', 'colider1')
		.leftJoinAndSelect('table.colider2', 'colider2')
		.leftJoinAndSelect('table.walkers', 'walkers')
		.leftJoinAndSelect('walkers.retreatBed', 'retreatBed')
		.where('table.retreatId = :retreatId', { retreatId })
		.orderBy('table.name', 'ASC')
		.getMany();

	// Get retreat information
	const retreat = await AppDataSource.getRepository(Retreat).findOneBy({ id: retreatId });
	if (!retreat) throw new Error('Retreat not found');

	// Format retreat dates - handle both Date objects and strings
	const formatDate = (date: Date | string) => {
		if (!date) return 'Fecha no disponible';

		let dateObj: Date;
		if (typeof date === 'string') {
			dateObj = new Date(date);
		} else {
			dateObj = date;
		}

		// Check if date is valid
		if (isNaN(dateObj.getTime())) {
			return 'Fecha inválida';
		}

		return dateObj.toLocaleDateString('es-ES', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
		});
	};

	const retreatDates = `${formatDate(retreat.startDate)} - ${formatDate(retreat.endDate)}`;
	const generationTime = new Date().toLocaleString('es-ES');

	const children: ParagraphType[] = [];

	// Document header section with retreat information
	children.push(
		new Paragraph({
			children: [
				new TextRun({
					text: '🏠 EMAUS - RETIRO ESPIRITUAL',
					bold: true,
					size: 24,
					color: '2C5282', // Professional blue color
				}),
			],
			alignment: AlignmentType.CENTER,
			spacing: { after: 200 },
		}),
	);

	children.push(
		new Paragraph({
			children: [
				new TextRun({
					text: retreat.parish.toUpperCase(),
					bold: true,
					size: 28,
					color: '1A365D', // Darker blue
				}),
			],
			alignment: AlignmentType.CENTER,
			spacing: { after: 100 },
		}),
	);

	children.push(
		new Paragraph({
			children: [
				new TextRun({
					text: retreatDates,
					size: 20,
					color: '4A5568', // Gray color
				}),
			],
			alignment: AlignmentType.CENTER,
			spacing: { after: 100 },
		}),
	);

	children.push(
		new Paragraph({
			children: [
				new TextRun({
					text: `Generado: ${generationTime}`,
					size: 16,
					italics: true,
					color: '718096', // Lighter gray
				}),
			],
			alignment: AlignmentType.CENTER,
			spacing: { after: 400 },
		}),
	);

	// Document title with enhanced styling
	children.push(
		new Paragraph({
			children: [
				new TextRun({
					text: 'INFORMACIÓN DE MESAS PARA SERVIDORES',
					bold: true,
					size: 22,
					color: '2D3748', // Dark gray
				}),
			],
			alignment: AlignmentType.CENTER,
			spacing: { before: 300, after: 400 },
			border: {
				bottom: {
					color: 'CBD5E0',
					size: 2,
					style: BorderStyle.SINGLE,
				},
			},
		}),
	);

	// Process each table
	for (let i = 0; i < tables.length; i++) {
		const table = tables[i];
		const isLastTable = i === tables.length - 1;

		// Table title with enhanced styling
		children.push(
			new Paragraph({
				children: [
					new TextRun({
						text: `📋 ${table.name}`,
						bold: true,
						size: 26,
						color: '2B6CB0', // Professional blue
					}),
				],
				spacing: { before: 600, after: 300 },
			}),
		);

		// Leaders section with enhanced styling
		const leaders = [];
		if (table.lider) leaders.push(table.lider);
		if (table.colider1) leaders.push(table.colider1);
		if (table.colider2) leaders.push(table.colider2);

		if (leaders.length > 0) {
			children.push(
				new Paragraph({
					children: [
						new TextRun({
							text: '👥 LÍDERES DE MESA',
							bold: true,
							size: 20,
							color: '2D3748', // Dark gray
						}),
					],
					spacing: { before: 300, after: 200 },
				}),
			);

			// Enhanced leader table with professional styling
			const leaderRows = [
				new TableRow({
					children: [
						new TableCell({
							children: [
								new Paragraph({
									children: [
										new TextRun({ text: 'NOMBRE COMPLETO', bold: true, size: 12, color: 'FFFFFF' }),
									],
									alignment: AlignmentType.CENTER,
								}),
							],
							width: { size: 35, type: WidthType.PERCENTAGE },
							shading: { fill: '2B6CB0', type: ShadingType.SOLID },
							borders: {
								top: { style: BorderStyle.NONE },
								bottom: { style: BorderStyle.NONE },
								left: { style: BorderStyle.NONE },
								right: { style: BorderStyle.NONE },
							},
						}),
						new TableCell({
							children: [
								new Paragraph({
									children: [
										new TextRun({ text: 'TELÉFONOS', bold: true, size: 12, color: 'FFFFFF' }),
									],
									alignment: AlignmentType.CENTER,
								}),
							],
							width: { size: 35, type: WidthType.PERCENTAGE },
							shading: { fill: '2B6CB0', type: ShadingType.SOLID },
							borders: {
								top: { style: BorderStyle.NONE },
								bottom: { style: BorderStyle.NONE },
								left: { style: BorderStyle.NONE },
								right: { style: BorderStyle.NONE },
							},
						}),
						new TableCell({
							children: [
								new Paragraph({
									children: [new TextRun({ text: 'EMAIL', bold: true, size: 12, color: 'FFFFFF' })],
									alignment: AlignmentType.CENTER,
								}),
							],
							width: { size: 30, type: WidthType.PERCENTAGE },
							shading: { fill: '2B6CB0', type: ShadingType.SOLID },
							borders: {
								top: { style: BorderStyle.NONE },
								bottom: { style: BorderStyle.NONE },
								left: { style: BorderStyle.NONE },
								right: { style: BorderStyle.NONE },
							},
						}),
					],
				}),
			];

			for (let j = 0; j < leaders.length; j++) {
				const leader = leaders[j];
				const isEvenRow = j % 2 === 0;

				const phones = [];
				if (leader.homePhone) phones.push(`🏠 ${leader.homePhone}`);
				if (leader.workPhone) phones.push(`🏢 ${leader.workPhone}`);
				if (leader.cellPhone) phones.push(`📱 ${leader.cellPhone}`);

				const rowColor = isEvenRow ? 'F7FAFC' : 'FFFFFF'; // Alternating light gray and white

				leaderRows.push(
					new TableRow({
						children: [
							new TableCell({
								children: [
									new Paragraph({
										children: [
											new TextRun({
												text: `${leader.firstName} ${leader.lastName}`,
												bold: true,
												size: 11,
											}),
										],
										spacing: { before: 50, after: 50 },
									}),
								],
								width: { size: 35, type: WidthType.PERCENTAGE },
								shading: { fill: rowColor, type: ShadingType.SOLID },
								borders: {
									top: { color: 'E2E8F0', size: 1, style: BorderStyle.SINGLE },
									bottom: { color: 'E2E8F0', size: 1, style: BorderStyle.SINGLE },
									left: { color: 'E2E8F0', size: 1, style: BorderStyle.SINGLE },
									right: { color: 'E2E8F0', size: 1, style: BorderStyle.SINGLE },
								},
							}),
							new TableCell({
								children: [
									new Paragraph({
										children: [
											new TextRun({
												text: phones.join('\n') || '📵 Sin teléfono',
												size: 10,
											}),
										],
										spacing: { before: 50, after: 50 },
									}),
								],
								width: { size: 35, type: WidthType.PERCENTAGE },
								shading: { fill: rowColor, type: ShadingType.SOLID },
								borders: {
									top: { color: 'E2E8F0', size: 1, style: BorderStyle.SINGLE },
									bottom: { color: 'E2E8F0', size: 1, style: BorderStyle.SINGLE },
									left: { color: 'E2E8F0', size: 1, style: BorderStyle.SINGLE },
									right: { color: 'E2E8F0', size: 1, style: BorderStyle.SINGLE },
								},
							}),
							new TableCell({
								children: [
									new Paragraph({
										children: [
											new TextRun({
												text: leader.email || '📧 Sin email',
												size: 10,
												italics: !leader.email,
											}),
										],
										spacing: { before: 50, after: 50 },
									}),
								],
								width: { size: 30, type: WidthType.PERCENTAGE },
								shading: { fill: rowColor, type: ShadingType.SOLID },
								borders: {
									top: { color: 'E2E8F0', size: 1, style: BorderStyle.SINGLE },
									bottom: { color: 'E2E8F0', size: 1, style: BorderStyle.SINGLE },
									left: { color: 'E2E8F0', size: 1, style: BorderStyle.SINGLE },
									right: { color: 'E2E8F0', size: 1, style: BorderStyle.SINGLE },
								},
							}),
						],
					}),
				);
			}

			children.push(
				new DocxTable({
					rows: leaderRows,
					width: { size: 100, type: WidthType.PERCENTAGE },
					borders: {
						top: { color: 'CBD5E0', size: 2, style: BorderStyle.SINGLE },
						bottom: { color: 'CBD5E0', size: 2, style: BorderStyle.SINGLE },
						left: { color: 'CBD5E0', size: 2, style: BorderStyle.SINGLE },
						right: { color: 'CBD5E0', size: 2, style: BorderStyle.SINGLE },
					},
					margins: { top: 100, bottom: 200, left: 100, right: 100 },
				}),
			);
		}

		// Enhanced Walkers section
		if (table.walkers && table.walkers.length > 0) {
			children.push(
				new Paragraph({
					children: [
						new TextRun({
							text: '🚶 CAMINANTES DE LA MESA',
							bold: true,
							size: 20,
							color: '2D3748', // Dark gray
						}),
					],
					spacing: { before: 400, after: 200 },
				}),
			);

			// Enhanced walkers table with professional styling
			const walkerRows = [
				new TableRow({
					children: [
						new TableCell({
							children: [
								new Paragraph({
									children: [new TextRun({ text: 'ID', bold: true, size: 10, color: 'FFFFFF' })],
									alignment: AlignmentType.CENTER,
								}),
							],
							width: { size: 6, type: WidthType.PERCENTAGE },
							shading: { fill: '38A169', type: ShadingType.SOLID }, // Green header for walkers
							borders: {
								top: { style: BorderStyle.NONE },
								bottom: { style: BorderStyle.NONE },
								left: { style: BorderStyle.NONE },
								right: { style: BorderStyle.NONE },
							},
						}),
						new TableCell({
							children: [
								new Paragraph({
									children: [
										new TextRun({ text: 'NOMBRE', bold: true, size: 10, color: 'FFFFFF' }),
									],
									alignment: AlignmentType.CENTER,
								}),
							],
							width: { size: 20, type: WidthType.PERCENTAGE },
							shading: { fill: '38A169', type: ShadingType.SOLID },
							borders: {
								top: { style: BorderStyle.NONE },
								bottom: { style: BorderStyle.NONE },
								left: { style: BorderStyle.NONE },
								right: { style: BorderStyle.NONE },
							},
						}),
						new TableCell({
							children: [
								new Paragraph({
									children: [
										new TextRun({ text: 'TELÉFONOS', bold: true, size: 10, color: 'FFFFFF' }),
									],
									alignment: AlignmentType.CENTER,
								}),
							],
							width: { size: 18, type: WidthType.PERCENTAGE },
							shading: { fill: '38A169', type: ShadingType.SOLID },
							borders: {
								top: { style: BorderStyle.NONE },
								bottom: { style: BorderStyle.NONE },
								left: { style: BorderStyle.NONE },
								right: { style: BorderStyle.NONE },
							},
						}),
						new TableCell({
							children: [
								new Paragraph({
									children: [
										new TextRun({ text: 'MEDICAMENTOS', bold: true, size: 10, color: 'FFFFFF' }),
									],
									alignment: AlignmentType.CENTER,
								}),
							],
							width: { size: 18, type: WidthType.PERCENTAGE },
							shading: { fill: '38A169', type: ShadingType.SOLID },
							borders: {
								top: { style: BorderStyle.NONE },
								bottom: { style: BorderStyle.NONE },
								left: { style: BorderStyle.NONE },
								right: { style: BorderStyle.NONE },
							},
						}),
						new TableCell({
							children: [
								new Paragraph({
									children: [
										new TextRun({ text: 'ALIMENTACIÓN', bold: true, size: 10, color: 'FFFFFF' }),
									],
									alignment: AlignmentType.CENTER,
								}),
							],
							width: { size: 18, type: WidthType.PERCENTAGE },
							shading: { fill: '38A169', type: ShadingType.SOLID },
							borders: {
								top: { style: BorderStyle.NONE },
								bottom: { style: BorderStyle.NONE },
								left: { style: BorderStyle.NONE },
								right: { style: BorderStyle.NONE },
							},
						}),
						new TableCell({
							children: [
								new Paragraph({
									children: [
										new TextRun({
											text: 'CONTACTO EMERGENCIA',
											bold: true,
											size: 10,
											color: 'FFFFFF',
										}),
									],
									alignment: AlignmentType.CENTER,
								}),
							],
							width: { size: 20, type: WidthType.PERCENTAGE },
							shading: { fill: '38A169', type: ShadingType.SOLID },
							borders: {
								top: { style: BorderStyle.NONE },
								bottom: { style: BorderStyle.NONE },
								left: { style: BorderStyle.NONE },
								right: { style: BorderStyle.NONE },
							},
						}),
					],
				}),
			];

			for (let k = 0; k < table.walkers.length; k++) {
				const walker = table.walkers[k];
				const isEvenRow = k % 2 === 0;

				const phones = [];
				if (walker.homePhone) phones.push(`🏠 ${walker.homePhone}`);
				if (walker.workPhone) phones.push(`🏢 ${walker.workPhone}`);
				if (walker.cellPhone) phones.push(`📱 ${walker.cellPhone}`);

				// Enhanced medication information with visual indicators
				let medication = '❌ No requiere';
				if (walker.hasMedication) {
					const meds = [];
					if (walker.medicationDetails) meds.push(`💊 ${walker.medicationDetails}`);
					if (walker.medicationSchedule) meds.push(`⏰ ${walker.medicationSchedule}`);
					medication = meds.join('\n') || '✅ Sí (sin detalles)';
				}

				// Enhanced food information with visual indicators
				let food = '✅ Sin restricciones';
				if (walker.hasDietaryRestrictions) {
					food = `⚠️ ${walker.dietaryRestrictionsDetails || 'Con restricciones'}`;
				}

				// Enhanced emergency contact information
				const emergencyContact = `🆘 ${walker.emergencyContact1Name}\n📞 ${walker.emergencyContact1Relation}: ${walker.emergencyContact1CellPhone}`;

				const rowColor = isEvenRow ? 'F0FFF4' : 'FFFFFF'; // Alternating light green and white

				walkerRows.push(
					new TableRow({
						children: [
							new TableCell({
								children: [
									new Paragraph({
										children: [
											new TextRun({
												text: String(walker.id_on_retreat || ''),
												bold: true,
												size: 10,
											}),
										],
										alignment: AlignmentType.CENTER,
										spacing: { before: 40, after: 40 },
									}),
								],
								width: { size: 6, type: WidthType.PERCENTAGE },
								shading: { fill: rowColor, type: ShadingType.SOLID },
								borders: {
									top: { color: 'C6F6D5', size: 1, style: BorderStyle.SINGLE },
									bottom: { color: 'C6F6D5', size: 1, style: BorderStyle.SINGLE },
									left: { color: 'C6F6D5', size: 1, style: BorderStyle.SINGLE },
									right: { color: 'C6F6D5', size: 1, style: BorderStyle.SINGLE },
								},
							}),
							new TableCell({
								children: [
									new Paragraph({
										children: [
											new TextRun({
												text: `${walker.firstName} ${walker.lastName}`,
												bold: true,
												size: 11,
											}),
										],
										spacing: { before: 40, after: 40 },
									}),
								],
								width: { size: 20, type: WidthType.PERCENTAGE },
								shading: { fill: rowColor, type: ShadingType.SOLID },
								borders: {
									top: { color: 'C6F6D5', size: 1, style: BorderStyle.SINGLE },
									bottom: { color: 'C6F6D5', size: 1, style: BorderStyle.SINGLE },
									left: { color: 'C6F6D5', size: 1, style: BorderStyle.SINGLE },
									right: { color: 'C6F6D5', size: 1, style: BorderStyle.SINGLE },
								},
							}),
							new TableCell({
								children: [
									new Paragraph({
										children: [
											new TextRun({
												text: phones.join('\n') || '📵 Sin teléfono',
												size: 9,
											}),
										],
										spacing: { before: 40, after: 40 },
									}),
								],
								width: { size: 18, type: WidthType.PERCENTAGE },
								shading: { fill: rowColor, type: ShadingType.SOLID },
								borders: {
									top: { color: 'C6F6D5', size: 1, style: BorderStyle.SINGLE },
									bottom: { color: 'C6F6D5', size: 1, style: BorderStyle.SINGLE },
									left: { color: 'C6F6D5', size: 1, style: BorderStyle.SINGLE },
									right: { color: 'C6F6D5', size: 1, style: BorderStyle.SINGLE },
								},
							}),
							new TableCell({
								children: [
									new Paragraph({
										children: [
											new TextRun({
												text: medication,
												size: 9,
												bold: walker.hasMedication,
												color: walker.hasMedication ? '744210' : '22543D', // Brown if has medication, dark green if not
											}),
										],
										spacing: { before: 40, after: 40 },
									}),
								],
								width: { size: 18, type: WidthType.PERCENTAGE },
								shading: { fill: rowColor, type: ShadingType.SOLID },
								borders: {
									top: { color: 'C6F6D5', size: 1, style: BorderStyle.SINGLE },
									bottom: { color: 'C6F6D5', size: 1, style: BorderStyle.SINGLE },
									left: { color: 'C6F6D5', size: 1, style: BorderStyle.SINGLE },
									right: { color: 'C6F6D5', size: 1, style: BorderStyle.SINGLE },
								},
							}),
							new TableCell({
								children: [
									new Paragraph({
										children: [
											new TextRun({
												text: food,
												size: 9,
												bold: walker.hasDietaryRestrictions,
												color: walker.hasDietaryRestrictions ? 'C53030' : '22543D', // Red if has restrictions, dark green if not
											}),
										],
										spacing: { before: 40, after: 40 },
									}),
								],
								width: { size: 18, type: WidthType.PERCENTAGE },
								shading: { fill: rowColor, type: ShadingType.SOLID },
								borders: {
									top: { color: 'C6F6D5', size: 1, style: BorderStyle.SINGLE },
									bottom: { color: 'C6F6D5', size: 1, style: BorderStyle.SINGLE },
									left: { color: 'C6F6D5', size: 1, style: BorderStyle.SINGLE },
									right: { color: 'C6F6D5', size: 1, style: BorderStyle.SINGLE },
								},
							}),
							new TableCell({
								children: [
									new Paragraph({
										children: [
											new TextRun({
												text: emergencyContact,
												size: 9,
												bold: true,
												color: 'B91C1C', // Dark red for emergency contact
											}),
										],
										spacing: { before: 40, after: 40 },
									}),
								],
								width: { size: 20, type: WidthType.PERCENTAGE },
								shading: { fill: rowColor, type: ShadingType.SOLID },
								borders: {
									top: { color: 'C6F6D5', size: 1, style: BorderStyle.SINGLE },
									bottom: { color: 'C6F6D5', size: 1, style: BorderStyle.SINGLE },
									left: { color: 'C6F6D5', size: 1, style: BorderStyle.SINGLE },
									right: { color: 'C6F6D5', size: 1, style: BorderStyle.SINGLE },
								},
							}),
						],
					}),
				);
			}

			children.push(
				new DocxTable({
					rows: walkerRows,
					width: { size: 100, type: WidthType.PERCENTAGE },
					borders: {
						top: { color: '9AE6B4', size: 2, style: BorderStyle.SINGLE },
						bottom: { color: '9AE6B4', size: 2, style: BorderStyle.SINGLE },
						left: { color: '9AE6B4', size: 2, style: BorderStyle.SINGLE },
						right: { color: '9AE6B4', size: 2, style: BorderStyle.SINGLE },
					},
					margins: { top: 100, bottom: 200, left: 100, right: 100 },
				}),
			);
		}

		// Add a visual separator between tables (except for the last one)
		if (!isLastTable) {
			children.push(
				new Paragraph({
					children: [
						new TextRun({
							text: '─────────────────────────────────────────────────',
							color: 'CBD5E0',
							size: 16,
						}),
					],
					alignment: AlignmentType.CENTER,
					spacing: { before: 400, after: 100 },
				}),
			);

			children.push(
				new Paragraph({
					children: [],
					pageBreakBefore: true,
				}),
			);
		} else {
			// Add footer for the last table
			children.push(
				new Paragraph({
					children: [
						new TextRun({
							text: '🙏 Que el Señor bendiga este retiro y a todos sus participantes',
							italics: true,
							size: 12,
							color: '718096',
						}),
					],
					alignment: AlignmentType.CENTER,
					spacing: { before: 600, after: 200 },
				}),
			);
		}
	}

	// Create document with enhanced structure
	const doc = new Document({
		sections: [
			{
				properties: {
					page: {
						// Page margins for better layout
						margin: {
							top: 1440, // 1 inch
							right: 1440,
							bottom: 1440,
							left: 1440,
						},
					},
				},
				// Document header with logo placeholder
				headers: {
					default: new Header({
						children: [
							new Paragraph({
								children: [
									new TextRun({
										text: '[LOGO EMAUS - Reemplazar con imagen real]',
										color: 'CBD5E0',
										size: 8,
										italics: true,
									}),
								],
								alignment: AlignmentType.CENTER,
							}),
						],
					}),
				},
				// Document footer with page numbers
				footers: {
					default: new Footer({
						children: [
							new Paragraph({
								children: [
									new TextRun({
										text: 'Página 1',
										size: 9,
										color: '718096',
									}),
								],
								alignment: AlignmentType.CENTER,
								spacing: { before: 200 },
							}),
							new Paragraph({
								children: [
									new TextRun({
										text: `Documento generado el ${generationTime} - EMAUS Sistema de Gestión`,
										size: 8,
										color: 'A0AEC0',
										italics: true,
									}),
								],
								alignment: AlignmentType.CENTER,
								spacing: { before: 50 },
							}),
						],
					}),
				},
				children,
			},
		],
	});

	// Generate buffer
	const buffer = await Packer.toBuffer(doc);
	return buffer;
};
