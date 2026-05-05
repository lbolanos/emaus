import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	ManyToOne,
	JoinColumn,
	CreateDateColumn,
	UpdateDateColumn,
	OneToMany,
	OneToOne,
} from 'typeorm';
import { Retreat } from './retreat.entity';
import { TableMesa } from './tableMesa.entity';
import { Responsability } from './responsability.entity';
import { Payment } from './payment.entity';
import { RetreatBed } from './retreatBed.entity';
import { ParticipantTag } from './participantTag.entity';
import { DateTransformer } from '../utils/date.transformer';
import { User } from './user.entity';

@Entity('participants')
export class Participant {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	// Virtual — populated from retreat_participants at query time
	id_on_retreat?: number;
	type?: 'walker' | 'server' | 'waiting' | 'partial_server';

	@Column('varchar')
	firstName!: string; // Corresponde a 'nombre'

	@Column('varchar')
	lastName!: string; // Corresponde a 'apellidos'

	@Column({ type: 'varchar', nullable: true })
	nickname?: string; // Corresponde a 'apodo'

	@Column({
		type: 'date',
		transformer: new DateTransformer(),
	})
	birthDate!: Date; // Combina 'dia', 'mes', 'anio'

	@Column('varchar')
	maritalStatus!: // Corresponde a 'estadocivil'
	'S' | 'C' | 'D' | 'V' | 'O';

	@Column('varchar')
	street!: string; // Corresponde a 'dircalle'

	@Column('varchar')
	houseNumber!: string; // Corresponde a 'dirnumero'

	@Column('varchar')
	postalCode!: string; // Corresponde a 'dircp'

	@Column('varchar')
	neighborhood!: string; // Corresponde a 'dircolonia'

	@Column('varchar')
	city!: string; // Corresponde a 'dirmunicipio'

	@Column('varchar')
	state!: string; // Corresponde a 'direstado'

	@Column('varchar')
	country!: string; // Corresponde a 'dirpais'

	@Column({ type: 'varchar', nullable: true })
	parish?: string; // Corresponde a 'parroquia'

	@Column({ type: 'varchar', nullable: true })
	homePhone?: string; // Corresponde a 'telcasa'

	@Column({ type: 'varchar', nullable: true })
	workPhone?: string; // Corresponde a 'teltrabajo'

	@Column('varchar')
	cellPhone!: string; // Corresponde a 'telcelular'

	@Column('varchar')
	email!: string;

	@Column('varchar')
	occupation!: string; // Corresponde a 'ocupacion'

	@Column('boolean')
	snores!: boolean; // Corresponde a 'ronca'

	@Column('boolean')
	hasMedication!: boolean; // Corresponde a 'medicinaespecial'

	@Column({ type: 'varchar', nullable: true })
	medicationDetails?: string; // Corresponde a 'medicinacual'

	@Column({ type: 'varchar', nullable: true })
	medicationSchedule?: string; // Corresponde a 'medicinahora'

	@Column('boolean')
	hasDietaryRestrictions!: boolean; // Corresponde a 'alimentosrestringidos'

	@Column({ type: 'varchar', nullable: true })
	dietaryRestrictionsDetails?: string; // Corresponde a 'alimentoscual'

	@Column({ type: 'text', nullable: true })
	disabilitySupport?: string | null; // Apoyos requeridos por discapacidad

	@Column('simple-array')
	sacraments!: string[]; // Combina campos de sacramentos

	@Column('varchar')
	emergencyContact1Name!: string; // Corresponde a 'emerg1nombre'

	@Column('varchar')
	emergencyContact1Relation!: string; // Corresponde a 'emerg1relacion'

	@Column({ type: 'varchar', nullable: true })
	emergencyContact1HomePhone?: string; // Corresponde a 'emerg1telcasa'

	@Column({ type: 'varchar', nullable: true })
	emergencyContact1WorkPhone?: string; // Corresponde a 'emerg1teltrabajo'

	@Column('varchar')
	emergencyContact1CellPhone!: string; // Corresponde a 'emerg1telcelular'

	@Column({ type: 'varchar', nullable: true })
	emergencyContact1Email?: string; // Corresponde a 'emerg1email'

	@Column({ type: 'varchar', nullable: true })
	emergencyContact2Name?: string; // Corresponde a 'emerg2nombre'

	@Column({ type: 'varchar', nullable: true })
	emergencyContact2Relation?: string; // Corresponde a 'emerg2relacion'

