import { DataSource } from 'typeorm';
import { ServiceTeam } from '../entities/serviceTeam.entity';
import { ServiceTeamMember } from '../entities/serviceTeamMember.entity';
import { Retreat } from '../entities/retreat.entity';
import { getRepositories } from '../utils/repositoryHelpers';
import { v4 as uuidv4 } from 'uuid';
import { defaultServiceTeams } from '../data/dynamicsTemplates';
import { formatDate as formatDateUtil } from '@repo/utils';

export const findTeamsByRetreatId = async (retreatId: string, dataSource?: DataSource) => {
	const repos = getRepositories(dataSource);
	return repos.serviceTeam
		.createQueryBuilder('team')
		.leftJoinAndSelect('team.leader', 'leader')
		.leftJoinAndSelect('team.members', 'members')
		.leftJoinAndSelect('members.participant', 'participant')
		.where('team.retreatId = :retreatId', { retreatId })
		.orderBy('team.priority', 'ASC')
		.addOrderBy('team.name', 'ASC')
		.getMany();
};

export const findTeamById = async (id: string, dataSource?: DataSource) => {
	const repos = getRepositories(dataSource);
	return repos.serviceTeam.findOne({
		where: { id },
		relations: ['leader', 'members', 'members.participant'],
	});
};

export const createTeam = async (data: any, dataSource?: DataSource) => {
	const repos = getRepositories(dataSource);
	const team = repos.serviceTeam.create({
		id: uuidv4(),
		...data,
	});
	await repos.serviceTeam.save(team);
	return findTeamById(team.id, dataSource);
};

export const updateTeam = async (id: string, data: any, dataSource?: DataSource) => {
	const repos = getRepositories(dataSource);
	await repos.serviceTeam.update(id, data);
	return findTeamById(id, dataSource);
};

export const deleteTeam = async (id: string, dataSource?: DataSource) => {
	const repos = getRepositories(dataSource);
	await repos.serviceTeam.delete(id);
};

export const addMember = async (
	teamId: string,
	participantId: string,
	role?: string,
	sourceTeamId?: string,
	dataSource?: DataSource,
) => {
	const repos = getRepositories(dataSource);

	// If coming from another team, remove from source first
	if (sourceTeamId) {
		await repos.serviceTeamMember.delete({
			serviceTeamId: sourceTeamId,
			participantId,
		});
	}

	// Check if already a member
	const existing = await repos.serviceTeamMember.findOne({
		where: { serviceTeamId: teamId, participantId },
	});
	if (existing) {
		return findTeamById(teamId, dataSource);
	}

	const member = repos.serviceTeamMember.create({
		id: uuidv4(),
		serviceTeamId: teamId,
		participantId,
		role: role || null,
	});
	await repos.serviceTeamMember.save(member);
	return findTeamById(teamId, dataSource);
};

export const removeMember = async (
	teamId: string,
	participantId: string,
	dataSource?: DataSource,
) => {
	const repos = getRepositories(dataSource);

	// Also unset leader if this participant was the leader
	const team = await repos.serviceTeam.findOne({ where: { id: teamId } });
	if (team && team.leaderId === participantId) {
		await repos.serviceTeam.update(teamId, { leaderId: undefined });
	}

	await repos.serviceTeamMember.delete({
		serviceTeamId: teamId,
		participantId,
	});
	return findTeamById(teamId, dataSource);
};

export const assignLeader = async (
	teamId: string,
	participantId: string,
	sourceTeamId?: string,
	dataSource?: DataSource,
) => {
	const repos = getRepositories(dataSource);

	// If coming from another team as leader, unset there
	if (sourceTeamId && sourceTeamId !== teamId) {
		const sourceTeam = await repos.serviceTeam.findOne({ where: { id: sourceTeamId } });
		if (sourceTeam && sourceTeam.leaderId === participantId) {
			await repos.serviceTeam.update(sourceTeamId, { leaderId: undefined });
		}
		// Also remove as member from source team
		await repos.serviceTeamMember.delete({
			serviceTeamId: sourceTeamId,
			participantId,
		});
	}

	// Set as leader
	await repos.serviceTeam.update(teamId, { leaderId: participantId });

	// Also add as member if not already
	const existing = await repos.serviceTeamMember.findOne({
		where: { serviceTeamId: teamId, participantId },
	});
	if (!existing) {
		const member = repos.serviceTeamMember.create({
			id: uuidv4(),
			serviceTeamId: teamId,
			participantId,
			role: 'líder',
		});
		await repos.serviceTeamMember.save(member);
	}

	return findTeamById(teamId, dataSource);
};

export const unassignLeader = async (teamId: string, dataSource?: DataSource) => {
	const repos = getRepositories(dataSource);
	await repos.serviceTeam.update(teamId, { leaderId: undefined });
	return findTeamById(teamId, dataSource);
};

export const createDefaultServiceTeamsForRetreat = async (
	retreat: Retreat,
	dataSource?: DataSource,
) => {
	const repos = getRepositories(dataSource);

	const teams = defaultServiceTeams.map((template) => {
		return repos.serviceTeam.create({
			id: uuidv4(),
			name: template.name,
			teamType: template.teamType,
			description: template.description,
			instructions: template.instructions || null,
			retreatId: retreat.id,
			priority: template.priority,
			isActive: true,
		});
	});

	await repos.serviceTeam.save(teams);
};

