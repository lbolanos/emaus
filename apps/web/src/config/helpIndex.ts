import type { HelpSection } from '@/stores/helpStore';

export const helpIndex: HelpSection[] = [
	{
		key: 'getting-started',
		title: 'Getting Started',
		titleEs: 'Primeros Pasos',
		icon: 'mdi-help-circle',
		routeContext: [],
		topics: [
			{
				key: 'overview',
				title: 'System Overview',
				titleEs: 'Descripción General',
				content: 'getting-started.md',
			},
			{
				key: 'navigation',
				title: 'Navigation',
				titleEs: 'Navegación',
				content: 'getting-started.md#navigation',
			},
		],
	},
	{
		key: 'navigation',
		title: 'Navigation',
		titleEs: 'Navegacion',
		icon: 'mdi-compass',
		routeContext: [],
		topics: [
			{
				key: 'navigation-architecture',
				title: 'Navigation Architecture',
				titleEs: 'Arquitectura de Navegacion',
				content: 'navigation.md',
			},
		],
	},
	{
		key: 'walkers',
		title: 'Walkers',
		titleEs: 'Caminantes',
		icon: 'mdi-account-multiple',
		routeContext: ['walkers', 'walkers-view'],
		topics: [
			{
				key: 'managing-walkers',
				title: 'Managing Walkers',
				titleEs: 'Gestionar Caminantes',
				content: 'walkers.md',
			},
		],
	},
	{
		key: 'servers',
		title: 'Servers',
		titleEs: 'Servidores',
		icon: 'mdi-account-tie',
		routeContext: ['servers', 'servers-view'],
		topics: [
			{
				key: 'managing-servers',
				title: 'Managing Servers',
				titleEs: 'Gestionar Servidores',
				content: 'servers.md',
			},
		],
	},
	{
		key: 'tables',
		title: 'Tables',
		titleEs: 'Mesas',
		icon: 'mdi-table',
		routeContext: ['tables', 'table-view'],
		topics: [
			{
				key: 'table-assignments',
				title: 'Table Assignments',
				titleEs: 'Asignaciones de Mesa',
				content: 'tables.md',
			},
		],
	},
	{
		key: 'bed-assignments',
		title: 'Bed Assignments',
		titleEs: 'Asignaciones de Camas',
		icon: 'mdi-bed',
		routeContext: ['bed-assignments', 'rooms'],
		topics: [
			{
				key: 'room-workflow',
				title: 'Room Assignment Workflow',
				titleEs: 'Flujo de Asignación de Habitaciones',
				content: 'bed-assignments.md',
			},
		],
	},
	{
		key: 'payments',
		title: 'Payments',
		titleEs: 'Pagos',
		icon: 'mdi-cash',
		routeContext: ['payments', 'payment-view'],
		topics: [
			{
				key: 'payment-tracking',
				title: 'Payment Tracking',
				titleEs: 'Seguimiento de Pagos',
				content: 'payments.md',
			},
		],
	},
	{
		key: 'reports',
		title: 'Reports',
		titleEs: 'Reportes',
		icon: 'mdi-file-chart',
		routeContext: ['reports', 'bags-report', 'shirts-report', 'medicines-report', 'walker-badges'],
		topics: [
			{
				key: 'available-reports',
				title: 'Available Reports',
				titleEs: 'Reportes Disponibles',
				content: 'reports.md',
			},
		],
	},
	{
		key: 'settings',
		title: 'Settings',
		titleEs: 'Configuración',
		icon: 'mdi-cog',
		routeContext: ['settings', 'change-password'],
		topics: [
			{
				key: 'configuration',
				title: 'Configuration Options',
				titleEs: 'Opciones de Configuración',
				content: 'settings.md',
			},
			{
				key: 'password-management',
				title: 'Password Management',
				titleEs: 'Gestión de Contraseña',
				content: 'password-management.md',
			},
		],
	},
	{
		key: 'communities',
		title: 'Communities',
		titleEs: 'Comunidades',
		icon: 'mdi-account-group',
		routeContext: [
			'communities',
			'community-dashboard',
			'community-members',
			'community-admins',
			'community-meetings',
		],
		topics: [
			{
				key: 'community-management',
				title: 'Community Management',
				titleEs: 'Gestión de Comunidades',
				content: 'communities.md',
			},
		],
	},
	{
		key: 'social',
		title: 'Social Features',
		titleEs: 'Características Sociales',
		icon: 'mdi-account-circle',
		routeContext: ['profile', 'public-profile', 'search-users', 'friends', 'followers'],
		topics: [
			{
				key: 'social-overview',
				title: 'Social Features',
				titleEs: 'Características Sociales',
				content: 'social.md',
			},
		],
	},
	{
		key: 'my-retreats',
		title: 'My Retreats',
		titleEs: 'Mis Retiros',
		icon: 'mdi-clock',
		routeContext: ['my-retreats'],
		topics: [
			{
				key: 'my-retreats-overview',
				title: 'My Retreats',
				titleEs: 'Mis Retiros',
				content: 'my-retreats.md',
			},
		],
	},
	{
		key: 'crm',
		title: 'Communication & CRM',
		titleEs: 'Comunicación (CRM)',
		icon: 'mdi-message-text',
		routeContext: ['message-sequences', 'communication-dashboard', 'follow-up'],
		topics: [
			{
				key: 'crm-overview',
				title: 'Overview',
				titleEs: 'Visión general',
				content: 'crm.md',
			},
			{
				key: 'whatsapp-queue',
				title: 'WhatsApp send queue',
				titleEs: 'Cola de WhatsApp',
				content: 'crm.md#cola-de-whatsapp',
			},
			{
				key: 'segments',
				title: 'Segments',
				titleEs: 'Segmentos',
				content: 'crm.md#segmentos',
			},
			{
				key: 'sequences',
				title: 'Automated sequences',
				titleEs: 'Secuencias automáticas',
				content: 'crm.md#secuencias-automaticas',
			},
			{
				key: 'dashboard',
				title: 'Dashboard',
				titleEs: 'Tablero de comunicación',
				content: 'crm.md#tablero-de-comunicacion',
			},
			{
				key: 'follow-up',
				title: 'Tasks & follow-up',
				titleEs: 'Tareas y seguimiento',
				content: 'crm.md#tareas-y-seguimiento',
			},
		],
	},
	{
		key: 'role-management',
		title: 'Role Management',
		titleEs: 'Gestión de Roles',
		icon: 'mdi-account-key',
		routeContext: ['role-management'],
		topics: [
			{
				key: 'role-management-overview',
				title: 'Overview',
				titleEs: 'Descripción general',
				content: 'role-management.md',
			},
		],
	},
	{
		key: 'minute-by-minute',
		title: 'Minute by Minute',
		titleEs: 'Minuto a Minuto',
		icon: 'mdi-timeline-clock',
		// getHelpByRoute usa includes(): 'minuto-a-minuto' cubre la agenda en vivo y
		// 'schedule-template' el editor del template global.
		routeContext: ['minuto-a-minuto', 'schedule-template'],
		topics: [
			{
				key: 'mam-overview',
				title: 'Overview',
				titleEs: 'Descripción general',
				content: 'minute-by-minute.md',
			},
		],
	},
	{
		key: 'pre-retreat-tasks',
		title: 'Pre-Retreat Tasks',
		titleEs: 'Tareas Pre-Retiro',
		icon: 'mdi-clipboard-check',
		// getHelpByRoute usa includes(): 'pre-retreat-task' cubre las rutas
		// 'pre-retreat-tasks' (por retiro) y 'pre-retreat-task-template' (global).
		routeContext: ['pre-retreat-task'],
		topics: [
			{
				key: 'pre-retreat-overview',
				title: 'Overview',
				titleEs: 'Descripción general',
				content: 'pre-retreat-tasks.md',
			},
		],
	},
	{
		key: 'preparations',
		title: 'Preparations',
		titleEs: 'Preparaciones',
		icon: 'mdi-book-open-page-variant',
		// getHelpByRoute usa includes() sobre el route NAME ('retreat-preparations').
		routeContext: ['retreat-preparation'],
		topics: [
			{
				key: 'preparations-overview',
				title: 'Overview',
				titleEs: 'Descripción general',
				content: 'preparations.md',
			},
		],
	},
	{
		key: 'retreat-dashboard',
		title: 'Retreat Dashboard',
		titleEs: 'Panel del Retiro',
		icon: 'mdi-view-dashboard',
		routeContext: ['retreat-dashboard'],
		topics: [
			{
				key: 'retreat-dashboard-overview',
				title: 'Overview',
				titleEs: 'Descripción general',
				content: 'retreat-dashboard.md',
			},
		],
	},
	{
		key: 'houses',
		title: 'Houses',
		titleEs: 'Casas',
		icon: 'mdi-home-city',
		routeContext: ['houses'],
		topics: [
			{
				key: 'houses-overview',
				title: 'Overview',
				titleEs: 'Descripción general',
				content: 'houses.md',
			},
		],
	},
	{
		key: 'retreat-shirt-types',
		title: 'Retreat Shirt Types',
		titleEs: 'Tipos de Playera',
		icon: 'mdi-tshirt-crew',
		routeContext: ['retreat-shirt-types'],
		topics: [
			{
				key: 'retreat-shirt-types-overview',
				title: 'Overview',
				titleEs: 'Descripción general',
				content: 'retreat-shirt-types.md',
			},
		],
	},
	{
		key: 'notes-and-meeting-points',
		title: 'Notes and Meeting Points',
		titleEs: 'Notas y Puntos de Encuentro',
		icon: 'mdi-map-marker',
		routeContext: ['notes-and-meeting-points'],
		topics: [
			{
				key: 'notes-and-meeting-points-overview',
				title: 'Overview',
				titleEs: 'Descripción general',
				content: 'notes-and-meeting-points.md',
			},
		],
	},
	{
		key: 'food',
		title: 'Food',
		titleEs: 'Comida',
		icon: 'mdi-food',
		routeContext: ['food'],
		topics: [
			{
				key: 'food-overview',
				title: 'Overview',
				titleEs: 'Descripción general',
				content: 'food.md',
			},
		],
	},
	{
		key: 'responsibilities',
		title: 'Responsibilities and Service Teams',
		titleEs: 'Responsabilidades y Equipos',
		icon: 'mdi-clipboard-account',
		routeContext: ['responsibilities', 'service-teams'],
		topics: [
			{
				key: 'responsibilities-overview',
				title: 'Overview',
				titleEs: 'Descripción general',
				content: 'responsibilities.md',
			},
		],
	},
	{
		key: 'user-type-and-table',
		title: 'User Type and Table',
		titleEs: 'Tipo de Usuario y Mesa',
		icon: 'mdi-account-switch',
		routeContext: ['user-type-and-table'],
		topics: [
			{
				key: 'user-type-and-table-overview',
				title: 'Overview',
				titleEs: 'Descripción general',
				content: 'user-type-and-table.md',
			},
		],
	},
	{
		key: 'participant-status',
		title: 'Waiting List, Canceled and Notes',
		titleEs: 'Espera, Cancelados y Notas',
		icon: 'mdi-account-clock',
		routeContext: ['waiting-list', 'canceled', 'cancellation-and-notes'],
		topics: [
			{
				key: 'participant-status-overview',
				title: 'Overview',
				titleEs: 'Descripción general',
				content: 'participant-status.md',
			},
		],
	},
	{
		key: 'reception',
		title: 'Reception',
		titleEs: 'Recepción',
		icon: 'mdi-check-decagram',
		routeContext: ['reception'],
		topics: [
			{
				key: 'reception-overview',
				title: 'Overview',
				titleEs: 'Descripción general',
				content: 'reception.md',
			},
		],
	},
	{
		key: 'angelitos',
		title: 'Angelitos (Helpers)',
		titleEs: 'Angelitos',
		icon: 'mdi-account-heart',
		routeContext: ['angelitos'],
		topics: [
			{
				key: 'angelitos-overview',
				title: 'Overview',
				titleEs: 'Descripción general',
				content: 'angelitos.md',
			},
		],
	},
	{
		key: 'palancas',
		title: 'Support Letters',
		titleEs: 'Palancas',
		icon: 'mdi-email-heart-outline',
		routeContext: ['palancas'],
		topics: [
			{
				key: 'palancas-overview',
				title: 'Overview',
				titleEs: 'Descripción general',
				content: 'palancas.md',
			},
		],
	},
	{
		key: 'testimonials',
		title: 'Testimonials',
		titleEs: 'Testimonios',
		icon: 'mdi-comment-quote',
		routeContext: ['testimonials'],
		topics: [
			{
				key: 'testimonials-overview',
				title: 'Overview',
				titleEs: 'Descripción general',
				content: 'testimonials.md',
			},
		],
	},
	{
		key: 'santisimo',
		title: 'Chapel Watch Schedule',
		titleEs: 'Guardias de la Capilla',
		icon: 'mdi-church',
		routeContext: ['santisimo'],
		topics: [
			{
				key: 'santisimo-overview',
				title: 'Overview',
				titleEs: 'Descripción general',
				content: 'santisimo.md',
			},
		],
	},
	{
		key: 'inventory',
		title: 'Inventory',
		titleEs: 'Inventario',
		icon: 'mdi-package-variant',
		routeContext: ['inventory'],
		topics: [
			{
				key: 'inventory-overview',
				title: 'Overview',
				titleEs: 'Descripción general',
				content: 'inventory.md',
			},
		],
	},
	{
		key: 'my-schedule',
		title: 'My Schedule',
		titleEs: 'Mi Agenda',
		icon: 'mdi-calendar-account',
		routeContext: ['my-schedule'],
		topics: [
			{
				key: 'my-schedule-overview',
				title: 'Overview',
				titleEs: 'Descripción general',
				content: 'my-schedule.md',
			},
		],
	},
	{
		key: 'message-templates',
		title: 'Message Templates',
		titleEs: 'Plantillas de Mensajes',
		icon: 'mdi-message-text',
		routeContext: ['message-templates'],
		topics: [
			{
				key: 'message-templates-overview',
				title: 'Overview',
				titleEs: 'Descripción general',
				content: 'message-templates.md',
			},
		],
	},
];

export function getHelpSectionByKey(key: string): HelpSection | undefined {
	return helpIndex.find((section) => section.key === key);
}

export function getHelpTopicByKey(sectionKey: string, topicKey: string) {
	const section = getHelpSectionByKey(sectionKey);
	if (!section) return undefined;
	return section.topics.find((topic) => topic.key === topicKey);
}

export function getHelpByRoute(routeName: string): HelpSection | undefined {
	return helpIndex.find((section) => section.routeContext?.some((ctx) => routeName.includes(ctx)));
}
