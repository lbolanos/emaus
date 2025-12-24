import { AppDataSource } from '../data-source';
import { Participant } from '../entities/participant.entity';
import { Retreat } from '../entities/retreat.entity';
import { TableMesa } from '../entities/tableMesa.entity';
import { RetreatBed, BedUsage, BedType } from '../entities/retreatBed.entity';
import { MessageTemplate } from '../entities/messageTemplate.entity';
import { Payment } from '../entities/payment.entity';
import { CreateParticipant, UpdateParticipant } from '@repo/types';
import { rebalanceTablesForRetreat, assignLeaderToTable } from './tableMesaService';
import { EmailService } from './emailService';
import { BedQueryUtils } from '../utils/bedQueryUtils';
import { In, Not, IsNull, ILike, Brackets } from 'typeorm';

const participantRepository = AppDataSource.getRepository(Participant);
const tableMesaRepository = AppDataSource.getRepository(TableMesa);
const paymentRepository = AppDataSource.getRepository(Payment);

// Create BedQueryUtils instance
const bedQueryUtils = new BedQueryUtils();

export const findAllParticipants = async (
	retreatId?: string,
	type?: 'walker' | 'server' | 'waiting' | 'partial_server',
	isCancelled?: boolean,
	relations: string[] = [],
	includePayments: boolean = false,
	tagIds?: string[],
): Promise<Participant[]> => {
	if (!retreatId) {
		throw new Error('retreatId is required');
	}

	// Always include payments, retreat, and tags relations for payment calculations and tag display
	const allRelations = [...new Set([...relations, 'payments', 'retreat', 'tags', 'tags.tag'])];
	if (includePayments) {
		allRelations.push('payments.recordedByUser');
	}

	const queryBuilder = participantRepository.createQueryBuilder('participant');

	// Apply base relations
	allRelations.forEach((relation) => {
		const parts = relation.split('.');
		if (parts.length === 1) {
			queryBuilder.leftJoinAndSelect(`participant.${parts[0]}`, parts[0]);
		} else {
			// Handle nested relations like 'tags.tag'
			queryBuilder.leftJoinAndSelect(`${parts[0]}.${parts[1]}`, parts[1]);
		}
	});

	// Apply base filters
	queryBuilder.where('participant.retreatId = :retreatId', { retreatId });

	if (type) {
		queryBuilder.andWhere('participant.type = :type', { type });
	}

	if (typeof isCancelled === 'boolean') {
		queryBuilder.andWhere('participant.isCancelled = :isCancelled', { isCancelled });
	}

	// Apply tag filter if provided
	if (tagIds && tagIds.length > 0) {
		console.log('[Service] findAllParticipants - Applying tagIds filter:', tagIds);
		const subQuery = queryBuilder
			.subQuery()
			.select('pt.participantId')
			.from('participant_tags', 'pt')
			.where('pt.tagId IN (:...tagIds)')
			.getQuery();
		queryBuilder.andWhere(`participant.id IN ${subQuery}`);
		queryBuilder.setParameter('tagIds', tagIds);
	}

	return queryBuilder
		.orderBy('participant.lastName', 'ASC')
		.addOrderBy('participant.firstName', 'ASC')
		.getMany();
};

export const findParticipantById = async (
	id: string,
	includePayments: boolean = false,
): Promise<Participant | null> => {
	const relations = ['retreat', 'tableMesa', 'retreatBed', 'tags', 'tags.tag'];
	if (includePayments) {
		relations.push('payments', 'payments.recordedByUser');
	}

	return participantRepository.findOne({
		where: { id },
		relations,
	});
};

