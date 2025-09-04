import { AppDataSource } from '../data-source';
import { Participant } from '../entities/participant.entity';
import { Table } from '../entities/table.entity';
import { Retreat } from '../entities/retreat.entity';
import { CreateParticipant, UpdateParticipant } from '@repo/types';
import { v4 as uuidv4 } from 'uuid';
import { In } from 'typeorm';

const participantRepository = AppDataSource.getRepository(Participant);
const tableRepository = AppDataSource.getRepository(Table);
const retreatRepository = AppDataSource.getRepository(Retreat);


const MIN_WALKERS_PER_TABLE = 5;
const MAX_WALKERS_PER_TABLE = 7;

const rebalanceTablesForRetreat = async (retreatId: string) => {
  // 1. Get all active walkers and all tables for the retreat
  const walkers = await participantRepository.find({
    where: { retreatId, type: 'walker', isCancelled: false },
    order: { registrationDate: 'ASC' },
  });
  const tables = await tableRepository.find({
    where: { retreatId },
    order: { name: 'ASC' },
  });

  const walkerCount = walkers.length;
  let tableCount = tables.length;

  // 2. Determine the ideal number of tables
  const idealTableCount = Math.max(1, Math.ceil(walkerCount / MAX_WALKERS_PER_TABLE));

  // 3. Adjust the number of tables if necessary
  if (tableCount < idealTableCount) {
    // Add more tables
    for (let i = tableCount + 1; i <= idealTableCount; i++) {
      const newTable = tableRepository.create({
        id: uuidv4(),
        name: `Table ${i}`,
        retreatId,
      });
      await tableRepository.save(newTable);
      tables.push(newTable);
    }
  } else if (tableCount > idealTableCount && tableCount > 5) { // Don't delete the original 5
    // Remove excess, empty tables
    const tablesToDelete = tables.slice(idealTableCount);
    const tableIdsToDelete = tablesToDelete.map(t => t.id);
    if (tableIdsToDelete.length > 0) {
      await tableRepository.delete({ id: In(tableIdsToDelete) });
    }
    tables.splice(idealTableCount);
  }

  // 4. Clear all existing table assignments for walkers
  await participantRepository.update({ retreatId, type: 'walker' }, { tableId: undefined });

  // 5. Distribute walkers evenly among the tables
  if (walkers.length > 0) {
    let tableIndex = 0;
    for (const walker of walkers) {
      walker.tableId = tables[tableIndex].id;
      await participantRepository.save(walker);
      tableIndex = (tableIndex + 1) % tables.length;
    }
  }
};

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

  const id_on_retreat = (maxIdOnRetreat.maxId || 0) + 1;

  // Create and save participant
  const newParticipant = participantRepository.create({
    ...participantData,
    id_on_retreat,
    isCancelled: false,
    registrationDate: new Date(),
    lastUpdatedDate: new Date()
  });
  
  const savedParticipant = await participantRepository.save(newParticipant);

  // Rebalance tables if a new walker was added (not waiting)
  if (savedParticipant.type === 'walker') {
    await rebalanceTablesForRetreat(savedParticipant.retreatId);
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
  
  const mapToEnglishKeys = (participant: any) => {
    return {
      id_on_retreat: participant.id?.trim(),
      type: (participant.tipousuario?.trim() === '3' ? 'walker' : 'server') as 'walker' | 'server' | 'waiting',
      firstName: participant.nombre?.trim(),
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
      email: participant.email?.trim(),
      occupation: participant.ocupacion?.trim(),
      snores: participant.ronca?.trim() === 'S',
      hasMedication: participant.medicinaespecial?.trim() === 'S',
      medicationDetails: participant.medicinacual?.trim(),
      medicationSchedule: participant.medicinahora?.trim(),
      hasDietaryRestrictions: participant.alimentosrestringidos?.trim() === 'S',
      dietaryRestrictionsDetails: participant.alimentoscual?.trim(),
      sacraments: [
        participant.sacramentobautismo?.trim() === 'S' ? 'baptism' : '',
        participant.sacramentocomunion?.trim() === 'S' ? 'communion' : '',
        participant.sacramentoconfirmacion?.trim() === 'S' ? 'confirmation' : '',
        participant.sacramentomatrimonio?.trim() === 'S' ? 'marriage' : '',
      ].filter(s => s),
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
      registrationDate: participant.fecharegistro?.trim() ? new Date(participant.fecharegistro.trim()) : new Date(),
    };
  };

  for (const participantData of participantsData) {
    const mappedData = mapToEnglishKeys(participantData);

    const existingParticipant = await participantRepository.findOne({
      where: { email: mappedData.email, retreatId },
    });

    if (existingParticipant) {
      participantRepository.merge(existingParticipant, mappedData);
      await participantRepository.save(existingParticipant);
      updatedCount++;
    } else {
      const newParticipant = participantRepository.create({
        ...mappedData,
        retreatId,
        lastUpdatedDate: new Date(),
      });
      await participantRepository.save(newParticipant);
      importedCount++;
    }
  }
  
  await rebalanceTablesForRetreat(retreatId);

  return { importedCount, updatedCount };
};
