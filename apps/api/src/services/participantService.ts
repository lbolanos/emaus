import { AppDataSource } from '../data-source';
import { Participant } from '../entities/participant.entity';
import { Retreat } from '../entities/retreat.entity';
import { TableMesa } from '../entities/tableMesa.entity';
import { RetreatBed } from '../entities/retreatBed.entity';
import { CreateParticipant, UpdateParticipant } from '@repo/types';
import { rebalanceTablesForRetreat } from './tableMesaService';
import { In, Not, IsNull, ILike, Brackets } from 'typeorm';

const participantRepository = AppDataSource.getRepository(Participant);
const retreatRepository = AppDataSource.getRepository(Retreat);
const tableMesaRepository = AppDataSource.getRepository(TableMesa);

export const findAllParticipants = async (
  retreatId?: string,
  type?: 'walker' | 'server' | 'waiting',
  isCancelled?: boolean,
  relations: string[] = []
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
  return participantRepository.find({ where, relations });
};

export const findParticipantById = async (id: string): Promise<Participant | null> => {
  return participantRepository.findOneBy({ id });
};

const assignBedToParticipant = async (participant: Participant, excludedBedIds: string[] = [], entityManager?: any): Promise<string | undefined> => {
  if (!participant.birthDate) return undefined;

  const age = new Date().getFullYear() - new Date(participant.birthDate).getFullYear();
  const retreatBedRepository = entityManager ? entityManager.getRepository(RetreatBed) : AppDataSource.getRepository(RetreatBed);

  
  // Find available beds using a query that respects the current transaction state
  const availableBedsQuery = retreatBedRepository.createQueryBuilder('bed')
    .where('bed.retreatId = :retreatId', { retreatId: participant.retreatId })
    .andWhere('bed.participantId IS NULL')
    .andWhere('bed.id NOT IN (:...excludedBedIds)', { excludedBedIds: excludedBedIds.length > 0 ? excludedBedIds : [''] });

  // Apply sorting based on participant type and age
  if (participant.type === 'walker') {
    if (age <= 40) { // Younger walkers: prioritize bunk beds
      availableBedsQuery.orderBy("CASE WHEN bed.type = 'litera' THEN 1 WHEN bed.type = 'normal' THEN 2 ELSE 3 END")
        .addOrderBy('bed.floor', 'ASC');
    } else { // Older walkers: prioritize normal beds on lower floors
      availableBedsQuery.orderBy("CASE WHEN bed.type = 'normal' THEN 1 WHEN bed.type = 'litera' THEN 2 ELSE 3 END")
        .addOrderBy('bed.floor', 'ASC');
    }
  } else if (participant.type === 'server') {
    if (age <= 35) { // Younger servers: prioritize mattresses
      availableBedsQuery.orderBy("CASE WHEN bed.type = 'colchon' THEN 1 WHEN bed.type = 'litera' THEN 2 ELSE 3 END");
    } else {
      availableBedsQuery.orderBy("CASE WHEN bed.type = 'litera' THEN 1 WHEN bed.type = 'normal' THEN 2 ELSE 3 END");
    }
  }

  // Try to find beds in rooms with same snoring status first
  if (participant.snores !== undefined) {
    const roomsWithSameSnorers = await retreatBedRepository.createQueryBuilder('rb')
      .select('rb.roomNumber')
      .innerJoin('rb.participant', 'p')
      .where('rb.retreatId = :retreatId', { retreatId: participant.retreatId })
      .andWhere('p.snores = :snores', { snores: participant.snores })
      .groupBy('rb.roomNumber')
      .getRawMany();
    
    const roomNumbers = roomsWithSameSnorers.map((r: any) => r.rb_roomNumber);

    if (roomNumbers.length > 0) {
      const snorerQuery = availableBedsQuery.clone()
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

const assignBedAndTableToParticipant = async (participant: Participant, assignedBedIds: Set<string>, entityManager: any): Promise<{ bedId?: string, tableId?: string }> => {
  const result: { bedId?: string, tableId?: string } = {};
  
  // Assign bed if applicable
  if (participant.type !== 'waiting') {
    const bedId = await assignBedToParticipant(participant, Array.from(assignedBedIds), entityManager);
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

    let tables = await tableRepo.find({
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
                tableId: Not(IsNull())
            },
            select: ['tableId']
        });
        const tablesToExclude = walkersInvitedBySamePerson.map(p => p.tableId).filter(Boolean);
        if (tablesToExclude.length > 0) {
            suitableTables = tables.filter(t => !tablesToExclude.includes(t.id as string));
        }
    }

    const tablesToChooseFrom = suitableTables.length > 0 ? suitableTables : tables;
    const minWalkers = Math.min(...tablesToChooseFrom.map(t => t.walkers?.length || 0));
    const leastPopulatedTables = tablesToChooseFrom.filter(t => (t.walkers?.length || 0) === minWalkers);
    const randomIndex = Math.floor(Math.random() * leastPopulatedTables.length);

    return leastPopulatedTables[randomIndex]?.id;
};

export const createParticipant = async (
  participantData: CreateParticipant,
  assignRelationships = true
): Promise<Participant> => {
  const COLOR_POOL = [
    '#FFADAD', '#FFD6A5', '#FDFFB6', '#CAFFBF', '#9BF6FF', '#A0C4FF', '#BDB2FF', '#FFC6FF',
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57', '#FF9FF3', '#54A0FF', '#5F27CD',
    '#00D2D3', '#FF9F43', '#10AC84', '#EE5A24', '#0984E3', '#6C5CE7', '#A29BFE', '#FD79A8',
    '#E17055', '#00B894', '#00CEC9', '#6C5CE7', '#FDCB6E', '#E84393', '#74B9FF', '#A29BFE',
    '#81ECEC', '#55A3FF', '#FD79A8', '#FDCB6E', '#6C5CE7', '#00CEC9', '#FF7675', '#74B9FF',
    '#A29BFE', '#81ECEC', '#55A3FF', '#FD79A8'
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
    console.log('COLOR ASSIGNMENT: Starting color assignment for participant:', {
      type: participantData.type,
      invitedBy: participantData.invitedBy,
      isInvitedByEmausMember: participantData.isInvitedByEmausMember,
      email: participantData.email,
      lastName: participantData.lastName
    });
    
    if (participantData.type === 'walker') {
      // Build search conditions to find participants in the same group
      const searchConditions: string[] = [];
      const parameters: any = { retreatId: participantData.retreatId };

      // Case 1: Walker invited by another person (invitedBy field)
      if (participantData.invitedBy) {
        const inviterName = participantData.invitedBy.toLowerCase().trim();
        if (inviterName) {
          searchConditions.push("LOWER(participant.invitedBy) = :inviterName");
          parameters.inviterName = inviterName;
          console.log('COLOR ASSIGNMENT: Added invitedBy condition:', inviterName);
        }
      }

      // Case 2: Walker invited by Emaus member (check inviter contact info)
      if (participantData.isInvitedByEmausMember) {
        const inviterEmail = participantData.inviterEmail?.toLowerCase();
        if (inviterEmail) {
          searchConditions.push("LOWER(participant.inviterEmail) = :inviterEmail");
          parameters.inviterEmail = inviterEmail;
          console.log('COLOR ASSIGNMENT: Added inviterEmail condition:', inviterEmail);
        }

        const inviterPhones = [participantData.inviterCellPhone, participantData.inviterWorkPhone, participantData.inviterHomePhone]
          .filter(Boolean)
          .map(phone => String(phone).replace(/\D/g, '').slice(-8))
          .filter(p => p.length > 0);

        if (inviterPhones.length > 0) {
          parameters.inviterPhones = inviterPhones;
          searchConditions.push("SUBSTR(participant.inviterCellPhone, -8) IN (:...inviterPhones)");
          searchConditions.push("SUBSTR(participant.inviterWorkPhone, -8) IN (:...inviterPhones)");
          searchConditions.push("SUBSTR(participant.inviterHomePhone, -8) IN (:...inviterPhones)");
          console.log('COLOR ASSIGNMENT: Added inviter phone conditions:', inviterPhones);
        }
      }

      // Case 3: Same lastname (family relationship)
      if (participantData.lastName) {
        const lastName = participantData.lastName.toLowerCase().trim();
        if (lastName) {
          searchConditions.push("LOWER(participant.lastName) = :lastName");
          parameters.lastName = lastName;
          console.log('COLOR ASSIGNMENT: Added lastName condition:', lastName);
        }
      }

      console.log('COLOR ASSIGNMENT: Final search conditions:', searchConditions);
      console.log('COLOR ASSIGNMENT: Final parameters:', parameters);

      if (searchConditions.length > 0) {
        // Find all existing walkers that match any of the group conditions
        const findAnyWalkerQb = participantRepository.createQueryBuilder('participant')
          .where('participant.retreatId = :retreatId')
          .andWhere('participant.type = :type', { type: 'walker' })
          .andWhere(new Brackets(qb => qb.where(searchConditions.join(' OR '))));

        const existingWalkers = await findAnyWalkerQb.setParameters(parameters).getMany();
        console.log('COLOR ASSIGNMENT: Existing walkers found:', existingWalkers.length);
        
        // Only assign color if there are 2 or more walkers in the group (including the new one)
        if (existingWalkers.length >= 1) {
          // This means we have a group: existing walkers + the new walker being created
          console.log('COLOR ASSIGNMENT: Group found - assigning colors');
          
          // Check if any existing walker already has a color
          const existingWalkerWithColor = existingWalkers.find(w => w.family_friend_color);
          
          if (existingWalkerWithColor?.family_friend_color) {
            // Use the same color as existing walker in the group
            colorToAssign = existingWalkerWithColor.family_friend_color;
            console.log('COLOR ASSIGNMENT: Reusing existing color:', colorToAssign);
          } else {
            // Find all used colors in this retreat
            const usedColorsResult = await participantRepository.createQueryBuilder('p')
              .select('DISTINCT p.family_friend_color', 'color')
              .where('p.retreatId = :retreatId', { retreatId: participantData.retreatId })
              .andWhere('p.family_friend_color IS NOT NULL')
              .getRawMany();
            const usedColors = usedColorsResult.map(r => r.color);
            
            console.log('COLOR ASSIGNMENT: Used colors in retreat:', usedColors);
            console.log('COLOR ASSIGNMENT: Total colors in pool:', COLOR_POOL.length);
            
            // Get an available color from the pool
            const availableColor = COLOR_POOL.find(c => !usedColors.includes(c));
            colorToAssign = availableColor || COLOR_POOL[Math.floor(Math.random() * COLOR_POOL.length)];
            
            console.log('COLOR ASSIGNMENT: Selected new color:', colorToAssign);

            if (colorToAssign) {
              // Update all walkers in the group to use the new color
              const updateConditions = searchConditions.map(condition => condition.replace(/participant\./g, ''));
              console.log('COLOR ASSIGNMENT: Update conditions:', updateConditions);
              
              const updateQb = participantRepository.createQueryBuilder()
                .update(Participant)
                .set({ family_friend_color: colorToAssign })
                .where('retreatId = :retreatId')
                .andWhere('type = :type', { type: 'walker' })
                .andWhere(new Brackets(qb => qb.where(updateConditions.join(' OR '))));
              
              const updateResult = await updateQb.setParameters(parameters).execute();
              console.log('COLOR ASSIGNMENT: Update result:', updateResult);
            }
          }
        } else {
          console.log('COLOR ASSIGNMENT: No group found - single walker, no color assigned');
        }
      }
    } else {
      console.log('COLOR ASSIGNMENT: Skipping color assignment - not a walker');
    }
    
    console.log('COLOR ASSIGNMENT: Final color assigned:', colorToAssign);

    if (participantData.type === 'walker' || participantData.type === 'server') {
      const retreat = await retreatRepository.findOne({ where: { id: participantData.retreatId } });
      if (retreat) {
        const participantCount = await participantRepository.count({ where: { retreatId: participantData.retreatId, type: participantData.type, isCancelled: false } });
        const limit = participantData.type === 'walker' ? retreat.max_walkers : retreat.max_servers;
        if (limit != null && participantCount >= limit) {
          participantData.type = 'waiting';
        }
      }
    }

    const maxIdOnRetreat = await participantRepository.createQueryBuilder('p').
      select('MAX(p.id_on_retreat)', 'maxId').
      where('p.retreatId = :retreatId', { retreatId: participantData.retreatId })
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


    console.log('COLOR ASSIGNMENT: Creating participant with data:', {
      ...newParticipantData,
      family_friend_color: colorToAssign
    });

    const newParticipant = participantRepository.create(newParticipantData);
    let savedParticipant: Participant = await participantRepository.save(newParticipant);
    
    console.log('COLOR ASSIGNMENT: Participant saved successfully:', {
      id: savedParticipant.id,
      email: savedParticipant.email,
      family_friend_color: savedParticipant.family_friend_color
    });

    if (assignRelationships && savedParticipant.type !== 'waiting') {
      // Use the new unified assignment function
      const assignedBedIds = new Set<string>();
      const { bedId, tableId } = await assignBedAndTableToParticipant(savedParticipant, assignedBedIds, transactionalEntityManager);
      
      if (bedId) {
        // Update the RetreatBed to point to the participant using query builder
        const retreatBedRepository = transactionalEntityManager.getRepository(RetreatBed);
        await retreatBedRepository.createQueryBuilder()
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
        
        await transactionalEntityManager.createQueryBuilder()
          .update(Participant)
          .set(updates)
          .where('id = :id', { id: savedParticipant.id })
          .execute();
          
        // Refresh the participant to get the updated data
        savedParticipant = await transactionalEntityManager.getRepository(Participant).findOne({
          where: { id: savedParticipant.id }
        }) || savedParticipant;
      }
    }

    return savedParticipant;
  });
};

export const updateParticipant = async (
  id: string, 
  participantData: UpdateParticipant
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
      return 'server';
    })() as 'walker' | 'server' | 'waiting',
    firstName: participant.nombre?.trim() || '',
    lastName: participant.apellidos?.trim(),
    nickname: participant.apodo?.trim(),
    birthDate: new Date(participant.anio?.trim(), participant.mes?.trim() - 1, participant.dia?.trim()),
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
    sacraments: ['baptism', 'communion', 'confirmation', 'marriage'].filter(s => participant[`sacramento${s}`]?.trim() === 'S') as any,
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
    tshirtSize: participant.camiseta?.trim(),
    invitedBy: participant.invitadopor?.trim(),
    isInvitedByEmausMember: participant.invitadaporemaus?.trim() === 'S' ? true : undefined,
    inviterHomePhone: participant.invtelcasa?.trim(),
    inviterWorkPhone: participant.invteltrabajo?.trim(),
    inviterCellPhone: participant.invtelcelular?.trim(),
    inviterEmail: participant.invemail?.trim(),
    pickupLocation: participant.puntoencuentro?.trim(),
    paymentDate: participant.fechapago?.trim() ? new Date(participant.fechapago.trim()) : undefined,
    paymentAmount: participant.montopago?.trim() ? parseFloat(participant.montopago.trim()) : undefined,
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

