/**
 * Excel import test fixtures covering various scenarios
 * These fixtures simulate real Excel data that would be imported
 */

export interface ExcelParticipantRow {
  id?: string;
  tipousuario?: string;
  nombre?: string;
  apellidos?: string;
  apodo?: string;
  email?: string;
  telcelular?: string;
  anio?: string;
  mes?: string;
  dia?: string;
  estadocivil?: string;
  dircalle?: string;
  dirnumero?: string;
  dircp?: string;
  dircolonia?: string;
  dirmunicipio?: string;
  direstado?: string;
  dirpais?: string;
  parroquia?: string;
  telcasa?: string;
  teltrabajo?: string;
  ocupacion?: string;
  ronca?: string;
  medicinaespecial?: string;
  medicinacual?: string;
  medicinahora?: string;
  alimentosrestringidos?: string;
  alimentoscual?: string;
  sacramentobaptism?: string;
  sacramentocommunion?: string;
  sacramentconfirmation?: string;
  sacramentmarriage?: string;
  emerg1nombre?: string;
  emerg1relacion?: string;
  emerg1telcasa?: string;
  emerg1teltrabajo?: string;
  emerg1telcelular?: string;
  emerg1email?: string;
  emerg2nombre?: string;
  emerg2relacion?: string;
  emerg2telcasa?: string;
  emerg2teltrabajo?: string;
  emerg2telcelular?: string;
  emerg2email?: string;
  camiseta?: string;
  invitadopor?: string;
  invitadaporemaus?: string;
  invtelcasa?: string;
  invteltrabajo?: string;
  invtelcelular?: string;
  invemail?: string;
  puntoencuentro?: string;
  becado?: string;
  palancasencargado?: string;
  palancaspedidas?: string;
  palancas?: string;
  notaspalancas?: string;
  habitacionindividual?: string;
  mesa?: string;
  habitacion?: string;
  montopago?: string;
  fechapago?: string;
  cancelado?: string;
  notas?: string;
}

/**
 * Valid participants data for happy path testing
 */
export const VALID_PARTICIPANTS_FIXTURE: ExcelParticipantRow[] = [
  {
    id: '1',
    tipousuario: '3', // Walker
    nombre: 'Juan',
    apellidos: 'Pérez',
    apodo: 'Juanito',
    email: 'juan.perez@example.com',
    telcelular: '5551234567',
    anio: '1990',
    mes: '5',
    dia: '15',
    estadocivil: 'soltero',
    email: 'juan.perez@example.com',
    ronca: 'N',
    medicinaespecial: 'N',
    alimentosrestringidos: 'N',
    sacramentobaptism: 'S',
    sacramentocommunion: 'S',
    sacramentconfirmation: 'S',
    camiseta: 'M',
    mesa: 'Table 1',
    habitacion: '101',
    montopago: '100',
    fechapago: '2024-01-15'
  },
  {
    id: '2',
    tipousuario: '0', // Server
    nombre: 'María',
    apellidos: 'González',
    apodo: 'Marí',
    email: 'maria.gonzalez@example.com',
    telcelular: '5559876543',
    anio: '1985',
    mes: '8',
    dia: '22',
    estadocivil: 'casado',
    ronca: 'S',
    medicinaespecial: 'S',
    medicinacual: 'Aspirina',
    medicinahora: 'Después de comer',
    alimentosrestringidos: 'N',
    sacramentobaptism: 'S',
    sacramentocommunion: 'S',
    sacramentconfirmation: 'S',
    sacramentmarriage: 'S',
    camiseta: 'S',
    mesa: 'Table 1',
    habitacion: '201',
    montopago: '150',
    fechapago: '2024-01-16'
  },
  {
    id: '3',
    tipousuario: '1', // Leader (Lider)
    nombre: 'Carlos',
    apellidos: 'Rodríguez',
    apodo: 'Carlitos',
    email: 'carlos.rodriguez@example.com',
    telcelular: '5555551234',
    anio: '1980',
    mes: '3',
    dia: '10',
    estadocivil: 'soltero',
    ronca: 'N',
    medicinaespecial: 'N',
    alimentosrestringidos: 'S',
    alimentoscual: 'Lactosa',
    sacramentobaptism: 'S',
    sacramentocommunion: 'S',
    sacramentconfirmation: 'S',
    sacramentmarriage: 'N',
    camiseta: 'L',
    mesa: 'Table 2',
    habitacion: '102',
    montopago: '120',
    fechapago: '2024-01-17'
  }
];

/**
 * Participants with family relationships for color coding testing
 */