const assignBedToParticipant = async (
	participant: Participant,
	excludedBedIds: string[] = [],
	entityManager?: any,
): Promise<string | undefined> => {
	// Don't assign beds to cancelled participants
	if (participant.isCancelled) {
		console.log(`🚫 Skipping bed assignment for cancelled participant ${participant.email}`);
		return undefined;
	}

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
			// Younger walkers: prioritize bottom bunk beds first, then top bunk
			availableBedsQuery
				.orderBy("CASE WHEN bed.type = 'litera_abajo' THEN 1 WHEN bed.type = 'litera_arriba' THEN 2 WHEN bed.type = 'normal' THEN 3 ELSE 4 END")
				.addOrderBy('bed.floor', 'ASC');
		} else {
			// Older walkers: prioritize normal beds on lower floors
			availableBedsQuery
				.orderBy("CASE WHEN bed.type = 'normal' THEN 1 WHEN bed.type = 'litera_abajo' THEN 2 WHEN bed.type = 'litera_arriba' THEN 3 ELSE 4 END")
				.addOrderBy('bed.floor', 'ASC');
		}
	} else if (participant.type === 'server') {
		if (age <= 35) {
			// Younger servers: prioritize mattresses
			availableBedsQuery.orderBy(
				"CASE WHEN bed.type = 'colchon' THEN 1 WHEN bed.type = 'litera_abajo' THEN 2 WHEN bed.type = 'litera_arriba' THEN 3 ELSE 4 END",
			);
		} else {
			availableBedsQuery.orderBy(
				"CASE WHEN bed.type = 'litera_abajo' THEN 1 WHEN bed.type = 'litera_arriba' THEN 2 WHEN bed.type = 'normal' THEN 3 ELSE 4 END",
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

	// Don't assign anything to cancelled participants
	if (participant.isCancelled) {
		console.log(
			`🚫 Skipping bed and table assignment for cancelled participant ${participant.email}`,
		);
		return result;
	}

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
	skipCapacityCheck = false,
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
			if (skipCapacityCheck) {
				console.log(
					`⚠️ SKIPPING CAPACITY CHECK during import for participant ${participantData.email}`,
				);
				console.log(`   - Preserving original type: ${participantData.type}`);
				console.log(`   - Reason: Import mode - capacity limits disabled`);
			} else {
				const retreat = await retreatRepository.findOne({
					where: { id: participantData.retreatId },
				});
				if (retreat) {
					console.log(`🔍 Checking capacity limits for participant type assignment:`);
					console.log(`   - Retreat ID: ${participantData.retreatId}`);
					console.log(`   - Participant email: ${participantData.email}`);
					console.log(`   - Original type: ${participantData.type}`);
					console.log(`   - Retreat max_walkers: ${retreat.max_walkers}`);
					console.log(`   - Retreat max_servers: ${retreat.max_servers}`);

					const participantCount = await participantRepository.count({
						where: {
							retreatId: participantData.retreatId,
							type: participantData.type,
							isCancelled: false,
						},
					});
					const limit =
						participantData.type === 'walker' ? retreat.max_walkers : retreat.max_servers;

					console.log(`   - Current ${participantData.type} count: ${participantCount}`);
					console.log(`   - Capacity limit for ${participantData.type}: ${limit}`);
					console.log(
						`   - Capacity check: ${participantCount} >= ${limit} = ${participantCount >= limit}`,
					);

					if (limit != null && participantCount >= limit) {
						console.log(
							`⚠️ CAPACITY REACHED: Changing participant ${participantData.email} from '${participantData.type}' to 'waiting'`,
						);
						console.log(
							`   - Reason: ${participantCount} ${participantData.type}s already registered (limit: ${limit})`,
						);
						participantData.type = 'waiting';
						console.log(`   - New type: ${participantData.type}`);
					} else {
						console.log(
							`✅ Capacity available: Keeping participant ${participantData.email} as '${participantData.type}'`,
						);
					}
				} else {
					console.log(
						`❌ WARNING: Could not find retreat ${participantData.retreatId} for capacity check`,
					);
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

		if (
			assignRelationships &&
			savedParticipant.type !== 'waiting' &&
			savedParticipant.type !== 'partial_server'
		) {
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
				// Note: retreatBedId is no longer stored in Participant entity
				// The relationship is managed through RetreatBed.participantId only
				if (tableId) updates.tableId = tableId;

				if (Object.keys(updates).length > 0) {
					await transactionalEntityManager
						.createQueryBuilder()
						.update(Participant)
						.set(updates)
						.where('id = :id', { id: savedParticipant.id })
						.execute();
				}

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
				console.log(
					`Skipping email sending for imported participant ${savedParticipant.email} - retreat is not public`,
				);
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
	skipRebalance: boolean = false,
): Promise<Participant | null> => {
	const participant = await participantRepository.findOneBy({ id });
	if (!participant) {
		return null;
	}

	const wasCancelled = participant.isCancelled;
	participantData.lastUpdatedDate = new Date();
	participantRepository.merge(participant, participantData as any);

	// If participant is being marked as cancelled, clear their assignments atomically
	if (participantData.isCancelled === true && !wasCancelled) {
		console.log(`🚫 Participant ${participant.email} is being cancelled, clearing assignments`);
		participant.tableId = undefined;

		// Also clear the participant assignment in the RetreatBed table
		const retreatBedRepository = AppDataSource.getRepository(RetreatBed);
		await retreatBedRepository
			.createQueryBuilder()
			.update(RetreatBed)
			.set({ participantId: null })
			.where('participantId = :id', { id: participant.id })
			.execute();
	}

	const updatedParticipant = await participantRepository.save(participant);

	/*if (updatedParticipant.type === 'walker' && wasCancelled !== updatedParticipant.isCancelled && !skipRebalance) {
		console.log(`🔄 Participant cancellation status changed, rebalancing tables for retreat ${updatedParticipant.retreatId}`);
		await rebalanceTablesForRetreat(updatedParticipant.retreatId);
	} else if (updatedParticipant.type === 'walker' && wasCancelled !== updatedParticipant.isCancelled && skipRebalance) {
		console.log(`⚠️ SKIPPING table rebalancing during import for participant ${updatedParticipant.email}`);
	}*/

	return updatedParticipant;
};

export const deleteParticipant = async (
	id: string,
	skipRebalance: boolean = false,
): Promise<void> => {
	const participant = await participantRepository.findOneBy({ id });
	if (participant) {
		await participantRepository.update(id, { isCancelled: true, tableId: undefined });
		/*if (participant.type === 'walker' && !skipRebalance) {
			console.log(`🔄 Walker participant deleted, rebalancing tables for retreat ${participant.retreatId}`);
			await rebalanceTablesForRetreat(participant.retreatId);
		} else if (participant.type === 'walker' && skipRebalance) {
			console.log(`⚠️ SKIPPING table rebalancing during import for deleted participant ${participant.email}`);
		}*/
	}
};

const mapToEnglishKeys = (participant: any): Partial<CreateParticipant> => {
	const userType = participant.tipousuario?.trim();
	let mappedType: string;

	if (userType === '3') {
		mappedType = 'walker';
	} else if (userType === '4') {
		mappedType = 'waiting';
	} else if (userType === '5') {
		mappedType = 'partial_server';
	} else {
		mappedType = 'server'; // Default for '0', '1', '2', or any other value
	}

	console.log(`🔍 Type mapping for ${participant.email || 'unknown'}:`);
	console.log(`   - tipousuario value: "${userType}"`);
	console.log(`   - Mapped to type: "${mappedType}"`);

	return {
		id_on_retreat: participant.id?.trim(),
		type: mappedType,
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
const extractExcelAssignments = (
	participant: any,
): {
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
const findAvailableColiderSlot = async (
	tableId: string,
	assignedLeadershipIds?: Set<string>,
): Promise<'colider1' | 'colider2' | null> => {
	try {
		const table = await tableMesaRepository.findOne({
			where: { id: tableId },
			select: ['colider1Id', 'colider2Id', 'name'],
		});

		if (!table) {
			console.warn(`⚠️ Table with ID "${tableId}" not found when checking for colider slots`);
			return null;
		}

		console.log(
			`🔍 Checking colider slots in table "${table.name}" (ID: ${tableId}): colider1Id=${table.colider1Id}, colider2Id=${table.colider2Id}`,
		);

		// Check for available slots in order: colider1 first, then colider2
		if (!table.colider1Id) {
			console.log(`✅ Found available colider1 slot in table "${table.name}"`);
			return 'colider1';
		}
		if (!table.colider2Id) {
			console.log(`✅ Found available colider2 slot in table "${table.name}"`);
			return 'colider2';
		}

		// Additional check: if we have a tracking set, verify the same person isn't assigned to both slots
		if (assignedLeadershipIds && table.colider1Id && table.colider2Id) {
			if (table.colider1Id === table.colider2Id) {
				console.warn(
					`⚠️ Same participant assigned to both colider1 and colider2 in table "${table.name}": ${table.colider1Id}`,
				);
				console.log(
					`🔧 Rejecting table "${table.name}" due to duplicate assignment - both slots have same participant`,
				);
				return null; // Reject this table entirely as it has duplicate assignments
			}
		}

		console.log(
			`⚠️ No available colider slots in table "${table.name}" - both colider1 and colider2 are occupied`,
		);
		return null; // No available slots
	} catch (error) {
		console.error(`Error finding available colider slot in table "${tableId}":`, error);
		return null;
	}
};

// New function to create multiple tables in a single transaction
const createTablesInBatch = async (retreatId: string, tableNames: string[]): Promise<number> => {
	let tablesActuallyCreated = 0;
	try {
		await AppDataSource.transaction(async (transactionalEntityManager) => {
			const transactionalTableRepository = transactionalEntityManager.getRepository(TableMesa);

			for (const tableName of tableNames) {
				// Check if table already exists
				const existingTable = await transactionalTableRepository.findOne({
					where: { name: tableName, retreatId },
					select: ['id', 'name'],
				});

				if (!existingTable) {
					console.log(`🏗️ Creating table "${tableName}" in batch transaction`);
					const newTable = transactionalTableRepository.create({
						name: tableName,
						retreatId,
					});
					await transactionalTableRepository.save(newTable);
					console.log(`✅ Table "${tableName}" created in batch: ID=${newTable.id}`);
					tablesActuallyCreated++;
				} else {
					console.log(`📋 Table "${tableName}" already exists in batch: ID=${existingTable.id}`);
				}
			}
		});
		console.log(`✅ Batch table transaction committed successfully`);
		console.log(
			`📊 Batch creation summary: ${tablesActuallyCreated} actually created out of ${tableNames.length} requested`,
		);
		return tablesActuallyCreated;
	} catch (error: any) {
		console.error(`❌ Batch table creation failed: ${error.message}`);
		throw error;
	}
};

// Helper function to check if participant is already a leader in any table
const checkExistingLeadership = async (
	participantId: string,
): Promise<{
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
			relations: ['lider'],
		});

		if (leaderTable) {
			return {
				isLeader: true,
				role: 'lider',
				tableName: leaderTable.name,
				tableId: leaderTable.id,
			};
		}

		const colider1Table = await tableMesaRepository.findOne({
			where: { colider1Id: participantId },
			select: ['id', 'name'],
		});

		if (colider1Table) {
			return {
				isLeader: true,
				role: 'colider1',
				tableName: colider1Table.name,
				tableId: colider1Table.id,
			};
		}

		const colider2Table = await tableMesaRepository.findOne({
			where: { colider2Id: participantId },
			select: ['id', 'name'],
		});

		if (colider2Table) {
			return {
				isLeader: true,
				role: 'colider2',
				tableName: colider2Table.name,
				tableId: colider2Table.id,
			};
		}

		return { isLeader: false };
	} catch (error) {
		console.error(`Error checking existing leadership for participant ${participantId}:`, error);
		return { isLeader: false };
	}
};

// Helper function to get the next bed number in a room
const getNextBedNumber = async (retreatId: string, roomNumber: string): Promise<string> => {
	try {
		const retreatBedRepository = AppDataSource.getRepository(RetreatBed);

		// Find existing beds in this room for this retreat
		const existingBeds = await retreatBedRepository.find({
			where: {
				retreatId,
				roomNumber: roomNumber.toString(),
			},
			select: ['bedNumber'],
			order: { bedNumber: 'ASC' },
		});

		if (existingBeds.length === 0) {
			return '1'; // First bed in the room
		}

		// Extract numeric values from bed numbers and find the highest
		const bedNumbers = existingBeds.map((bed) => {
			const num = parseInt(bed.bedNumber);
			return isNaN(num) ? 0 : num;
		});

		const maxBedNumber = Math.max(...bedNumbers);
		return String(maxBedNumber + 1);
	} catch (error) {
		console.error(`Error getting next bed number for room "${roomNumber}":`, error);
		return '1'; // Default to first bed if there's an error
	}
};

// Helper function to create a new RetreatBed for a room
const createRetreatBedForRoom = async (
	retreatId: string,
	roomNumber: string,
	participantType: 'walker' | 'server',
): Promise<{ bedId: string; wasCreated: boolean } | undefined> => {
	try {
		const retreatBedRepository = AppDataSource.getRepository(RetreatBed);

		// Get the next bed number for this room
		const bedNumber = await getNextBedNumber(retreatId, roomNumber);

		console.log(
			`🔍 Checking if bed ${bedNumber} already exists in room "${roomNumber}" for ${participantType}`,
		);

		// Check if a bed with this room number and bed number already exists
		const existingBed = await retreatBedRepository.findOne({
			where: {
				retreatId,
				roomNumber: roomNumber.toString(),
				bedNumber,
			},
			select: ['id', 'participantId', 'defaultUsage'],
		});

		if (existingBed) {
			console.log(
				`📋 Bed ${bedNumber} already exists in room "${roomNumber}" (ID: ${existingBed.id})`,
			);
			console.log(
				`   - Current participant assignment: ${existingBed.participantId || 'unassigned'}`,
			);
			console.log(`   - Default usage: ${existingBed.defaultUsage}`);

			// If the bed is unassigned or matches the required usage, return it
			if (
				!existingBed.participantId &&
				existingBed.defaultUsage ===
				(participantType === 'walker' ? BedUsage.CAMINANTE : BedUsage.SERVIDOR)
			) {
				console.log(
					`✅ Using existing unassigned bed ${bedNumber} in room "${roomNumber}" for ${participantType}`,
				);
				return { bedId: existingBed.id, wasCreated: false };
			} else if (existingBed.participantId) {
				console.log(
					`⚠️ Bed ${bedNumber} in room "${roomNumber}" is already assigned to participant ${existingBed.participantId}`,
				);
				// Try to find the next available bed number
				const nextBedNumber = (parseInt(bedNumber) + 1).toString();
				console.log(`🔄 Trying next bed number: ${nextBedNumber}`);

				// Check if next bed number exists
				const nextExistingBed = await retreatBedRepository.findOne({
					where: {
						retreatId,
						roomNumber: roomNumber.toString(),
						bedNumber: nextBedNumber,
					},
					select: ['id', 'participantId'],
				});

				if (!nextExistingBed) {
					const newBedId = await createNewBed(
						retreatBedRepository,
						retreatId,
						roomNumber,
						nextBedNumber,
						participantType,
					);
					return newBedId ? { bedId: newBedId, wasCreated: true } : undefined;
				} else {
					console.log(
						`⚠️ Next bed ${nextBedNumber} also exists, cannot create bed in room "${roomNumber}"`,
					);
					return undefined;
				}
			} else {
				console.log(
					`⚠️ Existing bed ${bedNumber} has different usage (${existingBed.defaultUsage}) than required (${participantType === 'walker' ? BedUsage.CAMINANTE : BedUsage.SERVIDOR})`,
				);
				return undefined;
			}
		}

		// If no existing bed found, create a new one
		const newBedId = await createNewBed(
			retreatBedRepository,
			retreatId,
			roomNumber,
			bedNumber,
			participantType,
		);
		return newBedId ? { bedId: newBedId, wasCreated: true } : undefined;
	} catch (error: any) {
		console.error(`❌ Failed to create RetreatBed for room "${roomNumber}":`, error.message);
		return undefined;
	}
};

// Helper function to actually create a new bed
const createNewBed = async (
	retreatBedRepository: any,
	retreatId: string,
	roomNumber: string,
	bedNumber: string,
	participantType: 'walker' | 'server',
): Promise<string> => {
	try {
		// Determine bed usage based on participant type
		const bedUsage = participantType === 'walker' ? BedUsage.CAMINANTE : BedUsage.SERVIDOR;

		// Create new RetreatBed with sensible defaults
		const newBed = retreatBedRepository.create({
			roomNumber: roomNumber.toString(),
			bedNumber,
			floor: 1, // Default to ground floor
			type: BedType.NORMAL, // Use enum value
			defaultUsage: bedUsage,
			retreatId,
		});

		const savedBed = await retreatBedRepository.save(newBed);
		const savedBedArray = Array.isArray(savedBed) ? savedBed : [savedBed];
		console.log(
			`🛏️ Created new RetreatBed ${savedBedArray[0].id} in room "${roomNumber}" (bed ${bedNumber}) for ${participantType}`,
		);

		return savedBedArray[0].id;
	} catch (error: any) {
		console.error(`❌ Failed to create new RetreatBed:`, error.message);
		throw error; // Re-throw to indicate failure
	}
};

// Helper function to find available bed by room number during import
const findAvailableBedByRoom = async (
	retreatId: string,
	roomNumber: string,
	participantType: 'walker' | 'server',
	assignedBedIds?: Set<string>,
): Promise<{ bedId: string; wasCreated: boolean } | undefined> => {
	if (!roomNumber) return undefined;

	try {
		const retreatBedRepository = AppDataSource.getRepository(RetreatBed);

		// Determine bed usage based on participant type
		const bedUsage = participantType === 'walker' ? BedUsage.CAMINANTE : BedUsage.SERVIDOR;

		// Find first available bed in the specified room
		let whereCondition: any = {
			retreatId,
			roomNumber: roomNumber.toString(), // Convert to string to handle numeric Excel values
			participantId: IsNull(), // Must be unassigned
			defaultUsage: bedUsage, // Must match participant type
		};

		// If we have a tracking set of assigned bed IDs, exclude those beds
		if (assignedBedIds && assignedBedIds.size > 0) {
			whereCondition.id = Not(In(Array.from(assignedBedIds)));
		}

		const availableBed = await retreatBedRepository.findOne({
			where: whereCondition,
			select: ['id'],
			order: {
				bedNumber: 'ASC', // Get the first bed in the room
			},
		});

		// If bed found, return its ID
		if (availableBed) {
			return { bedId: availableBed.id, wasCreated: false };
		}

		// No available bed found, try to create one
		console.log(
			`🔍 No available bed found in room "${roomNumber}" for ${participantType}. Attempting to create new bed...`,
		);
		const bedResult = await createRetreatBedForRoom(retreatId, roomNumber, participantType);

		if (bedResult) {
			if (bedResult.wasCreated) {
				console.log(
					`✅ Created and assigned new bed in room "${roomNumber}" for ${participantType}`,
				);
			} else {
				console.log(`✅ Reused existing bed in room "${roomNumber}" for ${participantType}`);
			}
			return bedResult;
		} else {
			console.warn(
				`⚠️ Failed to create or find bed in room "${roomNumber}" for ${participantType}`,
			);
			return undefined;
		}
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
	user: any,
): Promise<{ paymentCreated: boolean }> => {
	const paymentAmount = participantRawData.montopago?.trim();
	const paymentDate = participantRawData.fechapago?.trim();

	if (!paymentAmount || !paymentDate) {
		// No payment data in import, skip payment creation
		return { paymentCreated: false };
	}

	try {
		// Validate user is provided
		if (!user || !user.id) {
			console.error('❌ No user provided for import - cannot create payment records');
			return { paymentCreated: false };
		}

		const amount = parseFloat(paymentAmount);
		if (isNaN(amount) || amount <= 0) {
			return { paymentCreated: false }; // Skip invalid amounts
		}

		// Check if payment already exists for this participant
		const existingPayments = await paymentRepository.find({
			where: { participantId },
			relations: ['recordedByUser'],
		});

		const totalExistingPayments = existingPayments.reduce(
			(sum, payment) => sum + Number(payment.amount),
			0,
		);
		let paymentCreated = false;

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
			paymentCreated = true;
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
			console.log(
				`✅ Created adjustment payment for participant ${participantId}: +$${adjustmentAmount} (total: $${amount})`,
			);
			paymentCreated = true;
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
			console.log(
				`⚠️ Created refund adjustment for participant ${participantId}: -$${Math.abs(refundAmount)} (total: $${amount})`,
			);
			paymentCreated = true;
		} else {
			// Total matches exactly - no action needed
			console.log(
				`ℹ️ Payment amounts match for participant ${participantId}: $${amount} (no adjustment needed)`,
			);
		}

		return { paymentCreated };
	} catch (error: any) {
		console.error(
			`❌ Failed to create payment adjustment for participant ${participantId}: ${error.message}`,
		);
		// Don't throw error - continue with participant creation even if payment fails
		return { paymentCreated: false };
	}
};

export const importParticipants = async (retreatId: string, participantsData: any[], user: any) => {
	let importedCount = 0;
	let updatedCount = 0;
	let skippedCount = 0;
	let tablesCreated = 0;
	let bedsCreated = 0;
	let paymentsCreated = 0;
	const processedParticipantIds: string[] = [];

	// Sort participants so cancelled ones are processed first
	// This ensures cancelled participants don't interfere with active participant assignments
	const sortedParticipantsData = participantsData.sort((a, b) => {
		const aCancelled = a.cancelado?.trim() === 'S';
		const bCancelled = b.cancelado?.trim() === 'S';

		if (aCancelled && !bCancelled) return -1; // a is cancelled, b is not - a comes first
		if (!aCancelled && bCancelled) return 1; // b is cancelled, a is not - b comes first
		return 0; // both are the same (both cancelled or both not cancelled)
	});

	console.log(
		`🚀 Starting import process for retreat ${retreatId} with ${sortedParticipantsData.length} participants`,
	);
	console.log(`📊 Initial database state check: counting existing tables...`);
	const initialTableCount = await tableMesaRepository.count({ where: { retreatId } });
	console.log(`📋 Found ${initialTableCount} existing tables in retreat ${retreatId}`);

	// First pass: Identify all tables that need to be created
	console.log(`🔍 First pass: Identifying tables that need to be created...`);
	const tablesToCreate = new Set<string>();
	for (const participantRawData of participantsData) {
		const excelAssignments = extractExcelAssignments(participantRawData);
		if (excelAssignments.tableName) {
			tablesToCreate.add(excelAssignments.tableName.toString());
		}
	}

	// Create all needed tables in a single transaction
	if (tablesToCreate.size > 0) {
		console.log(
			`🏗️ Creating ${tablesToCreate.size} tables in batch: [${Array.from(tablesToCreate).join(', ')}]`,
		);
		const actualTablesCreated = await createTablesInBatch(retreatId, Array.from(tablesToCreate));
		tablesCreated = actualTablesCreated;
		console.log(`✅ Batch table creation completed: ${tablesCreated} tables actually created`);
	}

	// Initialize tracking to prevent duplicate assignments during import
	const assignedBedIds = new Set<string>();
	const bedAssignmentQueue: Array<{
		participant: any;
		bedNumber: string;
		roomNumber: string;
		participantType: 'walker' | 'server';
	}> = [];

	// Leadership role tracking to prevent same person from being assigned to multiple roles
	const assignedLeadershipIds = new Set<string>();
	const leadershipAssignmentQueue: Array<{
		participant: any;
		tableName: string;
		leadershipRole: 'lider' | 'colider1' | 'colider2' | null;
		participantEmail: string;
	}> = [];

	// Second pass: Process participants and collect bed assignments
	for (const participantRawData of sortedParticipantsData) {
		const mappedData = mapToEnglishKeys(participantRawData);
		const excelAssignments = extractExcelAssignments(participantRawData);

		console.log(`👤 Importing participant: ${mappedData.email}`);
		console.log(
			`   - Original type from Excel: ${participantRawData.tipousuario} -> ${mappedData.type} -> ${mappedData.isCancelled ? 'cancelled' : 'active'}`,
		);
		console.log(`   - Excel table assignment: ${excelAssignments.tableName}`);
		console.log(`   - Excel room assignment: ${excelAssignments.roomNumber}`);

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
				console.log(`🔄 Updating existing participant: ${existingParticipant.email}`);
				console.log(`   - Current type: ${existingParticipant.type}`);
				console.log(`   - Type from Excel: ${type} (will not be changed on update)`);

				const updatedParticipant = await updateParticipant(
					existingParticipant.id,
					updateData as UpdateParticipant,
					true,
				); // skipRebalance = true during import
				console.log(
					`✅ Updated participant: ${updatedParticipant.email} -> Final type: ${updatedParticipant.type} -> Cancelled: ${updatedParticipant.isCancelled}`,
				);
				updatedCount++;
				processedParticipantIds.push(existingParticipant.id);
				participant = existingParticipant;

				// Create payment record if payment data exists in import
				const paymentResult = await createPaymentFromImport(
					existingParticipant.id,
					retreatId,
					participantRawData,
					user,
				);
				if (paymentResult.paymentCreated) {
					paymentsCreated++;
				}
			} else {
				const newParticipant = await createParticipant(
					{ ...mappedData, retreatId } as CreateParticipant,
					false,
					true, // isImporting = true
					true, // skipCapacityCheck = true during import
				);
				console.log(
					`✅ Created new participant: ${newParticipant.email} -> Final type: ${newParticipant.type} -> Cancelled: ${newParticipant.isCancelled}`,
				);
				importedCount++;
				processedParticipantIds.push(newParticipant.id);
				participant = newParticipant;

				// Create payment record if payment data exists in import
				const paymentResult = await createPaymentFromImport(
					newParticipant.id,
					retreatId,
					participantRawData,
					user,
				);
				if (paymentResult.paymentCreated) {
					paymentsCreated++;
				}
			}

			// Handle table assignment from Excel 'mesa' field (tables are pre-created in batch)
			if (excelAssignments.tableName && participant.type === 'walker') {
				console.log(
					`🔍 Processing table assignment for participant ${participant.email} -> table "${excelAssignments.tableName}"`,
				);

				// Tables are pre-created, just find the existing one
				const existingTable = await tableMesaRepository.findOne({
					where: { name: excelAssignments.tableName.toString(), retreatId },
					select: ['id', 'name'],
				});

				if (existingTable) {
					console.log(
						`📋 Found pre-created table: ${existingTable.name} (ID: ${existingTable.id})`,
					);
					await participantRepository.update(participant.id, { tableId: existingTable.id });
					console.log(
						`✅ Assigned participant ${participant.email} to table "${excelAssignments.tableName}"`,
					);
				} else {
					console.error(
						`❌ CRITICAL: Pre-created table "${excelAssignments.tableName}" not found! This should not happen.`,
					);
				}
			}

			// Handle bed assignment from Excel 'habitacion' field - collect for batch processing
			if (
				excelAssignments.roomNumber &&
				participant.type !== 'waiting' &&
				participant.type !== 'partial_server'
			) {
				console.log(
					`🛏️ Queueing bed assignment for participant ${participant.email} -> room "${excelAssignments.roomNumber}"`,
				);
				bedAssignmentQueue.push({
					participant: participant,
					bedNumber: '', // Will be determined by findAvailableBedByRoom
					roomNumber: excelAssignments.roomNumber,
					participantType: participant.type,
				});
			}

			// Handle leadership role assignment from Excel 'tipousuario' field - collect for batch processing
			if (excelAssignments.leadershipRole && participant.type === 'server') {
				// Only assign leadership if the participant also has a table assignment
				if (excelAssignments.tableName) {
					console.log(
						`👑 Queueing leadership assignment for participant ${participant.email} -> role ${excelAssignments.leadershipRole} at table "${excelAssignments.tableName}"`,
					);
					leadershipAssignmentQueue.push({
						participant: participant,
						tableName: excelAssignments.tableName,
						leadershipRole: excelAssignments.leadershipRole,
						participantEmail: participant.email,
					});
				} else {
					console.warn(
						`⚠️ Cannot assign leadership role to participant ${participant.email}: no table specified (mesa field required for tipousuario ${excelAssignments.tipousuario})`,
					);
				}
			} else if (excelAssignments.leadershipRole && participant.type !== 'server') {
				console.warn(
					`⚠️ Cannot assign leadership role to participant ${participant.email}: participant type is '${participant.type}' but leadership roles require 'server' type`,
				);
			}
		} catch (error: any) {
			console.error(`❌ Failed to import participant ${mappedData.email}: ${error.message}`);
			console.error(`📋 Error stack trace:`, error.stack);
			console.error(`🔍 Error details:`, {
				message: error.message,
				name: error.name,
				participantEmail: mappedData.email,
				retreatId,
				tablesCreatedSoFar: tablesCreated,
				step: 'individual participant processing',
			});
			skippedCount++;
		}
	}

	// Note: Bed assignments will be processed within the main transaction to ensure consistency
	// This prevents the issue where assignments made outside the transaction were later cleared
	console.log(
		`🛏️ ${bedAssignmentQueue.length} bed assignments queued for processing in main transaction...`,
	);

	// Process leadership assignments in batch to prevent duplicate role assignments
	console.log(`👑 Processing ${leadershipAssignmentQueue.length} queued leadership assignments...`);

	for (const leadershipAssignment of leadershipAssignmentQueue) {
		const { participant, tableName, leadershipRole, participantEmail } = leadershipAssignment;

		// Skip cancelled participants entirely - double-check participant status before assignment
		if (participant.isCancelled) {
			console.log(
				`🚫 Skipping leadership assignment for cancelled participant ${participant.email}`,
			);
			continue;
		}

		// Fresh participant lookup to ensure we have the latest cancellation status
		const freshParticipant = await participantRepository.findOne({
			where: { id: participant.id },
			select: ['id', 'type', 'isCancelled', 'email', 'firstName', 'lastName'],
		});

		if (!freshParticipant) {
			console.warn(
				`⚠️ Participant ${participantEmail} not found during leadership assignment, skipping...`,
			);
			continue;
		}

		if (freshParticipant.isCancelled) {
			console.log(
				`🚫 Skipping leadership assignment for cancelled participant ${freshParticipant.email} (fresh lookup)`,
			);
			continue;
		}

		if (freshParticipant.type !== 'server') {
			console.warn(
				`⚠️ Cannot assign leadership role to participant ${freshParticipant.email}: type is '${freshParticipant.type}' but servers only`,
			);
			continue;
		}

		// Update using the fresh participant data
		const participantForAssignment = freshParticipant;

		// Check if this participant is already assigned to a leadership role in this batch
		if (assignedLeadershipIds.has(participant.id)) {
			console.log(
				`⚠️ Participant ${participantEmail} is already assigned to a leadership role in this batch, skipping additional assignments...`,
			);
			continue;
		}

		// Check database for existing leadership assignments (from previous imports)
		const existingLeadership = await checkExistingLeadership(participant.id);
		if (existingLeadership.isLeader) {
			console.log(
				`🔄 Participant ${participantEmail} is already ${existingLeadership.role} in table "${existingLeadership.tableName}" from previous import. Removing from previous assignment...`,
			);
		}

		// Find the pre-created table
		const existingTable = await tableMesaRepository.findOne({
			where: { name: tableName.toString(), retreatId },
			select: ['id', 'name'],
		});

		if (existingTable) {
			console.log(
				`📋 Found pre-created table for leadership: ${existingTable.name} (ID: ${existingTable.id})`,
			);

			// For colider1 role, find available slot (colider1 or colider2)
			let finalRole = leadershipRole;
			if (leadershipRole === 'colider1') {
				const availableSlot = await findAvailableColiderSlot(
					existingTable.id,
					assignedLeadershipIds,
				);
				if (!availableSlot) {
					console.warn(
						`⚠️ Cannot assign colider: No available colider slots in table "${tableName}" for participant ${participantEmail}`,
					);
					continue;
				}
				finalRole = availableSlot;
			}

			// Double-check: make sure this participant isn't already assigned to this table in any capacity
			const currentTableState = await tableMesaRepository.findOne({
				where: { id: existingTable.id },
				select: ['liderId', 'colider1Id', 'colider2Id'],
			});

			if (currentTableState) {
				const currentAssignments = [
					currentTableState.liderId,
					currentTableState.colider1Id,
					currentTableState.colider2Id,
				];
				if (currentAssignments.includes(participant.id)) {
					console.warn(
						`⚠️ Participant ${participantEmail} is already assigned to table "${tableName}" in some capacity, skipping duplicate assignment...`,
					);
					continue;
				}
			}

			// Mark this participant as assigned to prevent multiple assignments in the same batch
			assignedLeadershipIds.add(participant.id);

			// Assign leadership role using existing function (which handles removing from other tables)
			if (finalRole) {
				await assignLeaderToTable(existingTable.id, participant.id, finalRole);
			} else {
				console.warn(
					`⚠️ Skipping leadership assignment for participant ${participantEmail}: no valid role (${leadershipRole})`,
				);
				continue;
			}

			// Verify the assignment didn't create duplicates
			const verificationTableState = await tableMesaRepository.findOne({
				where: { id: existingTable.id },
				select: ['liderId', 'colider1Id', 'colider2Id'],
			});

			if (verificationTableState) {
				const assignments = [
					verificationTableState.liderId,
					verificationTableState.colider1Id,
					verificationTableState.colider2Id,
				];
				const uniqueAssignments = assignments.filter((id) => id !== null);

				// Check for duplicates
				if (uniqueAssignments.length !== new Set(uniqueAssignments).size) {
					console.error(
						`❌ CRITICAL: Duplicate assignment detected in table "${tableName}" after assignment!`,
					);
					console.error(
						`   Assignments: lider=${verificationTableState.liderId}, colider1=${verificationTableState.colider1Id}, colider2=${verificationTableState.colider2Id}`,
					);

					// Find and remove the duplicate
					const duplicates = uniqueAssignments.filter(
						(id, index) => uniqueAssignments.indexOf(id) !== index,
					);
					for (const duplicateId of duplicates) {
						console.log(
							`🔧 Removing duplicate assignment for participant ${duplicateId} from table "${tableName}"`,
						);
						if (verificationTableState.colider1Id === duplicateId) {
							await tableMesaRepository.update(existingTable.id, { colider1Id: undefined });
						} else if (verificationTableState.colider2Id === duplicateId) {
							await tableMesaRepository.update(existingTable.id, { colider2Id: undefined });
						}
					}
				} else {
					if (existingLeadership.isLeader) {
						console.log(
							`✅ Moved participant ${participantEmail} from ${existingLeadership.role} of table "${existingLeadership.tableName}" to ${finalRole} of table "${tableName}"`,
						);
					} else {
						console.log(
							`✅ Assigned participant ${participantEmail} as ${finalRole} of table "${tableName}"`,
						);
					}
				}
			}
		} else {
			console.error(
				`❌ CRITICAL: Pre-created table "${tableName}" not found for leadership assignment!`,
			);
		}
	}
	console.log(`👑 Leadership assignment processing completed`);

	// Assign beds and tables using the new redesigned system
	console.log(
		`🔄 Starting main transaction for bed/table assignment for ${processedParticipantIds.length} processed participants`,
	);
	console.log(
		`📊 Pre-transaction table count: ${await tableMesaRepository.count({ where: { retreatId } })}`,
	);

	// Check participant table assignments before main transaction
	const participantsWithTableBefore = await participantRepository.count({
		where: { retreatId, tableId: Not(IsNull()) },
	});
	console.log(
		`📊 Pre-transaction: ${participantsWithTableBefore} participants have table assignments`,
	);

	try {
		await AppDataSource.transaction(async (transactionalEntityManager) => {
			console.log(`✅ Main transaction started successfully`);
			console.log(`🔍 Main transaction: processing ${processedParticipantIds.length} participants`);

			const transactionalParticipantRepository =
				transactionalEntityManager.getRepository(Participant);
			const transactionalBedRepository = transactionalEntityManager.getRepository(RetreatBed);

			// Get all participants to process to check for existing Excel assignments
			const participantsToProcess = await transactionalParticipantRepository.find({
				where: { id: In(processedParticipantIds) },
			});

			console.log(
				`📊 Main transaction: found ${participantsToProcess.length} participants to process`,
			);

			// Count participants with existing Excel assignments
			const participantsWithExcelAssignments = participantsToProcess.filter((p) => p.tableId);
			const participantsWithoutExcelAssignments = participantsToProcess.filter((p) => !p.tableId);

			console.log(
				`📋 Main transaction: ${participantsWithExcelAssignments.length} participants have Excel table assignments, ${participantsWithoutExcelAssignments.length} need automatic assignments`,
			);

			// Note: We no longer clear bed assignments here since they are now handled atomically
			// within the transaction along with all other assignments to ensure consistency

			// Track assigned beds to prevent duplicate assignments
			const assignedBedIds = new Set<string>();

			// First, process Excel bed assignments within the transaction to ensure consistency
			console.log(
				`🛏️ Processing ${bedAssignmentQueue.length} Excel bed assignments within main transaction...`,
			);
			for (const bedAssignment of bedAssignmentQueue) {
				const { participant, roomNumber, participantType } = bedAssignment;

				// Refresh participant data to get the latest cancellation status (handles duplicate rows in Excel)
				const freshParticipant = await transactionalParticipantRepository.findOne({
					where: { id: participant.id },
					select: ['id', 'type', 'isCancelled', 'email', 'firstName', 'lastName'],
				});

				if (!freshParticipant) {
					console.warn(
						`⚠️ Participant ${participant.email} not found during bed assignment, skipping...`,
					);
					continue;
				}

				// Skip cancelled participants
				if (freshParticipant.isCancelled) {
					console.log(
						`🚫 Skipping Excel bed assignment for cancelled participant ${freshParticipant.email}`,
					);
					continue;
				}

				// Use the fresh participant data for all subsequent operations
				const participantForAssignment = freshParticipant;

				// Check if this participant already has a bed assigned
				const hasExistingBedAssignment = await bedQueryUtils.participantHasBedAssignment(
					participantForAssignment.id,
				);
				if (hasExistingBedAssignment) {
					const existingBed = await bedQueryUtils.getParticipantBedAssignment(
						participantForAssignment.id,
					);
					console.log(
						`⚠️ Participant ${participantForAssignment.email} already has bed assigned (${existingBed?.id}), skipping Excel assignment...`,
					);
					if (existingBed) {
						assignedBedIds.add(existingBed.id);
					}
					continue;
				}

				// Find or create a bed that hasn't been assigned yet in this batch
				const bedResult = await findAvailableBedByRoom(
					retreatId,
					roomNumber,
					participantType,
					assignedBedIds,
				);

				if (bedResult) {
					const { bedId, wasCreated } = bedResult;

					// Mark this bed as assigned to prevent other participants from getting it
					assignedBedIds.add(bedId);

					// Update the bed to point to the participant within the transaction
					await transactionalBedRepository
						.createQueryBuilder()
						.update(RetreatBed)
						.set({ participantId: participantForAssignment.id })
						.where('id = :id', { id: bedId })
						.execute();

					console.log(
						`✅ Excel assignment: Assigned participant ${participantForAssignment.email} to bed ${bedId} in room "${roomNumber}"`,
					);

					// Track bed creation
					if (wasCreated) {
						bedsCreated++;
					}
				} else {
					console.warn(
						`⚠️ No available bed found in room "${roomNumber}" for participant ${participantForAssignment.email} (Excel assignment)`,
					);
				}
			}
			console.log(`🛏️ Excel bed assignment processing completed within transaction`);

			// Process participants one by one with atomic bed assignment for any remaining unassigned participants
			for (const participant of participantsToProcess) {
				// Skip cancelled participants entirely
				if (participant.isCancelled) {
					console.log(`🚫 Skipping cancelled participant ${participant.email} in main transaction`);
					continue;
				}

				if (participant.type !== 'waiting' && participant.type !== 'partial_server') {
					// Check if participant already has bed assignment (from previous import or database)
					const hasExistingBedAssignment = await bedQueryUtils.participantHasBedAssignment(
						participant.id,
					);
					const hasExistingTableAssignment = !!participant.tableId;

					if (hasExistingTableAssignment || hasExistingBedAssignment) {
						console.log(
							`✅ Main transaction: preserving existing assignments for participant ${participant.email} (tableId: ${participant.tableId}, hasBed: ${hasExistingBedAssignment})`,
						);

						// Track existing bed assignments to prevent conflicts
						if (hasExistingBedAssignment) {
							const existingBed = await bedQueryUtils.getParticipantBedAssignment(participant.id);
							if (existingBed) {
								assignedBedIds.add(existingBed.id);
							}
						}
						continue;
					}

					// Use the new unified assignment function
					const { bedId, tableId } = await assignBedAndTableToParticipant(
						participant,
						assignedBedIds,
						transactionalEntityManager,
					);

					// Handle table assignment
					if (tableId) {
						await transactionalParticipantRepository
							.createQueryBuilder()
							.update(Participant)
							.set({ tableId })
							.where('id = :id', { id: participant.id })
							.execute();
					}
				}
			}

			console.log(`🔄 Main transaction: about to commit all participant updates`);
		});
		console.log(`✅ Main transaction completed successfully`);
	} catch (error: any) {
		console.error(`❌ MAIN TRANSACTION FAILED: ${error.message}`);
		console.error(`📋 Transaction error stack trace:`, error.stack);
		console.error(`🔍 Transaction error details:`, {
			message: error.message,
			name: error.name,
			retreatId,
			tablesCreatedSoFar: tablesCreated,
			processedParticipantsCount: processedParticipantIds.length,
			step: 'main bed/table assignment transaction',
		});
		throw error; // Re-throw to stop the import process
	}

	// Check participant table assignments after main transaction
	const participantsWithTableAfter = await participantRepository.count({
		where: { retreatId, tableId: Not(IsNull()) },
	});
	console.log(
		`📊 Post-transaction: ${participantsWithTableAfter} participants have table assignments`,
	);

	console.log(
		`📊 Post-transaction table count: ${await tableMesaRepository.count({ where: { retreatId } })}`,
	);

	// Final verification: Check all tables that should exist based on our tracking
	console.log(`🔍 Final verification: Checking database state...`);
	const finalTableCount = await tableMesaRepository.count({ where: { retreatId } });
	const expectedTableCount = initialTableCount + tablesCreated;

	console.log(`📊 Final table count verification:`);
	console.log(`   - Initial tables: ${initialTableCount}`);
	console.log(`   - Tables actually created during import: ${tablesCreated}`);
	console.log(`   - Expected final count: ${expectedTableCount}`);
	console.log(`   - Actual final count: ${finalTableCount}`);

	if (finalTableCount !== expectedTableCount) {
		console.error(
			`❌ CRITICAL ERROR: Table count mismatch! Expected ${expectedTableCount}, found ${finalTableCount}`,
		);
		console.error(
			`   This indicates that ${expectedTableCount - finalTableCount} tables were lost due to transaction rollbacks`,
		);

		// List all tables to see what's missing
		const allTables = await tableMesaRepository.find({
			where: { retreatId },
			select: ['id', 'name'],
			order: { name: 'ASC' },
		});
		console.log(
			`📋 Current tables in database:`,
			allTables.map((t) => `${t.name} (${t.id})`),
		);
	} else {
		console.log(`✅ Table count verification passed - all created tables are persisted`);
	}

	// NOTE: Skipping rebalanceTablesForRetreat during import to prevent table deletions
	// The import process explicitly creates and assigns tables based on Excel data
	// Calling rebalance would delete tables that were intentionally created during import
	//console.log(`⚠️ SKIPPING rebalanceTablesForRetreat during import to preserve explicitly created tables`);
	console.log(`📋 Import process has already handled table assignments based on Excel data`);

	// For debugging purposes, let us know what would have happened:
	const currentTableCount = await tableMesaRepository.count({ where: { retreatId } });
	console.log(`📊 Current table count (preserving all tables): ${currentTableCount}`);

	console.log(
		`🎉 Import process completed: imported=${importedCount}, updated=${updatedCount}, skipped=${skippedCount}, tablesCreated=${tablesCreated}, bedsCreated=${bedsCreated}, paymentsCreated=${paymentsCreated}`,
	);

	return {
		importedCount,
		updatedCount,
		skippedCount,
		tablesCreated,
		bedsCreated,
		paymentsCreated,
	};
};
