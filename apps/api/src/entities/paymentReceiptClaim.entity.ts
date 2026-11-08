import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	CreateDateColumn,
	ManyToOne,
	JoinColumn,
	Index,
} from 'typeorm';
import { Retreat } from './retreat.entity';
import { Participant } from './participant.entity';
import { Payment } from './payment.entity';
import { User } from './user.entity';

export type PaymentReceiptClaimStatus = 'pending' | 'attached' | 'dismissed';

/**
 * Comprobante de pago enviado por una familia vía el link de capacidad
 * (specs: comprobantes por link). La foto vive en S3 privado
 * `payment-receipts/claims/{claimId}.webp`; al aplicar, el objeto se mueve a
 * `payment-receipts/{paymentId}.webp` y el claim queda `attached` con la traza
 * del pago creado.
 */
@Entity('payment_receipt_claims')
@Index('IDX_payment_receipt_claims_retreat_status', ['retreatId', 'status'])
@Index('IDX_payment_receipt_claims_participant', ['participantId'])
export class PaymentReceiptClaim {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'uuid' })
	retreatId!: string;

	@ManyToOne(() => Retreat, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'retreatId' })
	retreat?: Retreat;

	@Column({ type: 'uuid' })
	participantId!: string;

	@ManyToOne(() => Participant, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'participantId' })
	participant?: Participant;

	// Bandeja: pending → attached | dismissed.
	@Column({ type: 'varchar', default: 'pending' })
	status!: PaymentReceiptClaimStatus;

	// Lo que escribió la familia (informativo; el monto real lo confirma el coordinador).
	@Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
	amountClaimed?: number | null;

	@Column({ type: 'varchar', nullable: true })
	reference?: string | null;

	@Column({ type: 'text', nullable: true })
	note?: string | null;

	// Quién envía (email/teléfono del formulario público, libre).
	@Column({ type: 'varchar', nullable: true })
	senderContact?: string | null;

	// S3 privado `payment-receipts/claims/` (presign al leer). En dev sin S3: data-URL.
	@Column({ type: 'text' })
	photoUrl!: string;

	@Column({ type: 'varchar', nullable: true })
	photoS3Key?: string | null;

	@Column({ type: 'uuid', nullable: true })
	attachedPaymentId?: string | null;

	@ManyToOne(() => Payment, { onDelete: 'SET NULL', nullable: true })
	@JoinColumn({ name: 'attachedPaymentId' })
	attachedPayment?: Payment | null;

	@Column({ type: 'datetime', nullable: true })
	attachedAt?: Date | null;

	@Column({ type: 'uuid', nullable: true })
	attachedById?: string | null;

	@ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
	@JoinColumn({ name: 'attachedById' })
	attachedBy?: User | null;

	@CreateDateColumn({ type: 'datetime' })
	createdAt!: Date;
}
