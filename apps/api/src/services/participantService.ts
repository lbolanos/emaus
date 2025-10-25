import { AppDataSource } from '../data-source';
import { Participant } from '../entities/participant.entity';
import { Retreat } from '../entities/retreat.entity';
import { TableMesa } from '../entities/tableMesa.entity';
import { RetreatBed, BedUsage } from '../entities/retreatBed.entity';
import { MessageTemplate } from '../entities/messageTemplate.entity';
import { Payment } from '../entities/payment.entity';
import { User } from '../entities/user.entity';
import { CreateParticipant, UpdateParticipant } from '@repo/types';
import { rebalanceTablesForRetreat, assignLeaderToTable } from './tableMesaService';
import { EmailService } from './emailService';
import { In, Not, IsNull, ILike, Brackets } from 'typeorm';

const participantRepository = AppDataSource.getRepository(Participant);
const retreatRepository = AppDataSource.getRepository(Retreat);
const tableMesaRepository = AppDataSource.getRepository(TableMesa);
const paymentRepository = AppDataSource.getRepository(Payment);
const userRepository = AppDataSource.getRepository(User);

export const findAllParticipants = async (
	retreatId?: string,
	type?: 'walker' | 'server' | 'waiting' | 'partial_server',
	isCancelled?: boolean,
	relations: string[] = [],
	includePayments: boolean = false,
): Promise<Participant[]> => {
	const where: any = {};

	if (retreatId) {
		where.retreatId = retreatId;
	} else {
		throw new Error('retreatId is required');
	}
	if (type) {
		where.type = type;
	}
	if (typeof isCancelled === 'boolean') {
		where.isCancelled = isCancelled;
	}

	// Always include payments and retreat relations for payment calculations
	const allRelations = [...new Set([...relations, 'payments', 'retreat'])];
	if (includePayments) {
		allRelations.push('payments.recordedByUser');
	}

	return participantRepository.find({
		where,
		relations: allRelations,
		order: {
			lastName: 'ASC',
			firstName: 'ASC'
		}
	});
};

export const findParticipantById = async (id: string, includePayments: boolean = false): Promise<Participant | null> => {
	const relations = ['retreat', 'tableMesa', 'retreatBed'];
	if (includePayments) {
		relations.push('payments', 'payments.recordedByUser');
	}

	return participantRepository.findOne({
		where: { id },
		relations
	});
};

const assignBedToParticipant = async (
	participant: Participant,
	excludedBedIds: string[] = [],
	entityManager?: any,
): Promise<string | undefined> => {
	if (!participant.birthDate) return undefined;

	const age = new Date().getFullYear() - new Date(participant.birthDate).getFullYear();
	const retreatBedRepository = entityManager
		? entityManager.getRepository(RetreatBed)
		: AppDataSource.getRepository(RetreatBed);

	// Determine bed usage based on participant type
	const bedUsage = participant.type === 'walker' ? 'caminante' : 'servidor';

	// Find available beds using a query that respects the current transaction state
	const availableBedsQuery = retreatBedRepository
		.createQueryBuilder('bed')
		.where('bed.retreatId = :retreatId', { retreatId: participant.retreatId })
		.andWhere('bed.participantId IS NULL')
		.andWhere('bed.defaultUsage = :bedUsage', { bedUsage })
		.andWhere('bed.id NOT IN (:...excludedBedIds)', {
			excludedBedIds: excludedBedIds.length > 0 ? excludedBedIds : [''],
		});

	// Apply sorting based on participant type and age
	if (participant.type === 'walker') {
		if (age <= 40) {
			// Younger walkers: prioritize bunk beds
			availableBedsQuery
				.orderBy("CASE WHEN bed.type = 'litera' THEN 1 WHEN bed.type = 'normal' THEN 2 ELSE 3 END")
				.addOrderBy('bed.floor', 'ASC');
		} else {
			// Older walkers: prioritize normal beds on lower floors
			availableBedsQuery
				.orderBy("CASE WHEN bed.type = 'normal' THEN 1 WHEN bed.type = 'litera' THEN 2 ELSE 3 END")
				.addOrderBy('bed.floor', 'ASC');
		}
	} else if (participant.type === 'server') {
		if (age <= 35) {
			// Younger servers: prioritize mattresses
			availableBedsQuery.orderBy(
				"CASE WHEN bed.type = 'colchon' THEN 1 WHEN bed.type = 'litera' THEN 2 ELSE 3 END",
			);
		} else {
			availableBedsQuery.orderBy(
				"CASE WHEN bed.type = 'litera' THEN 1 WHEN bed.type = 'normal' THEN 2 ELSE 3 END",
			);
		}
	}

	// Try to find beds in rooms with same snoring status first
	if (participant.snores !== undefined) {
		const roomsWithSameSnorers = await retreatBedRepository
			.createQueryBuilder('rb')
			.select('rb.roomNumber')
			.innerJoin('rb.participant', 'p')
			.where('rb.retreatId = :retreatId', { retreatId: participant.retreatId })
			.andWhere('p.snores = :snores', { snores: participant.snores })
			.groupBy('rb.roomNumber')
			.getRawMany();

		const roomNumbers = roomsWithSameSnorers.map((r: any) => r.rb_roomNumber);

		if (roomNumbers.length > 0) {
			const snorerQuery = availableBedsQuery
				.clone()
				.andWhere('bed.roomNumber IN (:...roomNumbers)', { roomNumbers });
			const bed = await snorerQuery.getOne();
			if (bed) return bed.id;
		}
	}

	// If no snorer-compatible beds found, get any available bed
	//const allAvailableBeds = await availableBedsQuery.getMany();
	//console.log(`BED ASSIGNMENT: Available beds for participant ${participant.id}:`, allAvailableBeds.map((b: RetreatBed) => `${b.id} (${b.roomNumber}-${b.bedNumber})`));

	const bed = await availableBedsQuery.getOne();

	// Debug: Check if we're getting the same bed for different participants
	/*if (bed) {
    console.log(`BED ASSIGNMENT: Participant ${participant.id} gets bed ${bed.id} (${bed.roomNumber}-${bed.bedNumber})`);
    console.log(`BED ASSIGNMENT: Excluded beds: ${excludedBedIds.join(', ')}`);
  } else {
    console.log(`BED ASSIGNMENT: No bed found for participant ${participant.id}`);
  }*/

	return bed?.id;
};