export const importParticipants = async (retreatId: string, participantsData: any[]) => {
  let importedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  const processedParticipantIds: string[] = [];

  for (const participantRawData of participantsData) {
    const mappedData = mapToEnglishKeys(participantRawData);

    if (!mappedData.email) {
      console.warn('Skipping participant due to missing email:', participantRawData);
      skippedCount++;
      continue;
    }

    try {
      const existingParticipant = await participantRepository.findOne({
        where: { email: mappedData.email, retreatId },
      });

      if (existingParticipant) {
        const { type, ...updateData } = mappedData;
        await updateParticipant(existingParticipant.id, updateData as UpdateParticipant);
        updatedCount++;
        processedParticipantIds.push(existingParticipant.id);
      } else {
        const newParticipant = await createParticipant({ ...mappedData, retreatId } as CreateParticipant, false);
        importedCount++;
        processedParticipantIds.push(newParticipant.id);
      }
    } catch (error: any) {
      console.error(`Failed to import participant ${mappedData.email}: ${error.message}`);
      skippedCount++;
    }
  }

  // Assign beds and tables using the new redesigned system
  await AppDataSource.transaction(async (transactionalEntityManager) => {
    const transactionalParticipantRepository = transactionalEntityManager.getRepository(Participant);
    const transactionalBedRepository = transactionalEntityManager.getRepository(RetreatBed);
    
    // First, clear any existing bed assignments for these participants to avoid conflicts
    await transactionalParticipantRepository.createQueryBuilder()
      .update(Participant)
      .set({ retreatBedId: null })
      .where('id IN (:...ids)', { ids: processedParticipantIds })
      .execute();
    
    // Clear existing participant assignments in beds for these participants
    await transactionalBedRepository.createQueryBuilder()
      .update(RetreatBed)
      .set({ participantId: null })
      .where('participantId IN (:...ids)', { ids: processedParticipantIds })
      .execute();
    
    // Get all participants to process
    const participantsToProcess = await transactionalParticipantRepository.find({ 
      where: { id: In(processedParticipantIds) } 
    });
    
    // Track assigned beds to prevent duplicate assignments
    const assignedBedIds = new Set<string>();
    
    // Process participants one by one with atomic bed assignment
    for (const participant of participantsToProcess) {
      if (participant.type !== 'waiting') {
        // Use the new unified assignment function
        const { bedId, tableId } = await assignBedAndTableToParticipant(participant, assignedBedIds, transactionalEntityManager);
        
        // Prepare update object
        const updates: any = {};
        if (tableId) updates.tableId = tableId;
        
        // Handle bed assignment with proper bidirectional relationship management
        if (bedId) {
          // First, assign the bed to the participant in the RetreatBed table using query builder
          await transactionalBedRepository.createQueryBuilder()
            .update(RetreatBed)
            .set({ participantId: participant.id })
            .where('id = :id', { id: bedId })
            .execute();
          
          // Then update the participant with the bed assignment
          updates.retreatBedId = bedId;
        }
        
        // Apply all updates to the participant using query builder to ensure individual updates
        if (Object.keys(updates).length > 0) {
          await transactionalParticipantRepository.createQueryBuilder()
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