	@Column({ type: 'varchar', nullable: true })
	emergencyContact2HomePhone?: string; // Corresponde a 'emerg2telcasa'

	@Column({ type: 'varchar', nullable: true })
	emergencyContact2WorkPhone?: string; // Corresponde a 'emerg2teltrabajo'

	@Column({ type: 'varchar', nullable: true })
	emergencyContact2CellPhone?: string; // Corresponde a 'emerg2telcelular'

	@Column({ type: 'varchar', nullable: true })
	emergencyContact2Email?: string; // Corresponde a 'emerg2email'

	@Column({ type: 'varchar', nullable: true })
	tshirtSize?: string; // Talla del caminante. Tamaños configurables por retiro vía retreat_shirt_type.availableSizes.

	@Column({ type: 'varchar', nullable: true })
	needsWhiteShirt?: string | null;

	@Column({ type: 'varchar', nullable: true })
	needsBlueShirt?: string | null;

	@Column({ type: 'varchar', nullable: true })
	needsJacket?: string | null;

	// Source of truth lives in retreat_participants; this column is a legacy
	// fallback. Reads go through the overlay in participantService; writes go
	// through updateParticipant which targets retreat_participants. TypeORM
	// will keep this column in sync during create flows.
	@Column({ type: 'varchar', nullable: true })
	invitedBy?: string | null;

	@Column({ type: 'boolean', nullable: true })
	isInvitedByEmausMember?: boolean | null;

	@Column({ type: 'varchar', nullable: true })
	inviterHomePhone?: string | null;

	@Column({ type: 'varchar', nullable: true })
	inviterWorkPhone?: string | null;

	@Column({ type: 'varchar', nullable: true })
	inviterCellPhone?: string | null;

	@Column({ type: 'varchar', nullable: true })
	inviterEmail?: string | null;

	// Virtual — populated from retreat_participants at query time
	family_friend_color?: string;

	@Column({ type: 'varchar', nullable: true })
	pickupLocation?: string | null;

	@Column({ type: 'boolean', nullable: true })
	arrivesOnOwn?: boolean | null;

	// --- CAMPOS AGREGADOS ---

	// Virtual — populated from retreat_participants at query time. The
	// underlying column on `participants` is kept for backward compatibility
	// but is no longer the source of truth.
	isScholarship?: boolean;

	// Virtual — populated from retreat_participants at query time.
	scholarshipAmount?: number | null;

	// Source of truth lives in retreat_participants; legacy column kept for
	// backward compatibility (overlay reads from retreat_participants).
	@Column({ type: 'varchar', nullable: true })
	palancasCoordinator?: string | null;

	@Column({ type: 'boolean', nullable: true })
	palancasRequested?: boolean | null;

	@Column({ type: 'text', nullable: true })
	palancasReceived?: string | null;

	@Column({ type: 'text', nullable: true })
	palancasNotes?: string | null;

	@Column({ type: 'boolean', nullable: true })
	requestsSingleRoom?: boolean | null;

	// Virtual — populated from retreat_participants at query time
	isCancelled?: boolean;
	bagMade?: boolean;

	@Column({ type: 'text', nullable: true })
	notes?: string; // Corresponde a 'notas'

	@CreateDateColumn({ type: 'datetime' })
	registrationDate!: Date; // Corresponde a 'fecharegistro'

	@UpdateDateColumn({ type: 'datetime' })
	lastUpdatedDate!: Date;

	@Column({ type: 'datetime', nullable: true })
	acceptedPrivacyNoticeAt?: Date | null;

	@Column({ type: 'varchar', length: 64, nullable: true })
	dataDeleteToken?: string | null;

	@Column({ type: 'datetime', nullable: true })
	dataDeletedAt?: Date | null;

	// --- RELACIONES ---

	@Column({ type: 'uuid', nullable: true })
	userId?: string | null;

	@ManyToOne(() => User, { nullable: true })
	@JoinColumn({ name: 'userId' })
	user?: User | null;

	@Column({ type: 'uuid', nullable: true })
	retreatId?: string | null;

	@ManyToOne(() => Retreat, (retreat) => retreat.participants, { nullable: true })
	@JoinColumn({ name: 'retreatId' })
	retreat?: Retreat | null;

	// Virtual — populated from retreat_participants at query time
	tableId?: string | null;
	tableMesa?: TableMesa;