const assignBedAndTableToParticipant = async (
	participant: Participant,
	assignedBedIds: Set<string>,
	entityManager: any,
): Promise<{ bedId?: string; tableId?: string }> => {
	const result: { bedId?: string; tableId?: string } = {};

	// Assign bed if applicable
	if (participant.type !== 'waiting' && participant.type !== 'partial_server') {
		const bedId = await assignBedToParticipant(
			participant,
			Array.from(assignedBedIds),
			entityManager,
		);
		if (bedId) {
			result.bedId = bedId;
			assignedBedIds.add(bedId);
		}
	}

	// Assign table if walker
	if (participant.type === 'walker') {
		result.tableId = await assignTableToWalker(participant);
	}

	return result;
};

const assignTableToWalker = async (participant: Participant): Promise<string | undefined> => {
	if (participant.type !== 'walker') return undefined;

	const tableRepo = AppDataSource.getRepository(TableMesa);
	const participantRepo = AppDataSource.getRepository(Participant);

	const tables = await tableRepo.find({
		where: { retreatId: participant.retreatId },
		relations: ['walkers'],
	});

	if (tables.length === 0) return undefined;
	tables.sort(() => Math.random() - 0.5);

	let suitableTables = tables;

	if (participant.invitedBy) {
		const walkersInvitedBySamePerson = await participantRepo.find({
			where: {
				retreatId: participant.retreatId,
				invitedBy: ILike(participant.invitedBy),
				id: Not(participant.id),
				tableId: Not(IsNull()),
			},
			select: ['tableId'],
		});
		const tablesToExclude = walkersInvitedBySamePerson.map((p) => p.tableId).filter(Boolean);
		if (tablesToExclude.length > 0) {
			suitableTables = tables.filter((t) => !tablesToExclude.includes(t.id));
		}
	}

	const tablesToChooseFrom = suitableTables.length > 0 ? suitableTables : tables;
	const minWalkers = Math.min(...tablesToChooseFrom.map((t) => t.walkers?.length || 0));
	const leastPopulatedTables = tablesToChooseFrom.filter(
		(t) => (t.walkers?.length || 0) === minWalkers,
	);
	const randomIndex = Math.floor(Math.random() * leastPopulatedTables.length);

	return leastPopulatedTables[randomIndex]?.id;
};

