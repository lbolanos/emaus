// Sidebar menu favorites (specs/menu-favorites). The favorite key is the
// ROUTE name — the same value telemetry records as the page_view `page` —
// so the API can pre-seed favorites from real usage without knowing
// anything about the web's menu structure.
//
// Maintenance note: when a menu item is added to the sidebar's
// `menuSections`, add its routeName here too, or the telemetry seed will
// never pick it (manual starring keeps working either way).

// Every routeName that has a sidebar menu item (apps/web/src/components/layout/Sidebar.vue).
export const MENU_ROUTE_NAMES = [
	// community + social (non-retreat)
	'my-communities',
	'communities',
	'pending-communities',
	'profile',
	'search-users',
	'friends',
	'followers',
	'testimonials',
	'my-retreats',
	// retreat: main / people / assignments
	'retreat-dashboard',
	'walkers',
	'servers',
	'angelitos',
	'waiting-list',
	'canceled',
	'reception',
	'tables',
	'responsibilities',
	'service-teams',
	'user-type-and-table',
	'bed-assignments',
	// retreat: logistics / communications
	'santisimo',
	'minuto-a-minuto',
	'pre-retreat-tasks',
	'retreat-preparations',
	'my-schedule',
	'inventory',
	'payments',
	'message-templates',
	'message-sequences',
	'communication-dashboard',
	'follow-up',
	'palancas',
	// retreat: reports / administration
	'notes-and-meeting-points',
	'cancellation-and-notes',
	'bags-report',
	'shirts-report',
	'walker-badges',
	'medicines-report',
	'rooms',
	'food',
	'role-management',
	'domain-audit',
	'retreat-shirt-types',
	// settings (bottom)
	'global-message-templates',
	'global-message-sequences',
	'inventory-items',
	'schedule-template',
	'pre-retreat-task-template',
	'houses',
	'telemetry',
	'change-password',
] as const;

export type MenuRouteName = (typeof MENU_ROUTE_NAMES)[number];

// Seed fallback for users with no useful page_view history (new accounts).
// Aggregate top from dev telemetry.
export const DEFAULT_FAVORITE_MENU_ITEMS: readonly string[] = [
	'retreat-dashboard',
	'walkers',
	'servers',
	'message-sequences',
	'tables',
];

// Cap for the persisted favorites list (zod enforces it too; the service
// sanitizes as defense in depth).
export const FAVORITE_MENU_ITEMS_LIMIT = 12;
