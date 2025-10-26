import { AppDataSource } from '../data-source';
import { RetreatBed } from '../entities/retreatBed.entity';
import { Retreat } from '../entities/retreat.entity';
import { Participant } from '../entities/participant.entity';

export const exportBadgesToDocx = async (retreatId: string) => {
	const {
		Document,
		Packer,
		Paragraph,
		TextRun,
		Table: DocxTable,
		TableRow,
		TableCell,
		WidthType,
		Header,
		Footer,
		AlignmentType,
		BorderStyle,
		ShadingType,
		HeadingLevel,
		UnderlineType,
		PageBreak
	} = await import('docx');
	type ParagraphType = InstanceType<typeof Paragraph>;

	// Get retreat beds with participant information
	const retreatBedRepository = AppDataSource.getRepository(RetreatBed);
	const retreat = await AppDataSource.getRepository(Retreat).findOneBy({ id: retreatId });
	if (!retreat) throw new Error('Retreat not found');

	const bedsWithParticipants = await retreatBedRepository
		.createQueryBuilder('bed')
		.leftJoinAndSelect('bed.participant', 'participant')
		.leftJoinAndSelect('participant.tableMesa', 'tableMesa')
		.where('bed.retreatId = :retreatId', { retreatId })
		.andWhere('bed.participant IS NOT NULL')
		.orderBy('bed.floor', 'ASC')
		.addOrderBy('bed.roomNumber', 'ASC')
		.addOrderBy('participant.firstName', 'ASC')
		.addOrderBy('participant.lastName', 'ASC')
		.getMany();

	// Format retreat dates
	const formatDate = (date: Date | string) => {
		if (!date) return 'Fecha no disponible';

		let dateObj: Date;
		if (typeof date === 'string') {
			dateObj = new Date(date);
		} else {
			dateObj = date;
		}

		if (isNaN(dateObj.getTime())) {
			return 'Fecha inválida';
		}

		return dateObj.toLocaleDateString('es-ES', {
			day: '2-digit',
			month: 'long',
			year: 'numeric'
		});
	};

	const retreatDates = `${formatDate(retreat.startDate)} - ${formatDate(retreat.endDate)}`;
	const generationTime = new Date().toLocaleString('es-ES', {
		dateStyle: 'full',
		timeStyle: 'short'
	});

	const children: any[] = [];

	// Document header with red theme
	children.push(
		new Paragraph({
			children: [
				new TextRun({
					text: "🌹 ",
					size: 36,
				}),
				new TextRun({
					text: "EMAUS",
					bold: true,
					size: 42,
					color: "DC2626",
					font: "Arial",
				}),
			],
			alignment: AlignmentType.CENTER,
			spacing: { after: 180 },
		})
	);

	children.push(
		new Paragraph({
			children: [
				new TextRun({
					text: "RETIRO ESPIRITUAL",
					bold: true,
					size: 24,
					color: "991B1B",
					allCaps: true,
					font: "Arial",
					characterSpacing: 40,
				}),
			],
			alignment: AlignmentType.CENTER,
			spacing: { after: 350 },
		})
	);

	children.push(
		new Paragraph({
			children: [
				new TextRun({
					text: retreat.parish.toUpperCase(),
					bold: true,
					size: 36,
					color: "374151",
					font: "Arial",
				}),
			],
			alignment: AlignmentType.CENTER,
			spacing: { after: 250 },
		})
	);

	children.push(
		new Paragraph({
			children: [
				new TextRun({
					text: "📅 ",
					size: 22,
				}),
				new TextRun({
					text: retreatDates,
					size: 24,
					color: "6B7280",
					font: "Arial",
				}),
			],
			alignment: AlignmentType.CENTER,
			spacing: { after: 350 },
		})
	);

	children.push(
		new Paragraph({
			children: [],
			spacing: { after: 600 },
		})
	);

	// Title banner with red theme and rounded effect
	const titleBanner = new DocxTable({
		rows: [
			new TableRow({
				children: [
					new TableCell({
						children: [
							new Paragraph({
								children: [
									new TextRun({
										text: "🌹 ",
										size: 28,
									}),
									new TextRun({
										text: "GAFETES PARA PARTICIPANTES",
										bold: true,
										size: 28,
										color: "1E40AF",
										font: "Arial",
										characterSpacing: 20,
									}),
								],
								alignment: AlignmentType.CENTER,
								spacing: { before: 300, after: 300 }
							})
						],
						shading: {
							fill: "DC2626",
							type: ShadingType.SOLID
						},
						borders: {
							top: { color: "DC2626", size: 40, style: BorderStyle.SINGLE },
							bottom: { color: "DC2626", size: 40, style: BorderStyle.SINGLE },
							left: { color: "DC2626", size: 40, style: BorderStyle.SINGLE },
							right: { color: "DC2626", size: 40, style: BorderStyle.SINGLE }
						},
						margins: { top: 250, bottom: 250, left: 500, right: 500 }
					}),
				],
			}),
		],
		width: { size: 92, type: WidthType.PERCENTAGE },
		alignment: AlignmentType.CENTER,
	});

	children.push(titleBanner);

	children.push(
		new Paragraph({
			children: [],
			spacing: { after: 900 },
		})
	);

	// If no participants assigned to beds, create empty badges section
	if (!bedsWithParticipants || bedsWithParticipants.length === 0) {
		children.push(
			new DocxTable({
				rows: [
					new TableRow({
						children: [
							new TableCell({
								children: [
									new Paragraph({
										children: [
											new TextRun({
												text: "⚠️ ",
												size: 20,
											}),
											new TextRun({
												text: "No hay participantes asignados a habitaciones.",
												size: 18,
												color: "B91C1C",
												font: "Arial",
												bold: true,
											})
										],
										alignment: AlignmentType.CENTER,
										spacing: { before: 250, after: 150 }
									}),
									new Paragraph({
										children: [
											new TextRun({
												text: "Para generar gafetes, primero asigna participantes a las camas desde la vista de 'Asignación de Camas'.",
												size: 16,
												color: "DC2626",
												font: "Arial",
												italics: true,
											})
										],
										alignment: AlignmentType.CENTER,
										spacing: { before: 100, after: 250 }
									})
								],
								shading: {
									fill: "FEF2F2",
									type: ShadingType.SOLID
								},
								borders: {
									top: { color: "EF4444", size: 35, style: BorderStyle.SINGLE },
									bottom: { color: "EF4444", size: 35, style: BorderStyle.SINGLE },
									left: { color: "EF4444", size: 35, style: BorderStyle.SINGLE },
									right: { color: "EF4444", size: 35, style: BorderStyle.SINGLE }
								},
								margins: { top: 250, bottom: 250, left: 450, right: 450 }
							}),
						],
					}),
				],
				width: { size: 95, type: WidthType.PERCENTAGE },
				alignment: AlignmentType.CENTER,
			})
		);

		children.push(
			new Paragraph({
				children: [],
				spacing: { before: 400 },
			})
		);
	} else {

	// Generate badges in groups of 3 per row for printability with red theme
	const badges = bedsWithParticipants.map(bed => {
		const participant = bed.participant!;
		const getDisplayName = () => {
			return participant.nickname || participant.firstName;
		};

		const getRoomInfo = (): string => {
			return `Piso ${bed.floor || '?'}, Cuarto ${bed.roomNumber || '?'}`;
		};

		const getTableInfo = (): string => {
			if (!participant.tableMesa) return 'No table assigned';
			return `Mesa ${participant.tableMesa.name}`;
		};

		const getBedType = (): string => {
			const bedTypeMap: Record<string, string> = {
				'normal': 'Cama Normal',
				'litera': 'Litera',
				'colchon': 'Colchón',
			};
			return bedTypeMap[bed.bedType] || bed.bedType || 'Bed';
		};

		return new TableCell({
			children: [
				new DocxTable({
					rows: [
						// Single cell badge with rose emoji
						new TableRow({
							children: [
								new TableCell({
									children: [
										// Rose emoji in top right corner
										new Paragraph({
											children: [
												new TextRun({
													text: "🌹",
													size: 32,
												}),
											],
											alignment: AlignmentType.RIGHT,
											spacing: { before: 200, after: 0 }
										}),
										// Name
										new Paragraph({
											children: [
												new TextRun({
													text: getDisplayName().toUpperCase(),
													bold: true,
													size: 36,
													color: "1F2937",
													font: "Arial",
												})
											],
											alignment: AlignmentType.CENTER,
											spacing: { before: 100, after: 250 }
										}),
										// Table info
										new Paragraph({
											children: [
												new TextRun({
													text: getTableInfo(),
													size: 20,
													color: "6B7280",
													font: "Arial",
												})
											],
											alignment: AlignmentType.CENTER,
											spacing: { before: 0, after: 200 }
										}),
										// Divider line
										new Paragraph({
											children: [
												new TextRun({
													text: "─────────────────",
													size: 16,
													color: "E5E7EB",
												})
											],
											alignment: AlignmentType.CENTER,
											spacing: { before: 80, after: 80 }
										}),
										// Room info
										new Paragraph({
											children: [
												new TextRun({
													text: getRoomInfo() + ", " + getBedType(),
													size: 18,
													color: "9CA3AF",
													font: "Arial",
												})
											],
											alignment: AlignmentType.CENTER,
											spacing: { before: 180, after: 280 }
										}),
									],
									shading: { fill: "1E40AF", type: ShadingType.SOLID },
									borders: {
										top: { color: "DC2626", size: 18, style: BorderStyle.SINGLE },
										bottom: { color: "DC2626", size: 18, style: BorderStyle.SINGLE },
										left: { color: "DC2626", size: 18, style: BorderStyle.SINGLE },
										right: { color: "DC2626", size: 18, style: BorderStyle.SINGLE }
									},
									margins: { top: 0, bottom: 0, left: 350, right: 350 }
								}),
							],
						}),
					],
					width: { size: 100, type: WidthType.PERCENTAGE },
					borders: {
						top: { style: BorderStyle.NONE },
						bottom: { style: BorderStyle.NONE },
						left: { style: BorderStyle.NONE },
						right: { style: BorderStyle.NONE }
					}
				})
			],
			width: { size: 50, type: WidthType.PERCENTAGE },
			margins: { top: 400, bottom: 400, left: 200, right: 200 },
			borders: {
				top: { style: BorderStyle.NONE },
				bottom: { style: BorderStyle.NONE },
				left: { style: BorderStyle.NONE },
				right: { style: BorderStyle.NONE }
			}
		});
	});

	// Group badges into rows of 2
	const badgeRows: any[] = [];
	for (let i = 0; i < badges.length; i += 2) {
		badgeRows.push(
			new TableRow({
				children: badges.slice(i, i + 2),
			})
		);
	}

	// If last row is incomplete, pad with empty cells
	if (badgeRows.length > 0 && badgeRows[badgeRows.length - 1]) {
		const lastRow = badgeRows[badgeRows.length - 1];
		if (lastRow.children) {
			while (lastRow.children.length < 2) {
				lastRow.children.push(
					new TableCell({
						children: [],
						width: { size: 50, type: WidthType.PERCENTAGE },
						borders: {
							top: { style: BorderStyle.NONE },
							bottom: { style: BorderStyle.NONE },
							left: { style: BorderStyle.NONE },
							right: { style: BorderStyle.NONE }
						}
					})
				);
			}
		}
	}

	const badgesTable = new DocxTable({
		rows: badgeRows,
		width: { size: 100, type: WidthType.PERCENTAGE },
		borders: {
			top: { style: BorderStyle.NONE },
			bottom: { style: BorderStyle.NONE },
			left: { style: BorderStyle.NONE },
			right: { style: BorderStyle.NONE }
		},
		margins: { top: 0, bottom: 0, left: 0, right: 0 }
	});

	children.push(badgesTable);

	children.push(
		new Paragraph({
			children: [],
			spacing: { before: 500 },
		})
	);
	}

	// Footer with red theme
	children.push(
		new Paragraph({
			children: [
				new TextRun({
					text: "🌹 ",
					size: 24,
				}),
				new TextRun({
					text: "Bendiciones para todos los participantes del retiro",
					italics: true,
					size: 20,
					color: "DC2626",
					font: "Arial",
				}),
			],
			alignment: AlignmentType.CENTER,
			spacing: { before: 300, after: 200 },
		})
	);

	// Create document
	const doc = new Document({
		sections: [
			{
				properties: {
					page: {
						margin: {
							top: 1440,
							right: 1440,
							bottom: 1440,
							left: 1440,
						},
					},
				},
				headers: {
					default: new Header({
						children: [
							new Paragraph({
								children: [
									new TextRun({
										text: "🌹 EMAUS",
										bold: true,
										size: 18,
										color: "DC2626",
										font: "Arial",
									}),
									new TextRun({
										text: " · Sistema de Gestión de Retiros",
										size: 16,
										color: "6B7280",
										font: "Arial",
									}),
								],
								alignment: AlignmentType.CENTER,
								spacing: { after: 120 },
							}),
							new Paragraph({
								children: [
									new TextRun({
										text: "─────────────────────────────────────",
										color: "FECACA",
										size: 14,
									}),
								],
								alignment: AlignmentType.CENTER,
							}),
						],
					}),
				},
				footers: {
					default: new Footer({
						children: [
							new Paragraph({
								children: [
									new TextRun({
										text: "─────────────────────────────────────",
										color: "FECACA",
										size: 14,
									}),
								],
								alignment: AlignmentType.CENTER,
								spacing: { before: 120 },
							}),
							new Paragraph({
								children: [
									new TextRun({
										text: `📄 Documento generado el ${generationTime}`,
										size: 16,
										color: "991B1B",
										font: "Arial",
									}),
								],
								alignment: AlignmentType.CENTER,
								spacing: { before: 180, after: 100 },
							}),
							new Paragraph({
								children: [
									new TextRun({
										text: "EMAUS · Sistema de Gestión de Retiros Espirituales",
										size: 14,
										color: "DC2626",
										italics: true,
										font: "Arial",
									}),
								],
								alignment: AlignmentType.CENTER,
								spacing: { after: 120 },
							}),
						],
					}),
				},
				children,
			},
		],
	});

	const buffer = await Packer.toBuffer(doc);
	return buffer;
};
