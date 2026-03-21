import { createRouter, createWebHistory } from 'vue-router';

// All views lazy-loaded to prevent Safari iOS stack overflow from deep module evaluation
const AppLayout = () => import('@/layouts/AppLayout.vue');
const WalkersView = () => import('../views/WalkersView.vue');
const ServersView = () => import('../views/ServersView.vue');
const PartialServerView = () => import('../views/PartialServerView.vue');
const CanceledView = () => import('../views/CanceledView.vue');
const HousesView = () => import('../views/HousesView.vue');
const PalancasView = () => import('../views/PalancasView.vue');
const PaymentsView = () => import('../views/PaymentsView.vue');
const NotesAndMeetingPointsView = () => import('../views/NotesAndMeetingPointsView.vue');
const RoomsView = () => import('../views/RoomsView.vue');
const UserTypeAndTableView = () => import('../views/UserTypeAndTableView.vue');
const FoodView = () => import('../views/FoodView.vue');
const CancellationAndNotesView = () => import('../views/CancellationAndNotesView.vue');
const WaitingListView = () => import('../views/WaitingListView.vue');
const BagsReportView = () => import('../views/BagsReportView.vue');
const MedicinesReportView = () => import('../views/MedicinesReportView.vue');
const LoginView = () => import('../views/LoginView.vue');
const RequestPasswordResetView = () => import('../views/RequestPasswordResetView.vue');
const ResetPasswordView = () => import('../views/ResetPasswordView.vue');
const ParticipantRegistrationView = () => import('../views/ParticipantRegistrationView.vue');
const RetreatDashboardView = () => import('../views/RetreatDashboardView.vue');
const BedAssignmentsView = () => import('../views/BedAssignmentsView.vue');
const TablesView = () => import('../views/TablesView.vue');
const BadgesView = () => import('../views/BadgesView.vue');
const MessageTemplatesView = () => import('../views/MessageTemplatesView.vue');
const GlobalMessageTemplatesView = () => import('../views/GlobalMessageTemplatesView.vue');
const InventoryView = () => import('../views/InventoryView.vue');
const InventoryItemsView = () => import('../views/InventoryItemsView.vue');
const RetreatRoleManagementView = () => import('../views/RetreatRoleManagementView.vue');
const AcceptInvitationView = () => import('../views/AcceptInvitationView.vue');
const TelemetryDashboardView = () => import('../views/TelemetryDashboardView.vue');
const RetreatFlyerView = () => import('../views/RetreatFlyerView.vue');
const HelpView = () => import('../views/HelpView.vue');
const LandingView = () => import('../views/LandingView.vue');

import { useAuthStore } from '@/stores/authStore';
import { useRetreatStore } from '@/stores/retreatStore';

// Debug: log chunk load failures on window for debug overlay
if (typeof window !== 'undefined') {
	window.addEventListener('vite:preloadError', (e: any) => {
		if ((window as any)._L) (window as any)._L('PRELOAD_ERR:' + e.payload?.message);
	});
}

