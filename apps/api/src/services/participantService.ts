import { AppDataSource } from '../data-source';
import { Participant } from '../entities/participant.entity';
import { Retreat } from '../entities/retreat.entity';
import { TableMesa } from '../entities/tableMesa.entity'; 
import { RetreatBed } from '../entities/retreatBed.entity';
import { CreateParticipant, UpdateParticipant } from '@repo/types';
import { rebalanceTablesForRetreat } from './tableMesaService';
import { Not, IsNull } from 'typeorm';

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
  if (isCancelled !== undefined) {
    where.isCancelled = isCancelled;
  }
  return participantRepository.find({ where, relations });
};

export const findParticipantById = async (id: string): Promise<Participant | null> => {
  return participantRepository.findOneBy({ id });
};

const assignBedToParticipant = async (participant: Participant, excludedBedIds: string[] = []): Promise<string | undefined> => {
  if (!participant.birthDate) return undefined; // Cannot assign without age

  const age = new Date().getFullYear() - new Date(participant.birthDate).getFullYear();
  const retreatBedRepository = AppDataSource.getRepository(RetreatBed);

  // Base query for available beds
  const createBaseQuery = (): any => {
    const qb = retreatBedRepository.createQueryBuilder('bed')
      .leftJoinAndSelect('bed.participant', 'p')
      .where('bed.retreatId = :retreatId', { retreatId: participant.retreatId })
      .andWhere('p.id IS NULL'); // Find unassigned beds
    if (excludedBedIds.length > 0) {
      qb.andWhere('bed.id NOT IN (:...excludedBedIds)', { excludedBedIds });
    }
    return qb;
  };

  // Add sorting logic based on participant type and age
  const applySorting = (qb: any) => {
    if (participant.type === 'walker') {
      if (age <= 40) { // Younger walkers: prioritize bunk beds
        qb.orderBy("CASE WHEN bed.type = 'litera' THEN 1 WHEN bed.type = 'normal' THEN 2 ELSE 3 END")
          .addOrderBy('bed.floor', 'ASC');
      } else { // Older walkers: prioritize normal beds on lower floors
        qb.orderBy("CASE WHEN bed.type = 'normal' THEN 1 WHEN bed.type = 'litera' THEN 2 ELSE 3 END")
          .addOrderBy('bed.floor', 'ASC');
      }
    } else if (participant.type === 'server') {
      if (age <= 35) { // Younger servers: prioritize mattresses
          qb.orderBy("CASE WHEN bed.type = 'colchon' THEN 1 WHEN bed.type = 'litera' THEN 2 ELSE 3 END");
      } else {
          qb.orderBy("CASE WHEN bed.type = 'litera' THEN 1 WHEN bed.type = 'normal' THEN 2 ELSE 3 END");
      }
    }
    return qb;
  };

  // Step 1: Find rooms that already have occupants with the same snoring preference.
  const roomsWithSameSnorers = await retreatBedRepository.createQueryBuilder('rb')
    .select('rb.roomNumber')
    .innerJoin('rb.participant', 'p')
    .where('rb.retreatId = :retreatId', { retreatId: participant.retreatId })
    .andWhere('p.snores = :snores', { snores: participant.snores })
    .groupBy('rb.roomNumber')
    .getRawMany();
  
  const roomNumbers = roomsWithSameSnorers.map(r => r.rb_roomNumber);

  let bed: RetreatBed | null = null;

  // Step 2: Try to find a bed in one of those rooms.
  if (roomNumbers.length > 0) {
    const qb = createBaseQuery();
    qb.andWhere('bed.roomNumber IN (:...roomNumbers)', { roomNumbers });
    bed = await applySorting(qb).getOne();
  }

  // Step 3: If no suitable bed is found, find any available bed, prioritizing empty rooms.
  if (!bed) {
    const qb = createBaseQuery();
    // This part is tricky without another subquery. We'll stick to the main sorting for now.
    // The existing logic will naturally fill empty rooms first if all else is equal.
    bed = await applySorting(qb).getOne();
  }

  return bed?.id;
};

const assignTableToWalker = async (participant: Participant): Promise<string | undefined> => {
    if (participant.type !== 'walker') return undefined;

    let tables = await tableMesaRepository.find({
        where: { retreatId: participant.retreatId },
        relations: ['walkers'],
    });

    tables.sort(() => Math.random() - 0.5);
    if (tables.length === 0) return undefined;

    let suitableTables = tables;

    // Filter out tables with walkers invited by the same person
    if (participant.invitedBy) {
        const walkersInvitedBySamePerson = await participantRepository.find({
            where: {
                retreatId: participant.retreatId,
                invitedBy: participant.invitedBy,
                id: Not(participant.id),
                tableId: Not(IsNull())
            },
            select: ['tableId']
        });
        const tablesToExclude = walkersInvitedBySamePerson.map(p => p.tableId).filter(Boolean);
        if (tablesToExclude.length > 0) {
            suitableTables = tables.filter(t => !tablesToExclude.includes(t.id));
        }
    }

    // If all tables have a conflict, just use any table. Otherwise, use the suitable ones.
    const tablesToChooseFrom = suitableTables.length > 0 ? suitableTables : tables;

    // Find the minimum number of walkers at any table
    const minWalkers = Math.min(...tablesToChooseFrom.map(t => t.walkers?.length || 0));

    // Get all tables that have that minimum number of walkers
    const leastPopulatedTables = tablesToChooseFrom.filter(t => (t.walkers?.length || 0) === minWalkers);

    // Randomly select one of the least populated tables
    const randomIndex = Math.floor(Math.random() * leastPopulatedTables.length);

    return leastPopulatedTables[randomIndex]?.id;
};

