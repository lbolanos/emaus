import 'vue-router';

declare module 'vue-router' {
	interface RouteMeta {
		requiresAuth?: boolean;
		requiresSuperadmin?: boolean;
		requiresRetreat?: boolean;
	}
}