export const createParticipant = async (
	participantData: CreateParticipant,
	assignRelationships = true,
	isImporting = false,
): Promise<Participant> => {
	const COLOR_POOL = [
		'#FFADAD',
		'#FFD6A5',
		'#FDFFB6',
		'#CAFFBF',
		'#9BF6FF',
		'#A0C4FF',
		'#BDB2FF',
		'#FFC6FF',
		'#FF6B6B',
		'#4ECDC4',
		'#45B7D1',
		'#96CEB4',
		'#FECA57',
		'#FF9FF3',
		'#54A0FF',
		'#5F27CD',
		'#00D2D3',
		'#FF9F43',
		'#10AC84',
		'#EE5A24',
		'#0984E3',
		'#6C5CE7',
		'#A29BFE',
		'#FD79A8',
		'#E17055',
		'#00B894',
		'#00CEC9',
		'#6C5CE7',
		'#FDCB6E',
		'#E84393',
		'#74B9FF',
		'#A29BFE',
		'#81ECEC',
		'#55A3FF',
		'#FD79A8',
		'#FDCB6E',
		'#6C5CE7',
		'#00CEC9',
		'#FF7675',
		'#74B9FF',
		'#A29BFE',
		'#81ECEC',
		'#55A3FF',
		'#FD79A8',
	];

	return AppDataSource.transaction(async (transactionalEntityManager) => {
		const participantRepository = transactionalEntityManager.getRepository(Participant);
		const retreatRepository = transactionalEntityManager.getRepository(Retreat);

		const existingParticipant = await participantRepository.findOne({
			where: { email: participantData.email, retreatId: participantData.retreatId },
		});
		if (existingParticipant) {
			throw new Error('A participant with this email already exists in this retreat.');
		}

		if (participantData.arrivesOnOwn === true) {
			participantData.pickupLocation = 'Llego por mi cuenta';
		}

		let colorToAssign: string | null = null;

		// Only apply family/friend color assignment to walkers
		/*console.log('COLOR ASSIGNMENT: Starting color assignment for participant:', {
			type: participantData.type,
			invitedBy: participantData.invitedBy,
			isInvitedByEmausMember: participantData.isInvitedByEmausMember,
			email: participantData.email,
			lastName: participantData.lastName,
		});*/

		if (participantData.type === 'walker') {
			// Build search conditions to find participants in the same group
			const searchConditions: string[] = [];
			const parameters: any = { retreatId: participantData.retreatId };

			// Case 1: Walker invited by another person (invitedBy field)
			if (participantData.invitedBy) {
				const inviterName = participantData.invitedBy.toLowerCase().trim();
				if (inviterName) {
					searchConditions.push('LOWER(participant.invitedBy) = :inviterName');
					parameters.inviterName = inviterName;
					//console.log('COLOR ASSIGNMENT: Added invitedBy condition:', inviterName);
				}
			}

			// Case 2: Walker invited by Emaus member (check inviter contact info)
			if (participantData.isInvitedByEmausMember) {
				const inviterEmail = participantData.inviterEmail?.toLowerCase();
				if (inviterEmail) {
					searchConditions.push('LOWER(participant.inviterEmail) = :inviterEmail');
					parameters.inviterEmail = inviterEmail;
					//console.log('COLOR ASSIGNMENT: Added inviterEmail condition:', inviterEmail);
				}

				const inviterPhones = [
					participantData.inviterCellPhone,
					participantData.inviterWorkPhone,
					participantData.inviterHomePhone,
				]
					.filter(Boolean)
					.map((phone) => String(phone).replace(/\D/g, '').slice(-8))
					.filter((p) => p.length > 0);

				if (inviterPhones.length > 0) {
					parameters.inviterPhones = inviterPhones;
					searchConditions.push('SUBSTR(participant.inviterCellPhone, -8) IN (:...inviterPhones)');
					searchConditions.push('SUBSTR(participant.inviterWorkPhone, -8) IN (:...inviterPhones)');
					searchConditions.push('SUBSTR(participant.inviterHomePhone, -8) IN (:...inviterPhones)');
					//console.log('COLOR ASSIGNMENT: Added inviter phone conditions:', inviterPhones);
				}
			}

			// Case 3: Same lastname (family relationship)
			if (participantData.lastName) {
				const lastName = participantData.lastName.toLowerCase().trim();
				if (lastName) {
					searchConditions.push('LOWER(participant.lastName) = :lastName');
					parameters.lastName = lastName;
					//console.log('COLOR ASSIGNMENT: Added lastName condition:', lastName);
				}
			}

			//console.log('COLOR ASSIGNMENT: Final search conditions:', searchConditions);
			//console.log('COLOR ASSIGNMENT: Final parameters:', parameters);

			if (searchConditions.length > 0) {
				// Find all existing walkers that match any of the group conditions
				const findAnyWalkerQb = participantRepository
					.createQueryBuilder('participant')
					.where('participant.retreatId = :retreatId')
					.andWhere('participant.type = :type', { type: 'walker' })
					.andWhere(new Brackets((qb) => qb.where(searchConditions.join(' OR '))));

				const existingWalkers = await findAnyWalkerQb.setParameters(parameters).getMany();
				//console.log('COLOR ASSIGNMENT: Existing walkers found:', existingWalkers.length);

				// Only assign color if there are 2 or more walkers in the group (including the new one)
				if (existingWalkers.length >= 1) {
					// This means we have a group: existing walkers + the new walker being created
					//console.log('COLOR ASSIGNMENT: Group found - assigning colors');

					// Check if any existing walker already has a color
					const existingWalkerWithColor = existingWalkers.find((w) => w.family_friend_color);

					if (existingWalkerWithColor?.family_friend_color) {
						// Use the same color as existing walker in the group
						colorToAssign = existingWalkerWithColor.family_friend_color;
						//console.log('COLOR ASSIGNMENT: Reusing existing color:', colorToAssign);
					} else {
						// Find all used colors in this retreat
						const usedColorsResult = await participantRepository
							.createQueryBuilder('p')
							.select('DISTINCT p.family_friend_color', 'color')
							.where('p.retreatId = :retreatId', { retreatId: participantData.retreatId })
							.andWhere('p.family_friend_color IS NOT NULL')
							.getRawMany();
						const usedColors = usedColorsResult.map((r) => r.color);

						//console.log('COLOR ASSIGNMENT: Used colors in retreat:', usedColors);
						//console.log('COLOR ASSIGNMENT: Total colors in pool:', COLOR_POOL.length);

						// Get an available color from the pool
						const availableColor = COLOR_POOL.find((c) => !usedColors.includes(c));
						colorToAssign =
							availableColor || COLOR_POOL[Math.floor(Math.random() * COLOR_POOL.length)];

						//console.log('COLOR ASSIGNMENT: Selected new color:', colorToAssign);

						if (colorToAssign) {
							// Update all walkers in the group to use the new color
							const updateConditions = searchConditions.map((condition) =>
								condition.replace(/participant\./g, ''),
							);
							//console.log('COLOR ASSIGNMENT: Update conditions:', updateConditions);

							const updateQb = participantRepository
								.createQueryBuilder()
								.update(Participant)
								.set({ family_friend_color: colorToAssign })
								.where('retreatId = :retreatId')
								.andWhere('type = :type', { type: 'walker' })
								.andWhere(new Brackets((qb) => qb.where(updateConditions.join(' OR '))));

							const updateResult = await updateQb.setParameters(parameters).execute();
							//console.log('COLOR ASSIGNMENT: Update result:', updateResult);
						}
					}
				} else {
					//console.log('COLOR ASSIGNMENT: No group found - single walker, no color assigned');
				}
			}
		} else {
			//console.log('COLOR ASSIGNMENT: Skipping color assignment - not a walker');
		}

		//console.log('COLOR ASSIGNMENT: Final color assigned:', colorToAssign);

		if (participantData.type === 'walker' || participantData.type === 'server') {
			const retreat = await retreatRepository.findOne({ where: { id: participantData.retreatId } });
			if (retreat) {
				const participantCount = await participantRepository.count({
					where: {
						retreatId: participantData.retreatId,
						type: participantData.type,
						isCancelled: false,
					},
				});
				const limit = participantData.type === 'walker' ? retreat.max_walkers : retreat.max_servers;
				if (limit != null && participantCount >= limit) {
					participantData.type = 'waiting';
				}
			}
		}

		const maxIdOnRetreat = await participantRepository
			.createQueryBuilder('p')
			.select('MAX(p.id_on_retreat)', 'maxId')
			.where('p.retreatId = :retreatId', { retreatId: participantData.retreatId })
			.getRawOne();
		const id_on_retreat = (maxIdOnRetreat.maxId || 0) + 1;

		const { retreatBed, tableMesa, ...restOfParticipantData } = participantData;

		const newParticipantData = {
			...restOfParticipantData,
			family_friend_color: colorToAssign || undefined,
			id_on_retreat,
			isCancelled: false,
			registrationDate: new Date(),
			lastUpdatedDate: new Date(),
		};

		if (!newParticipantData.nickname) {
			newParticipantData.nickname = newParticipantData.firstName;
		}

		/*console.log('COLOR ASSIGNMENT: Creating participant with data:', {
			...newParticipantData,
			family_friend_color: colorToAssign,
		});*/

		const newParticipant = participantRepository.create(newParticipantData);
		let savedParticipant: Participant = await participantRepository.save(newParticipant);

		/*console.log('COLOR ASSIGNMENT: Participant saved successfully:', {
			id: savedParticipant.id,
			email: savedParticipant.email,
			family_friend_color: savedParticipant.family_friend_color,
		});*/

		if (assignRelationships && savedParticipant.type !== 'waiting' && savedParticipant.type !== 'partial_server') {
			// Use the new unified assignment function
			const assignedBedIds = new Set<string>();
			const { bedId, tableId } = await assignBedAndTableToParticipant(
				savedParticipant,
				assignedBedIds,
				transactionalEntityManager,
			);

			if (bedId) {
				// Update the RetreatBed to point to the participant using query builder
				const retreatBedRepository = transactionalEntityManager.getRepository(RetreatBed);
				await retreatBedRepository
					.createQueryBuilder()
					.update(RetreatBed)
					.set({ participantId: savedParticipant.id })
					.where('id = :id', { id: bedId })
					.execute();
			}

			if (bedId || tableId) {
				// Use query builder to ensure individual updates
				const updates: any = {};
				if (bedId) updates.retreatBedId = bedId;
				if (tableId) updates.tableId = tableId;

				await transactionalEntityManager
					.createQueryBuilder()
					.update(Participant)
					.set(updates)
					.where('id = :id', { id: savedParticipant.id })
					.execute();

				// Refresh the participant to get the updated data
				savedParticipant =
					(await transactionalEntityManager.getRepository(Participant).findOne({
						where: { id: savedParticipant.id },
					})) || savedParticipant;
			}
		}

		// Send welcome email after successful registration (only if not importing or if retreat is public)
		try {
			// Get retreat details for template variables and to check if retreat is public
			const retreat = await transactionalEntityManager.getRepository(Retreat).findOne({
				where: { id: savedParticipant.retreatId },
			});

			// Skip email sending if importing or retreat is not public
			if (isImporting || !retreat || !retreat.isPublic) {
				console.log(`Skipping email sending for imported participant ${savedParticipant.email} - retreat is not public`);
				return savedParticipant;
			}

			const emailService = new EmailService();
			const templateType = savedParticipant.type === 'walker' ? 'WALKER_WELCOME' : 'SERVER_WELCOME';

			// Find the welcome template for this retreat
			const welcomeTemplate = await transactionalEntityManager
				.getRepository(MessageTemplate)
				.findOne({
					where: {
						retreatId: savedParticipant.retreatId,
						type: templateType,
					},
				});

			if (welcomeTemplate && savedParticipant.email) {
				await emailService.sendEmailWithTemplate(
					savedParticipant.email,
					welcomeTemplate.id,
					savedParticipant.retreatId,
					{
						participant: savedParticipant,
						retreat: retreat,
					},
				);
			}

			// Send notification email to the server who invited the participant
			if (savedParticipant.invitedBy && retreat) {
				// Find the server who invited this participant
				const invitingServer = await transactionalEntityManager.getRepository(Participant).findOne({
					where: {
						retreatId: savedParticipant.retreatId,
						nickname: savedParticipant.invitedBy,
						type: 'server',
					},
				});

				if (invitingServer && invitingServer.email) {
					// Find notification template for servers - use GENERAL type as fallback
					const notificationTemplate = await transactionalEntityManager
						.getRepository(MessageTemplate)
						.findOne({
							where: {
								retreatId: savedParticipant.retreatId,
								type: 'GENERAL',
							},
						});

					if (notificationTemplate) {
						await emailService.sendEmailWithTemplate(
							invitingServer.email,
							notificationTemplate.id,
							savedParticipant.retreatId,
							{
								participant: savedParticipant,
								retreat: retreat,
								invitingServer: invitingServer,
							},
						);
						console.log(
							`Notification email sent to server ${invitingServer.nickname} for new participant ${savedParticipant.firstName} ${savedParticipant.lastName}`,
						);
					} else {
						// If no template exists, send a simple notification
						await emailService.sendParticipantEmail({
							to: invitingServer.email,
							subject: `Nuevo participante invitado: ${savedParticipant.firstName} ${savedParticipant.lastName}`,
							participant: savedParticipant,
							retreat: retreat,
							messageContent: `
								<h2>¡Hola ${invitingServer.firstName}!</h2>
								<p>Te informamos que <strong>${savedParticipant.firstName} ${savedParticipant.lastName}</strong> se ha registrado exitosamente en el retiro.</p>
								<p><strong>Detalles del participante:</strong></p>
								<ul>
									<li>Nombre: ${savedParticipant.firstName} ${savedParticipant.lastName}</li>
									<li>Tipo: ${savedParticipant.type === 'walker' ? 'Caminante' : 'Servidor'}</li>
									<li>Email: ${savedParticipant.email || 'No proporcionado'}</li>
									<li>Teléfono: ${savedParticipant.cellPhone || 'No proporcionado'}</li>
								</ul>
								<p>Gracias por invitar a nuevos participantes al retiro.</p>
							`,
						});
						console.log(
							`Simple notification email sent to server ${invitingServer.nickname} for new participant ${savedParticipant.firstName} ${savedParticipant.lastName}`,
						);
					}
				} else {
					console.log(
						`Could not find server with nickname '${savedParticipant.invitedBy}' to send notification`,
					);
				}
			}
		} catch (emailError) {
			console.error('Error sending welcome/notification emails:', emailError);
			// Don't throw - registration succeeded even if email fails
		}

		return savedParticipant;
	});
};