	@OneToMany(() => Responsability, (responsability) => responsability.participant)
	responsibilities!: Responsability[];

	@OneToMany(() => Payment, (payment) => payment.participant)
	payments!: Payment[];

	@OneToMany(() => ParticipantTag, (participantTag) => participantTag.participant)
	tags!: ParticipantTag[];

	@OneToOne(() => RetreatBed, (retreatBed) => retreatBed.participant)
	retreatBed?: RetreatBed | null;

	// Virtual — populated by findAllParticipants from participant_communications count
	messageCount?: number;

	// --- PROPERTIES COMPUTADAS ---

	/**
	 * Calcula el total pagado por el participante sumando todos sus pagos
	 * Esta propiedad reemplaza al campo paymentAmount legado
	 */
	get totalPaid(): number {
		if (!this.payments || this.payments.length === 0) {
			return 0;
		}
		return this.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
	}

	/**
	 * Obtiene el último pago registrado del participante
	 */
	get lastPayment(): Payment | null {
		if (!this.payments || this.payments.length === 0) {
			return null;
		}
		// Ordenar por fecha de pago y luego por fecha de creación
		return this.payments.sort((a, b) => {
			const dateCompare = new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime();
			if (dateCompare !== 0) return dateCompare;
			return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
		})[0];
	}

	/**
	 * Obtiene la fecha del último pago como string con formato YYYY-MM-DD
	 */
	get lastPaymentDate(): string | null {
		const lastPayment = this.lastPayment;
		if (!lastPayment || !lastPayment.paymentDate) {
			return null;
		}
		// Retornar fecha en formato YYYY-MM-DD
		const date = new Date(lastPayment.paymentDate);
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	/**
	 * Verifica si el participante tiene pagos registrados
	 */
	get hasPayments(): boolean {
		return this.payments && this.payments.length > 0;
	}

	/**
	 * Calcula el estado de pago del participante
	 * 'paid': Pagado completamente
	 * 'partial': Pagado parcialmente
	 * 'unpaid': Sin pagos
	 * 'overpaid': Pagado de más
	 */
	get paymentStatus(): 'paid' | 'partial' | 'unpaid' | 'overpaid' | 'scholarship' {
		const total = this.totalPaid;

		// Parsear el costo del retiro (puede ser un string con formato de moneda)
		let expectedAmount = 0;
		if (this.retreat?.cost) {
			const costString = this.retreat.cost.replace(/[^0-9.-]/g, '');
			expectedAmount = parseFloat(costString) || 0;
		}

		// 'overpaid' tiene prioridad sobre 'scholarship': si un becado pagó
		// más del costo del retiro, es información relevante que debe verse.
		if (expectedAmount > 0 && total > expectedAmount) {
			return 'overpaid';
		}

		// Para el resto de los casos, becado domina al estado de pago.
		if (this.isScholarship) {
			return 'scholarship';
		}

		// Si no tiene retiro asociado, no hay pago esperado
		if (!this.retreat) {
			return 'unpaid';
		}

		if (total === 0) return 'unpaid';
		if (total < expectedAmount) return 'partial';
		return 'paid';
	}

	/**
	 * Calcula el monto restante por pagar
	 */
	get paymentRemaining(): number {
		if (this.isScholarship) return 0;

		// Si no tiene retiro asociado, no hay pago esperado
		if (!this.retreat) return 0;

		let expectedAmount = 0;
		if (this.retreat?.cost) {
			const costString = this.retreat.cost.replace(/[^0-9.-]/g, '');
			expectedAmount = parseFloat(costString) || 0;
		}

		return Math.max(0, expectedAmount - this.totalPaid);
	}

	/**
	 * Custom JSON serialization to include computed properties
	 */
	toJSON() {
		const { ...plainObject } = this;

		// Add computed properties to JSON output
		plainObject.totalPaid = this.totalPaid;
		plainObject.paymentStatus = this.paymentStatus;
		plainObject.paymentRemaining = this.paymentRemaining;
		plainObject.hasPayments = this.hasPayments;
		plainObject.lastPaymentDate = this.lastPaymentDate;

		// Ensure virtual fields from retreat_participants are present
		if (this.id_on_retreat !== undefined) plainObject.id_on_retreat = this.id_on_retreat;
		if (this.type !== undefined) plainObject.type = this.type;
		if (this.messageCount !== undefined) plainObject.messageCount = this.messageCount;

		return plainObject;
	}
}