export const FAMILY_PARTICIPANTS_FIXTURE: ExcelParticipantRow[] = [
  {
    id: '4',
    tipousuario: '3',
    nombre: 'Ana',
    apellidos: 'Martínez', // Same last name - should get same color
    email: 'ana.martinez@example.com',
    telcelular: '5551112222',
    anio: '1992',
    mes: '7',
    dia: '8',
    estadocivil: 'soltera',
    ronca: 'N',
    medicinaespecial: 'N',
    alimentosrestringidos: 'N',
    sacramentobaptism: 'S',
    sacramentocommunion: 'S',
    sacramentconfirmation: 'S',
    camiseta: 'M',
    mesa: 'Table 3',
    habitacion: '103'
  },
  {
    id: '5',
    tipousuario: '3',
    nombre: 'Luis',
    apellidos: 'Martínez', // Same last name - should get same color
    email: 'luis.martinez@example.com',
    telcelular: '5553334444',
    anio: '1995',
    mes: '9',
    dia: '12',
    estadocivil: 'soltero',
    ronca: 'N',
    medicinaespecial: 'N',
    alimentosrestringidos: 'N',
    sacramentobaptism: 'S',
    sacramentocommunion: 'S',
    sacramentconfirmation: 'S',
    camiseta: 'M',
    mesa: 'Table 3',
    habitacion: '103'
  },
  {
    id: '6',
    tipousuario: '3',
    nombre: 'Sofía',
    apellidos: 'López',
    email: 'sofia.lopez@example.com',
    invitadopor: 'Ana Martínez', // Invited by Ana - should get same color
    telcelular: '5555556666',
    anio: '1993',
    mes: '4',
    dia: '20',
    estadocivil: 'soltera',
    ronca: 'N',
    medicinaespecial: 'N',
    alimentosrestringidos: 'N',
    sacramentobaptism: 'S',
    sacramentocommunion: 'S',
    sacramentconfirmation: 'S',
    camiseta: 'S',
    mesa: 'Table 4',
    habitacion: '104'
  }
];

/**
 * Invalid data for error handling testing
 */
export const INVALID_PARTICIPANTS_FIXTURE: ExcelParticipantRow[] = [
  {
    // Missing required email
    id: '7',
    tipousuario: '3',
    nombre: 'Pedro',
    apellidos: 'Sánchez',
    // email: 'pedro.sanchez@example.com', // Missing email
    telcelular: '5557778888'
  },
  {
    // Invalid email format
    id: '8',
    tipousuario: '3',
    nombre: 'Laura',
    apellidos: 'Díaz',
    email: 'laura.invalid-email', // Invalid email
    telcelular: '5559990000'
  },
  {
    // Invalid birth date
    id: '9',
    tipousuario: '3',
    nombre: 'Roberto',
    apellidos: 'Gómez',
    email: 'roberto.gomez@example.com',
    anio: 'invalid', // Invalid year
    mes: '13', // Invalid month
    dia: '32', // Invalid day
    telcelular: '5551112222'
  },
  {
    // Missing required fields
    id: '10',
    tipousuario: '3',
    // nombre: 'Missing Name', // Missing required name
    email: 'missing.name@example.com'
  }
];

/**
 * Edge cases for boundary testing
 */
export const EDGE_CASE_PARTICIPANTS_FIXTURE: ExcelParticipantRow[] = [
  {
    id: '11',
    tipousuario: '4', // Waiting list
    nombre: 'Esperanza',
    apellidos: 'Esperanza',
    email: 'esperanza.lista@example.com',
    telcelular: '5550001111',
    anio: '2000',
    mes: '12',
    dia: '31',
    ronca: 'N',
    medicinaespecial: 'N',
    alimentosrestringidos: 'N'
  },
  {
    id: '12',
    tipousuario: '5', // Partial server
    nombre: 'Servicio',
    apellidos: 'Parcial',
    email: 'servicio.parcial@example.com',
    telcelular: '5552223333',
    anio: '1998',
    mes: '6',
    dia: '15',
    ronca: 'S',
    medicinaespecial: 'S',
    medicinacual: 'Insulina',
    medicinahora: 'Antes de cada comida',
    alimentosrestringidos: 'S',
    alimentoscual: 'Gluten, lácteos, frutos secos'
  },
  {
    id: '13',
    tipousuario: '3',
    nombre: 'Jubilado',
    apellidos: 'Anciano',
    email: 'jubilado.anciano@example.com',
    telcelular: '5554445555',
    anio: '1940', // Very old participant
    mes: '1',
    dia: '1',
    ronca: 'S',
    medicinaespecial: 'S',
    medicinacual: 'Múltiples medicamentos',
    medicinahora: 'Varias veces al día',
    alimentosrestringidos: 'S',
    alimentoscual: 'Bajo en sodio, sin azúcar',
    habitacionindividual: 'S', // Requests single room
    becado: 'S', // Has scholarship
    palancaspedidas: 'S',
    palancas: '10'
  }
];

