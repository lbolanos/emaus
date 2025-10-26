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
import { DateTransformer } from '../utils/date.transformer';

@Entity('participants')
export class Participant {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column('int')
	id_on_retreat!: number; // Corresponde a 'id'

	@Column({ type: 'varchar' })
	type!: 'walker' | 'server' | 'waiting' | 'partial_server'; // Corresponde a 'tipousuario'

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
	tshirtSize?: 'S' | 'M' | 'G' | 'X' | '2'; // Corresponde a 'camiseta'

	@Column({ type: 'varchar', nullable: true })
	needsWhiteShirt?: string | null;

	@Column({ type: 'varchar', nullable: true })
	needsBlueShirt?: string | null;

	@Column({ type: 'varchar', nullable: true })
	needsJacket?: string | null;

	@Column({ type: 'varchar', nullable: true })
	invitedBy?: string; // Corresponde a 'invitadopor'

	@Column({ type: 'boolean', nullable: true })
	isInvitedByEmausMember?: boolean | null; // Corresponde a 'invitadaporemaus'

	@Column({ type: 'varchar', nullable: true })
	inviterHomePhone?: string; // Corresponde a 'invtelcasa'

	@Column({ type: 'varchar', nullable: true })
	inviterWorkPhone?: string; // Corresponde a 'invteltrabajo'

	@Column({ type: 'varchar', nullable: true })
	inviterCellPhone?: string; // Corresponde a 'invtelcelular'

	@Column({ type: 'varchar', nullable: true })
	inviterEmail?: string; // Corresponde a 'invemail'

	@Column({ type: 'varchar', length: 20, nullable: true })
	family_friend_color?: string;

	@Column({ type: 'varchar', nullable: true })
	pickupLocation?: string; // Corresponde a 'puntoencuentro'

	@Column({ type: 'boolean', nullable: true })
	arrivesOnOwn?: boolean;

	// --- CAMPOS AGREGADOS ---

	@Column({ type: 'boolean', default: false })
	isScholarship!: boolean; // Corresponde a 'becado'

	@Column({ type: 'varchar', nullable: true })
	palancasCoordinator?: string; // Corresponde a 'palancasencargado'

	@Column({ type: 'boolean', nullable: true })
	palancasRequested?: boolean; // Corresponde a 'palancaspedidas'

	@Column({ type: 'text', nullable: true })
	palancasReceived?: string; // Corresponde a 'palancas'

	@Column({ type: 'text', nullable: true })
	palancasNotes?: string; // Corresponde a 'notaspalancas'

	@Column({ type: 'boolean', nullable: true })
	requestsSingleRoom?: boolean; // Corresponde a 'habitacionindividual'

	@Column({ type: 'boolean', default: false })
	isCancelled!: boolean; // Corresponde a 'cancelado'

	@Column({ type: 'text', nullable: true })
	notes?: string; // Corresponde a 'notas'

	@CreateDateColumn({ type: 'datetime' })
	registrationDate!: Date; // Corresponde a 'fecharegistro'

	@UpdateDateColumn({ type: 'datetime' })
	lastUpdatedDate!: Date;

	// --- RELACIONES ---

	@Column('uuid')
	retreatId!: string;

	@ManyToOne(() => Retreat, (retreat) => retreat.participants)
	@JoinColumn({ name: 'retreatId' })
	retreat!: Retreat;

	@Column({ type: 'uuid', nullable: true })
	tableId?: string | null; // Corresponde a 'mesa'

	@ManyToOne(() => TableMesa, (table) => table.walkers, { nullable: true })
	@JoinColumn({ name: 'tableId' })
	tableMesa?: TableMesa;

	@OneToMany(() => Responsability, (responsability) => responsability.participant)
	responsibilities!: Responsability[];

	@OneToMany(() => Payment, (payment) => payment.participant)
	payments!: Payment[];

	@OneToOne(() => RetreatBed, (retreatBed) => retreatBed.participant)
	retreatBed?: RetreatBed | null;

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
	get paymentStatus(): 'paid' | 'partial' | 'unpaid' | 'overpaid' {
		const total = this.totalPaid;

		// Si el participante es becado, consideramos que está pagado
		if (this.isScholarship) {
			return 'paid';
		}

		// Parsear el costo del retiro (puede ser un string con formato de moneda)
		let expectedAmount = 0;
		if (this.retreat?.cost) {
			// Eliminar símbolos de moneda y convertir a número
			const costString = this.retreat.cost.replace(/[^0-9.-]/g, '');
			expectedAmount = parseFloat(costString) || 0;
		}

		if (total === 0) return 'unpaid';
		if (total < expectedAmount) return 'partial';
		if (total > expectedAmount) return 'overpaid';
		return 'paid';
	}

	/**
	 * Calcula el monto restante por pagar
	 */
	get paymentRemaining(): number {
		if (this.isScholarship) return 0;

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

		return plainObject;
	}
}
