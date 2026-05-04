import { AppDataSource } from '../data-source';
import { ScheduleTemplate } from '../entities/scheduleTemplate.entity';
import { ScheduleTemplateSet } from '../entities/scheduleTemplateSet.entity';

type SeedRow = Omit<Partial<ScheduleTemplate>, 'id' | 'createdAt' | 'updatedAt' | 'templateSetId' | 'templateSet'>;

// Nombres canónicos de Responsabilidades — coinciden con los creados en
// `responsabilityService.createDefaultResponsibilitiesForRetreat`.
const R = {
	logistica: 'Logistica',
	comedor: 'Comedor',
	campanero: 'Campanero',
	sacerdotes: 'Sacerdotes',
	oracion: 'Oración de Intercesión',
	musica: 'Música',
	santisimo: 'Santísimo',
	mantelitos: 'Mantelitos',
	transporte: 'Transporte',
	palanquitas: 'Palanquitas',
	cuartos: 'Cuartos',
	salon: 'Salón',
	snacks: 'Snacks',
	inventario: 'Inventario',
	continua: 'Continua',
	// Charlas/Textos (de getDefaultCharlas)
	rosa: 'Charla: De la Rosa',
	conocerte: 'Charla: Conocerte a Ti Mismo',
	mascaras: 'Charla: Conociendo a Dios a través del Conocimiento Personal (Las Máscaras)',
	escrituras: 'Charla: Conociendo a Dios a través de la Escrituras',
	oracionCharla: 'Charla: Conociendo a Dios a través de la Oración',
	sacramentos: 'Charla: Conociendo a Dios a través de los Sacramentos',
	cargas: 'Charla: Las Cargas que Llevamos',
	sanacion: 'Charla: Sanación de los Recuerdos (Sanando Heridas)',
	familia: 'Charla: Conociendo a Dios a través de la Familia y Amigos',
	servicio: 'Charla: Amando a Dios a través del Servicio',
	confianza: 'Charla: De la Confianza',
	// Textos (también responsabilidades específicas)
	textoConfidencialidad: 'Texto: Explicación de la Confidencialidad',
	textoLema: 'Texto: Explicación del Lema "Jesucristo Ha Resucitado"',
	textoPared: 'Texto: Dinámica de la Pared',
	textoLavadoManos: 'Texto: Lavado de Manos',
	textoPalanca: 'Texto: Explicación de La Palanca',
	textoAgape: 'Texto: Explicación del Ágape',
	textoQuemaPecados: 'Texto: Quema de Pecados',
	textoCartaJesus: 'Texto: Carta de Jesús',
	textoDinamicaSanacion: 'Texto: Dinámica de Sanación',
	textoEspirituSanto: 'Texto: Oración al Espíritu Santo',
	// Roles fijos nuevos
	biblias: 'Biblias',
	rosarios: 'Explicación Rosario y entrega',
	bolsas: 'Bolsas',
	resumenDia: 'Resumen del día',
	recepcion: 'Recepción',
	reglamento: 'Reglamento de la Casa',
} as const;

/**
 * Based on the PDF "Minuto a minuto Retiro Sta Clara NOV 2019 v2" (Emaús Hombres 3 días, Bogotá).
 */