export const updateParticipant = async (
	id: string,
	participantData: UpdateParticipant,
): Promise<Participant | null> => {
	const participant = await participantRepository.findOneBy({ id });
	if (!participant) {
		return null;
	}

	const wasCancelled = participant.isCancelled;
	participantData.lastUpdatedDate = new Date();
	participantRepository.merge(participant, participantData as any);
	const updatedParticipant = await participantRepository.save(participant);

	if (updatedParticipant.type === 'walker' && wasCancelled !== updatedParticipant.isCancelled) {
		await rebalanceTablesForRetreat(updatedParticipant.retreatId);
	}

	return updatedParticipant;
};

export const deleteParticipant = async (id: string): Promise<void> => {
	const participant = await participantRepository.findOneBy({ id });
	if (participant) {
		await participantRepository.update(id, { isCancelled: true, tableId: undefined });
		if (participant.type === 'walker') {
			await rebalanceTablesForRetreat(participant.retreatId);
		}
	}
};

const mapToEnglishKeys = (participant: any): Partial<CreateParticipant> => {
	return {
		id_on_retreat: participant.id?.trim(),
		type: (() => {
			const userType = participant.tipousuario?.trim();
			if (userType === '3') return 'walker';
			if (userType === '4') return 'waiting';
			if (userType === '5') return 'partial_server';
			return 'server';
		})(),
		firstName: participant.nombre?.trim() || '',
		lastName: participant.apellidos?.trim(),
		nickname: participant.apodo?.trim(),
		birthDate: new Date(
			participant.anio?.trim(),
			participant.mes?.trim() - 1,
			participant.dia?.trim(),
		),
		maritalStatus: participant.estadocivil?.trim(),
		street: participant.dircalle?.trim(),
		houseNumber: participant.dirnumero?.trim(),
		postalCode: participant.dircp?.trim(),
		neighborhood: participant.dircolonia?.trim(),
		city: participant.dirmunicipio?.trim(),
		state: participant.direstado?.trim(),
		country: participant.dirpais?.trim(),
		parish: participant.parroquia?.trim(),
		homePhone: participant.telcasa?.trim(),
		workPhone: participant.teltrabajo?.trim(),
		cellPhone: participant.telcelular?.trim(),
		email: participant.email?.trim() || '',
		occupation: participant.ocupacion?.trim(),
		snores: participant.ronca?.trim() === 'S',
		hasMedication: participant.medicinaespecial?.trim() === 'S',
		medicationDetails: participant.medicinacual?.trim(),
		medicationSchedule: participant.medicinahora?.trim(),
		hasDietaryRestrictions: participant.alimentosrestringidos?.trim() === 'S',
		dietaryRestrictionsDetails: participant.alimentoscual?.trim(),
		sacraments: ['baptism', 'communion', 'confirmation', 'marriage'].filter(
			(s) => participant[`sacramento${s}`]?.trim() === 'S',
		) as any,
		emergencyContact1Name: participant.emerg1nombre?.trim(),
		emergencyContact1Relation: participant.emerg1relacion?.trim(),
		emergencyContact1HomePhone: participant.emerg1telcasa?.trim(),
		emergencyContact1WorkPhone: participant.emerg1teltrabajo?.trim(),
		emergencyContact1CellPhone: participant.emerg1telcelular?.trim(),
		emergencyContact1Email: participant.emerg1email?.trim(),
		emergencyContact2Name: participant.emerg2nombre?.trim(),
		emergencyContact2Relation: participant.emerg2relacion?.trim(),
		emergencyContact2HomePhone: participant.emerg2telcasa?.trim(),
		emergencyContact2WorkPhone: participant.emerg2teltrabajo?.trim(),
		emergencyContact2CellPhone: participant.emerg2telcelular?.trim(),
		emergencyContact2Email: participant.emerg2email?.trim(),
		tshirtSize: (() => {
			const size = participant.camiseta?.trim()?.toUpperCase();
			const validSizes = ['S', 'M', 'G', 'X', '2'];
			return validSizes.includes(size) ? size : null;
		})(),
		invitedBy: participant.invitadopor?.trim(),
		isInvitedByEmausMember: participant.invitadaporemaus?.trim() === 'S' ? true : undefined,
		inviterHomePhone: participant.invtelcasa?.trim(),
		inviterWorkPhone: participant.invteltrabajo?.trim(),
		inviterCellPhone: participant.invtelcelular?.trim(),
		inviterEmail: participant.invemail?.trim(),
		pickupLocation: participant.puntoencuentro?.trim(),
		isScholarship: participant.becado?.trim() === 'S',
		palancasCoordinator: participant.palancasencargado?.trim(),
		palancasRequested: participant.palancaspedidas?.trim() === 'S',
		palancasReceived: participant.palancas?.trim(),
		palancasNotes: participant.notaspalancas?.trim(),
		requestsSingleRoom: participant.habitacionindividual?.trim() === 'S',
		isCancelled: participant.cancelado?.trim() === 'S',
		notes: participant.notas?.trim(),
	};
};