export const createParticipant = async (
  participantData: CreateParticipant
): Promise<Participant> => {
  const { retreatId, type } = participantData;

  // Check if participant already exists
  const existingParticipant = await participantRepository.findOne({
    where: {
      email: participantData.email,
      retreatId: participantData.retreatId
    },
  });
  if (existingParticipant) {
    throw new Error('A participant with this email already exists in this retreat.');
  }

  // Waiting list logic
  if (type === 'walker' || type === 'server') {
    const retreat = await retreatRepository.findOne({ where: { id: retreatId } });
    if (retreat) {
      const participantCount = await participantRepository.count({
        where: { retreatId, type, isCancelled: false },
      });

      const limit = type === 'walker' ? retreat.max_walkers : retreat.max_servers;

      if (limit !== null && limit !== undefined && participantCount >= limit) {
        participantData.type = 'waiting';
      }
    }
  }

  // Assign id_on_retreat
  const maxIdOnRetreat = await participantRepository.createQueryBuilder('participant')
    .select('MAX(participant.id_on_retreat)', 'maxId')
    .where('participant.retreatId = :retreatId', { retreatId: participantData.retreatId })
    .getRawOne();

  const id_on_retreat = Number(maxIdOnRetreat.maxId || 0) + 1;

  // Create and save participant
  const newParticipant = participantRepository.create({
    ...participantData,
    id_on_retreat,
    isCancelled: false,
    registrationDate: new Date(),
    lastUpdatedDate: new Date()
  });
  
  let savedParticipant = await participantRepository.save(newParticipant);

  // Assign bed and table if not on waiting list
  if (savedParticipant.type === 'walker' || savedParticipant.type === 'server') {
    const bedId = await assignBedToParticipant(savedParticipant);
    const tableId = await assignTableToWalker(savedParticipant);

    if (bedId || tableId) {
        savedParticipant = await participantRepository.save({ ...savedParticipant, retreatBedId: bedId, tableId });
    }
  }

  return savedParticipant;
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
  participantRepository.merge(participant, participantData);
  const updatedParticipant = await participantRepository.save(participant);

  // Rebalance if the participant is a walker and their cancelled status changed
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

export const importParticipants = async (retreatId: string, participantsData: any[]) => {
  // For simplicity, we'll rebalance once at the end.
  
  let importedCount = 0;
  let updatedCount = 0;
  
  const mapToEnglishKeys = (participant: any): Partial<CreateParticipant> => {
    return {
      id_on_retreat: participant.id?.trim(),
      type: (participant.tipousuario?.trim() === '3' ? 'walker' : 'server') as 'walker' | 'server' | 'waiting',
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
      sacraments: ([
        participant.sacramentobautismo?.trim() === 'S' ? 'baptism' : '',
        participant.sacramentocomunion?.trim() === 'S' ? 'communion' : '',
        participant.sacramentoconfirmacion?.trim() === 'S' ? 'confirmation' : '',
        participant.sacramentomatrimonio?.trim() === 'S' ? 'marriage' : '',
      ].filter(Boolean) as ('baptism' | 'communion' | 'confirmation' | 'marriage' | 'none')[]),
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
      isInvitedByEmausMember: participant.invitadaporemaus?.trim() === 'S',
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
      //registrationDate: participant.fecharegistro?.trim() ? new Date(participant.fecharegistro.trim()) : new Date(),
    };
  };

  for (const participantData of participantsData) {
    const mappedData = mapToEnglishKeys(participantData) as CreateParticipant;

    if (!mappedData.email) {
      console.warn('Skipping participant due to missing email:', participantData);
      continue; // Skip records without an email
    }

    const existingParticipant = await participantRepository.findOne({
      where: { email: mappedData.email, retreatId },
    });

    if (existingParticipant) {
      // Don't override existing type if they are on waiting list etc.
      const { type, ...updateData } = mappedData;
      participantRepository.merge(existingParticipant, updateData);
      await participantRepository.save(existingParticipant);
      updatedCount++;
    } else {
      const newParticipant = participantRepository.create({
        ...mappedData,
        retreatId,
        isCancelled: false,
        registrationDate: new Date(),
        lastUpdatedDate: new Date(),
      });
      await participantRepository.save(newParticipant);
      importedCount++;
    }
  }

  // Now, assign beds and tables for all non-cancelled participants
  const allParticipants = await participantRepository.find({
    where: { retreatId, isCancelled: false },
  });

  const assignedBedIds: string[] = [];

  for (const participant of allParticipants) {
    const bedId = await assignBedToParticipant(participant, assignedBedIds);
    const tableId = await assignTableToWalker(participant);
    await participantRepository.update(participant.id, { retreatBedId: bedId, tableId });
    if (bedId) {
      assignedBedIds.push(bedId);
    }
  }

  return { importedCount, updatedCount };
};