const STA_CLARA_ITEMS: SeedRow[] = [
	// Day 1 (Viernes)
	{ defaultDay: 1, defaultOrder: 10, defaultStartTime: '10:30', defaultDurationMinutes: 150, name: 'Llegada del equipo y alistado de la casa', type: 'logistica', locationHint: 'Casa', responsabilityName: R.logistica },
	{ defaultDay: 1, defaultOrder: 20, defaultStartTime: '13:00', defaultDurationMinutes: 90, name: 'Almuerzo del equipo', type: 'comida', blocksSantisimoAttendance: true, locationHint: 'Comedor', responsabilityName: R.comedor },
	{ defaultDay: 1, defaultOrder: 30, defaultStartTime: '15:00', defaultDurationMinutes: 60, name: 'Organizar mesas de recepción', type: 'logistica', responsabilityName: R.recepcion },
	{ defaultDay: 1, defaultOrder: 40, defaultStartTime: '17:30', defaultDurationMinutes: 50, name: 'Llegada de caminantes', type: 'logistica', requiresResponsable: true, responsabilityName: R.recepcion },
	{ defaultDay: 1, defaultOrder: 50, defaultStartTime: '18:20', defaultDurationMinutes: 10, name: 'Ubicación líderes y colíderes en mesas', type: 'logistica', responsabilityName: R.recepcion },
	{ defaultDay: 1, defaultOrder: 60, defaultStartTime: '18:30', defaultDurationMinutes: 10, name: 'Campana — pasar al comedor', type: 'campana', requiresResponsable: true, responsabilityName: R.campanero },
	{ defaultDay: 1, defaultOrder: 70, defaultStartTime: '18:40', defaultDurationMinutes: 10, name: 'Bienvenida a los caminantes (reglas)', type: 'logistica', locationHint: 'Comedor', requiresResponsable: true, responsabilityName: R.logistica },
	{ defaultDay: 1, defaultOrder: 80, defaultStartTime: '18:50', defaultDurationMinutes: 5, name: 'Lectura Camino de Emaús', type: 'oracion', requiresResponsable: true, responsabilityName: 'Continua' },
	{ defaultDay: 1, defaultOrder: 90, defaultStartTime: '18:55', defaultDurationMinutes: 5, name: 'Bendición de los alimentos', type: 'oracion', responsabilityName: R.sacerdotes },
	{ defaultDay: 1, defaultOrder: 100, defaultStartTime: '19:00', defaultDurationMinutes: 30, name: 'Cena', type: 'comida', blocksSantisimoAttendance: true, locationHint: 'Comedor', responsabilityName: R.comedor },
	{ defaultDay: 1, defaultOrder: 110, defaultStartTime: '19:30', defaultDurationMinutes: 80, name: 'Presentaciones individuales', type: 'logistica', blocksSantisimoAttendance: true, responsabilityName: R.logistica },
	{ defaultDay: 1, defaultOrder: 120, defaultStartTime: '20:50', defaultDurationMinutes: 10, name: 'Campana — pasar al salón', type: 'campana', responsabilityName: R.campanero },
	{ defaultDay: 1, defaultOrder: 130, defaultStartTime: '21:00', defaultDurationMinutes: 7, name: 'Explicación de confidencialidad', type: 'logistica', requiresResponsable: true, responsabilityName: R.textoConfidencialidad },
	{ defaultDay: 1, defaultOrder: 140, defaultStartTime: '21:07', defaultDurationMinutes: 8, name: 'Presentación de la Rosa', type: 'logistica', requiresResponsable: true, responsabilityName: R.rosa },
	{ defaultDay: 1, defaultOrder: 150, defaultStartTime: '21:15', defaultDurationMinutes: 5, name: 'Explicación cuaderno y palanquitas', type: 'logistica', requiresResponsable: true, responsabilityName: R.palanquitas },
	{ defaultDay: 1, defaultOrder: 160, defaultStartTime: '21:20', defaultDurationMinutes: 5, name: 'Explicación oración Espíritu Santo', type: 'oracion', requiresResponsable: true, responsabilityName: R.textoEspirituSanto },
	{ defaultDay: 1, defaultOrder: 170, defaultStartTime: '21:25', defaultDurationMinutes: 5, name: 'Explicación "Jesucristo ha resucitado"', type: 'logistica', requiresResponsable: true, responsabilityName: R.textoLema },
	{ defaultDay: 1, defaultOrder: 180, defaultStartTime: '21:30', defaultDurationMinutes: 7, name: 'Primera Lectura del Camino de Emaús (Lc 24,13-18)', type: 'oracion', requiresResponsable: true, responsabilityName: 'Continua' },
	{ defaultDay: 1, defaultOrder: 190, defaultStartTime: '21:40', defaultDurationMinutes: 50, name: 'Testimonio 1 — Conocerte a ti mismo', type: 'testimonio', requiresResponsable: true, allowedResponsibilityTypes: 'charlista', palanquitaNotes: 'Hoy Necesito (Celinés)', responsabilityName: R.conocerte },
	{ defaultDay: 1, defaultOrder: 195, defaultStartTime: '22:30', defaultDurationMinutes: 5, name: 'Tiempo para meditar (post Testimonio 1)', type: 'descanso', responsabilityName: R.musica },
	{ defaultDay: 1, defaultOrder: 200, defaultStartTime: '22:35', defaultDurationMinutes: 7, name: 'Explicación del cuadro de Rembrandt', type: 'logistica', requiresResponsable: true, responsabilityName: R.logistica },
	{ defaultDay: 1, defaultOrder: 210, defaultStartTime: '22:45', defaultDurationMinutes: 50, name: 'Testimonio 2 — Padre Amoroso', type: 'testimonio', requiresResponsable: true, allowedResponsibilityTypes: 'charlista', palanquitaNotes: 'Hijo Pródigo', responsabilityName: R.cargas },
	{ defaultDay: 1, defaultOrder: 215, defaultStartTime: '23:35', defaultDurationMinutes: 5, name: 'Tiempo para meditar (post Testimonio 2)', type: 'descanso', responsabilityName: R.musica },
	{ defaultDay: 1, defaultOrder: 220, defaultStartTime: '23:40', defaultDurationMinutes: 10, name: 'Campana — pasar a la Capilla', type: 'campana', responsabilityName: R.campanero },
	{ defaultDay: 1, defaultOrder: 230, defaultStartTime: '23:50', defaultDurationMinutes: 10, name: 'Entrega de Biblias', type: 'logistica', locationHint: 'Capilla', requiresResponsable: true, responsabilityName: R.biblias },
	{ defaultDay: 1, defaultOrder: 240, defaultStartTime: '00:00', defaultDurationMinutes: 10, name: 'Explicación de Adoración al Santísimo', type: 'santisimo', locationHint: 'Capilla', requiresResponsable: true, responsabilityName: R.santisimo },
	{ defaultDay: 1, defaultOrder: 250, defaultStartTime: '00:10', defaultDurationMinutes: 360, name: 'Vigilia y Adoración al Santísimo (turnos)', type: 'santisimo', locationHint: 'Capilla', responsabilityName: R.santisimo },

	// Day 2 (Sábado)
	{ defaultDay: 2, defaultOrder: 10, defaultStartTime: '06:00', defaultDurationMinutes: 30, name: 'Rosario en el Oratorio', type: 'oracion', requiresResponsable: true, responsabilityName: R.logistica },
	{ defaultDay: 2, defaultOrder: 20, defaultStartTime: '06:30', defaultDurationMinutes: 15, name: 'Despertar caminantes', type: 'logistica', responsabilityName: R.cuartos },
	{ defaultDay: 2, defaultOrder: 30, defaultStartTime: '06:45', defaultDurationMinutes: 15, name: 'Campana — pasar a Capilla', type: 'campana', responsabilityName: R.campanero },
	{ defaultDay: 2, defaultOrder: 40, defaultStartTime: '07:00', defaultDurationMinutes: 6, name: 'Oración de la mañana', type: 'oracion', locationHint: 'Capilla', responsabilityName: R.oracion },
	{ defaultDay: 2, defaultOrder: 50, defaultStartTime: '07:06', defaultDurationMinutes: 7, name: 'Segunda Lectura Camino de Emaús (Lc 24,19-24)', type: 'oracion', requiresResponsable: true, responsabilityName: 'Continua' },
	{ defaultDay: 2, defaultOrder: 60, defaultStartTime: '07:19', defaultDurationMinutes: 35, name: 'Desayuno', type: 'comida', blocksSantisimoAttendance: true, locationHint: 'Comedor', responsabilityName: R.comedor },
	{ defaultDay: 2, defaultOrder: 70, defaultStartTime: '08:20', defaultDurationMinutes: 7, name: 'Resumen del día anterior', type: 'logistica', requiresResponsable: true, responsabilityName: R.resumenDia },
	{ defaultDay: 2, defaultOrder: 80, defaultStartTime: '08:30', defaultDurationMinutes: 55, name: 'Testimonio 3 — Dejando caer las Máscaras', type: 'testimonio', requiresResponsable: true, palanquitaNotes: 'Nada te turbe (Hna. Glenda)', responsabilityName: R.mascaras },
	{ defaultDay: 2, defaultOrder: 85, defaultStartTime: '09:25', defaultDurationMinutes: 5, name: 'Tiempo para meditar (post Testimonio 3)', type: 'descanso', responsabilityName: R.musica },
	{ defaultDay: 2, defaultOrder: 90, defaultStartTime: '09:30', defaultDurationMinutes: 7, name: 'Tercera Lectura Camino de Emaús (Lc 24,25-27)', type: 'oracion', responsabilityName: 'Continua' },
	{ defaultDay: 2, defaultOrder: 100, defaultStartTime: '09:40', defaultDurationMinutes: 90, name: 'Testimonio 4 — Fe en su Palabra', type: 'testimonio', requiresResponsable: true, palanquitaNotes: 'Tu palabra (Marcela Gándara)', responsabilityName: R.escrituras },
	{ defaultDay: 2, defaultOrder: 105, defaultStartTime: '11:10', defaultDurationMinutes: 5, name: 'Tiempo para meditar (post Testimonio 4)', type: 'descanso', responsabilityName: R.musica },
	{ defaultDay: 2, defaultOrder: 110, defaultStartTime: '11:17', defaultDurationMinutes: 10, name: 'Refrigerio de la mañana', type: 'refrigerio', blocksSantisimoAttendance: true, responsabilityName: R.snacks },
	{ defaultDay: 2, defaultOrder: 120, defaultStartTime: '11:35', defaultDurationMinutes: 50, name: 'Testimonio 5 — La Oración', type: 'testimonio', requiresResponsable: true, responsabilityName: R.oracionCharla },
	{ defaultDay: 2, defaultOrder: 125, defaultStartTime: '12:25', defaultDurationMinutes: 5, name: 'Tiempo para meditar (post Testimonio 5)', type: 'descanso', responsabilityName: R.musica },
	{ defaultDay: 2, defaultOrder: 130, defaultStartTime: '12:37', defaultDurationMinutes: 40, name: 'Almuerzo', type: 'comida', blocksSantisimoAttendance: true, locationHint: 'Comedor', responsabilityName: R.comedor },
	{ defaultDay: 2, defaultOrder: 140, defaultStartTime: '13:25', defaultDurationMinutes: 60, name: 'Testimonio 6 — Los Sacramentos', type: 'testimonio', requiresResponsable: true, palanquitaNotes: 'Sacerdote Para Siempre', responsabilityName: R.sacramentos },
	{ defaultDay: 2, defaultOrder: 145, defaultStartTime: '14:25', defaultDurationMinutes: 5, name: 'Tiempo para meditar (post Testimonio 6)', type: 'descanso', responsabilityName: R.musica },
	{ defaultDay: 2, defaultOrder: 150, defaultStartTime: '14:30', defaultDurationMinutes: 5, name: 'Reiteración de confidencialidad', type: 'logistica', responsabilityName: R.textoConfidencialidad },
	{ defaultDay: 2, defaultOrder: 160, defaultStartTime: '14:35', defaultDurationMinutes: 40, name: 'Dinámica de Oración de Intercesión', type: 'dinamica', blocksSantisimoAttendance: true, responsabilityName: R.oracion },
	{ defaultDay: 2, defaultOrder: 170, defaultStartTime: '15:25', defaultDurationMinutes: 10, name: 'Refrigerio de la tarde', type: 'refrigerio', blocksSantisimoAttendance: true, responsabilityName: R.snacks },
	{ defaultDay: 2, defaultOrder: 180, defaultStartTime: '15:45', defaultDurationMinutes: 60, name: 'Testimonio 7 — Sanación de Recuerdos', type: 'testimonio', requiresResponsable: true, responsabilityName: R.sanacion },
	{ defaultDay: 2, defaultOrder: 185, defaultStartTime: '16:45', defaultDurationMinutes: 5, name: 'Tiempo para meditar (post Testimonio 7)', type: 'descanso', responsabilityName: R.musica },
	{ defaultDay: 2, defaultOrder: 190, defaultStartTime: '16:50', defaultDurationMinutes: 7, name: 'Cuarta Lectura Camino de Emaús (Lc 24,28-32)', type: 'oracion', responsabilityName: 'Continua' },
	{ defaultDay: 2, defaultOrder: 200, defaultStartTime: '17:00', defaultDurationMinutes: 15, name: 'Dinámica Sanación de Recuerdos', type: 'dinamica', responsabilityName: R.textoDinamicaSanacion },
	{ defaultDay: 2, defaultOrder: 210, defaultStartTime: '17:15', defaultDurationMinutes: 25, name: 'Dinámica Quema de Pecados', type: 'dinamica', responsabilityName: R.textoQuemaPecados },
	{ defaultDay: 2, defaultOrder: 220, defaultStartTime: '18:00', defaultDurationMinutes: 30, name: 'Cena', type: 'comida', blocksSantisimoAttendance: true, locationHint: 'Comedor', responsabilityName: R.comedor },
	{ defaultDay: 2, defaultOrder: 230, defaultStartTime: '18:40', defaultDurationMinutes: 20, name: 'Dinámica Imposición de Ceniza', type: 'dinamica', responsabilityName: R.sacerdotes },
	{ defaultDay: 2, defaultOrder: 240, defaultStartTime: '19:05', defaultDurationMinutes: 55, name: 'Testimonio 8 — Fe y Confianza', type: 'testimonio', requiresResponsable: true, palanquitaNotes: 'Sin música / Hijo Pródigo, Hna. Glenda', responsabilityName: R.confianza },
	{ defaultDay: 2, defaultOrder: 245, defaultStartTime: '20:00', defaultDurationMinutes: 5, name: 'Tiempo para meditar (post Testimonio 8)', type: 'descanso', responsabilityName: R.musica },
	{ defaultDay: 2, defaultOrder: 250, defaultStartTime: '20:05', defaultDurationMinutes: 30, name: 'Dinámica de la Pared', type: 'dinamica', locationHint: 'Pared', requiresResponsable: true, responsabilityName: R.textoPared },
	{ defaultDay: 2, defaultOrder: 260, defaultStartTime: '20:35', defaultDurationMinutes: 60, name: 'Confesiones', type: 'oracion', responsabilityName: R.sacerdotes },
	{ defaultDay: 2, defaultOrder: 270, defaultStartTime: '20:50', defaultDurationMinutes: 10, name: 'Dinámica Lavado de Manos', type: 'dinamica', responsabilityName: R.textoLavadoManos },
	{ defaultDay: 2, defaultOrder: 280, defaultStartTime: '20:55', defaultDurationMinutes: 60, name: 'Entrega y lectura de Palancas', type: 'logistica', responsabilityName: R.textoPalanca },
	{ defaultDay: 2, defaultOrder: 290, defaultStartTime: '22:05', defaultDurationMinutes: 60, name: 'Celebración Santa Misa', type: 'misa', locationHint: 'Capilla', requiresResponsable: true, responsabilityName: R.sacerdotes },
	{ defaultDay: 2, defaultOrder: 300, defaultStartTime: '23:05', defaultDurationMinutes: 10, name: 'Canción "Enciende una Luz" / velas', type: 'oracion', responsabilityName: R.musica },
	{ defaultDay: 2, defaultOrder: 310, defaultStartTime: '23:15', defaultDurationMinutes: 30, name: 'Merienda de la noche', type: 'refrigerio', blocksSantisimoAttendance: true, responsabilityName: R.snacks },

	// Day 3 (Domingo)
	{ defaultDay: 3, defaultOrder: 10, defaultStartTime: '06:00', defaultDurationMinutes: 35, name: 'Rosario en el Oratorio', type: 'oracion', responsabilityName: R.logistica },
	{ defaultDay: 3, defaultOrder: 20, defaultStartTime: '06:35', defaultDurationMinutes: 10, name: 'Campana — pasar a Capilla', type: 'campana', responsabilityName: R.campanero },
	{ defaultDay: 3, defaultOrder: 30, defaultStartTime: '06:45', defaultDurationMinutes: 5, name: 'Oración para comenzar el día', type: 'oracion', responsabilityName: R.oracion },
	{ defaultDay: 3, defaultOrder: 40, defaultStartTime: '06:50', defaultDurationMinutes: 5, name: 'Quinta Lectura Camino de Emaús (Lc 24,29-32)', type: 'oracion', responsabilityName: 'Continua' },
	{ defaultDay: 3, defaultOrder: 50, defaultStartTime: '07:05', defaultDurationMinutes: 30, name: 'Desayuno', type: 'comida', blocksSantisimoAttendance: true, locationHint: 'Comedor', responsabilityName: R.comedor },
	{ defaultDay: 3, defaultOrder: 60, defaultStartTime: '07:35', defaultDurationMinutes: 90, name: 'Dinámica "Los Mantelitos"', type: 'dinamica', responsabilityName: R.mantelitos },
	{ defaultDay: 3, defaultOrder: 70, defaultStartTime: '09:20', defaultDurationMinutes: 10, name: 'Resumen día anterior', type: 'logistica', responsabilityName: R.resumenDia },
	{ defaultDay: 3, defaultOrder: 80, defaultStartTime: '09:35', defaultDurationMinutes: 45, name: 'Testimonio 9 — Familia y Amigos', type: 'testimonio', requiresResponsable: true, palanquitaNotes: 'Por siempre (Harold y Elena)', responsabilityName: R.familia },
	{ defaultDay: 3, defaultOrder: 85, defaultStartTime: '10:20', defaultDurationMinutes: 5, name: 'Tiempo para meditar (post Testimonio 9)', type: 'descanso', responsabilityName: R.musica },
	{ defaultDay: 3, defaultOrder: 90, defaultStartTime: '10:25', defaultDurationMinutes: 10, name: 'Snacks / Break', type: 'refrigerio', blocksSantisimoAttendance: true, responsabilityName: R.snacks },
	{ defaultDay: 3, defaultOrder: 100, defaultStartTime: '10:40', defaultDurationMinutes: 50, name: 'Testimonio 10 — El Servicio', type: 'testimonio', requiresResponsable: true, responsabilityName: R.servicio },
	{ defaultDay: 3, defaultOrder: 105, defaultStartTime: '11:30', defaultDurationMinutes: 5, name: 'Tiempo para meditar (post Testimonio 10)', type: 'descanso', responsabilityName: R.musica },
	{ defaultDay: 3, defaultOrder: 110, defaultStartTime: '11:40', defaultDurationMinutes: 5, name: 'Explicación Rosario y entrega', type: 'logistica', responsabilityName: R.rosarios },
	{ defaultDay: 3, defaultOrder: 120, defaultStartTime: '11:45', defaultDurationMinutes: 35, name: 'Dinámica Carta de Jesús', type: 'dinamica', locationHint: 'Capilla', responsabilityName: R.textoCartaJesus },
	{ defaultDay: 3, defaultOrder: 130, defaultStartTime: '12:35', defaultDurationMinutes: 35, name: 'Almuerzo', type: 'comida', blocksSantisimoAttendance: true, locationHint: 'Comedor', responsabilityName: R.comedor },
	{ defaultDay: 3, defaultOrder: 140, defaultStartTime: '13:10', defaultDurationMinutes: 30, name: 'Dinámica Oración Compartida', type: 'dinamica', responsabilityName: R.oracion },
	{ defaultDay: 3, defaultOrder: 150, defaultStartTime: '13:40', defaultDurationMinutes: 10, name: 'Entrega de bolsas/kits de salida', type: 'logistica', responsabilityName: R.bolsas },
	{ defaultDay: 3, defaultOrder: 160, defaultStartTime: '13:50', defaultDurationMinutes: 15, name: 'Campana — pasar a Capilla', type: 'campana', responsabilityName: R.campanero },
	{ defaultDay: 3, defaultOrder: 170, defaultStartTime: '14:05', defaultDurationMinutes: 30, name: 'Dinámica del Perdón', type: 'dinamica', locationHint: 'Capilla', responsabilityName: R.logistica },
	{ defaultDay: 3, defaultOrder: 180, defaultStartTime: '14:50', defaultDurationMinutes: 40, name: 'Salida a la Iglesia', type: 'traslado', responsabilityName: R.transporte },
	{ defaultDay: 3, defaultOrder: 190, defaultStartTime: '16:30', defaultDurationMinutes: 75, name: 'Misa de Cierre', type: 'misa', requiresResponsable: true, responsabilityName: R.sacerdotes },
	{ defaultDay: 3, defaultOrder: 200, defaultStartTime: '17:45', defaultDurationMinutes: 30, name: 'Limpieza / cierre logístico', type: 'logistica', responsabilityName: R.logistica },
];