// Helper function to extract Excel-specific fields for table and bed assignments
const extractExcelAssignments = (participant: any): {
	tableName?: string;
	roomNumber?: string;
	tipousuario?: string;
	leadershipRole?: 'lider' | 'colider1' | 'colider2' | null;
} => {
	const tipousuario = participant.tipousuario?.toString().trim();
	let leadershipRole: 'lider' | 'colider1' | 'colider2' | null = null;

	// Determine leadership role based on tipousuario
	if (tipousuario === '1') {
		leadershipRole = 'lider'; // Primero de Mesa
	} else if (tipousuario === '2') {
		leadershipRole = 'colider1'; // Segundo de Mesa (will be assigned to colider1 or colider2 based on availability)
	}
	// tipousuario = '0' (Servidor sin mesa) and others get no leadership role

	return {
		tableName: participant.mesa?.toString().trim(),
		roomNumber: participant.habitacion?.toString().trim(),
		tipousuario,
		leadershipRole,
	};
};

// Helper function to find available colider slot in a table
const findAvailableColiderSlot = async (tableId: string): Promise<'colider1' | 'colider2' | null> => {
	try {
		const table = await tableMesaRepository.findOne({
			where: { id: tableId },
			select: ['colider1Id', 'colider2Id']
		});

		if (!table) return null;

		// Check for available slots in order: colider1 first, then colider2
		if (!table.colider1Id) return 'colider1';
		if (!table.colider2Id) return 'colider2';

		return null; // No available slots
	} catch (error) {
		console.error(`Error finding available colider slot in table "${tableId}":`, error);
		return null;
	}
};

