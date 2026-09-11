import { AppDataSource } from "../data-source";
import { Participant } from "../entities/participant.entity";
import { Retreat } from "../entities/retreat.entity";
import { RetreatParticipant } from "../entities/retreatParticipant.entity";

/**
 * Hydrates a Participant instance with the per-retreat context of
 * `overlayRetreatId`, mutating it in place:
 *
 *  - filters relation-loaded `payments`/`debts` to that retreat (they include
 *    EVERY retreat of the participant),
 *  - swaps `participant.retreat` to the context retreat (the expected amount
 *    comes from `participant.retreat`, which by default is the primary one),
 *  - overlays the per-retreat snapshot fields from `retreat_participants`
 *    (`type`, `isScholarship`, `mealCount`, `takesFridayMeal`, ...), clearing
 *    them when the participant is not registered in that retreat.
 *
 * This is the single source of truth for "make this participant's per-retreat
 * state correct" — extracted from `findParticipantById` so the message
 * sequence engine can reuse it without the circular import
 * (participantService imports messageSequenceService).
 *
 * The caller is responsible for loading the relations it needs hydrated
 * (`payments`, `debts`, `retreat`); the filters below skip what is missing.
 */
export const hydrateParticipantRetreatContext = async (
  participant: Participant,
  overlayRetreatId: string,
): Promise<void> => {
  // Paz y salvo per-retiro: los pagos/deudas cargados por relación incluyen TODOS
  // los retiros del participante. Filtrar al retiro de contexto para que
  // totalPaid/totalDebt/chargeBreakdown no mezclen retiros.
  if (participant.payments) {
    participant.payments = participant.payments.filter(
      (pay: any) => pay.retreatId === overlayRetreatId,
    );
  }
  if (participant.debts) {
    participant.debts = participant.debts.filter(
      (d: any) => d.retreatId === overlayRetreatId,
    );
  }
  // El monto esperado sale de participant.retreat (primario): usar el del contexto.
  if (participant.retreat && participant.retreat.id !== overlayRetreatId) {
    const contextRetreat = await AppDataSource.getRepository(Retreat).findOne({
      where: { id: overlayRetreatId },
    });
    if (contextRetreat) {
      participant.retreat = contextRetreat;
      participant.retreatId = overlayRetreatId;
    }
  }

  // Overlay retreat-specific fields from retreat_participants
  const rpRepo = AppDataSource.getRepository(RetreatParticipant);
  const rp = await rpRepo.findOne({
    where: {
      participantId: participant.id,
      retreatId: overlayRetreatId,
    },
    relations: ["tableMesa"],
  });
  if (rp) {
    if (rp.type != null) participant.type = rp.type as any;
    if (rp.isCancelled != null) participant.isCancelled = rp.isCancelled;
    if (rp.tableId !== undefined) participant.tableId = rp.tableId;
    if (rp.idOnRetreat != null) participant.id_on_retreat = rp.idOnRetreat;
    if (rp.familyFriendColor !== undefined)
      participant.family_friend_color = rp.familyFriendColor ?? undefined;
    if (rp.tableMesa) participant.tableMesa = rp.tableMesa;
    participant.bagMade = rp.bagMade ?? false;
    participant.isScholarship = rp.isScholarship ?? false;
    if (rp.scholarshipAmount !== undefined)
      participant.scholarshipAmount = rp.scholarshipAmount;
    if (rp.mealCount !== undefined) participant.mealCount = rp.mealCount;
    if (rp.takesFridayMeal !== undefined)
      participant.takesFridayMeal = rp.takesFridayMeal;
    if (rp.palancasCoordinator !== undefined)
      participant.palancasCoordinator = rp.palancasCoordinator;
    if (rp.palancasRequested !== undefined)
      participant.palancasRequested = rp.palancasRequested;
    if (rp.palancasReceived !== undefined)
      participant.palancasReceived = rp.palancasReceived;
    if (rp.palancasNotes !== undefined)
      participant.palancasNotes = rp.palancasNotes;
    if (rp.invitedBy !== undefined) participant.invitedBy = rp.invitedBy;
    if (rp.isInvitedByEmausMember !== undefined)
      participant.isInvitedByEmausMember = rp.isInvitedByEmausMember;
    if (rp.inviterHomePhone !== undefined)
      participant.inviterHomePhone = rp.inviterHomePhone;
    if (rp.inviterWorkPhone !== undefined)
      participant.inviterWorkPhone = rp.inviterWorkPhone;
    if (rp.inviterCellPhone !== undefined)
      participant.inviterCellPhone = rp.inviterCellPhone;
    if (rp.inviterEmail !== undefined)
      participant.inviterEmail = rp.inviterEmail;
    if (rp.pickupLocation !== undefined)
      participant.pickupLocation = rp.pickupLocation;
    if (rp.arrivesOnOwn !== undefined)
      participant.arrivesOnOwn = rp.arrivesOnOwn;
    if (rp.requestsSingleRoom !== undefined)
      participant.requestsSingleRoom = rp.requestsSingleRoom;
    if (rp.notes !== undefined && rp.notes !== null)
      participant.notes = rp.notes;
    if (rp.createdAt) participant.registrationDate = rp.createdAt;
  } else {
    // Caller asked for a specific retreat where this participant is NOT
    // registered. Clear legacy per-retreat columns so we don't leak data
    // from another retreat (or from the global "primary" participants row).
    participant.type = undefined;
    participant.isCancelled = undefined;
    participant.tableId = undefined;
    participant.id_on_retreat = undefined;
    participant.family_friend_color = undefined;
    participant.tableMesa = undefined as any;
    participant.bagMade = undefined as any;
    participant.isScholarship = undefined as any;
    participant.scholarshipAmount = null;
    participant.mealCount = null;
    participant.takesFridayMeal = null;
    participant.palancasCoordinator = null;
    participant.palancasRequested = null;
    participant.palancasReceived = null;
    participant.palancasNotes = null;
    participant.invitedBy = null;
    participant.isInvitedByEmausMember = null;
    participant.inviterHomePhone = null;
    participant.inviterWorkPhone = null;
    participant.inviterCellPhone = null;
    participant.inviterEmail = null;
    participant.pickupLocation = null;
    participant.arrivesOnOwn = null;
    participant.requestsSingleRoom = null;
    participant.notes = null;
  }
};