/**
 * Participants for leadership testing
 */
export const LEADERSHIP_PARTICIPANTS_FIXTURE: ExcelParticipantRow[] = [
  {
    id: '14',
    tipousuario: '1', // Lider (Table Leader)
    nombre: 'Líder',
    apellidos: 'Principal',
    email: 'lider.principal@example.com',
    telcelular: '5556667777',
    mesa: 'Table 5',
    habitacion: '205'
  },
  {
    id: '15',
    tipousuario: '2', // Colider (Co-leader)
    nombre: 'Colíder',
    apellidos: 'Secundario',
    email: 'colider.secundario@example.com',
    telcelular: '5558889999',
    mesa: 'Table 5',
    habitacion: '206'
  },
  {
    id: '16',
    tipousuario: '0', // Server without table
    nombre: 'Servidor',
    apellidos: 'Sin Mesa',
    email: 'servidor.sinmesa@example.com',
    telcelular: '5550002222',
    habitacion: '207'
  }
];

/**
 * Large batch for performance testing (100 participants)
 */
export const LARGE_BATCH_FIXTURE: ExcelParticipantRow[] = Array.from({ length: 100 }, (_, index) => ({
  id: `${index + 100}`,
  tipousuario: String(Math.floor(Math.random() * 4)), // 0-3 (server types)
  nombre: `Participant${index + 1}`,
  apellidos: `TestSurname${index + 1}`,
  email: `participant${index + 1}@test.com`,
  telcelular: `555${String(index).padStart(3, '0')}${String(index + 1).padStart(4, '0')}`,
  anio: String(1970 + Math.floor(Math.random() * 40)),
  mes: String(Math.floor(Math.random() * 12) + 1),
  dia: String(Math.floor(Math.random() * 28) + 1),
  estadocivil: Math.random() > 0.5 ? 'soltero' : 'casado',
  ronca: Math.random() > 0.7 ? 'S' : 'N',
  medicinaespecial: Math.random() > 0.8 ? 'S' : 'N',
  alimentosrestringidos: Math.random() > 0.8 ? 'S' : 'N',
  sacramentobaptism: 'S',
  sacramentocommunion: 'S',
  sacramentconfirmation: 'S',
  camiseta: ['S', 'M', 'L', 'X'][Math.floor(Math.random() * 4)],
  mesa: `Table ${Math.floor(Math.random() * 10) + 1}`,
  habitacion: `${Math.floor(Math.random() * 5) + 1}0${Math.floor(Math.random() * 8) + 1}`
}));

/**
 * Cancelled participants for testing cancellation handling
 */
export const CANCELLED_PARTICIPANTS_FIXTURE: ExcelParticipantRow[] = [
  {
    id: '200',
    tipousuario: '3',
    nombre: 'Cancelado',
    apellidos: 'Total',
    email: 'cancelado.total@example.com',
    telcelular: '5551113333',
    cancelado: 'S', // Cancelled
    notas: 'Participant cancelled before retreat'
  },
  {
    id: '201',
    tipousuario: '0',
    nombre: 'Servidor',
    apellidos: 'Cancelado',
    email: 'servidor.cancelado@example.com',
    telcelular: '5552224444',
    mesa: 'Table 1',
    habitacion: '101',
    cancelado: 'S' // Cancelled server
  }
];

/**
 * Combined fixture for comprehensive testing
 */
export const COMPREHENSIVE_FIXTURE: ExcelParticipantRow[] = [
  ...VALID_PARTICIPANTS_FIXTURE,
  ...FAMILY_PARTICIPANTS_FIXTURE,
  ...EDGE_CASE_PARTICIPANTS_FIXTURE,
  ...LEADERSHIP_PARTICIPANTS_FIXTURE
];

/**
 * All fixtures for easy access in tests
 */
export const ALL_FIXTURES = {
  VALID_PARTICIPANTS_FIXTURE,
  FAMILY_PARTICIPANTS_FIXTURE,
  INVALID_PARTICIPANTS_FIXTURE,
  EDGE_CASE_PARTICIPANTS_FIXTURE,
  LEADERSHIP_PARTICIPANTS_FIXTURE,
  LARGE_BATCH_FIXTURE,
  CANCELLED_PARTICIPANTS_FIXTURE,
  COMPREHENSIVE_FIXTURE
} as const;