// Helper function to assign leadership role during import
const assignLeadershipRole = async (
	retreatId: string,
	participantId: string,
	tableName: string,
	leadershipRole: 'lider' | 'colider1' | 'colider2' | null,
	participantEmail: string
): Promise<void> => {
	if (!leadershipRole || !tableName) return;

	try {
		// Check if participant is already a leader in another table
		const existingLeadership = await checkExistingLeadership(participantId);
		if (existingLeadership.isLeader) {
			console.log(`🔄 Participant ${participantEmail} is already ${existingLeadership.role} in table "${existingLeadership.tableName}". Removing from previous assignment...`);

			// Remove from existing table (the assignLeaderToTable function will handle this)
		}

		// Find or create the table by name
		const tableId = await findOrCreateTableByName(retreatId, tableName);
		if (!tableId) {
			console.warn(`⚠️ Cannot assign leadership: Failed to find or create table "${tableName}" for participant ${participantEmail}`);
			return;
		}

		// For colider1 role, find available slot (colider1 or colider2)
		let finalRole = leadershipRole;
		if (leadershipRole === 'colider1') {
			const availableSlot = await findAvailableColiderSlot(tableId);
			if (!availableSlot) {
				console.warn(`⚠️ Cannot assign colider: No available colider slots in table "${tableName}" for participant ${participantEmail}`);
				return;
			}
			finalRole = availableSlot;
		}

		// Assign leadership role using existing function (which handles removing from other tables)
		await assignLeaderToTable(tableId, participantId, finalRole);

		if (existingLeadership.isLeader) {
			console.log(`✅ Moved participant ${participantEmail} from ${existingLeadership.role} of table "${existingLeadership.tableName}" to ${finalRole} of table "${tableName}"`);
		} else {
			console.log(`✅ Assigned participant ${participantEmail} as ${finalRole} of table "${tableName}"`);
		}

	} catch (error: any) {
		console.error(`❌ Failed to assign leadership role for participant ${participantEmail}:`, error.message);
	}
};

// Helper function to find or create table by name during import
const findOrCreateTableByName = async (retreatId: string, tableName: string): Promise<string | undefined> => {
	if (!tableName) return undefined;

	try {
		// First, try to find existing table
		const existingTable = await tableMesaRepository.findOne({
			where: {
				retreatId,
				name: tableName.toString() // Convert to string to handle numeric Excel values
			},
			select: ['id']
		});

		if (existingTable) {
			return existingTable.id;
		}

		// Table doesn't exist, create it
		console.log(`📋 Creating new table "${tableName}" for retreat ${retreatId}`);
		const newTable = tableMesaRepository.create({
			name: tableName.toString(),
			retreatId
		});
		const savedTable = await tableMesaRepository.save(newTable);

		console.log(`✅ Created table "${tableName}" with ID: ${savedTable.id}`);
		return savedTable.id;

	} catch (error) {
		console.error(`Error finding or creating table "${tableName}":`, error);
		return undefined;
	}
};

// Helper function to check if participant is already a leader in any table
const checkExistingLeadership = async (participantId: string): Promise<{
	isLeader: boolean;
	role?: 'lider' | 'colider1' | 'colider2';
	tableName?: string;
	tableId?: string;
}> => {
	try {
		// Check all three leadership roles
		const leaderTable = await tableMesaRepository.findOne({
			where: { liderId: participantId },
			select: ['id', 'name'],
			relations: ['lider']
		});

		if (leaderTable) {
			return {
				isLeader: true,
				role: 'lider',
				tableName: leaderTable.name,
				tableId: leaderTable.id
			};
		}

		const colider1Table = await tableMesaRepository.findOne({
			where: { colider1Id: participantId },
			select: ['id', 'name']
		});

		if (colider1Table) {
			return {
				isLeader: true,
				role: 'colider1',
				tableName: colider1Table.name,
				tableId: colider1Table.id
			};
		}

		const colider2Table = await tableMesaRepository.findOne({
			where: { colider2Id: participantId },
			select: ['id', 'name']
		});

		if (colider2Table) {
			return {
				isLeader: true,
				role: 'colider2',
				tableName: colider2Table.name,
				tableId: colider2Table.id
			};
		}

		return { isLeader: false };
	} catch (error) {
		console.error(`Error checking existing leadership for participant ${participantId}:`, error);
		return { isLeader: false };
	}
};