const router = createRouter({
	history: createWebHistory(import.meta.env.BASE_URL),
	routes: [
		{
			path: '/login',
			name: 'login',
			component: LoginView,
			meta: { requiresAuth: false },
		},
		{
			path: '/request-password-reset',
			name: 'request-password-reset',
			component: RequestPasswordResetView,
			meta: { requiresAuth: false },
		},
		{
			path: '/reset-password',
			name: 'reset-password',
			component: ResetPasswordView,
			meta: { requiresAuth: false },
		},
		{
			path: '/register/:type/:retreatId',
			name: 'registration',
			component: ParticipantRegistrationView,
			props: true,
			meta: { requiresAuth: false },
		},
		{
			path: '/:slug([a-z0-9]+)',
			name: 'registration-slug-walker',
			component: ParticipantRegistrationView,
			props: (route) => ({ slug: route.params.slug, type: 'walker' }),
			meta: { requiresAuth: false },
		},
		{
			path: '/:slug([a-z0-9]+)/server',
			name: 'registration-slug-server',
			component: ParticipantRegistrationView,
			props: (route) => ({ slug: route.params.slug, type: 'server' }),
			meta: { requiresAuth: false },
		},
		{
			path: '/accept-invitation/:token',
			name: 'accept-invitation',
			component: AcceptInvitationView,
			props: true,
			meta: { requiresAuth: false },
		},
		{
			path: '/accept-community-invitation/:token',
			name: 'accept-community-invitation',
			component: () => import('../views/AcceptCommunityInvitationView.vue'),
			props: true,
			meta: { requiresAuth: false },
		},
		{
			path: '/public/attendance/:communityId/:meetingId',
			name: 'public-attendance',
			component: () => import('../views/PublicAttendanceView.vue'),
			props: true,
			meta: { requiresAuth: false },
		},
		{
			path: '/',
			name: 'landing',
			component: LandingView,
			meta: { requiresAuth: false },
		},
		{
			path: '/privacy',
			name: 'privacy',
			component: () => import('../views/PrivacyPolicyView.vue'),
			meta: { requiresAuth: false },
		},
		{
			path: '/terms',
			name: 'terms',
			component: () => import('../views/TermsView.vue'),
			meta: { requiresAuth: false },
		},
		{
			path: '/app',
			component: AppLayout,
			meta: { requiresAuth: true },
			children: [
				{
					path: '',
					name: 'home',
					component: WalkersView, // Default component for '/'
					meta: { requiresRetreat: true },
				},
				{
					path: 'walkers',
					name: 'walkers',
					component: WalkersView,
					meta: { requiresRetreat: true },
				},
				{
					path: 'servers',
					name: 'servers',
					component: ServersView,
					meta: { requiresRetreat: true },
				},
				{
					path: 'partial-servers',
					name: 'partial-servers',
					component: PartialServerView,
					meta: { requiresRetreat: true },
				},
				{
					path: 'tables',
					name: 'tables',
					component: TablesView,
					meta: { requiresRetreat: true },
				},
				{
					path: 'walker-badges',
					name: 'walker-badges',
					component: BadgesView,
					meta: { requiresRetreat: true },
				},
				{
					path: 'palancas',
					name: 'palancas',
					component: PalancasView,
					meta: { requiresRetreat: true },
				},
				{
					path: 'payments',
					name: 'payments',
					component: PaymentsView,
					meta: { requiresRetreat: true },
				},
				{
					path: 'notes-and-meeting-points',
					name: 'notes-and-meeting-points',
					component: NotesAndMeetingPointsView,
					meta: { requiresRetreat: true },
				},
				{
					path: 'rooms',
					name: 'rooms',
					component: RoomsView,
					meta: { requiresRetreat: true },
				},
				{
					path: 'user-type-and-table',
					name: 'user-type-and-table',
					component: UserTypeAndTableView,
					meta: { requiresRetreat: true },
				},
				{
					path: 'food',
					name: 'food',
					component: FoodView,
					meta: { requiresRetreat: true },
				},
				{
					path: 'cancellation-and-notes',
					name: 'cancellation-and-notes',
					component: CancellationAndNotesView,
					meta: { requiresRetreat: true },
				},
				{
					path: 'waiting-list',
					name: 'waiting-list',
					component: WaitingListView,
					meta: { requiresRetreat: true },
				},
				{
					path: 'bags-report',
					name: 'bags-report',
					component: BagsReportView,
					meta: { requiresRetreat: true },
				},
				{
					path: 'medicines-report',
					name: 'medicines-report',
					component: MedicinesReportView,
					meta: { requiresRetreat: true },
				},
				{
					path: 'canceled',
					name: 'canceled',
					component: CanceledView,
					meta: { requiresRetreat: true },
				},
				{
					path: 'houses',
					name: 'houses',
					component: HousesView,
					meta: { requiresRetreat: false },
				},
				{
					path: 'retreats/:id/dashboard',
					name: 'retreat-dashboard',
					component: RetreatDashboardView,
					props: true,
					meta: { requiresRetreat: true },
				},
				{
					path: 'retreats/:id/flyer',
					name: 'retreat-flyer',
					component: RetreatFlyerView,
					props: true,
					meta: { requiresRetreat: true },
				},
				{
					path: 'retreats/:id/bed-assignments',
					name: 'bed-assignments',
					component: BedAssignmentsView,
					props: true,
					meta: { requiresRetreat: true },
				},
				{
					path: 'retreats/:id/responsibilities',
					name: 'responsibilities',
					component: () => import('../views/ResponsabilitiesView.vue'),
					props: true,
					meta: { requiresRetreat: true },
				},
				{
					path: 'service-teams',
					name: 'service-teams',
					component: () => import('../views/ServiceTeamsView.vue'),
					meta: { requiresRetreat: true },
				},
				{
					path: 'retreats/:id/inventory',
					name: 'inventory',
					component: InventoryView,
					props: true,
					meta: { requiresRetreat: true },
				},
				{
					path: 'settings/inventory-items',
					name: 'inventory-items',
					component: InventoryItemsView,
					meta: { requiresRetreat: false },
				},
				{
					path: 'settings/message-templates',
					name: 'message-templates',
					component: MessageTemplatesView,
					meta: { requiresRetreat: true },
				},
				{
					path: 'settings/global-message-templates',
					name: 'global-message-templates',
					component: GlobalMessageTemplatesView,
					meta: { requiresRetreat: false },
				},
				{
					path: 'settings/change-password',
					name: 'change-password',
					component: () => import('../views/ChangePasswordView.vue'),
					meta: { requiresRetreat: false },
				},
				{
					path: 'retreats/:id/role-management',
					name: 'role-management',
					component: RetreatRoleManagementView,
					props: true,
					meta: { requiresRetreat: true },
				},
				{
					path: 'telemetry',
					name: 'telemetry',
					component: TelemetryDashboardView,
					meta: { requiresSuperadmin: true, requiresRetreat: false },
				},
				{
					path: 'help',
					name: 'help',
					component: HelpView,
					meta: { requiresRetreat: false },
				},
				{
					path: 'help/:section',
					name: 'help-section',
					component: HelpView,
					props: true,
					meta: { requiresRetreat: false },
				},
				// Community Routes
				{
					path: 'communities',
					name: 'communities',
					component: () => import('../views/CommunityListView.vue'),
					meta: { requiresRetreat: false },
				},
				{
					path: 'communities/:id',
					name: 'community-dashboard',
					component: () => import('../views/CommunityDashboardView.vue'),
					props: true,
					meta: { requiresRetreat: false },
				},
				{
					path: 'communities/:id/members',
					name: 'community-members',
					component: () => import('../views/CommunityMembersView.vue'),
					props: true,
					meta: { requiresRetreat: false },
				},
				{
					path: 'communities/:id/meetings',
					name: 'community-meetings',
					component: () => import('../views/CommunityMeetingsView.vue'),
					props: true,
					meta: { requiresRetreat: false },
				},
				{
					path: 'communities/:id/meetings/:meetingId/flyer',
					name: 'community-meeting-flyer',
					component: () => import('../views/CommunityMeetingFlyerView.vue'),
					props: true,
					meta: { requiresRetreat: false },
				},
				{
					path: 'communities/:id/attendance/:meetingId',
					name: 'community-attendance',
					component: () => import('../views/CommunityAttendanceView.vue'),
					props: true,
					meta: { requiresRetreat: false },
				},
				{
					path: 'communities/:id/admins',
					name: 'community-admins',
					component: () => import('../views/CommunityAdminsView.vue'),
					props: true,
					meta: { requiresRetreat: false },
				},
				{
					path: 'communities/:id/templates',
					name: 'community-templates',
					component: () => import('../views/CommunityMessageTemplatesView.vue'),
					props: true,
					meta: { requiresRetreat: false },
				},
				// Social Routes
				{
					path: 'profile',
					name: 'profile',
					component: () => import('../views/social/ProfileView.vue'),
					meta: { requiresRetreat: false },
				},
				{
					path: 'profile/:id',
					name: 'public-profile',
					component: () => import('../views/social/PublicProfileView.vue'),
					props: true,
					meta: { requiresRetreat: false },
				},
				{
					path: 'social/search',
					name: 'search-users',
					component: () => import('../views/social/SearchUsersView.vue'),
					meta: { requiresRetreat: false },
				},
				{
					path: 'social/friends',
					name: 'friends',
					component: () => import('../views/social/FriendsView.vue'),
					meta: { requiresRetreat: false },
				},
				{
					path: 'social/followers',
					name: 'followers',
					component: () => import('../views/social/FollowersView.vue'),
					meta: { requiresRetreat: false },
				},
				{
					path: 'testimonials',
					name: 'testimonials',
					component: () => import('../views/social/TestimonialsView.vue'),
					meta: { requiresRetreat: false },
				},
				{
					path: 'my-retreats',
					name: 'my-retreats',
					component: () => import('../views/social/MyRetreatsView.vue'),
					meta: { requiresRetreat: false },
				},
			],
		},
	],
});