/**
 * Based on "Programa Retiro Polanco III.xlsx". Emphasizes Plan A/Plan B, specific Spotify
 * tracks and palanquitas referenced in the program. Leaner set (~30 items) for teams that
 * prefer a lighter agenda than Santa Clara.
 */
const POLANCO_ITEMS: SeedRow[] = [
	// ============ Día 1 (Viernes) ============
	// Pre-retiro
	{ defaultDay: 1, defaultOrder: 1, defaultDurationMinutes: 60, name: 'Hora Santa, elección de mesas (jueves en parroquia)', type: 'oracion', locationHint: 'Parroquia', description: 'Hora Santa de preparación; el equipo elige mesas y atan pendientes pre-retiro.', responsabilityName: R.logistica },
	{ defaultDay: 1, defaultOrder: 5, defaultStartTime: '12:00', defaultDurationMinutes: 60, name: 'Llegada de servidores a Casa de Retiro', type: 'logistica', description: 'Arribo del equipo. Acomodo de equipaje, asignación de cuartos del equipo y check-in inicial.', responsabilityName: R.logistica },
	{ defaultDay: 1, defaultOrder: 10, defaultStartTime: '13:00', defaultDurationMinutes: 40, name: 'Misa de servidores', type: 'misa', requiresResponsable: true, description: 'Eucaristía privada del equipo para encomendar el retiro al Señor antes de la llegada de los caminantes.', responsabilityName: R.sacerdotes },
	{ defaultDay: 1, defaultOrder: 15, defaultStartTime: '13:40', defaultDurationMinutes: 60, name: 'Comida del equipo', type: 'comida', blocksSantisimoAttendance: true, locationHint: 'Comedor', description: 'Comida en comunidad antes de empezar la preparación operativa de la casa.', responsabilityName: R.comedor },
	{ defaultDay: 1, defaultOrder: 20, defaultStartTime: '14:40', defaultDurationMinutes: 30, name: 'Revisión de cuartos, camas y baños', type: 'logistica', description: 'Revisar que todos los cuartos tengan camas tendidas, toallas, jabones y baños limpios para los caminantes.', responsabilityName: R.cuartos },
	{ defaultDay: 1, defaultOrder: 21, defaultStartTime: '14:40', defaultDurationMinutes: 30, name: 'Revisión de salón y banners', type: 'logistica', locationHint: 'Salón', description: 'Verificar montaje del salón de charlas, sillas, banners y elementos visuales del retiro.', responsabilityName: R.salon },
	{ defaultDay: 1, defaultOrder: 23, defaultStartTime: '14:40', defaultDurationMinutes: 30, name: 'Revisión de comedor y snack', type: 'logistica', locationHint: 'Comedor', description: 'Mesas dispuestas, mantelería, áreas de snack listas con bebidas y bocadillos.', responsabilityName: R.comedor },
	{ defaultDay: 1, defaultOrder: 24, defaultStartTime: '14:40', defaultDurationMinutes: 30, name: 'Pruebas de audio y sonido', type: 'logistica', description: 'Probar micrófonos, mezcladora, parlantes y pistas musicales en salón y capilla.', responsabilityName: R.musica },
	{ defaultDay: 1, defaultOrder: 26, defaultStartTime: '14:40', defaultDurationMinutes: 30, name: 'Setup de mesas de recepción', type: 'logistica', description: 'Instalar mesas de recepción con listas, etiquetas, recipientes para celulares/relojes y kit de bienvenida.', responsabilityName: R.recepcion },
	{ defaultDay: 1, defaultOrder: 25, defaultStartTime: '15:10', defaultDurationMinutes: 50, name: 'Junta de logística: cuartos, pared, explicaciones', type: 'logistica', requiresResponsable: true, description: 'Reunión final del equipo: localización de cuartos, áreas permitidas, asignación de explicaciones y montaje de la Pared.', responsabilityName: R.logistica },
	{ defaultDay: 1, defaultOrder: 30, defaultStartTime: '16:00', defaultDurationMinutes: 1, name: 'Salida a puntos de encuentro de caminantes', type: 'traslado', description: 'El equipo de transporte sale a recibir a los caminantes en parroquia con aguas, aviso de no celular y listas.', responsabilityName: R.transporte },
	{ defaultDay: 1, defaultOrder: 35, defaultStartTime: '16:00', defaultDurationMinutes: 1, name: 'Salida de caminantes desde parroquia (transporte)', type: 'traslado', description: 'Caminantes parten en transporte rumbo a la casa de retiro.', responsabilityName: R.transporte },
	{ defaultDay: 1, defaultOrder: 40, defaultStartTime: '16:00', defaultDurationMinutes: 60, name: 'Exposición del Santísimo', type: 'santisimo', locationHint: 'Capilla', requiresResponsable: true, description: 'Exposición del Santísimo Sacramento durante la llegada de los caminantes para encomendar el retiro.', responsabilityName: R.santisimo },
	{ defaultDay: 1, defaultOrder: 45, defaultStartTime: '17:00', defaultDurationMinutes: 50, name: 'Recepción de caminantes en casa de retiro (celulares, relojes, medicinas)', type: 'logistica', requiresResponsable: true, planBNotes: 'Mesas bajo techo si llueve', description: 'Tomar celulares y relojes; identificar maletas, medicinas y necesidades especiales de cada caminante.', responsabilityName: R.recepcion },
	{ defaultDay: 1, defaultOrder: 50, defaultStartTime: '17:00', defaultDurationMinutes: 50, name: 'Llevar maletas a sus cuartos', type: 'logistica', description: 'Acompañar a cada caminante a su cuarto, llevando maletas y verificando ubicación.', responsabilityName: R.cuartos },
	{ defaultDay: 1, defaultOrder: 55, defaultStartTime: '17:50', defaultDurationMinutes: 30, name: 'Integrar caminantes en área de Snacks', type: 'refrigerio', description: 'Recibir a los caminantes en el área de snacks para romper el hielo antes del inicio formal.', responsabilityName: R.snacks },
	// Inicio del retiro
	{ defaultDay: 1, defaultOrder: 60, defaultStartTime: '18:30', defaultDurationMinutes: 1, name: 'Inicio del retiro — suena la campana', type: 'campana', description: 'Toque de campana que marca el inicio oficial del retiro y llama a los caminantes al salón.', responsabilityName: R.campanero },
	{ defaultDay: 1, defaultOrder: 65, defaultStartTime: '18:30', defaultDurationMinutes: 10, name: 'Bienvenida (Salón)', type: 'logistica', locationHint: 'Salón', requiresResponsable: true, description: 'Palabras de bienvenida del coordinador a los caminantes ya reunidos en el salón de charlas.', responsabilityName: R.logistica },
	{ defaultDay: 1, defaultOrder: 70, defaultStartTime: '18:40', defaultDurationMinutes: 5, name: 'Oración para comenzar el retiro', type: 'oracion', description: 'Oración inicial pidiendo al Señor que acompañe el retiro y abra los corazones de los caminantes.', responsabilityName: R.logistica },
	{ defaultDay: 1, defaultOrder: 75, defaultStartTime: '18:45', defaultDurationMinutes: 1, name: 'Presentaciones individuales (3 preguntas)', type: 'logistica', blocksSantisimoAttendance: true, description: 'Cada caminante se presenta y responde 3 preguntas: qué viene buscando, qué deja y qué se quiere llevar.', responsabilityName: R.logistica },
	{ defaultDay: 1, defaultOrder: 80, defaultStartTime: '18:45', defaultDurationMinutes: 10, name: 'Explicación de la Lectura del Camino de Emaús', type: 'oracion', description: 'Introducción al pasaje de Lc 24,13-35 que será el hilo conductor del retiro a lo largo de los tres días.', responsabilityName: R.continua },
	{ defaultDay: 1, defaultOrder: 85, defaultStartTime: '18:45', defaultDurationMinutes: 10, name: 'Lectura completa del Camino de Emaús', type: 'oracion', description: 'Lectura íntegra del Evangelio de Emaús como apertura del retiro.', responsabilityName: R.continua },
	{ defaultDay: 1, defaultOrder: 90, defaultStartTime: '18:55', defaultDurationMinutes: 10, name: 'Reglamento de la Casa', type: 'logistica', description: 'Explicación de las reglas operativas de la casa: horarios, áreas, comidas, dormitorios.', responsabilityName: R.reglamento },
	{ defaultDay: 1, defaultOrder: 95, defaultStartTime: '19:05', defaultDurationMinutes: 10, name: 'Reglas: confidencialidad, descansos, equipo y coordinadores de mesa', type: 'logistica', description: 'Confidencialidad del retiro, períodos de descanso, presentación del equipo y de los coordinadores de mesa.', responsabilityName: R.textoConfidencialidad },
	{ defaultDay: 1, defaultOrder: 100, defaultStartTime: '19:15', defaultDurationMinutes: 10, name: 'Asignaciones de mesa', type: 'logistica', description: 'Anuncio de la mesa que tocará a cada caminante, con su líder y colíderes.', responsabilityName: R.logistica },
	{ defaultDay: 1, defaultOrder: 102, defaultStartTime: '19:23', defaultDurationMinutes: 2, name: 'Campana — pasar al comedor', type: 'campana', description: 'Toque de campana para llamar a los caminantes al comedor para la cena.', responsabilityName: R.campanero },
	{ defaultDay: 1, defaultOrder: 105, defaultStartTime: '19:25', defaultDurationMinutes: 60, name: 'Cena (oración por los caminantes durante)', type: 'comida', blocksSantisimoAttendance: true, locationHint: 'Comedor', description: 'Cena en mesas asignadas; durante el servicio se eleva oración silenciosa por cada caminante.', responsabilityName: R.comedor },
	{ defaultDay: 1, defaultOrder: 110, defaultStartTime: '20:25', defaultDurationMinutes: 10, name: 'Break 1 (Día 1)', type: 'refrigerio', palanquitaNotes: null, description: 'Break para snacks y conversación informal antes de la primera charla.', responsabilityName: R.snacks },
	{ defaultDay: 1, defaultOrder: 111, defaultStartTime: '20:25', defaultDurationMinutes: 10, name: 'Entrega de palanquita en cuartos: La Piedra, agua y chocolates', type: 'logistica', locationHint: 'Cuartos', palanquitaNotes: 'La Piedra y Botella de Agua con Chocolates', description: 'Equipo de Cuartos deposita en cada cuarto: La Piedra, una botella de agua y chocolates como palanquita.', responsabilityName: R.cuartos },
	{ defaultDay: 1, defaultOrder: 113, defaultStartTime: '20:33', defaultDurationMinutes: 2, name: 'Campana — pasar al salón', type: 'campana', description: 'Toque de campana después del break para llamar a los caminantes al salón de charlas.', responsabilityName: R.campanero },
	{ defaultDay: 1, defaultOrder: 115, defaultStartTime: '20:35', defaultDurationMinutes: 5, name: 'La Rosa — explicación del símbolo de Emaús', type: 'dinamica', description: 'Presentación de la rosa como símbolo del retiro de Emaús; se explica su significado.', responsabilityName: R.rosa },
	{ defaultDay: 1, defaultOrder: 120, defaultStartTime: '20:40', defaultDurationMinutes: 2, name: 'Explicación de los Cuadernitos (diarios)', type: 'logistica', palanquitaNotes: 'Repartir Diarios y Oración al Espíritu Santo', description: 'Se reparten los cuadernitos/diarios y se invita a los caminantes a escribir sus reflexiones durante el retiro.', responsabilityName: R.palanquitas },
	{ defaultDay: 1, defaultOrder: 125, defaultStartTime: '20:42', defaultDurationMinutes: 3, name: 'Explicación de las Palancas (los que oran por este retiro)', type: 'dinamica', description: 'Se explica el concepto de las "palancas" — personas que están orando por este retiro desde afuera.', responsabilityName: R.textoPalanca },
	{ defaultDay: 1, defaultOrder: 130, defaultStartTime: '20:45', defaultDurationMinutes: 5, name: 'Explicación de la Exhortación "Jesucristo Ha Resucitado"', type: 'dinamica', description: 'Explicación del lema central del retiro y se anuncia que durante la noche se cuelga el cartel.', responsabilityName: R.textoLema },
	{ defaultDay: 1, defaultOrder: 135, defaultStartTime: '20:50', defaultDurationMinutes: 1, name: 'Break 2 (Día 1)', type: 'refrigerio', description: 'Pausa breve antes de la primera lectura del Camino de Emaús.', responsabilityName: R.snacks },
	{ defaultDay: 1, defaultOrder: 140, defaultStartTime: '20:50', defaultDurationMinutes: 15, name: 'Primera Lectura del Camino de Emaús (Lucas 24:13-18)', type: 'oracion', description: 'Caminante desanimado, sin fe, golpeado por la vida. Primera escena del Camino de Emaús.', responsabilityName: R.continua },
	{ defaultDay: 1, defaultOrder: 145, defaultStartTime: '21:05', defaultDurationMinutes: 4, name: 'Oración al Espíritu Santo (explicación)', type: 'oracion', description: 'Breve explicación de por qué oramos al Espíritu Santo antes de cada charla, e invocación inicial.', responsabilityName: R.textoEspirituSanto },
	{ defaultDay: 1, defaultOrder: 150, defaultStartTime: '21:10', defaultDurationMinutes: 45, name: 'Charla: Conocer a Dios a través de Conocerte a Ti Mismo (Testimonio 1)', type: 'charla', requiresResponsable: true, palanquitaNotes: 'Hoy Necesito (Celinés)', musicTrackUrl: 'https://open.spotify.com/playlist/52AlsgRFRdSg07W3LLjlsK', description: 'Primera charla y testimonio: rompe el hielo, primer intento por ablandar los corazones de los caminantes.', responsabilityName: R.conocerte },
	{ defaultDay: 1, defaultOrder: 155, defaultStartTime: '21:55', defaultDurationMinutes: 5, name: 'Tiempo para meditar (post Conocerte)', type: 'descanso', description: 'Silencio para meditar y escribir en los cuadernitos lo que tocó la charla.', responsabilityName: R.musica },
	{ defaultDay: 1, defaultOrder: 160, defaultStartTime: '22:00', defaultDurationMinutes: 10, name: 'Break 3 (Día 1)', type: 'refrigerio', description: 'Pausa breve antes de la segunda charla de la noche.', responsabilityName: R.snacks },
	{ defaultDay: 1, defaultOrder: 165, defaultStartTime: '22:10', defaultDurationMinutes: 45, name: 'Charla: El Padre Amoroso', type: 'charla', requiresResponsable: true, palanquitaNotes: 'Hijo Pródigo', description: 'Presenta al pecador arrepentido que regresa a casa pidiendo perdón al Padre.', responsabilityName: R.cargas },
	{ defaultDay: 1, defaultOrder: 170, defaultStartTime: '22:55', defaultDurationMinutes: 5, name: 'Tiempo para meditar (post Padre Amoroso)', type: 'descanso', description: 'Silencio para meditar después de la charla del Padre Amoroso.', responsabilityName: R.musica },
	{ defaultDay: 1, defaultOrder: 173, defaultStartTime: '22:58', defaultDurationMinutes: 2, name: 'Campana — pasar a la Capilla', type: 'campana', description: 'Toque de campana para llamar a los caminantes a la capilla para la entrega de Biblias.', responsabilityName: R.campanero },
	{ defaultDay: 1, defaultOrder: 175, defaultStartTime: '23:00', defaultDurationMinutes: 30, name: 'Explicación, bendición y entrega de Biblias', type: 'logistica', locationHint: 'Capilla', requiresResponsable: true, description: 'Se pasa a la capilla, se explican las Biblias y los sacerdotes las bendicen antes de entregarlas a cada caminante.', responsabilityName: R.biblias },
	{ defaultDay: 1, defaultOrder: 180, defaultStartTime: '23:30', defaultDurationMinutes: 1, name: 'Silencio hasta mañana', type: 'logistica', description: 'Indicación de silencio nocturno: caminantes a sus cuartos en silencio, meditando.', responsabilityName: R.logistica },
	{ defaultDay: 1, defaultOrder: 185, defaultStartTime: '23:30', defaultDurationMinutes: 1, name: 'Reunión de servidores (revisar errores de mesa, ánimo de oración)', type: 'logistica', description: 'Reunión nocturna del equipo: revisar errores de mesa, mantener el ánimo de oración para el día siguiente.', responsabilityName: R.logistica },
	{ defaultDay: 1, defaultOrder: 22, defaultStartTime: '14:50', defaultDurationMinutes: 1, name: 'Cuelgue del Cartel "Jesucristo Ha Resucitado"', type: 'logistica', locationHint: 'Salón', description: 'Cuelgue del cartel central del retiro en el salón de charlas, antes de que lleguen los caminantes.', responsabilityName: R.textoLema },

	// ============ Día 2 (Sábado) ============
	{ defaultDay: 2, defaultOrder: 5, defaultStartTime: '07:25', defaultDurationMinutes: 35, name: 'Hora de despertarse', type: 'logistica', description: 'Equipo de Cuartos despierta a los caminantes con suavidad y los invita a alistarse para el día.', responsabilityName: R.cuartos },
	{ defaultDay: 2, defaultOrder: 8, defaultStartTime: '07:58', defaultDurationMinutes: 2, name: 'Campana — pasar a Capilla (mañana)', type: 'campana', description: 'Toque de campana para llamar a los caminantes a la capilla al inicio del sábado.', responsabilityName: R.campanero },
	{ defaultDay: 2, defaultOrder: 10, defaultStartTime: '08:00', defaultDurationMinutes: 5, name: 'Reunidos en capilla — Oración para comenzar el día', type: 'oracion', locationHint: 'Capilla', description: 'Reunidos en la capilla con música sacra de fondo; oración inicial para abrir el sábado.', responsabilityName: R.logistica },
	{ defaultDay: 2, defaultOrder: 15, defaultStartTime: '08:05', defaultDurationMinutes: 15, name: 'Segunda Lectura del Camino de Emaús (Lucas 24:19-24)', type: 'oracion', description: 'Los caminantes desconfían y se rompe el silencio. Segunda escena del Camino de Emaús.', responsabilityName: R.continua },
	{ defaultDay: 2, defaultOrder: 18, defaultStartTime: '08:18', defaultDurationMinutes: 2, name: 'Campana — pasar al comedor (desayuno)', type: 'campana', description: 'Toque de campana para llamar a los caminantes al comedor para el desayuno.', responsabilityName: R.campanero },
	{ defaultDay: 2, defaultOrder: 20, defaultStartTime: '08:20', defaultDurationMinutes: 50, name: 'Desayuno (oración la hace un caminante)', type: 'comida', blocksSantisimoAttendance: true, description: 'Desayuno; un caminante hace la oración de bendición de los alimentos.', responsabilityName: R.comedor },
	{ defaultDay: 2, defaultOrder: 25, defaultStartTime: '09:10', defaultDurationMinutes: 10, name: 'Foto del retiro', type: 'logistica', description: 'Foto grupal del retiro, organizada llevando a los caminantes por mesas.', responsabilityName: R.logistica },
	{ defaultDay: 2, defaultOrder: 30, defaultStartTime: '09:20', defaultDurationMinutes: 10, name: 'Break 1 (Día 2)', type: 'refrigerio', description: 'Pausa de la mañana antes del resumen del día anterior.', responsabilityName: R.snacks },
	{ defaultDay: 2, defaultOrder: 35, defaultStartTime: '09:30', defaultDurationMinutes: 20, name: 'Resumen del día anterior (Día 2)', type: 'logistica', description: 'Coordinador hace un resumen breve del día anterior y presenta lo que sigue en el sábado.', responsabilityName: R.resumenDia },
	{ defaultDay: 2, defaultOrder: 40, defaultStartTime: '09:50', defaultDurationMinutes: 15, name: 'Tercera Lectura del Camino de Emaús (Lucas 24:25-27)', type: 'oracion', description: 'Cristo nos explica las escrituras. Tercera escena del Camino de Emaús.', responsabilityName: R.continua },
	{ defaultDay: 2, defaultOrder: 45, defaultStartTime: '10:05', defaultDurationMinutes: 50, name: 'Charla: Amando a Dios a través de la Fe en su Palabra', type: 'charla', requiresResponsable: true, palanquitaNotes: 'Tu palabra (Marcela Gándara)', description: 'Charla sobre la fe en la Palabra de Dios como camino para amarlo y conocerlo más.', responsabilityName: R.escrituras },
	{ defaultDay: 2, defaultOrder: 50, defaultStartTime: '10:55', defaultDurationMinutes: 5, name: 'Tiempo para meditar (post Palabra)', type: 'descanso', description: 'Silencio para meditar tras la charla de la Palabra.', responsabilityName: R.musica },
	{ defaultDay: 2, defaultOrder: 55, defaultStartTime: '11:00', defaultDurationMinutes: 50, name: 'Charla: Las Máscaras', type: 'charla', requiresResponsable: true, palanquitaNotes: 'Nada te turbe (Hna. Glenda)', description: 'Charla sobre las máscaras que nos ponemos en la vida y cómo Dios nos invita a quitárnoslas.', responsabilityName: R.mascaras },
	{ defaultDay: 2, defaultOrder: 60, defaultStartTime: '11:50', defaultDurationMinutes: 5, name: 'Tiempo para meditar (post Máscaras)', type: 'descanso', description: 'Silencio para meditar después de la charla de Las Máscaras.', responsabilityName: R.musica },
	{ defaultDay: 2, defaultOrder: 65, defaultStartTime: '11:55', defaultDurationMinutes: 10, name: 'Break 2 (Día 2)', type: 'refrigerio', description: 'Pausa antes de la charla de Sacramentos (sin preguntas).', responsabilityName: R.snacks },
	{ defaultDay: 2, defaultOrder: 75, defaultStartTime: '12:05', defaultDurationMinutes: 45, name: 'Charla: Amando a Dios a través de los Sacramentos', type: 'charla', requiresResponsable: true, palanquitaNotes: 'Sacerdote Para Siempre', description: 'El sacerdote habla sobre los sacramentos como medios privilegiados para amar a Dios. NO HAY PREGUNTAS.', responsabilityName: R.sacramentos },
	{ defaultDay: 2, defaultOrder: 80, defaultStartTime: '12:50', defaultDurationMinutes: 10, name: 'Break 3 (Día 2)', type: 'refrigerio', description: 'Pausa antes de la charla de la Oración.', responsabilityName: R.snacks },
	{ defaultDay: 2, defaultOrder: 85, defaultStartTime: '13:00', defaultDurationMinutes: 50, name: 'Charla: Amando a Dios a través de la Oración', type: 'charla', requiresResponsable: true, description: 'Charla sobre la oración como diálogo con Dios y medio para crecer en amor a Él.', responsabilityName: R.oracionCharla },
	{ defaultDay: 2, defaultOrder: 90, defaultStartTime: '13:50', defaultDurationMinutes: 5, name: 'Tiempo para meditar (post Oración)', type: 'descanso', description: 'Silencio para meditar después de la charla de la Oración.', responsabilityName: R.musica },
	{ defaultDay: 2, defaultOrder: 93, defaultStartTime: '13:53', defaultDurationMinutes: 2, name: 'Campana — pasar al comedor (Día 2)', type: 'campana', description: 'Toque de campana para llamar a los caminantes al comedor para la comida del sábado.', responsabilityName: R.campanero },
	{ defaultDay: 2, defaultOrder: 95, defaultStartTime: '13:55', defaultDurationMinutes: 40, name: 'Comida (Día 2)', type: 'comida', blocksSantisimoAttendance: true, description: 'Comida del sábado; énfasis en mantener el ánimo de oración. Líderes reciben instrucciones de la dinámica de oración en grupo.', responsabilityName: R.comedor },
	{ defaultDay: 2, defaultOrder: 100, defaultStartTime: '14:35', defaultDurationMinutes: 5, name: 'Traslado al lugar de oración', type: 'traslado', description: 'Mesas se trasladan al lugar exterior asignado para la dinámica de oración en grupo.', responsabilityName: R.transporte },
	{ defaultDay: 2, defaultOrder: 105, defaultStartTime: '14:40', defaultDurationMinutes: 60, name: 'Dinámica: Oración en Grupo (Mateo 18:19-20)', type: 'dinamica', description: 'Cada líder de mesa lee Mateo 18:19-20. Comienza el coordinador con su ayudante. NO DAMOS CONSEJOS, SOLO ESCUCHAMOS Y ORAMOS POR ELLOS.', planBNotes: 'Salones donde hacer la dinámica si llueve', responsabilityName: R.oracion },
	{ defaultDay: 2, defaultOrder: 110, defaultStartTime: '15:40', defaultDurationMinutes: 15, name: 'Break 4 (Día 2)', type: 'refrigerio', palanquitaNotes: 'Palanquita Cuartos: Yo Confío en Ti, Coronilla y Chocolate', description: 'Pausa después de la oración en grupo. Equipo de cuartos deja palanquita: Yo Confío en Ti, Coronilla y Chocolate.', responsabilityName: R.snacks },
	{ defaultDay: 2, defaultOrder: 115, defaultStartTime: '15:55', defaultDurationMinutes: 15, name: 'Práctica Canción de entrada (Caminamos en la Luz de Dios)', type: 'logistica', description: 'Práctica de la canción "Caminamos en la Luz de Dios" mientras llegan todas las mesas al salón.', responsabilityName: R.musica },
	{ defaultDay: 2, defaultOrder: 125, defaultStartTime: '16:10', defaultDurationMinutes: 50, name: 'Charla: Sanación de Recuerdos', type: 'charla', requiresResponsable: true, description: 'Charla profunda sobre cómo Dios sana los recuerdos dolorosos del pasado.', responsabilityName: R.sanacion },
	{ defaultDay: 2, defaultOrder: 130, defaultStartTime: '17:00', defaultDurationMinutes: 5, name: 'Tiempo para meditar (post Sanación, video)', type: 'descanso', description: 'Silencio para meditar tras la charla de Sanación; se acompaña con un video.', responsabilityName: R.musica },
	{ defaultDay: 2, defaultOrder: 135, defaultStartTime: '17:05', defaultDurationMinutes: 15, name: 'Break 5 (Día 2)', type: 'refrigerio', description: 'Pausa antes de la cuarta lectura del Camino de Emaús.', responsabilityName: R.snacks },
	{ defaultDay: 2, defaultOrder: 140, defaultStartTime: '17:20', defaultDurationMinutes: 15, name: 'Cuarta Lectura del Camino de Emaús (Lucas 24:28-32)', type: 'oracion', description: 'Cristo pasa de invitado a anfitrión, ofreciéndonos el Ágape y la Eucaristía. MANDAR CERRAR LOS OJOS.', responsabilityName: R.continua },
	{ defaultDay: 2, defaultOrder: 145, defaultStartTime: '17:35', defaultDurationMinutes: 15, name: 'Dinámica de Sanación (3 voces)', type: 'dinamica', description: 'Tres voces guían la dinámica de sanación con los ojos cerrados.', responsabilityName: R.textoDinamicaSanacion },
	{ defaultDay: 2, defaultOrder: 150, defaultStartTime: '17:50', defaultDurationMinutes: 35, name: 'Dinámica: Hoja de Pecados (escribir y depositar)', type: 'dinamica', description: 'Cada caminante escribe sus pecados, los dobla y los pone en el recipiente para la quema.', locationHint: 'Jardín / Gruta', responsabilityName: R.textoQuemaPecados },
	{ defaultDay: 2, defaultOrder: 155, defaultStartTime: '18:25', defaultDurationMinutes: 10, name: 'Descanso y meditación (silencio hasta cena)', type: 'descanso', description: 'Silencio total hasta la hora de la cena, para procesar la dinámica anterior.', responsabilityName: R.musica },
	{ defaultDay: 2, defaultOrder: 158, defaultStartTime: '18:33', defaultDurationMinutes: 2, name: 'Campana — pasar al comedor (cena Día 2)', type: 'campana', description: 'Toque de campana para llamar a los caminantes al comedor para la cena del sábado.', responsabilityName: R.campanero },
	{ defaultDay: 2, defaultOrder: 160, defaultStartTime: '18:35', defaultDurationMinutes: 40, name: 'Cena (Día 2, oración por caminante)', type: 'comida', blocksSantisimoAttendance: true, description: 'Cena del sábado; la oración la hace un caminante. Recordar a los caminantes pasar al baño después.', responsabilityName: R.comedor },
	{ defaultDay: 2, defaultOrder: 165, defaultStartTime: '19:15', defaultDurationMinutes: 20, name: 'Caminantes al baño (post-cena)', type: 'logistica', description: 'IMPORTANTE recordar a los caminantes pasar al baño antes de las cenizas.', responsabilityName: R.cuartos },
	{ defaultDay: 2, defaultOrder: 170, defaultStartTime: '19:35', defaultDurationMinutes: 15, name: 'Aplicación de Cenizas', type: 'dinamica', description: 'Las cenizas se aplican en la mano del caminante: "Estas cenizas representan los pecados que escribiste y aquellos que omitiste; los cuales te serán perdonados por el Señor."', responsabilityName: R.textoQuemaPecados },
	{ defaultDay: 2, defaultOrder: 175, defaultStartTime: '19:50', defaultDurationMinutes: 1, name: 'Reunión en capilla — tiempo de reflexión', type: 'oracion', locationHint: 'Capilla', description: 'Caminantes pasan a la capilla en silencio; tiempo de reflexión sin limpiar las cenizas.', responsabilityName: R.logistica },
	{ defaultDay: 2, defaultOrder: 180, defaultStartTime: '19:50', defaultDurationMinutes: 1, name: 'Recepción de sacerdotes (snack y oración)', type: 'logistica', description: 'Equipo de Snacks y Oración recibe a los sacerdotes; explicación del retiro y preparación para confesiones.', responsabilityName: R.sacerdotes },
	{ defaultDay: 2, defaultOrder: 185, defaultStartTime: '19:50', defaultDurationMinutes: 45, name: 'Charla: La Confianza', type: 'charla', requiresResponsable: true, palanquitaNotes: 'Pistas de fondo / Hijo Pródigo', description: 'Charla sobre la confianza absoluta en el amor del Padre que perdona y acoge al hijo pródigo.', responsabilityName: R.confianza },
	{ defaultDay: 2, defaultOrder: 190, defaultStartTime: '20:30', defaultDurationMinutes: 5, name: 'Preparación para La Pared', type: 'logistica', description: 'Preparación logística (luz, audio, montaje) para la dinámica de La Pared.', responsabilityName: R.textoPared },
	{ defaultDay: 2, defaultOrder: 195, defaultStartTime: '20:35', defaultDurationMinutes: 25, name: 'Dinámica La Pared', type: 'dinamica', locationHint: 'Pared', requiresResponsable: true, description: 'Caminantes sentados con ojos cerrados; un hermano pide que lo acompañe. Lectura del booth de la pared (CD Colombia).', responsabilityName: R.textoPared },
	{ defaultDay: 2, defaultOrder: 200, defaultStartTime: '21:00', defaultDurationMinutes: 60, name: 'Confesiones', type: 'oracion', description: 'El hijo pródigo pide y recibe el perdón. Sacerdotes confiesan a los caminantes.', responsabilityName: R.sacerdotes },
	{ defaultDay: 2, defaultOrder: 205, defaultStartTime: '22:00', defaultDurationMinutes: 15, name: 'Dinámica: Lavado de Manos', type: 'dinamica', description: 'Representación gráfica: los pecados son borrados. "Que esta agua viva, creada por nuestro Padre, te asegure Su perdón, Su amor y Su paz."', responsabilityName: R.textoLavadoManos },
	{ defaultDay: 2, defaultOrder: 210, defaultStartTime: '22:00', defaultDurationMinutes: 15, name: 'Entrega de Palancas', type: 'dinamica', palanquitaNotes: 'Cantos Gregorianos de fondo', description: 'Entrega de las palancas a cada caminante con cantos gregorianos de fondo. Mantener silencio y distancia de las confesiones.', responsabilityName: R.textoPalanca },
	{ defaultDay: 2, defaultOrder: 213, defaultStartTime: '22:28', defaultDurationMinutes: 2, name: 'Campana — Misa nocturna', type: 'campana', description: 'Toque de campana para llamar a los caminantes a la capilla para la Misa nocturna.', responsabilityName: R.campanero },
	{ defaultDay: 2, defaultOrder: 215, defaultStartTime: '22:30', defaultDurationMinutes: 45, name: 'Misa nocturna', type: 'misa', description: 'Misa de la noche con el equipo y los caminantes después de las confesiones y palancas.', responsabilityName: R.sacerdotes },
	{ defaultDay: 2, defaultOrder: 220, defaultStartTime: '23:15', defaultDurationMinutes: 15, name: 'Snack y aviso (mañana levantarse temprano)', type: 'refrigerio', description: 'Invitación al snack y aviso de que mañana se levantarán temprano para el último día.', responsabilityName: R.snacks },
	{ defaultDay: 2, defaultOrder: 225, defaultStartTime: '23:30', defaultDurationMinutes: 15, name: 'Reunión de equipo (logística)', type: 'logistica', description: 'Reunión nocturna del equipo logístico para alinear tareas del último día.', responsabilityName: R.logistica },
	{ defaultDay: 2, defaultOrder: 230, defaultStartTime: '23:45', defaultDurationMinutes: 1, name: 'Exponer al Santísimo (overnight)', type: 'santisimo', locationHint: 'Capilla', description: 'Exposición del Santísimo durante la noche para que siga cuidando a caminantes y servidores.', responsabilityName: R.santisimo },

	// ============ Día 3 (Domingo) ============
	{ defaultDay: 3, defaultOrder: 5, defaultStartTime: '08:30', defaultDurationMinutes: 40, name: 'Hora de despertarse (Día 3)', type: 'logistica', description: 'Despertar a los caminantes para el último día del retiro.', responsabilityName: R.cuartos },
	{ defaultDay: 3, defaultOrder: 8, defaultStartTime: '09:08', defaultDurationMinutes: 2, name: 'Campana — pasar a Capilla (Día 3)', type: 'campana', description: 'Toque de campana para llamar a los caminantes a la capilla al inicio del domingo.', responsabilityName: R.campanero },
	{ defaultDay: 3, defaultOrder: 10, defaultStartTime: '09:10', defaultDurationMinutes: 10, name: 'Reunirse en capilla (Día 3)', type: 'oracion', locationHint: 'Capilla', description: 'Reunidos en la capilla con música sacra de fondo para iniciar el domingo.', responsabilityName: R.logistica },
	{ defaultDay: 3, defaultOrder: 15, defaultStartTime: '09:20', defaultDurationMinutes: 10, name: 'Oración para comenzar el día (Día 3)', type: 'oracion', description: 'Oración inicial del último día, hecha por un caminante.', responsabilityName: R.logistica },
	{ defaultDay: 3, defaultOrder: 20, defaultStartTime: '09:30', defaultDurationMinutes: 10, name: 'Explicar dinámica de Mantelitos (instrucciones para desayuno)', type: 'dinamica', description: 'Sentarse en lugares distintos, no voltear los manteles. Dios tiene un mensaje personal — los caminantes son invitados a compartir.', responsabilityName: R.mantelitos },
	{ defaultDay: 3, defaultOrder: 23, defaultStartTime: '09:38', defaultDurationMinutes: 2, name: 'Campana — pasar al comedor (desayuno Día 3)', type: 'campana', description: 'Toque de campana para llamar a los caminantes al comedor para el desayuno con mantelitos.', responsabilityName: R.campanero },
	{ defaultDay: 3, defaultOrder: 25, defaultStartTime: '09:40', defaultDurationMinutes: 70, name: 'Desayuno con Dinámica de Mantelitos', type: 'comida', blocksSantisimoAttendance: true, description: 'Desayuno; cada caminante encuentra un mensaje personal bajo su mantel y comparte sus impresiones con la mesa.', responsabilityName: R.mantelitos },
	{ defaultDay: 3, defaultOrder: 30, defaultStartTime: '10:50', defaultDurationMinutes: 10, name: 'Break 1 (Día 3)', type: 'refrigerio', description: 'Pausa después del desayuno con mantelitos.', responsabilityName: R.snacks },
	{ defaultDay: 3, defaultOrder: 35, defaultStartTime: '11:00', defaultDurationMinutes: 20, name: 'Resumen del día anterior (Día 3)', type: 'logistica', description: 'Resumen del sábado por el coordinador antes de iniciar las charlas del domingo.', responsabilityName: R.resumenDia },
	{ defaultDay: 3, defaultOrder: 40, defaultStartTime: '11:20', defaultDurationMinutes: 15, name: 'Quinta Lectura del Evangelio de Emaús (Lucas 24:33-35)', type: 'oracion', description: 'Quinta y última lectura del Camino de Emaús: los caminantes regresan a anunciar a los demás.', responsabilityName: R.continua },
	{ defaultDay: 3, defaultOrder: 50, defaultStartTime: '11:35', defaultDurationMinutes: 50, name: 'Charla: Amando a Dios a través de la Familia y los Amigos', type: 'charla', requiresResponsable: true, palanquitaNotes: 'Por siempre (Harold y Elena)', description: 'Charla sobre cómo amar a Dios a través del cuidado y servicio a la familia y los amigos.', responsabilityName: R.familia },
	{ defaultDay: 3, defaultOrder: 55, defaultStartTime: '12:25', defaultDurationMinutes: 5, name: 'Tiempo para meditar (post Familia)', type: 'descanso', description: 'Silencio para meditar tras la charla de Familia y Amigos.', responsabilityName: R.musica },
	{ defaultDay: 3, defaultOrder: 60, defaultStartTime: '12:30', defaultDurationMinutes: 10, name: 'Break 2 (Día 3)', type: 'refrigerio', description: 'Pausa antes de la charla de Servicio.', responsabilityName: R.snacks },
	{ defaultDay: 3, defaultOrder: 65, defaultStartTime: '12:40', defaultDurationMinutes: 45, name: 'Charla: Amando a Dios a través del Servicio', type: 'charla', requiresResponsable: true, palanquitaNotes: 'Sueños. Un corazón. Todos a la mesa', description: 'Charla final sobre el servicio como expresión de amor a Dios y al prójimo.', responsabilityName: R.servicio },
	{ defaultDay: 3, defaultOrder: 70, defaultStartTime: '13:25', defaultDurationMinutes: 5, name: 'Tiempo para meditar (post Servicio, video fin de retiro)', type: 'descanso', description: 'Silencio acompañado por video de fin de retiro para meditar.', responsabilityName: R.musica },
	{ defaultDay: 3, defaultOrder: 75, defaultStartTime: '13:30', defaultDurationMinutes: 1, name: 'Convocatoria al Servicio (parroquia o cualquier lugar)', type: 'logistica', description: 'Líder convoca a los caminantes a servir, sea en la parroquia o en cualquier lugar o situación.', responsabilityName: R.logistica },
	{ defaultDay: 3, defaultOrder: 80, defaultStartTime: '13:30', defaultDurationMinutes: 10, name: 'Break 3 (Día 3)', type: 'refrigerio', description: 'Pausa antes del traslado del Santísimo y la dinámica Carta de Jesús.', responsabilityName: R.snacks },
	{ defaultDay: 3, defaultOrder: 85, defaultStartTime: '13:40', defaultDurationMinutes: 1, name: 'Traslado del Santísimo y Catequesis (Jesús Vivo y Presente)', type: 'santisimo', description: 'Traslado del Santísimo y catequesis breve: Jesús nos acompaña, nos habla, está vivo y presente.', responsabilityName: R.santisimo },
	{ defaultDay: 3, defaultOrder: 90, defaultStartTime: '13:40', defaultDurationMinutes: 40, name: 'Dinámica: Carta de Jesús (a caminantes y a reclusorios)', type: 'dinamica', description: 'Todos los miembros del equipo escriben la carta. Palanquitas hacen las bolsas para los caminantes que no participan.', locationHint: 'Capilla', responsabilityName: R.textoCartaJesus },
	{ defaultDay: 3, defaultOrder: 93, defaultStartTime: '14:18', defaultDurationMinutes: 2, name: 'Campana — pasar al comedor (Día 3)', type: 'campana', description: 'Toque de campana para llamar a los caminantes al comedor para la última comida.', responsabilityName: R.campanero },
	{ defaultDay: 3, defaultOrder: 95, defaultStartTime: '14:20', defaultDurationMinutes: 40, name: 'Comida (Día 3)', type: 'comida', blocksSantisimoAttendance: true, description: 'Última comida en la casa de retiro antes del cierre.', responsabilityName: R.comedor },
	{ defaultDay: 3, defaultOrder: 100, defaultStartTime: '15:00', defaultDurationMinutes: 60, name: 'Desarmar cuartos (post-comida)', type: 'logistica', description: 'Equipo de Cuartos: tender camas vacías, recoger toallas y limpiar baños mientras los caminantes oran.', responsabilityName: R.cuartos },
	{ defaultDay: 3, defaultOrder: 101, defaultStartTime: '15:00', defaultDurationMinutes: 60, name: 'Desarmar salón y banners (post-comida)', type: 'logistica', locationHint: 'Salón', description: 'Equipo de Salón: bajar banners, recoger sillas y dejar el salón listo para devolver.', responsabilityName: R.salon },
	{ defaultDay: 3, defaultOrder: 102, defaultStartTime: '15:00', defaultDurationMinutes: 60, name: 'Limpiar comedor y área de snack (post-comida)', type: 'logistica', locationHint: 'Comedor', description: 'Equipo de Comedor y Snacks: limpiar mesas, recoger inventario sobrante, lavar utensilios.', responsabilityName: R.comedor },
	{ defaultDay: 3, defaultOrder: 103, defaultStartTime: '15:00', defaultDurationMinutes: 60, name: 'Recoger audio y sonido (post-comida)', type: 'logistica', description: 'Equipo de Música: empacar micrófonos, mezcladora, parlantes y cables del salón y la capilla.', responsabilityName: R.musica },
	{ defaultDay: 3, defaultOrder: 104, defaultStartTime: '15:00', defaultDurationMinutes: 60, name: 'Preparar entrega de celulares y despedida (post-comida)', type: 'logistica', description: 'Equipo de Bolsas: preparar la devolución de celulares, relojes y medicinas; coordinar la salida final de los caminantes.', responsabilityName: R.bolsas },
	{ defaultDay: 3, defaultOrder: 105, defaultStartTime: '15:00', defaultDurationMinutes: 60, name: 'Dinámica: Oración Compartida (líder bendice con Números 6:24-26)', type: 'dinamica', description: 'El líder de mesa comparte lo que ha sido este fin de semana y hace petición especial. Al final, bendice a la persona a su derecha con Números 6:24-26.', responsabilityName: R.oracion },
	{ defaultDay: 3, defaultOrder: 110, defaultStartTime: '16:00', defaultDurationMinutes: 1, name: 'Vuelven al salón de charlas', type: 'traslado', description: 'Caminantes regresan al salón de charlas para el cierre del retiro.', responsabilityName: R.cuartos },
	{ defaultDay: 3, defaultOrder: 115, defaultStartTime: '16:00', defaultDurationMinutes: 10, name: 'Maletas listas para subir a camiones', type: 'logistica', description: 'Equipo deja las maletas listas en la zona de embarque para subirlas a los camiones.', responsabilityName: R.logistica },
	{ defaultDay: 3, defaultOrder: 120, defaultStartTime: '16:10', defaultDurationMinutes: 15, name: 'Break 4 (Día 3)', type: 'refrigerio', description: 'Pausa antes del cierre formal del retiro.', responsabilityName: R.snacks },
	{ defaultDay: 3, defaultOrder: 125, defaultStartTime: '16:25', defaultDurationMinutes: 1, name: 'Reunión en el salón (Día 3 cierre)', type: 'logistica', description: 'Caminantes reunidos en el salón para el cierre formal del retiro.', responsabilityName: R.logistica },
	{ defaultDay: 3, defaultOrder: 130, defaultStartTime: '16:25', defaultDurationMinutes: 20, name: 'Sexta y Última Lectura completa de Emaús (Lucas 24:13-35)', type: 'oracion', description: 'He aquí la razón de nuestro peregrinar. Lectura íntegra del Evangelio para cerrar la experiencia.', responsabilityName: R.continua },
	{ defaultDay: 3, defaultOrder: 135, defaultStartTime: '16:45', defaultDurationMinutes: 15, name: 'Resumen sobre la confidencialidad (mundo exterior es el mismo de antes)', type: 'logistica', description: 'Recordatorio: lo vivido en el retiro es confidencial; el mundo exterior sigue igual y ellos van con la misión.', responsabilityName: R.logistica },
	{ defaultDay: 3, defaultOrder: 140, defaultStartTime: '17:00', defaultDurationMinutes: 5, name: 'Agradecimientos', type: 'logistica', description: 'Agradecimientos del coordinador y del equipo a los caminantes y a las palancas.', responsabilityName: R.logistica },
	{ defaultDay: 3, defaultOrder: 145, defaultStartTime: '17:05', defaultDurationMinutes: 10, name: 'Dinámica del Perdón', type: 'dinamica', description: 'Pedimos perdón por lo que no hemos hecho. Reconocer humildemente lo que pudimos haber hecho mejor.', responsabilityName: R.logistica },
	{ defaultDay: 3, defaultOrder: 150, defaultStartTime: '17:15', defaultDurationMinutes: 1, name: 'Levantar y desarmar logística (final)', type: 'logistica', description: 'Cierre del desmontaje: salón, audio, cuartos, recepción.', responsabilityName: R.logistica },
	{ defaultDay: 3, defaultOrder: 152, defaultStartTime: '17:13', defaultDurationMinutes: 2, name: 'Campana — pasar a transporte (parroquia)', type: 'campana', description: 'Toque de campana para llamar a los caminantes a abordar el transporte hacia la parroquia.', responsabilityName: R.campanero },
	{ defaultDay: 3, defaultOrder: 155, defaultStartTime: '17:15', defaultDurationMinutes: 25, name: 'Traslado a la parroquia (25 min camino)', type: 'traslado', description: 'Traslado en transporte hasta la parroquia para la misa de cierre (25 min).', responsabilityName: R.transporte },
	{ defaultDay: 3, defaultOrder: 160, defaultStartTime: '17:40', defaultDurationMinutes: 60, name: 'Misa de Cierre del Retiro', type: 'misa', requiresResponsable: true, palanquitaNotes: 'Canción: Caminamos en la Luz de Dios', description: 'Misa de cierre en la parroquia con familias y palancas; entrada con la canción "Caminamos en la Luz de Dios".', responsabilityName: R.sacerdotes },
	{ defaultDay: 3, defaultOrder: 165, defaultStartTime: '18:40', defaultDurationMinutes: 60, name: 'Fin del retiro', type: 'logistica', description: 'Cierre oficial: caminantes salen con sus familias; equipo recoge últimos detalles y cierra la casa.', responsabilityName: R.logistica },
];

