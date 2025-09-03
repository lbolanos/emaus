import { AppDataSource } from '../data-source';
import { Participant } from '../entities/participant.entity';
import { CreateParticipant, UpdateParticipant } from '@repo/types';

const participantRepository = AppDataSource.getRepository(Participant);

export const findAllParticipants = async (retreatId?: string, type?: 'walker' | 'server' | 'deleted', isCancelled?: boolean): Promise<Participant[]> => {
  const where: any = { isCancelled: false };

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
  return participantRepository.find({ where });
};

export const findParticipantById = async (id: string): Promise<Participant | null> => {
  return participantRepository.findOneBy({ id, isCancelled: false });
};

export const createParticipant = async (
  participantData: CreateParticipant
): Promise<Participant> => {
  const existingParticipant = await participantRepository.findOne({
    where: {
      email: participantData.email,
      retreatId: participantData.retreatId
    },
  });

  if (existingParticipant) {
    throw new Error('A participant with this email already exists in this retreat.');
  }

  const newParticipant = participantRepository.create({
    ...participantData, isCancelled : false, registrationDate: new Date(), lastUpdatedDate: new Date()
  });
  return participantRepository.save(newParticipant);
};

export const updateParticipant = async (
  id: string,
  participantData: UpdateParticipant
): Promise<Participant | null> => {
  const participant = await participantRepository.findOneBy({ id });
  if (!participant) {
    return null;
  }
  participantRepository.merge(participant, participantData);
  return participantRepository.save(participant);
};

export const deleteParticipant = async (id: string): Promise<void> => {
  await participantRepository.update(id, { isCancelled: true });
};

export const importParticipants = async (retreatId: string, participantsData: any[]) => {
  let importedCount = 0;
  let updatedCount = 0;

  const mapToEnglishKeys = (participant: any) => {
    return {
      id: participant.id?.trim(),
      type: (participant.tipousuario?.trim() === '3' ? 'walker' : 'server') as 'walker' | 'server',
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
        participant.sacramentobautismo?.trim() === 'S' ? 'bautismo' : '',
        participant.sacramentocomunion?.trim() === 'S' ? 'comunion' : '',
        participant.sacramentoconfirmacion?.trim() === 'S' ? 'confirmacion' : '',
        participant.sacramentomatrimonio?.trim() === 'S' ? 'matrimonio' : '',
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

  return { importedCount, updatedCount };
};
