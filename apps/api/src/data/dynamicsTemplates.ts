import { ServiceTeamType } from '@repo/types';
import { SERVICE_TEAM_INSTRUCTIONS } from './serviceTeamInstructions.js';

// El markdown de cada equipo vive en serviceTeamInstructions.ts, no aquí: este módulo importa
// @repo/types, y una migración que arrastre esa cadena queda "pending" para siempre en
// producción con "Unknown file extension .ts" (ver AddMissingServiceTeams). Tenerlo aparte,
// en un archivo sin imports, es lo que permite a una migración reusar el texto en vez de
// embeber otra copia. No devuelvas las instrucciones a este archivo.

export interface DefaultServiceTeamTemplate {
	name: string;
	teamType: ServiceTeamType;
	description: string;
	instructions?: string;
	priority: number;
}

export const defaultServiceTeams: DefaultServiceTeamTemplate[] = [
	{
		name: 'Cocina / Comedor',
		teamType: ServiceTeamType.COCINA,
		description: 'Preparación de alimentos y servicio de comedor',
		instructions: SERVICE_TEAM_INSTRUCTIONS['Cocina / Comedor'],
		priority: 1,
	},
	{
		name: 'Música y Alabanza',
		teamType: ServiceTeamType.MUSICA,
		description: 'Momentos de alabanza y música durante el retiro',
		instructions: SERVICE_TEAM_INSTRUCTIONS['Música y Alabanza'],
		priority: 2,
	},
	{
		name: 'Palancas',
		teamType: ServiceTeamType.PALANCAS,
		description: 'Recolección y distribución de palancas',
		instructions: SERVICE_TEAM_INSTRUCTIONS['Palancas'],
		priority: 3,
	},
	{
		name: 'Logística',
		teamType: ServiceTeamType.LOGISTICA,
		description: 'Coordinación general y materiales del retiro',
		instructions: SERVICE_TEAM_INSTRUCTIONS['Logística'],
		priority: 4,
	},
	{
		name: 'Limpieza y Orden',
		teamType: ServiceTeamType.LIMPIEZA,
		description: 'Aseo de espacios y turnos de limpieza',
		instructions: SERVICE_TEAM_INSTRUCTIONS['Limpieza y Orden'],
		priority: 5,
	},
	{
		name: 'Intercesión / Oración',
		teamType: ServiceTeamType.ORACION,
		description: 'Oración continua y turnos de adoración',
		instructions: SERVICE_TEAM_INSTRUCTIONS['Intercesión / Oración'],
		priority: 6,
	},
	{
		name: 'Liturgia',
		teamType: ServiceTeamType.LITURGIA,
		description: 'Preparación de eucaristía y lecturas',
		instructions: SERVICE_TEAM_INSTRUCTIONS['Liturgia'],
		priority: 7,
	},
	{
		name: 'Bienvenida / Registro',
		teamType: ServiceTeamType.BIENVENIDA,
		description: 'Recepción, equipaje y registro de caminantes',
		instructions: SERVICE_TEAM_INSTRUCTIONS['Bienvenida / Registro'],
		priority: 8,
	},
	{
		name: 'Salón',
		teamType: ServiceTeamType.SALON,
		description: 'Decoración y preparación del salón de charlas',
		instructions: SERVICE_TEAM_INSTRUCTIONS['Salón'],
		priority: 9,
	},
	{
		name: 'Cuartos',
		teamType: ServiceTeamType.CUARTOS,
		description: 'Preparación de habitaciones',
		instructions: SERVICE_TEAM_INSTRUCTIONS['Cuartos'],
		priority: 10,
	},
	{
		name: 'Transporte',
		teamType: ServiceTeamType.TRANSPORTE,
		description: 'Logística de transporte de caminantes y servidores',
		instructions: SERVICE_TEAM_INSTRUCTIONS['Transporte'],
		priority: 11,
	},
	{
		name: 'Snacks',
		teamType: ServiceTeamType.SNACKS,
		description: 'Preparación de snacks y bebidas entre actividades',
		instructions: SERVICE_TEAM_INSTRUCTIONS['Snacks'],
		priority: 12,
	},
	{
		name: 'Dinámica de la Pared',
		teamType: ServiceTeamType.DINAMICA,
		description: 'Dinámica espiritual de la Pared',
		instructions: SERVICE_TEAM_INSTRUCTIONS['Dinámica de la Pared'],
		priority: 13,
	},
	{
		name: 'Serenata',
		teamType: ServiceTeamType.DINAMICA,
		description: 'Dinámica de la Serenata',
		instructions: SERVICE_TEAM_INSTRUCTIONS['Serenata'],
		priority: 14,
	},
	{
		name: 'Dinámica del Perdón / Clausura',
		teamType: ServiceTeamType.DINAMICA,
		description: 'Dinámica de reconciliación y cierre del retiro',
		instructions: SERVICE_TEAM_INSTRUCTIONS['Dinámica del Perdón / Clausura'],
		priority: 15,
	},
	{
		name: 'Dinámica de la Rosa',
		teamType: ServiceTeamType.DINAMICA,
		description: 'Dinámica de apertura con la rosa',
		instructions: SERVICE_TEAM_INSTRUCTIONS['Dinámica de la Rosa'],
		priority: 16,
	},
	{
		name: 'Dinámica de las Máscaras',
		teamType: ServiceTeamType.DINAMICA,
		description: 'Dinámica de las máscaras — autenticidad y vulnerabilidad',
		instructions: SERVICE_TEAM_INSTRUCTIONS['Dinámica de las Máscaras'],
		priority: 17,
	},
	{
		name: 'Sanación de los Recuerdos',
		teamType: ServiceTeamType.DINAMICA,
		description: 'Dinámica de sanación interior y oración de sanación',
		instructions: SERVICE_TEAM_INSTRUCTIONS['Sanación de los Recuerdos'],
		priority: 18,
	},
	{
		name: 'Reglas del Retiro',
		teamType: ServiceTeamType.OTRO,
		description: 'Normas de convivencia y reglamento para caminantes',
		instructions: SERVICE_TEAM_INSTRUCTIONS['Reglas del Retiro'],
		priority: 19,
	},
	{
		name: 'Rosario en Cadena',
		teamType: ServiceTeamType.OTRO,
		description: 'Cadena de oración del rosario con familias',
		instructions: SERVICE_TEAM_INSTRUCTIONS['Rosario en Cadena'],
		priority: 20,
	},
	{
		name: 'Trabajo de Pasillo',
		teamType: ServiceTeamType.OTRO,
		description: 'Acompañamiento personal a caminantes entre actividades',
		instructions: SERVICE_TEAM_INSTRUCTIONS['Trabajo de Pasillo'],
		priority: 21,
	},
	{
		name: 'Líder de Mesa (Primero de Mesa)',
		teamType: ServiceTeamType.OTRO,
		description: 'Responsabilidades del líder principal de mesa',
		instructions: SERVICE_TEAM_INSTRUCTIONS['Líder de Mesa (Primero de Mesa)'],
		priority: 22,
	},
	{
		name: 'Colíder de Mesa (Segundo de Mesa)',
		teamType: ServiceTeamType.OTRO,
		description: 'Responsabilidades del colíder / segundo de mesa',
		instructions: SERVICE_TEAM_INSTRUCTIONS['Colíder de Mesa (Segundo de Mesa)'],
		priority: 23,
	},
	{
		name: 'Oración por Intercesión en Mesa',
		teamType: ServiceTeamType.DINAMICA,
		description: 'Ejercicios de oración de acción de gracias y petición en mesa',
		instructions: SERVICE_TEAM_INSTRUCTIONS['Oración por Intercesión en Mesa'],
		priority: 24,
	},
	{
		name: 'Sacerdotes',
		teamType: ServiceTeamType.SACERDOTES,
		description: 'Coordinación de los sacerdotes y la atención sacramental del retiro',
		instructions: SERVICE_TEAM_INSTRUCTIONS['Sacerdotes'],
		priority: 25,
	},
	{
		name: 'Compras',
		teamType: ServiceTeamType.COMPRAS,
		description: 'Aprovisionamiento y compras de materiales e insumos del retiro',
		instructions: SERVICE_TEAM_INSTRUCTIONS['Compras'],
		priority: 26,
	},
	{
		name: 'Examen de Conciencia / Quema de Pecados',
		teamType: ServiceTeamType.DINAMICA,
		description: 'Dinámica de examen de conciencia y quema de pecados (Anexo A-2-16)',
		instructions: SERVICE_TEAM_INSTRUCTIONS['Examen de Conciencia / Quema de Pecados'],
		priority: 27,
	},
];