async function upsertSet(
	repo: ReturnType<typeof AppDataSource.getRepository<ScheduleTemplateSet>>,
	setData: Partial<ScheduleTemplateSet>,
): Promise<ScheduleTemplateSet> {
	let s = await repo.findOne({ where: { name: setData.name! } });
	if (!s) {
		s = repo.create(setData);
		s = await repo.save(s);
	} else if (setData.isDefault !== undefined && s.isDefault !== setData.isDefault) {
		// Sync isDefault si cambió en el seed (ej. cambio de template predeterminado)
		await repo.update(s.id, { isDefault: setData.isDefault });
		s.isDefault = setData.isDefault;
	}
	return s;
}

async function seedSet(
	setId: string,
	rows: SeedRow[],
): Promise<{ created: number; added: number }> {
	const repo = AppDataSource.getRepository(ScheduleTemplate);
	const existing = await repo.find({ where: { templateSetId: setId } });
	if (existing.length === 0) {
		const items = rows.map((r) => repo.create({ ...r, templateSetId: setId }));
		await repo.save(items);
		return { created: items.length, added: 0 };
	}
	// Aditivo: inserta sólo filas cuya combinación (defaultDay, name) no exista en el set.
	// Permite ampliar templates ya seedeados sin duplicar lo que ya está.
	const key = (day: number | undefined | null, name: string | undefined | null) =>
		`${day ?? 0}__${(name ?? '').trim()}`;
	const existingKeys = new Set(existing.map((e) => key(e.defaultDay, e.name)));
	const missing = rows.filter((r) => r.name && !existingKeys.has(key(r.defaultDay, r.name)));
	if (missing.length === 0) return { created: 0, added: 0 };
	const items = missing.map((r) => repo.create({ ...r, templateSetId: setId }));
	await repo.save(items);
	return { created: 0, added: items.length };
}