// Helper function to find available bed by room number during import
const findAvailableBedByRoom = async (
	retreatId: string,
	roomNumber: string,
	participantType: 'walker' | 'server'
): Promise<string | undefined> => {
	if (!roomNumber) return undefined;

	try {
		const retreatBedRepository = AppDataSource.getRepository(RetreatBed);

		// Determine bed usage based on participant type
		const bedUsage = participantType === 'walker' ? BedUsage.CAMINANTE : BedUsage.SERVIDOR;

		// Find first available bed in the specified room
		const availableBed = await retreatBedRepository.findOne({
			where: {
				retreatId,
				roomNumber: roomNumber.toString(), // Convert to string to handle numeric Excel values
				participantId: IsNull(), // Must be unassigned
				defaultUsage: bedUsage, // Must match participant type
			},
			select: ['id'],
			order: {
				bedNumber: 'ASC' // Get the first bed in the room
			}
		});

		return availableBed?.id;
	} catch (error) {
		console.error(`Error finding available bed in room "${roomNumber}":`, error);
		return undefined;
	}
};

// Helper function to create payment record during import
const createPaymentFromImport = async (
	participantId: string,
	retreatId: string,
	participantRawData: any,
	user: any
): Promise<void> => {
	const paymentAmount = participantRawData.montopago?.trim();
	const paymentDate = participantRawData.fechapago?.trim();

	if (!paymentAmount || !paymentDate) {
		// No payment data in import, skip payment creation
		return;
	}

	try {
		// Validate user is provided
		if (!user || !user.id) {
			console.error('❌ No user provided for import - cannot create payment records');
			return;
		}

		const amount = parseFloat(paymentAmount);
		if (isNaN(amount) || amount <= 0) {
			return; // Skip invalid amounts
		}

		// Check if payment already exists for this participant
		const existingPayments = await paymentRepository.find({
			where: { participantId },
			relations: ['recordedByUser']
		});

		const totalExistingPayments = existingPayments.reduce((sum, payment) => sum + Number(payment.amount), 0);

		// Handle payment scenarios based on existing payments
		if (existingPayments.length === 0) {
			// No existing payments - create new payment
			const payment = paymentRepository.create({
				participantId,
				retreatId,
				amount,
				paymentDate: new Date(paymentDate),
				paymentMethod: 'other', // Default for imports
				referenceNumber: 'IMPORT',
				notes: 'Imported from Excel/CSV file',
				recordedBy: user.id,
			});

			await paymentRepository.save(payment);
			console.log(`✅ Created payment record for participant ${participantId}: $${amount}`);
		} else if (totalExistingPayments < amount) {
			// Existing payments sum less than imported amount - create adjustment payment
			const adjustmentAmount = amount - totalExistingPayments;
			const payment = paymentRepository.create({
				participantId,
				retreatId,
				amount: adjustmentAmount,
				paymentDate: new Date(paymentDate),
				paymentMethod: 'other',
				referenceNumber: 'IMPORT_ADJUSTMENT',
				notes: `Import adjustment - bringing total to $${amount} (existing: $${totalExistingPayments})`,
				recordedBy: user.id,
			});

			await paymentRepository.save(payment);
			console.log(`✅ Created adjustment payment for participant ${participantId}: +$${adjustmentAmount} (total: $${amount})`);
		} else if (totalExistingPayments > amount) {
			// Existing payments sum exceeds imported amount - create refund/adjustment
			const refundAmount = totalExistingPayments - amount;
			const payment = paymentRepository.create({
				participantId,
				retreatId,
				amount: -Math.abs(refundAmount), // Negative amount for refund
				paymentDate: new Date(paymentDate),
				paymentMethod: 'other',
				referenceNumber: 'IMPORT_REFUND',
				notes: `Import adjustment - bringing total to $${amount} (excess: $${totalExistingPayments})`,
				recordedBy: user.id,
			});

			await paymentRepository.save(payment);
			console.log(`⚠️ Created refund adjustment for participant ${participantId}: -$${Math.abs(refundAmount)} (total: $${amount})`);
		} else {
			// Total matches exactly - no action needed
			console.log(`ℹ️ Payment amounts match for participant ${participantId}: $${amount} (no adjustment needed)`);
		}
	} catch (error: any) {
		console.error(`❌ Failed to create payment adjustment for participant ${participantId}: ${error.message}`);
		// Don't throw error - continue with participant creation even if payment fails
	}
};

