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
		routeContext: ['reports'],
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
		routeContext: ['settings'],
		topics: [
			{
				key: 'configuration',
				title: 'Configuration Options',
				titleEs: 'Opciones de Configuración',
				content: 'settings.md',
			},
		],
	},
	{
		key: 'communities',
		title: 'Communities',
		titleEs: 'Comunidades',
		icon: 'mdi-account-group',
		routeContext: ['communities', 'community-dashboard', 'community-members'],
		topics: [
			{
				key: 'community-management',
				title: 'Community Management',
				titleEs: 'Gestión de Comunidades',
				content: 'communities.md',
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