/**
 * Sincroniza campos del template ya seedeados con los valores actuales del seed.
 * Se ejecuta después del insert aditivo para propagar cambios al template global.
 *
 * Match por `(templateSetId, defaultDay, name)`. Solo actualiza cuando el valor
 * del seed es no-null y difiere del existente. No reemplaza valores presentes con
 * null (no clobber accidental).
 *
 * Idempotente: cero writes si todo está sincronizado.
 */
const SYNCABLE_FIELDS: Array<keyof SeedRow> = [
	'responsabilityName',
	'defaultStartTime',
	'defaultDurationMinutes',
	'defaultOrder',
	'type',
	'palanquitaNotes',
	'planBNotes',
	'description',
	'locationHint',
	'requiresResponsable',
	'blocksSantisimoAttendance',
	'allowedResponsibilityTypes',
	'musicTrackUrl',
];

async function syncTemplateFields(setId: string, rows: SeedRow[]): Promise<number> {
	const repo = AppDataSource.getRepository(ScheduleTemplate);
	const existingAll = await repo.find({ where: { templateSetId: setId } });
	const byKey = new Map(
		existingAll.map((e) => [`${e.defaultDay ?? 0}__${(e.name ?? '').trim()}`, e]),
	);
	let patched = 0;
	for (const row of rows) {
		if (!row.name) continue;
		const existing = byKey.get(`${row.defaultDay ?? 0}__${row.name.trim()}`);
		if (!existing) continue;
		const updates: Partial<ScheduleTemplate> = {};
		for (const field of SYNCABLE_FIELDS) {
			const seedVal = (row as any)[field];
			// undefined → no tocar
			// null → forzar limpieza del campo en DB
			// otro valor → actualizar si difiere
			if (seedVal === undefined) continue;
			if (seedVal === null) {
				if ((existing as any)[field] != null) (updates as any)[field] = null;
				continue;
			}
			if ((existing as any)[field] !== seedVal) {
				(updates as any)[field] = seedVal;
			}
		}
		if (Object.keys(updates).length === 0) continue;
		await repo.update(existing.id, updates);
		patched++;
	}
	return patched;
}

