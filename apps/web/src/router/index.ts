import { createRouter, createWebHistory } from 'vue-router';
import AppLayout from '@/layouts/AppLayout.vue';
import WalkersView from '../views/WalkersView.vue';
import ServersView from '../views/ServersView.vue';
import PartialServerView from '../views/PartialServerView.vue';
import CanceledView from '../views/CanceledView.vue';
import HousesView from '../views/HousesView.vue';
import PalancasView from '../views/PalancasView.vue';
import PaymentsView from '../views/PaymentsView.vue';
import NotesAndMeetingPointsView from '../views/NotesAndMeetingPointsView.vue';
import RoomsView from '../views/RoomsView.vue';
import UserTypeAndTableView from '../views/UserTypeAndTableView.vue';
import FoodView from '../views/FoodView.vue';
import CancellationAndNotesView from '../views/CancellationAndNotesView.vue';
import WaitingListView from '../views/WaitingListView.vue';
import BagsReportView from '../views/BagsReportView.vue';
import MedicinesReportView from '../views/MedicinesReportView.vue';
import LoginView from '../views/LoginView.vue';
import RequestPasswordResetView from '../views/RequestPasswordResetView.vue';
import ResetPasswordView from '../views/ResetPasswordView.vue';
import ParticipantRegistrationView from '../views/ParticipantRegistrationView.vue';
import RetreatDashboardView from '../views/RetreatDashboardView.vue';
import BedAssignmentsView from '../views/BedAssignmentsView.vue';
import TablesView from '../views/TablesView.vue';
import BadgesView from '../views/BadgesView.vue';
import MessageTemplatesView from '../views/MessageTemplatesView.vue';
import GlobalMessageTemplatesView from '../views/GlobalMessageTemplatesView.vue';
import InventoryView from '../views/InventoryView.vue';
import InventoryItemsView from '../views/InventoryItemsView.vue';
import RetreatRoleManagementView from '../views/RetreatRoleManagementView.vue';
import AcceptInvitationView from '../views/AcceptInvitationView.vue';
import TelemetryDashboardView from '../views/TelemetryDashboardView.vue';
import RetreatFlyerView from '../views/RetreatFlyerView.vue';
import HelpView from '../views/HelpView.vue';
import { useAuthStore } from '@/stores/authStore';
import { useRetreatStore } from '@/stores/retreatStore';

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
			component: AppLayout,
			meta: { requiresAuth: true },
			children: [
				{
					path: '',
					name: 'home',
					component: WalkersView, // Default component for '/'
				},
				{
					path: 'walkers',
					name: 'walkers',
					component: WalkersView,
				},
				{
					path: 'servers',
					name: 'servers',
					component: ServersView,
				},
				{
					path: 'partial-servers',
					name: 'partial-servers',
					component: PartialServerView,
				},
				{
					path: 'tables',
					name: 'tables',
					component: TablesView,
				},
				{
					path: 'walker-badges',
					name: 'walker-badges',
					component: BadgesView,
				},
				{
					path: 'palancas',
					name: 'palancas',
					component: PalancasView,
				},
				{
					path: 'payments',
					name: 'payments',
					component: PaymentsView,
				},
				{
					path: 'notes-and-meeting-points',
					name: 'notes-and-meeting-points',
					component: NotesAndMeetingPointsView,
				},
				{
					path: 'rooms',
					name: 'rooms',
					component: RoomsView,
				},
				{
					path: 'user-type-and-table',
					name: 'user-type-and-table',
					component: UserTypeAndTableView,
				},
				{
					path: 'food',
					name: 'food',
					component: FoodView,
				},
				{
					path: 'cancellation-and-notes',
					name: 'cancellation-and-notes',
					component: CancellationAndNotesView,
				},
				{
					path: 'waiting-list',
					name: 'waiting-list',
					component: WaitingListView,
				},
				{
					path: 'bags-report',
					name: 'bags-report',
					component: BagsReportView,
				},
				{
					path: 'medicines-report',
					name: 'medicines-report',
					component: MedicinesReportView,
				},
				{
					path: 'canceled',
					name: 'canceled',
					component: CanceledView,
				},
				{
					path: 'houses',
					name: 'houses',
					component: HousesView,
				},
				{
					path: 'retreats/:id/dashboard',
					name: 'retreat-dashboard',
					component: RetreatDashboardView,
					props: true,
				},
				{
					path: 'retreats/:id/flyer',
					name: 'retreat-flyer',
					component: RetreatFlyerView,
					props: true,
				},
				{
					path: 'retreats/:id/bed-assignments',
					name: 'bed-assignments',
					component: BedAssignmentsView,
					props: true,
				},
				{
					path: 'retreats/:id/responsibilities',
					name: 'responsibilities',
					component: () => import('../views/ResponsabilitiesView.vue'),
					props: true,
				},
				{
					path: 'retreats/:id/inventory',
					name: 'inventory',
					component: InventoryView,
					props: true,
				},
				{
					path: 'settings/inventory-items',
					name: 'inventory-items',
					component: InventoryItemsView,
				},
				{
					path: 'settings/message-templates',
					name: 'message-templates',
					component: MessageTemplatesView,
				},
				{
					path: 'settings/global-message-templates',
					name: 'global-message-templates',
					component: GlobalMessageTemplatesView,
				},
				{
					path: 'retreats/:id/role-management',
					name: 'role-management',
					component: RetreatRoleManagementView,
					props: true,
				},
				{
					path: 'telemetry',
					name: 'telemetry',
					component: TelemetryDashboardView,
					meta: { requiresSuperadmin: true },
				},
				{
					path: 'help',
					name: 'help',
					component: HelpView,
				},
				{
					path: 'help/:section',
					name: 'help-section',
					component: HelpView,
					props: true,
				},
				// Community Routes
				{
					path: 'communities',
					name: 'communities',
					component: () => import('../views/CommunityListView.vue'),
				},
				{
					path: 'communities/:id',
					name: 'community-dashboard',
					component: () => import('../views/CommunityDashboardView.vue'),
					props: true,
				},
				{
					path: 'communities/:id/members',
					name: 'community-members',
					component: () => import('../views/CommunityMembersView.vue'),
					props: true,
				},
				{
					path: 'communities/:id/meetings',
					name: 'community-meetings',
					component: () => import('../views/CommunityMeetingsView.vue'),
					props: true,
				},
				{
					path: 'communities/:id/meetings/:meetingId/flyer',
					name: 'community-meeting-flyer',
					component: () => import('../views/CommunityMeetingFlyerView.vue'),
					props: true,
				},
				{
					path: 'communities/:id/attendance/:meetingId',
					name: 'community-attendance',
					component: () => import('../views/CommunityAttendanceView.vue'),
					props: true,
				},
				{
					path: 'communities/:id/admins',
					name: 'community-admins',
					component: () => import('../views/CommunityAdminsView.vue'),
					props: true,
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
		next({ name: 'walkers' });
		return;
	}

	if (to.name === 'home' && auth.isAuthenticated) {
		// New logic for root path redirection - only redirect if route name is 'home'
		// This prevents infinite redirects when navigating to other routes
		const retreatStore = useRetreatStore();
		try {
			await retreatStore.fetchRetreats();
		} catch (error) {
			console.error('Failed to fetch retreats during root path redirect:', error);
			// Fallback if fetching retreats fails - let the route render normally
			next();
			return;
		}

		if (retreatStore.retreats.length > 0 && retreatStore.selectedRetreatId) {
			// Only redirect to dashboard if we have retreats and a selected retreat
			next({ name: 'retreat-dashboard', params: { id: retreatStore.selectedRetreatId } });
			return;
		}

		// Fallback to walkers if no retreats or no selected retreat
		next({ name: 'walkers' });
		return;
	}

	next();
});

export default router;
