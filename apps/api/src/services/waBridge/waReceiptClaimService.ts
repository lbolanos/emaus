import { AppDataSource } from '../../data-source';
import { Payment } from '../../entities/payment.entity';
import { PaymentReceiptClaim } from '../../entities/paymentReceiptClaim.entity';
import { WhatsappInboxMessage } from '../../entities/whatsappInboxMessage.entity';

/**
 * A payment registered from a WhatsApp receipt also shows in the payments
 * «Comprobantes» tab, under «Aplicados» (specs/whatsapp-inbox v1.5, D27).
 *
 * That tab lists PaymentReceiptClaim rows (family receipts sent through their
 * personal link). The inbox reuses the model as-is — no migration — with a
 * claim born `attached` to the payment it already produced: same participant,
 * amount and reference, the WhatsApp caption as note and the payment's own
 * receipt as photo (not a copy). A payment without a photo adds nothing.
 *
 * `senderContact` says "WhatsApp" and, for a walker's chat, the number. An
 * emergency contact's chat only exists for participant:health (D22) and the
 * tab is readable without it, so neither its number nor its caption (the
 * note) goes there.
 */
export async function recordWhatsappReceiptClaim(input: {
	message: WhatsappInboxMessage;
	paymentId: string;
	actorUserId: string;
	fromEmergencyContact: boolean;
}): Promise<PaymentReceiptClaim | null> {
	const payment = await AppDataSource.getRepository(Payment).findOne({
		where: { id: input.paymentId },
		select: ['id', 'retreatId', 'participantId', 'amount', 'referenceNumber', 'receiptUrl', 'receiptS3Key'],
	});
	if (!payment?.receiptUrl) return null;

	const claimRepo = AppDataSource.getRepository(PaymentReceiptClaim);
	// Linking the same payment again (a retried request) adds no second row.
	const existing = await claimRepo.findOne({ where: { attachedPaymentId: payment.id } });
	if (existing) return existing;

	return claimRepo.save(
		claimRepo.create({
			retreatId: payment.retreatId,
			participantId: payment.participantId,
			status: 'attached',
			amountClaimed: payment.amount,
			reference: payment.referenceNumber ?? null,
			note:
				!input.fromEmergencyContact && input.message.body ? input.message.body.slice(0, 1000) : null,
			senderContact: input.fromEmergencyContact
				? 'WhatsApp (contacto de emergencia)'
				: `WhatsApp +${input.message.chatPhone}`,
			photoUrl: payment.receiptUrl,
			photoS3Key: payment.receiptS3Key ?? null,
			attachedPaymentId: payment.id,
			attachedAt: new Date(),
			attachedById: input.actorUserId,
		}),
	);
}
