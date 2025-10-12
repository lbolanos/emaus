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
import MessageTemplatesView from '../views/MessageTemplatesView.vue';
import GlobalMessageTemplatesView from '../views/GlobalMessageTemplatesView.vue';
import InventoryView from '../views/InventoryView.vue';
import InventoryItemsView from '../views/InventoryItemsView.vue';
import RetreatRoleManagementView from '../views/RetreatRoleManagementView.vue';
import AcceptInvitationView from '../views/AcceptInvitationView.vue';
import { useAuthStore } from '@/stores/authStore';
import { useRetreatStore } from '@/stores/retreatStore';

const router = createRouter({
	history: createWebHistory(import.meta.env.BASE_URL),
	routes: [
		{
			path: '/login',
			name: 'login',
			component: LoginView,
		},
		{
			path: '/request-password-reset',
			name: 'request-password-reset',
			component: RequestPasswordResetView,
		},
		{
			path: '/reset-password',
			name: 'reset-password',
			component: ResetPasswordView,
		},
		{
			path: '/register/:type/:retreatId',
			name: 'registration',
			component: ParticipantRegistrationView,
			props: true,
		},
		{
			path: '/accept-invitation/:token',
			name: 'accept-invitation',
			component: AcceptInvitationView,
			props: true,
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
			],
		},
	],
});

router.beforeEach(async (to, from, next) => {
	const auth = useAuthStore();
	// Ensure auth status is checked before any navigation
	if (!auth.isAuthenticated) {
		await auth.checkAuthStatus();
	}

	const requiresAuth = to.matched.some((record) => record.meta.requiresAuth);

	if (requiresAuth && !auth.isAuthenticated) {
		next({ name: 'login' });
	} else if (to.name === 'login' && auth.isAuthenticated) {
		next({ name: 'home' });
	} else if (to.path === '/' && auth.isAuthenticated) {
		// New logic for root path redirection
		const retreatStore = useRetreatStore();
		try {
			await retreatStore.fetchRetreats();
		} catch (error) {
			console.error('Failed to fetch retreats during root path redirect:', error);
			// Fallback if fetching retreats fails
			next({ name: 'walkers' });
			return;
		}

		if (retreatStore.retreats.length > 0) {
			if (!retreatStore.selectedRetreatId) {
				retreatStore.selectedRetreatId = retreatStore.retreats[0].id;
			}
			next({ name: 'retreat-dashboard', params: { id: retreatStore.selectedRetreatId } });
		} else {
			next({ name: 'walkers' });
		}
	} else {
		next();
	}
});

export default router;
