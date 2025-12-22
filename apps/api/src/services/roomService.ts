import { AppDataSource } from '../data-source';
import { RetreatBed } from '../entities/retreatBed.entity';
import { Retreat } from '../entities/retreat.entity';

export const exportRoomLabelsToDocx = async (retreatId: string) => {
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
		PageBreak,
	} = await import('docx');
	type ParagraphType = InstanceType<typeof Paragraph>;

	// Get retreat beds with participant information
	const retreatBedRepository = AppDataSource.getRepository(RetreatBed);
	const retreat = await AppDataSource.getRepository(Retreat).findOneBy({ id: retreatId });
	if (!retreat) throw new Error('Retreat not found');

	const beds = await retreatBedRepository
		.createQueryBuilder('bed')
		.leftJoinAndSelect('bed.participant', 'participant')
		.where('bed.retreatId = :retreatId', { retreatId })
		.orderBy('bed.floor', 'ASC')
		.addOrderBy('bed.roomNumber', 'ASC')
		.addOrderBy('bed.bedNumber', 'ASC')
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
			year: 'numeric',
		});
	};

	const retreatDates = `${formatDate(retreat.startDate)} - ${formatDate(retreat.endDate)}`;
	const generationTime = new Date().toLocaleString('es-ES', {
		dateStyle: 'full',
		timeStyle: 'short',
	});

	const children: ParagraphType[] = [];

	// Enhanced document header with gradient-like effect
	children.push(
		new Paragraph({
			children: [
				new TextRun({
					text: '🏠 ',
					size: 32,
				}),
				new TextRun({
					text: 'EMAUS',
					bold: true,
					size: 36,
					color: '1E40AF',
					font: 'Calibri Light',
				}),
			],
			alignment: AlignmentType.CENTER,
			spacing: { after: 120 },
		}),
	);

	children.push(
		new Paragraph({
			children: [
				new TextRun({
					text: 'RETIRO ESPIRITUAL',
					bold: true,
					size: 20,
					color: '3B82F6',
					allCaps: true,
					font: 'Calibri',
				}),
			],
			alignment: AlignmentType.CENTER,
			spacing: { after: 300 },
		}),
	);

	// Decorative line
	children.push(
		new Paragraph({
			children: [
				new TextRun({
					text: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
					color: 'CBD5E0',
					size: 16,
				}),
			],
			alignment: AlignmentType.CENTER,
			spacing: { after: 300 },
		}),
	);

	children.push(
		new Paragraph({
			children: [
				new TextRun({
					text: retreat.parish.toUpperCase(),
					bold: true,
					size: 32,
					color: '1A365D',
					font: 'Calibri',
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
					text: '📅 ',
					size: 20,
				}),
				new TextRun({
					text: retreatDates,
					size: 22,
					color: '475569',
					font: 'Calibri',
				}),
			],
			alignment: AlignmentType.CENTER,
			spacing: { after: 300 },
		}),
	);

	// Decorative line
	children.push(
		new Paragraph({
			children: [
				new TextRun({
					text: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
					color: 'CBD5E0',
					size: 16,
				}),
			],
			alignment: AlignmentType.CENTER,
			spacing: { after: 300 },
		}),
	);

	// Highlighted title banner
	const titleBanner = new DocxTable({
		rows: [
			new TableRow({
				children: [
					new TableCell({
						children: [
							new Paragraph({
								children: [
									new TextRun({
										text: '🚪 ETIQUETAS DE HABITACIONES PARA LAS PUERTAS',
										bold: true,
										size: 24,
										color: '1E40AF',
										font: 'Calibri',
									}),
								],
								alignment: AlignmentType.CENTER,
								spacing: { before: 250, after: 250 },
							}),
						],
						shading: {
							fill: '2563EB',
							type: ShadingType.SOLID,
						},
						borders: {
							top: { color: '1E40AF', size: 24, style: BorderStyle.SINGLE },
							bottom: { color: '1E40AF', size: 24, style: BorderStyle.SINGLE },
							left: { color: '1E40AF', size: 24, style: BorderStyle.SINGLE },
							right: { color: '1E40AF', size: 24, style: BorderStyle.SINGLE },
						},
						margins: { top: 200, bottom: 200, left: 400, right: 400 },
					}),
				],
			}),
		],
		width: { size: 90, type: WidthType.PERCENTAGE },
		alignment: AlignmentType.CENTER,
	});

	children.push(titleBanner);

	children.push(
		new Paragraph({
			children: [],
			spacing: { after: 600 },
		}),
	);

	// Group beds by floor and room
	const groupedBeds = beds.reduce(
		(acc, bed) => {
			const floor = bed.floor !== undefined && bed.floor !== null ? String(bed.floor) : 'PB';
			const roomNumber = bed.roomNumber;

			if (!acc[floor]) {
				acc[floor] = {};
			}
			if (!acc[floor][roomNumber]) {
				acc[floor][roomNumber] = [];
			}
			acc[floor][roomNumber].push(bed);
			return acc;
		},
		{} as Record<string, Record<string, any[]>>,
	);

	// Generate labels for each room in two columns
	let floorCount = 0;
	for (const [floor, rooms] of Object.entries(groupedBeds)) {
		floorCount++;

		// Enhanced floor title with badge style
		const floorBadge = new DocxTable({
			rows: [
				new TableRow({
					children: [
						new TableCell({
							children: [
								new Paragraph({
									children: [
										new TextRun({
											text: '🏢 ',
											size: 24,
										}),
										new TextRun({
											text: floor === 'PB' ? 'PLANTA BAJA' : `PISO ${floor}`,
											bold: true,
											size: 26,
											color: '1E40AF',
											font: 'Calibri',
										}),
									],
									alignment: AlignmentType.CENTER,
									spacing: { before: 180, after: 180 },
								}),
							],
							shading: {
								fill: '059669',
								type: ShadingType.SOLID,
							},
							borders: {
								top: { color: '047857', size: 18, style: BorderStyle.SINGLE },
								bottom: { color: '047857', size: 18, style: BorderStyle.SINGLE },
								left: { color: '047857', size: 18, style: BorderStyle.SINGLE },
								right: { color: '047857', size: 18, style: BorderStyle.SINGLE },
							},
							margins: { top: 150, bottom: 150, left: 600, right: 600 },
						}),
					],
				}),
			],
			width: { size: 50, type: WidthType.PERCENTAGE },
			alignment: AlignmentType.CENTER,
		});

		children.push(floorBadge);

		children.push(
			new Paragraph({
				children: [],
				spacing: { after: 400 },
			}),
		);

		const roomEntries = Object.entries(rooms);
		const roomPairs = [];
		for (let i = 0; i < roomEntries.length; i += 2) {
			roomPairs.push(roomEntries.slice(i, i + 2));
		}

		let pairCount = 0;
		for (const roomPair of roomPairs) {
			pairCount++;
			const isLastPair = pairCount === roomPairs.length;
			const isLastFloor = floorCount === Object.keys(groupedBeds).length && isLastPair;

			const roomCells = roomPair.map(([roomNumber, roomBeds]) => {
				const typedRoomBeds = roomBeds;

				const roomTableRows = [
					// Enhanced room header with shadow effect
					new TableRow({
						children: [
							new TableCell({
								children: [
									new Paragraph({
										children: [
											new TextRun({
												text: '🚪 ',
												size: 24,
											}),
											new TextRun({
												text: `HABITACIÓN ${roomNumber}`,
												bold: true,
												size: 24,
												color: '1E40AF',
												font: 'Calibri',
											}),
										],
										alignment: AlignmentType.CENTER,
										spacing: { before: 200, after: 200 },
									}),
								],
								width: { size: 100, type: WidthType.PERCENTAGE },
								shading: {
									fill: '1E40AF',
									type: ShadingType.SOLID,
								},
								borders: {
									top: { color: '1E3A8A', size: 20, style: BorderStyle.SINGLE },
									left: { color: '1E3A8A', size: 20, style: BorderStyle.SINGLE },
									right: { color: '1E3A8A', size: 20, style: BorderStyle.SINGLE },
									bottom: { color: '2563EB', size: 8, style: BorderStyle.SINGLE },
								},
								margins: { top: 180, bottom: 180, left: 300, right: 300 },
							}),
						],
					}),
				];

				// Enhanced header row with gradient colors
				roomTableRows.push(
					new TableRow({
						children: [
							new TableCell({
								children: [
									new Paragraph({
										children: [
											new TextRun({
												text: 'CAMA',
												bold: true,
												size: 16,
												color: '1E40AF',
												font: 'Calibri',
											}),
										],
										alignment: AlignmentType.CENTER,
										spacing: { before: 120, after: 120 },
									}),
								],
								width: { size: 20, type: WidthType.PERCENTAGE },
								shading: { fill: '047857', type: ShadingType.SOLID },
								borders: {
									top: { style: BorderStyle.NONE },
									bottom: { color: '065F46', size: 6, style: BorderStyle.SINGLE },
									left: { color: '065F46', size: 12, style: BorderStyle.SINGLE },
									right: { color: '065F46', size: 2, style: BorderStyle.SINGLE },
								},
							}),
							new TableCell({
								children: [
									new Paragraph({
										children: [
											new TextRun({
												text: 'TIPO DE CAMA',
												bold: true,
												size: 16,
												color: '1E40AF',
												font: 'Calibri',
											}),
										],
										alignment: AlignmentType.CENTER,
										spacing: { before: 120, after: 120 },
									}),
								],
								width: { size: 30, type: WidthType.PERCENTAGE },
								shading: { fill: '047857', type: ShadingType.SOLID },
								borders: {
									top: { style: BorderStyle.NONE },
									bottom: { color: '065F46', size: 6, style: BorderStyle.SINGLE },
									left: { color: '065F46', size: 2, style: BorderStyle.SINGLE },
									right: { color: '065F46', size: 2, style: BorderStyle.SINGLE },
								},
							}),
							new TableCell({
								children: [
									new Paragraph({
										children: [
											new TextRun({
												text: 'PARTICIPANTE ASIGNADO',
												bold: true,
												size: 16,
												color: '1E40AF',
												font: 'Calibri',
											}),
										],
										alignment: AlignmentType.CENTER,
										spacing: { before: 120, after: 120 },
									}),
								],
								width: { size: 50, type: WidthType.PERCENTAGE },
								shading: { fill: '047857', type: ShadingType.SOLID },
								borders: {
									top: { style: BorderStyle.NONE },
									bottom: { color: '065F46', size: 6, style: BorderStyle.SINGLE },
									left: { color: '065F46', size: 2, style: BorderStyle.SINGLE },
									right: { color: '065F46', size: 12, style: BorderStyle.SINGLE },
								},
							}),
						],
					}),
				);

				// Enhanced bed rows with better styling
				for (let i = 0; i < typedRoomBeds.length; i++) {
					const bed = typedRoomBeds[i];
					const isEvenRow = i % 2 === 0;
					const isLastRow = i === typedRoomBeds.length - 1;
					const rowColor = isEvenRow ? 'ECFDF5' : '1E40AF';

					const participantName = bed.participant
						? `${bed.participant.firstName} ${bed.participant.lastName}`
						: 'Sin asignar';

					const bedTypeMap: Record<string, { icon: string; label: string; color: string }> = {
						litera_abajo: { icon: '🛏️', label: 'Litera Inferior', color: '2563EB' },
						litera_arriba: { icon: '🛏️', label: 'Litera Superior', color: '7C3AED' },
						colchon: { icon: '🛌', label: 'Colchón', color: 'DC2626' },
						normal: { icon: '🛏️', label: 'Cama Normal', color: '059669' },
					};

					const bedType = bedTypeMap[bed.type] || bedTypeMap['normal'];

					roomTableRows.push(
						new TableRow({
							children: [
								new TableCell({
									children: [
										new Paragraph({
											children: [
												new TextRun({
													text: bed.bedNumber,
													bold: true,
													size: 20,
													color: '1F2937',
													font: 'Calibri',
												}),
											],
											alignment: AlignmentType.CENTER,
											spacing: { before: 150, after: 150 },
										}),
									],
									width: { size: 20, type: WidthType.PERCENTAGE },
									shading: { fill: rowColor, type: ShadingType.SOLID },
									borders: {
										top: { color: 'D1FAE5', size: 4, style: BorderStyle.SINGLE },
										bottom: isLastRow
											? { color: '065F46', size: 12, style: BorderStyle.SINGLE }
											: { color: 'D1FAE5', size: 4, style: BorderStyle.SINGLE },
										left: { color: '065F46', size: 12, style: BorderStyle.SINGLE },
										right: { color: 'D1FAE5', size: 4, style: BorderStyle.SINGLE },
									},
									margins: { top: 120, bottom: 120, left: 150, right: 150 },
								}),
								new TableCell({
									children: [
										new Paragraph({
											children: [
												new TextRun({
													text: `${bedType.icon}  `,
													size: 18,
												}),
												new TextRun({
													text: bedType.label,
													size: 16,
													color: bedType.color,
													bold: true,
													font: 'Calibri',
												}),
											],
											alignment: AlignmentType.CENTER,
											spacing: { before: 100, after: 100 },
										}),
									],
									width: { size: 30, type: WidthType.PERCENTAGE },
									shading: { fill: rowColor, type: ShadingType.SOLID },
									borders: {
										top: { color: 'D1FAE5', size: 4, style: BorderStyle.SINGLE },
										bottom: isLastRow
											? { color: '065F46', size: 12, style: BorderStyle.SINGLE }
											: { color: 'D1FAE5', size: 4, style: BorderStyle.SINGLE },
										left: { color: 'D1FAE5', size: 4, style: BorderStyle.SINGLE },
										right: { color: 'D1FAE5', size: 4, style: BorderStyle.SINGLE },
									},
									margins: { top: 120, bottom: 120, left: 150, right: 150 },
								}),
								new TableCell({
									children: [
										new Paragraph({
											children: [
												bed.participant
													? new TextRun({
															text: '✓  ',
															color: '059669',
															size: 16,
															bold: true,
														})
													: new TextRun({
															text: '○  ',
															color: 'DC2626',
															size: 16,
														}),
												new TextRun({
													text: participantName,
													bold: !!bed.participant,
													size: bed.participant ? 18 : 16,
													color: bed.participant ? '064E3B' : '991B1B',
													font: 'Calibri',
													italics: !bed.participant,
												}),
											],
											spacing: { before: 100, after: 100 },
										}),
									],
									width: { size: 50, type: WidthType.PERCENTAGE },
									shading: {
										fill: bed.participant ? rowColor : 'FEF2F2',
										type: ShadingType.SOLID,
									},
									borders: {
										top: { color: 'D1FAE5', size: 4, style: BorderStyle.SINGLE },
										bottom: isLastRow
											? { color: '065F46', size: 12, style: BorderStyle.SINGLE }
											: { color: 'D1FAE5', size: 4, style: BorderStyle.SINGLE },
										left: { color: 'D1FAE5', size: 4, style: BorderStyle.SINGLE },
										right: { color: '065F46', size: 12, style: BorderStyle.SINGLE },
									},
									margins: { top: 120, bottom: 120, left: 200, right: 200 },
								}),
							],
						}),
					);
				}

				// Summary footer for room
				const totalBeds = typedRoomBeds.length;
				const assignedBeds = typedRoomBeds.filter((bed) => bed.participant).length;
				const availableBeds = totalBeds - assignedBeds;

				roomTableRows.push(
					new TableRow({
						children: [
							new TableCell({
								children: [
									new Paragraph({
										children: [
											new TextRun({
												text: `📊 Total: ${totalBeds}  |  ✓ Asignadas: ${assignedBeds}  |  ○ Disponibles: ${availableBeds}`,
												size: 14,
												color: availableBeds > 0 ? 'B45309' : '059669',
												bold: true,
												font: 'Calibri',
											}),
										],
										alignment: AlignmentType.CENTER,
										spacing: { before: 120, after: 120 },
									}),
								],
								columnSpan: 3,
								shading: {
									fill: availableBeds > 0 ? 'FEF3C7' : 'D1FAE5',
									type: ShadingType.SOLID,
								},
								borders: {
									top: { color: '065F46', size: 6, style: BorderStyle.SINGLE },
									bottom: { color: '065F46', size: 12, style: BorderStyle.SINGLE },
									left: { color: '065F46', size: 12, style: BorderStyle.SINGLE },
									right: { color: '065F46', size: 12, style: BorderStyle.SINGLE },
								},
								margins: { top: 100, bottom: 100, left: 200, right: 200 },
							}),
						],
					}),
				);

				const roomTable = new DocxTable({
					rows: roomTableRows,
					width: { size: 100, type: WidthType.PERCENTAGE },
					margins: { top: 0, bottom: 0, left: 0, right: 0 },
				});

				return new TableCell({
					children: [roomTable],
					width: { size: 50, type: WidthType.PERCENTAGE },
					margins: { top: 0, bottom: 300, left: 150, right: 150 },
					borders: {
						top: { style: BorderStyle.NONE },
						bottom: { style: BorderStyle.NONE },
						left: { style: BorderStyle.NONE },
						right: { style: BorderStyle.NONE },
					},
				});
			});

			if (roomPair.length === 1) {
				roomCells.push(
					new TableCell({
						children: [],
						width: { size: 50, type: WidthType.PERCENTAGE },
						borders: {
							top: { style: BorderStyle.NONE },
							bottom: { style: BorderStyle.NONE },
							left: { style: BorderStyle.NONE },
							right: { style: BorderStyle.NONE },
						},
					}),
				);
			}

			const twoColumnRows = [
				new TableRow({
					children: roomCells,
				}),
			];

			children.push(
				new DocxTable({
					rows: twoColumnRows,
					width: { size: 100, type: WidthType.PERCENTAGE },
					borders: {
						top: { style: BorderStyle.NONE },
						bottom: { style: BorderStyle.NONE },
						left: { style: BorderStyle.NONE },
						right: { style: BorderStyle.NONE },
					},
					margins: { top: 0, bottom: 500, left: 0, right: 0 },
				}),
			);

			if (!isLastPair) {
				children.push(
					new Paragraph({
						children: [],
						spacing: { after: 300 },
					}),
				);
			}

			if (isLastPair && !isLastFloor) {
				children.push(
					new Paragraph({
						children: [],
						pageBreakBefore: true,
					}),
				);
			}
		}
	}

	// Enhanced footer with summary statistics
	const totalBedsCount = beds.length;
	const assignedBedsCount = beds.filter((bed) => bed.participant).length;
	const availableBedsCount = totalBedsCount - assignedBedsCount;
	const occupancyRate =
		totalBedsCount > 0 ? ((assignedBedsCount / totalBedsCount) * 100).toFixed(1) : '0';

	children.push(
		new Paragraph({
			children: [],
			spacing: { before: 600 },
		}),
	);

	// Summary statistics banner
	const summaryBanner = new DocxTable({
		rows: [
			new TableRow({
				children: [
					new TableCell({
						children: [
							new Paragraph({
								children: [
									new TextRun({
										text: '📊 RESUMEN GENERAL',
										bold: true,
										size: 20,
										color: '1E40AF',
										font: 'Calibri',
									}),
								],
								alignment: AlignmentType.CENTER,
								spacing: { before: 150, after: 150 },
							}),
						],
						columnSpan: 4,
						shading: { fill: '6366F1', type: ShadingType.SOLID },
						borders: {
							top: { color: '4F46E5', size: 15, style: BorderStyle.SINGLE },
							left: { color: '4F46E5', size: 15, style: BorderStyle.SINGLE },
							right: { color: '4F46E5', size: 15, style: BorderStyle.SINGLE },
							bottom: { color: '4F46E5', size: 6, style: BorderStyle.SINGLE },
						},
					}),
				],
			}),
			new TableRow({
				children: [
					new TableCell({
						children: [
							new Paragraph({
								children: [
									new TextRun({
										text: '🛏️\n',
										size: 28,
									}),
									new TextRun({
										text: `${totalBedsCount}\n`,
										bold: true,
										size: 32,
										color: '1E40AF',
										font: 'Calibri',
									}),
									new TextRun({
										text: 'Total Camas',
										size: 14,
										color: '64748B',
										font: 'Calibri',
									}),
								],
								alignment: AlignmentType.CENTER,
								spacing: { before: 200, after: 200 },
							}),
						],
						width: { size: 25, type: WidthType.PERCENTAGE },
						shading: { fill: 'EFF6FF', type: ShadingType.SOLID },
						borders: {
							top: { color: 'CBD5E1', size: 6, style: BorderStyle.SINGLE },
							bottom: { color: '4F46E5', size: 15, style: BorderStyle.SINGLE },
							left: { color: '4F46E5', size: 15, style: BorderStyle.SINGLE },
							right: { color: 'CBD5E1', size: 6, style: BorderStyle.SINGLE },
						},
					}),
					new TableCell({
						children: [
							new Paragraph({
								children: [
									new TextRun({
										text: '✅\n',
										size: 28,
									}),
									new TextRun({
										text: `${assignedBedsCount}\n`,
										bold: true,
										size: 32,
										color: '059669',
										font: 'Calibri',
									}),
									new TextRun({
										text: 'Asignadas',
										size: 14,
										color: '64748B',
										font: 'Calibri',
									}),
								],
								alignment: AlignmentType.CENTER,
								spacing: { before: 200, after: 200 },
							}),
						],
						width: { size: 25, type: WidthType.PERCENTAGE },
						shading: { fill: 'ECFDF5', type: ShadingType.SOLID },
						borders: {
							top: { color: 'CBD5E1', size: 6, style: BorderStyle.SINGLE },
							bottom: { color: '4F46E5', size: 15, style: BorderStyle.SINGLE },
							left: { color: 'CBD5E1', size: 6, style: BorderStyle.SINGLE },
							right: { color: 'CBD5E1', size: 6, style: BorderStyle.SINGLE },
						},
					}),
					new TableCell({
						children: [
							new Paragraph({
								children: [
									new TextRun({
										text: '⭕\n',
										size: 28,
									}),
									new TextRun({
										text: `${availableBedsCount}\n`,
										bold: true,
										size: 32,
										color: availableBedsCount > 0 ? 'DC2626' : '059669',
										font: 'Calibri',
									}),
									new TextRun({
										text: 'Disponibles',
										size: 14,
										color: '64748B',
										font: 'Calibri',
									}),
								],
								alignment: AlignmentType.CENTER,
								spacing: { before: 200, after: 200 },
							}),
						],
						width: { size: 25, type: WidthType.PERCENTAGE },
						shading: {
							fill: availableBedsCount > 0 ? 'FEF2F2' : 'ECFDF5',
							type: ShadingType.SOLID,
						},
						borders: {
							top: { color: 'CBD5E1', size: 6, style: BorderStyle.SINGLE },
							bottom: { color: '4F46E5', size: 15, style: BorderStyle.SINGLE },
							left: { color: 'CBD5E1', size: 6, style: BorderStyle.SINGLE },
							right: { color: 'CBD5E1', size: 6, style: BorderStyle.SINGLE },
						},
					}),
					new TableCell({
						children: [
							new Paragraph({
								children: [
									new TextRun({
										text: '📈\n',
										size: 28,
									}),
									new TextRun({
										text: `${occupancyRate}%\n`,
										bold: true,
										size: 32,
										color: '7C3AED',
										font: 'Calibri',
									}),
									new TextRun({
										text: 'Ocupación',
										size: 14,
										color: '64748B',
										font: 'Calibri',
									}),
								],
								alignment: AlignmentType.CENTER,
								spacing: { before: 200, after: 200 },
							}),
						],
						width: { size: 25, type: WidthType.PERCENTAGE },
						shading: { fill: 'FAF5FF', type: ShadingType.SOLID },
						borders: {
							top: { color: 'CBD5E1', size: 6, style: BorderStyle.SINGLE },
							bottom: { color: '4F46E5', size: 15, style: BorderStyle.SINGLE },
							left: { color: 'CBD5E1', size: 6, style: BorderStyle.SINGLE },
							right: { color: '4F46E5', size: 15, style: BorderStyle.SINGLE },
						},
					}),
				],
			}),
		],
		width: { size: 85, type: WidthType.PERCENTAGE },
		alignment: AlignmentType.CENTER,
	});

	children.push(summaryBanner);

	children.push(
		new Paragraph({
			children: [],
			spacing: { after: 400 },
		}),
	);

	// Decorative line
	children.push(
		new Paragraph({
			children: [
				new TextRun({
					text: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
					color: 'CBD5E0',
					size: 16,
				}),
			],
			alignment: AlignmentType.CENTER,
			spacing: { before: 200, after: 300 },
		}),
	);

	// Enhanced footer message
	children.push(
		new Paragraph({
			children: [
				new TextRun({
					text: '🙏 ',
					size: 20,
				}),
				new TextRun({
					text: 'Bendiciones para todos los participantes del retiro',
					italics: true,
					size: 18,
					color: '64748B',
					font: 'Calibri',
				}),
			],
			alignment: AlignmentType.CENTER,
			spacing: { before: 200, after: 200 },
		}),
	);

	children.push(
		new Paragraph({
			children: [
				new TextRun({
					text: '"En la comunidad encontramos paz y fortaleza espiritual"',
					italics: true,
					size: 14,
					color: '94A3B8',
					font: 'Calibri',
				}),
			],
			alignment: AlignmentType.CENTER,
			spacing: { before: 100, after: 200 },
		}),
	);

	// Create document with enhanced styling
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
										text: '🏠 EMAUS',
										bold: true,
										size: 16,
										color: '3B82F6',
										font: 'Calibri',
									}),
									new TextRun({
										text: ' · Sistema de Gestión de Retiros',
										size: 14,
										color: '94A3B8',
										font: 'Calibri',
									}),
								],
								alignment: AlignmentType.CENTER,
								spacing: { after: 100 },
							}),
							new Paragraph({
								children: [
									new TextRun({
										text: '─────────────────────────────────────',
										color: 'E2E8F0',
										size: 12,
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
										text: '─────────────────────────────────────',
										color: 'E2E8F0',
										size: 12,
									}),
								],
								alignment: AlignmentType.CENTER,
								spacing: { before: 100 },
							}),
							new Paragraph({
								children: [
									new TextRun({
										text: `📄 Documento generado el ${generationTime}`,
										size: 14,
										color: '64748B',
										font: 'Calibri',
									}),
								],
								alignment: AlignmentType.CENTER,
								spacing: { before: 150, after: 80 },
							}),
							new Paragraph({
								children: [
									new TextRun({
										text: 'EMAUS · Sistema de Gestión de Retiros Espirituales',
										size: 12,
										color: '94A3B8',
										italics: true,
										font: 'Calibri',
									}),
								],
								alignment: AlignmentType.CENTER,
								spacing: { after: 100 },
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