export async function createDefaultScheduleTemplate(): Promise<void> {
	const setRepo = AppDataSource.getRepository(ScheduleTemplateSet);

	const staClara = await upsertSet(setRepo, {
		name: 'Emaús — Colombia',
		description: 'Minuto a minuto basado en el retiro de Santa Clara, Bogotá (Nov 2019). Retiro completo de 3 días con los 10 testimonios clásicos.',
		sourceTag: 'santa_clara_pdf',
		isActive: true,
		isDefault: false,
	});
	const polanco = await upsertSet(setRepo, {
		name: 'Emaús — México',
		description: 'Basado en el programa de Polanco III. Agenda completa con Plan A/Plan B, música específica por charla y descripciones detalladas de cada actividad.',
		sourceTag: 'polanco_xlsx',
		isActive: true,
		isDefault: true,
	});

	const a = await seedSet(staClara.id, STA_CLARA_ITEMS);
	const b = await seedSet(polanco.id, POLANCO_ITEMS);

	if (a.created || a.added || b.created || b.added) {
		console.log(
			`[scheduleTemplateSeeder] Sta Clara: created=${a.created} added=${a.added}; Polanco: created=${b.created} added=${b.added}`,
		);
	}

	// Sync de campos para items ya seedeados (propaga cambios al template global)
	const pa = await syncTemplateFields(staClara.id, STA_CLARA_ITEMS);
	const pb = await syncTemplateFields(polanco.id, POLANCO_ITEMS);
	if (pa || pb) {
		console.log(`[scheduleTemplateSeeder] sync fields Sta Clara=${pa} items, Polanco=${pb} items`);
	}
}

// Export rows for tests
export const __TEST__ = { STA_CLARA_ITEMS, POLANCO_ITEMS, R };
