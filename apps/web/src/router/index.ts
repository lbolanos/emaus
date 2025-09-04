import { createRouter, createWebHistory } from 'vue-router';
import AppLayout from '@/layouts/AppLayout.vue';
import WalkersView from '../views/WalkersView.vue';
import ServersView from '../views/ServersView.vue';
import CanceledView from '../views/CanceledView.vue';
import HousesView from '../views/HousesView.vue';
import LoginView from '../views/LoginView.vue';
import RequestPasswordResetView from '../views/RequestPasswordResetView.vue';
import ResetPasswordView from '../views/ResetPasswordView.vue';
import ParticipantRegistrationView from '../views/ParticipantRegistrationView.vue';
import RetreatDashboardView from '../views/RetreatDashboardView.vue';
import BedAssignmentsView from '../views/BedAssignmentsView.vue';
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
  } else if (to.path === '/' && auth.isAuthenticated) { // New logic for root path redirection
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