export const exportTeamsToDocx = async (retreatId: string, dataSource?: DataSource) => {
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

	const teams = await findTeamsByRetreatId(retreatId, dataSource);
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
					text: 'EQUIPOS DE SERVICIO',
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

	for (const team of teams) {
		// Team name
		children.push(
			new Paragraph({
				children: [
					new TextRun({ text: team.name, bold: true, size: 22, color: '2C5282' }),
					new TextRun({ text: `  (${team.teamType})`, size: 18, color: '718096' }),
				],
				spacing: { before: 300, after: 100 },
			}),
		);

		if (team.description) {
			children.push(
				new Paragraph({
					children: [new TextRun({ text: team.description, size: 18, italics: true, color: '4A5568' })],
					spacing: { after: 100 },
				}),
			);
		}

		// Leader
		const leaderName = team.leader
			? `${team.leader.firstName} ${team.leader.lastName}`
			: 'Sin asignar';

		children.push(
			new Paragraph({
				children: [
					new TextRun({ text: 'Líder: ', bold: true, size: 20 }),
					new TextRun({ text: leaderName, size: 20 }),
				],
				spacing: { after: 100 },
			}),
		);

		// Members table
		const memberRows = (team.members || [])
			.filter((m) => m.participantId !== team.leaderId)
			.map((m) => {
				const p = m.participant;
				return new TableRow({
					children: [
						new TableCell({
							children: [
								new Paragraph({
									children: [
										new TextRun({ text: p ? `${p.firstName} ${p.lastName}` : 'N/A', size: 18 }),
									],
								}),
							],
							width: { size: 40, type: WidthType.PERCENTAGE },
						}),
						new TableCell({
							children: [
								new Paragraph({
									children: [new TextRun({ text: p?.cellPhone || '', size: 18 })],
								}),
							],
							width: { size: 30, type: WidthType.PERCENTAGE },
						}),
						new TableCell({
							children: [
								new Paragraph({
									children: [new TextRun({ text: p?.email || '', size: 18 })],
								}),
							],
							width: { size: 30, type: WidthType.PERCENTAGE },
						}),
					],
				});
			});

		if (memberRows.length > 0) {
			const headerRow = new TableRow({
				children: [
					new TableCell({
						children: [
							new Paragraph({
								children: [new TextRun({ text: 'Nombre', bold: true, size: 18, color: 'FFFFFF' })],
							}),
						],
						shading: { type: ShadingType.SOLID, color: '2C5282' },
						width: { size: 40, type: WidthType.PERCENTAGE },
					}),
					new TableCell({
						children: [
							new Paragraph({
								children: [new TextRun({ text: 'Teléfono', bold: true, size: 18, color: 'FFFFFF' })],
							}),
						],
						shading: { type: ShadingType.SOLID, color: '2C5282' },
						width: { size: 30, type: WidthType.PERCENTAGE },
					}),
					new TableCell({
						children: [
							new Paragraph({
								children: [new TextRun({ text: 'Email', bold: true, size: 18, color: 'FFFFFF' })],
							}),
						],
						shading: { type: ShadingType.SOLID, color: '2C5282' },
						width: { size: 30, type: WidthType.PERCENTAGE },
					}),
				],
			});

			children.push(
				new Paragraph({
					children: [new TextRun({ text: `Miembros (${memberRows.length}):`, bold: true, size: 20 })],
					spacing: { before: 100, after: 50 },
				}),
			);

			const membersTable = new DocxTable({
				rows: [headerRow, ...memberRows],
				width: { size: 100, type: WidthType.PERCENTAGE },
			});
			children.push(membersTable as unknown as ParagraphType);
		} else {
			children.push(
				new Paragraph({
					children: [new TextRun({ text: 'Sin miembros asignados', size: 18, italics: true, color: '718096' })],
					spacing: { after: 100 },
				}),
			);
		}

		// Instructions
		if (team.instructions) {
			children.push(
				new Paragraph({
					children: [new TextRun({ text: 'Instrucciones:', bold: true, size: 20 })],
					spacing: { before: 200, after: 50 },
				}),
			);

			// Simple markdown-to-text: split by lines
			const lines = team.instructions.split('\n');
			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed) continue;
				if (trimmed.startsWith('## ')) {
					children.push(
						new Paragraph({
							children: [
								new TextRun({ text: trimmed.replace('## ', ''), bold: true, size: 20 }),
							],
							spacing: { before: 100, after: 50 },
						}),
					);
				} else if (trimmed.startsWith('### ')) {
					children.push(
						new Paragraph({
							children: [
								new TextRun({ text: trimmed.replace('### ', ''), bold: true, size: 18 }),
							],
							spacing: { before: 80, after: 30 },
						}),
					);
				} else if (trimmed.startsWith('- ')) {
					children.push(
						new Paragraph({
							children: [new TextRun({ text: `  • ${trimmed.replace('- ', '')}`, size: 18 })],
							spacing: { after: 20 },
						}),
					);
				} else {
					children.push(
						new Paragraph({
							children: [new TextRun({ text: trimmed, size: 18 })],
							spacing: { after: 20 },
						}),
					);
				}
			}
		}

		// Separator
		children.push(
			new Paragraph({
				children: [new TextRun({ text: '' })],
				spacing: { before: 200, after: 200 },
				border: {
					bottom: { color: 'E2E8F0', size: 1, style: BorderStyle.SINGLE },
				},
			}),
		);
	}

	const doc = new Document({
		sections: [{ children }],
	});

	return Packer.toBuffer(doc);
};