export const importParticipants = async (retreatId: string, participantsData: any[], user: any) => {
	let importedCount = 0;
	let updatedCount = 0;
	let skippedCount = 0;
	const processedParticipantIds: string[] = [];

	for (const participantRawData of participantsData) {
		const mappedData = mapToEnglishKeys(participantRawData);
		const excelAssignments = extractExcelAssignments(participantRawData);

		if (!mappedData.email) {
			console.warn('Skipping participant due to missing email:', participantRawData);
			skippedCount++;
			continue;
		}

		let participant: Participant;
		try {
			const existingParticipant = await participantRepository.findOne({
				where: { email: mappedData.email, retreatId },
			});

			if (existingParticipant) {
				const { type, ...updateData } = mappedData;
				await updateParticipant(existingParticipant.id, updateData as UpdateParticipant);
				updatedCount++;
				processedParticipantIds.push(existingParticipant.id);
				participant = existingParticipant;

				// Create payment record if payment data exists in import
				await createPaymentFromImport(existingParticipant.id, retreatId, participantRawData, user);
			} else {
				const newParticipant = await createParticipant(
					{ ...mappedData, retreatId } as CreateParticipant,
					false,
					true, // isImporting = true
				);
				importedCount++;
				processedParticipantIds.push(newParticipant.id);
				participant = newParticipant;

				// Create payment record if payment data exists in import
				await createPaymentFromImport(newParticipant.id, retreatId, participantRawData, user);
			}

			// Handle table assignment from Excel 'mesa' field
			if (excelAssignments.tableName && participant.type === 'walker') {
				const tableId = await findOrCreateTableByName(retreatId, excelAssignments.tableName);
				if (tableId) {
					await participantRepository.update(participant.id, { tableId });
					console.log(`✅ Assigned participant ${participant.email} to table "${excelAssignments.tableName}"`);
				} else {
					console.warn(`⚠️ Failed to create or find table "${excelAssignments.tableName}" for participant ${participant.email}`);
				}
			}

			// Handle bed assignment from Excel 'habitacion' field
			if (excelAssignments.roomNumber && participant.type !== 'waiting' && participant.type !== 'partial_server') {
				const bedId = await findAvailableBedByRoom(retreatId, excelAssignments.roomNumber, participant.type);
				if (bedId) {
					// Update participant with bed assignment
					await participantRepository.update(participant.id, { retreatBedId: bedId });

					// Update the bed to point to the participant
					const retreatBedRepository = AppDataSource.getRepository(RetreatBed);
					await retreatBedRepository.update(bedId, { participantId: participant.id });

					console.log(`✅ Assigned participant ${participant.email} to bed in room "${excelAssignments.roomNumber}"`);
				} else {
					console.warn(`⚠️ No available bed found in room "${excelAssignments.roomNumber}" for participant ${participant.email}`);
				}
			}

			// Handle leadership role assignment from Excel 'tipousuario' field
			if (excelAssignments.leadershipRole && participant.type === 'server') {
				// Only assign leadership if the participant also has a table assignment
				if (excelAssignments.tableName) {
					await assignLeadershipRole(
						retreatId,
						participant.id,
						excelAssignments.tableName,
						excelAssignments.leadershipRole,
						participant.email
					);
				} else {
					console.warn(`⚠️ Cannot assign leadership role to participant ${participant.email}: no table specified (mesa field required for tipousuario ${excelAssignments.tipousuario})`);
				}
			} else if (excelAssignments.leadershipRole && participant.type !== 'server') {
				console.warn(`⚠️ Cannot assign leadership role to participant ${participant.email}: participant type is '${participant.type}' but leadership roles require 'server' type`);
			}

		} catch (error: any) {
			console.error(`Failed to import participant ${mappedData.email}: ${error.message}`);
			skippedCount++;
		}
	}

	// Assign beds and tables using the new redesigned system
	await AppDataSource.transaction(async (transactionalEntityManager) => {
		const transactionalParticipantRepository =
			transactionalEntityManager.getRepository(Participant);
		const transactionalBedRepository = transactionalEntityManager.getRepository(RetreatBed);

		// Get all participants to process to check for existing Excel assignments
		const participantsToProcess = await transactionalParticipantRepository.find({
			where: { id: In(processedParticipantIds) },
		});

		// Only clear assignments for participants that don't have Excel assignments
		const participantsWithoutExcelAssignments = participantsToProcess.filter(
			p => !p.tableId && !p.retreatBedId
		);

		if (participantsWithoutExcelAssignments.length > 0) {
			const participantIdsWithoutAssignments = participantsWithoutExcelAssignments.map(p => p.id);

			// Clear bed assignments for participants without Excel assignments
			await transactionalParticipantRepository
				.createQueryBuilder()
				.update(Participant)
				.set({ retreatBedId: null })
				.where('id IN (:...ids)', { ids: participantIdsWithoutAssignments })
				.execute();

			// Clear existing participant assignments in beds for these participants
			await transactionalBedRepository
				.createQueryBuilder()
				.update(RetreatBed)
				.set({ participantId: null })
				.where('participantId IN (:...ids)', { ids: participantIdsWithoutAssignments })
				.execute();
		}

		// Track assigned beds to prevent duplicate assignments
		const assignedBedIds = new Set<string>();

		// Process participants one by one with atomic bed assignment
		for (const participant of participantsToProcess) {
			if (participant.type !== 'waiting' && participant.type !== 'partial_server') {
				// Skip if participant already has assignments from Excel import
				const hasExistingAssignments = participant.tableId || participant.retreatBedId;
				if (hasExistingAssignments) {
					// Track existing bed assignments to prevent conflicts
					if (participant.retreatBedId) {
						assignedBedIds.add(participant.retreatBedId);
					}
					continue;
				}

				// Use the new unified assignment function
				const { bedId, tableId } = await assignBedAndTableToParticipant(
					participant,
					assignedBedIds,
					transactionalEntityManager,
				);

				// Prepare update object
				const updates: any = {};
				if (tableId) updates.tableId = tableId;

				// Handle bed assignment with proper bidirectional relationship management
				if (bedId) {
					// First, assign the bed to the participant in the RetreatBed table using query builder
					await transactionalBedRepository
						.createQueryBuilder()
						.update(RetreatBed)
						.set({ participantId: participant.id })
						.where('id = :id', { id: bedId })
						.execute();

					// Then update the participant with the bed assignment
					updates.retreatBedId = bedId;
				}

				// Apply all updates to the participant using query builder to ensure individual updates
				if (Object.keys(updates).length > 0) {
					await transactionalParticipantRepository
						.createQueryBuilder()
						.update(Participant)
						.set(updates)
						.where('id = :id', { id: participant.id })
						.execute();
				}
			}
		}
	});

	await rebalanceTablesForRetreat(retreatId);

	return { importedCount, updatedCount, skippedCount };
};