router.beforeEach(async (to, from, next) => {
	const auth = useAuthStore();

	// Check if route explicitly doesn't require auth
	const requiresAuth = to.matched.some((record) => record.meta.requiresAuth !== false);
	const requiresSuperadmin = to.matched.some((record) => record.meta.requiresSuperadmin);

	// Ensure auth status is checked before any navigation (only if auth might be required)
	if (requiresAuth && !auth.isAuthenticated) {
		await auth.checkAuthStatus();
	}

	if (requiresAuth && !auth.isAuthenticated) {
		next({ name: 'login' });
		return;
	}

	if (requiresSuperadmin && !auth.isAuthenticated) {
		// Redirect unauthenticated users trying to access telemetry
		next({ name: 'login' });
		return;
	}

	if (to.name === 'login' && auth.isAuthenticated) {
		// Let the login handler handle the redirect after successful login
		next();
		return;
	}

	if (to.name === 'home' && auth.isAuthenticated) {
		// Redirect authenticated users to the most recent retreat's dashboard
		const retreatStore = useRetreatStore();
		try {
			await retreatStore.fetchRetreats();
		} catch (error) {
			console.error('Failed to fetch retreats during root path redirect:', error);
			// Fallback if fetching retreats fails - let the route render normally
			next();
			return;
		}

		if (retreatStore.mostRecentRetreat) {
			// Redirect to the most recent retreat's dashboard
			next({ name: 'retreat-dashboard', params: { id: retreatStore.mostRecentRetreat.id } });
			return;
		}

		// Fallback to walkers if no retreats exist
		next({ name: 'walkers' });
		return;
	}

	next();
});

export default router;
