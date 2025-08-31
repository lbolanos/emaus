import { createRouter, createWebHistory } from 'vue-router';
import AppLayout from '@/layouts/AppLayout.vue';
import WalkersView from '../views/WalkersView.vue';
import LoginView from '../views/LoginView.vue';
import RequestPasswordResetView from '../views/RequestPasswordResetView.vue';
import ResetPasswordView from '../views/ResetPasswordView.vue';
import WalkerRegistrationView from '../views/WalkerRegistrationView.vue';
import ServerRegistrationView from '../views/ServerRegistrationView.vue';
import { useAuthStore } from '@/stores/authStore';

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
      path: '/retreat/:retreatId/walker-registration',
      name: 'walker-registration',
      component: WalkerRegistrationView,
    },
    {
      path: '/retreat/:retreatId/server-registration',
      name: 'server-registration',
      component: ServerRegistrationView,
    },
    {
      path: '/',
      component: AppLayout,
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          name: 'walkers',
          component: WalkersView,
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
    next({ name: 'walkers' });
  } else {
    next();
  }
});

export default router