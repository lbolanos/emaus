import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
} from 'typeorm';
import { Retreat } from './retreat.entity';
import { Table } from './table.entity';
import { RetreatBed } from './retreatBed.entity';

@Entity('participants')
export class Participant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('int')
  id_on_retreat!: number; // Corresponde a 'id'

  @Column({ type: 'varchar' })
  type!: 'walker' | 'server' | 'waiting'; // Corresponde a 'tipousuario'

  @Column('varchar')
  firstName!: string; // Corresponde a 'nombre'

  @Column('varchar')
  lastName!: string; // Corresponde a 'apellidos'

  @Column({ type: 'varchar', nullable: true })
  nickname?: string; // Corresponde a 'apodo'

  @Column('date')
  birthDate!: Date; // Combina 'dia', 'mes', 'anio'

  @Column('varchar')
  maritalStatus!: // Corresponde a 'estadocivil'
  | 'S'
    | 'C'
    | 'D'
    | 'V'
    | 'O';

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
  invitedBy?: string; // Corresponde a 'invitadopor'

  @Column({ type: 'boolean', nullable: true })
  isInvitedByEmausMember?: boolean; // Corresponde a 'invitadaporemaus'

  @Column({ type: 'varchar', nullable: true })
  inviterHomePhone?: string; // Corresponde a 'invtelcasa'

  @Column({ type: 'varchar', nullable: true })
  inviterWorkPhone?: string; // Corresponde a 'invteltrabajo'

  @Column({ type: 'varchar', nullable: true })
  inviterCellPhone?: string; // Corresponde a 'invtelcelular'

  @Column({ type: 'varchar', nullable: true })
  inviterEmail?: string; // Corresponde a 'invemail'

  @Column({ type: 'varchar', nullable: true })
  pickupLocation?: string; // Corresponde a 'puntoencuentro'

  @Column({ type: 'boolean', nullable: true })
  arrivesOnOwn?: boolean;

  // --- CAMPOS AGREGADOS ---

  @Column({ type: 'date', nullable: true })
  paymentDate?: Date; // Corresponde a 'fechapago'

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  paymentAmount?: number; // Corresponde a 'montopago'

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
  tableId?: string; // Corresponde a 'mesa'

  @ManyToOne(() => Table, (table) => table.participants, { nullable: true })
  @JoinColumn({ name: 'tableId' })
  table?: Table;

  @OneToOne(() => RetreatBed, (bed) => bed.participant, { nullable: true })
  retreatBed?: RetreatBed | null;
}