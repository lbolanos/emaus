<template>
  <div class="accept-invitation-container">
    <div class="background-decoration">
      <div class="decoration-circle circle-1"></div>
      <div class="decoration-circle circle-2"></div>
      <div class="decoration-circle circle-3"></div>
    </div>

    <div class="invitation-card">
      <!-- Logo/Header -->
      <div class="logo-section">
        <div class="logo-icon">
          <svg width="60" height="60" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <h1 class="app-title">Emaús</h1>
        <p class="app-subtitle">Sistema de Gestión de Retiros</p>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="loading-section">
        <div class="loading-animation">
          <div class="spinner"></div>
          <div class="loading-dots">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
        <h3>Verificando tu invitación</h3>
        <p>Por favor, espera un momento...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="error-section">
        <div class="error-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
            <line x1="15" y1="9" x2="9" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <line x1="9" y1="9" x2="15" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </div>
        <h2>Invitación Inválida</h2>
        <p>{{ error }}</p>
        <button class="btn btn-primary" @click="goToLogin">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M15 3H19C20.1046 3 21 3.89543 21 5V19C21 20.1046 20.1046 21 19 21H15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M10 17L15 12L10 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <line x1="15" y1="12" x2="3" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          Ir al Inicio de Sesión
        </button>
      </div>

      <!-- Not Authenticated State -->
      <div v-else-if="!isAuthenticated" class="auth-required-section">
        <div class="info-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M16 21V19C16 17.9391 15.5786 16.9217 14.8284 16.1716C14.0783 15.4214 13.0609 15 12 15H8C6.93913 15 5.92172 15.4214 5.17157 16.1716C4.42143 16.9217 4 17.9391 4 19V21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="10" cy="7" r="4" stroke="currentColor" stroke-width="2"/>
          </svg>
        </div>
        <h2>Inicia Sesión para Continuar</h2>
        <p class="invitation-description">Debes iniciar sesión para aceptar la invitación como administrador de la comunidad.</p>

        <div class="invitation-details">
          <div class="detail-card">
            <div class="detail-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M17 21V19C17 17.9391 16.5786 16.9217 15.8284 16.1716C15.0783 15.4214 14.0609 15 13 15H5C3.93913 15 2.92172 15.4214 2.17157 16.1716C1.42143 16.9217 1 17.9391 1 19V21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <circle cx="9" cy="7" r="4" stroke="currentColor" stroke-width="2"/>
                <path d="M23 21V19C22.9993 18.1137 22.7044 17.2528 22.1614 16.5523C21.6184 15.8519 20.8581 15.3516 20 15.13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M16 3.13C16.8604 3.35031 17.623 3.85071 18.1676 4.55232C18.7122 5.25392 19.0078 6.11683 19.0078 7.005C19.0078 7.89318 18.7122 8.75608 18.1676 9.45769C17.623 10.1593 16.8604 10.6597 16 10.88" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <div class="detail-content">
              <label>Comunidad</label>
              <p>{{ invitationData?.community?.name || 'Cargando...' }}</p>
            </div>
          </div>

          <div class="detail-card">
            <div class="detail-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 4H20C21.1 4 22 4.9 22 6V18C22 19.1 21.1 20 20 20H4C2.9 20 2 19.1 2 18V6C2 4.9 2.9 4 4 4Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <polyline points="22,6 12,13 2,6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <div class="detail-content">
              <label>Correo Electrónico</label>
              <p>{{ invitationData?.user?.email || 'Cargando...' }}</p>
            </div>
          </div>
        </div>

        <div class="action-buttons">
          <button class="btn btn-primary btn-large" @click="goToLoginWithToken">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M15 3H19C20.1046 3 21 3.89543 21 5V19C21 20.1046 20.1046 21 19 21H15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M10 17L15 12L10 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <line x1="15" y1="12" x2="3" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            Iniciar Sesión
          </button>
        </div>
      </div>

      <!-- Invitation Info & Accept -->
      <div v-else-if="invitationData && !accepted" class="invitation-info-section">
        <div class="success-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M22 11.08V12C21.9988 14.1564 21.3005 16.2547 20.0093 17.9818C18.7182 19.709 16.9033 20.9725 14.8354 21.5839C12.7674 22.1953 10.5573 22.1219 8.53447 21.3746C6.51168 20.6273 4.78465 19.2461 3.61096 17.4371C2.43727 15.628 1.87979 13.4881 2.02168 11.3363C2.16356 9.18455 2.99721 7.13631 4.39828 5.49706C5.79935 3.85781 7.69279 2.71537 9.79619 2.24013C11.8996 1.7649 14.1003 1.98232 16.07 2.86" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M22 4L12 14.01L9 11.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <h2>¡Invitación a Administrador de Comunidad!</h2>
        <p class="invitation-description">Has sido invitado a ser administrador de la comunidad <strong>{{ invitationData.community.name }}</strong>.</p>

        <div class="invitation-details">
          <div class="detail-card">
            <div class="detail-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M17 21V19C17 17.9391 16.5786 16.9217 15.8284 16.1716C15.0783 15.4214 14.0609 15 13 15H5C3.93913 15 2.92172 15.4214 2.17157 16.1716C1.42143 16.9217 1 17.9391 1 19V21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <circle cx="9" cy="7" r="4" stroke="currentColor" stroke-width="2"/>
                <path d="M23 21V19C22.9993 18.1137 22.7044 17.2528 22.1614 16.5523C21.6184 15.8519 20.8581 15.3516 20 15.13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M16 3.13C16.8604 3.35031 17.623 3.85071 18.1676 4.55232C18.7122 5.25392 19.0078 6.11683 19.0078 7.005C19.0078 7.89318 18.7122 8.75608 18.1676 9.45769C17.623 10.1593 16.8604 10.6597 16 10.88" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <div class="detail-content">
              <label>Comunidad</label>
              <p>{{ invitationData.community.name }}</p>
            </div>
          </div>

          <div class="detail-card">
            <div class="detail-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 4H20C21.1 4 22 4.9 22 6V18C22 19.1 21.1 20 20 20H4C2.9 20 2 19.1 2 18V6C2 4.9 2.9 4 4 4Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <polyline points="22,6 12,13 2,6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <div class="detail-content">
              <label>Tu Cuenta</label>
              <p>{{ invitationData.user.email }}</p>
            </div>
          </div>

          <div class="detail-card">
            <div class="detail-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                <polyline points="12,6 12,12 16,14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <div class="detail-content">
              <label>Expira</label>
              <p>{{ invitationData.invitationExpiresAt ? formatDate(invitationData.invitationExpiresAt) : 'Cargando...' }}</p>
            </div>
          </div>
        </div>

        <div v-if="formError" class="alert alert-error">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
            <line x1="12" y1="8" x2="12" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <line x1="12" y1="16" x2="12.01" y2="16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          {{ formError }}
        </div>

        <div class="action-buttons">
          <button class="btn btn-primary btn-large" @click="acceptInvitation" :disabled="isSubmitting">
            <div v-if="isSubmitting" class="btn-spinner"></div>
            <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M16 21V5C16 4.46957 15.7893 3.96086 15.4142 3.58579C15.0391 3.21071 14.5304 3 14 3H10C9.46957 3 8.96086 3.21071 8.58579 3.58579C8.21071 3.21071 8 4.46957 8 5V21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M3 21H21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M12 11V15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M10 13H14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            {{ isSubmitting ? 'Procesando...' : 'Aceptar Invitación' }}
          </button>

          <button class="btn btn-secondary btn-large" @click="goToDashboard">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 9L12 2L21 9V20C21 20.5304 20.7893 21.0391 20.4142 21.4142C20.0391 21.7893 19.5304 22 19 22H5C4.46957 22 3.96086 21.7893 3.58579 21.4142C3.21071 21.0391 3 20.5304 3 20V9Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <polyline points="9,22 9,12 15,12 15,22" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Ir al Panel Principal
          </button>
        </div>
      </div>

      <!-- Success State -->
      <div v-else-if="accepted" class="success-section">
        <div class="success-icon">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M22 11.08V12C21.9988 14.1564 21.3005 16.2547 20.0093 17.9818C18.7182 19.709 16.9033 20.9725 14.8354 21.5839C12.7674 22.1953 10.5573 22.1219 8.53447 21.3746C6.51168 20.6273 4.78465 19.2461 3.61096 17.4371C2.43727 15.628 1.87979 13.4881 2.02168 11.3363C2.16356 9.18455 2.99721 7.13631 4.39828 5.49706C5.79935 3.85781 7.69279 2.71537 9.79619 2.24013C11.8996 1.7649 14.1003 1.98232 16.07 2.86" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M22 4L12 14.01L9 11.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <h2>¡Invitación Aceptada!</h2>
        <p class="invitation-description">Ahora eres administrador de la comunidad <strong>{{ invitationData?.community?.name }}</strong>.</p>

        <div class="action-buttons">
          <button class="btn btn-primary btn-large" @click="goToCommunity">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M17 21V19C17 17.9391 16.5786 16.9217 15.8284 16.1716C15.0783 15.4214 14.0609 15 13 15H5C3.93913 15 2.92172 15.4214 2.17157 16.1716C1.42143 16.9217 1 17.9391 1 19V21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <circle cx="9" cy="7" r="4" stroke="currentColor" stroke-width="2"/>
              <path d="M23 21V19C22.9993 18.1137 22.7044 17.2528 22.1614 16.5523C21.6184 15.8519 20.8581 15.3516 20 15.13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M16 3.13C16.8604 3.35031 17.623 3.85071 18.1676 4.55232C18.7122 5.25392 19.0078 6.11683 19.0078 7.005C19.0078 7.89318 18.7122 8.75608 18.1676 9.45769C17.623 10.1593 16.8604 10.6597 16 10.88" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Ir a la Comunidad
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Community Admin Invitation Acceptance Page
 *
 * PURPOSE:
 * This page handles the acceptance of community admin invitations. When an existing user is invited
 * to become a co-administrator of a community, they receive an invitation link that leads to this page.
 *
 * INVITATION FLOW:
 * 1. Invitation Creation:
 *    - An existing community admin uses the "Invite Admin" button in CommunityAdminsView
 *    - The system creates a CommunityAdmin record with status='pending' and generates a unique token
 *    - The token expires after 7 days
 *    - The system returns an invitation link like: /accept-community-invitation/{token}
 *
 * 2. Invitation Link Access:
 *    - The invited user clicks the link or pastes it into their browser
 *    - This component mounts and receives the token from the URL
 *
 * 3. Validation Process (validateInvitation):
 *    - Calls checkAuthStatus() to see if user is logged in (non-blocking)
 *    - Calls GET /api/communities/invitations/status/{token}
 *    - Backend checks if token exists, is pending, and hasn't expired
 *    - Returns { valid: true, community: {...}, user: {...}, invitationExpiresAt: date }
 *
 * 4. User States:
 *    a) NOT AUTHENTICATED:
 *       - Shows login prompt with community and email info
 *       - "Iniciar Sesión" button stores token in sessionStorage and redirects to login
 *       - After login, user should return to this page with the token
 *
 *    b) AUTHENTICATED + VALID TOKEN:
 *       - Shows invitation details (community, email, expiration)
 *       - "Aceptar Invitación" button processes the acceptance
 *
 *    c) ERROR STATES:
 *       - Invalid/expired token: Shows error message
 *       - Token not found: Shows error message
 *       - API errors: Shows appropriate error message
 *
 * 5. Acceptance Process (acceptInvitation):
 *    - Calls POST /api/communities/invitations/accept with { token }
 *    - Backend validates:
 *      - User is authenticated
 *      - Token matches a pending invitation for this user
 *      - Token hasn't expired
 *    - Backend updates CommunityAdmin record: status='active', acceptedAt=now
 *    - Backend invalidates user's permission cache
 *    - Shows success message and redirects to community dashboard after 2 seconds
 *
 * 6. Post-Acceptance:
 *    - User is now an active community admin
 *    - Community appears in sidebar under "Comunidades"
 *    - User can access all community features they're authorized for
 *
 * SECURITY NOTES:
 * - User MUST already exist in the system (unlike retreat invitations which create users)
 * - Tokens are single-use and expire after acceptance
 * - Token expires 7 days after creation
 * - Only the invited user can accept (email must match)
 *
 * ROUTE: /accept-community-invitation/:token
 * API ENDPOINTS:
 * - GET /api/communities/invitations/status/:token (public)
 * - POST /api/communities/invitations/accept (requires auth)
 */
import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getCommunityInvitationStatus, acceptCommunityInvitation } from '@/services/api';
import { getRecaptchaToken, RECAPTCHA_ACTIONS } from '@/services/recaptcha';
import { formatDate } from '@repo/utils';
import { useAuthStore } from '@/stores/authStore';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const loading = ref(true);
const error = ref('');
const invitationData = ref<any>(null);
const isSubmitting = ref(false);
const formError = ref('');
const accepted = ref(false);

const token = route.params.token as string;

// Check if user is authenticated
const isAuthenticated = computed(() => authStore.isAuthenticated);

const goToLogin = () => {
  router.push('/login');
};

const goToLoginWithToken = () => {
  // Store token for redirect after login
  sessionStorage.setItem('communityInviteToken', token);
  router.push({ path: '/login', query: { redirect: route.fullPath } });
};

const goToDashboard = () => {
  router.push('/dashboard');
};

const goToCommunity = () => {
  if (invitationData.value?.community?.id) {
    router.push(`/communities/${invitationData.value.community.id}`);
  } else {
    router.push('/dashboard');
  }
};

const validateInvitation = async () => {
  try {
    // Check auth status first (non-blocking)
    await authStore.checkAuthStatus();

    const response = await getCommunityInvitationStatus(token);

    if (response && response.valid) {
      invitationData.value = response;
    } else {
      error.value = response?.message || 'Invitación no válida o expirada';
    }
  } catch (err: any) {
    console.error('Error validating community invitation:', err);
    // Check if it's an axios error with a response message
    if (err.response?.data?.message) {
      error.value = err.response.data.message;
    } else if (err.message) {
      error.value = 'Error al verificar la invitación';
    } else {
      error.value = 'Invitación no válida o expirada';
    }
  } finally {
    loading.value = false;
  }
};

const acceptInvitation = async () => {
  try {
    formError.value = '';
    isSubmitting.value = true;

    // Get reCAPTCHA token for bot protection
    const recaptchaToken = await getRecaptchaToken(RECAPTCHA_ACTIONS.COMMUNITY_INVITATION_ACCEPT);

    await acceptCommunityInvitation(token, recaptchaToken);

    accepted.value = true;

    // Redirect to community after successful acceptance
    setTimeout(() => {
      goToCommunity();
    }, 2000);
  } catch (err: any) {
    formError.value = 'Error al aceptar la invitación';
    console.error('Error accepting community invitation:', err);
    if (err.response?.data?.message) {
      formError.value = err.response.data.message;
    }
  } finally {
    isSubmitting.value = false;
  }
};

onMounted(() => {
  validateInvitation();
});
</script>

<style scoped>
.accept-invitation-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 1rem;
  position: relative;
  overflow: hidden;
}

/* Background decorations */
.background-decoration {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 0;
}

.decoration-circle {
  position: absolute;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  animation: float 6s ease-in-out infinite;
}

.circle-1 {
  width: 200px;
  height: 200px;
  top: 10%;
  left: 10%;
  animation-delay: 0s;
}

.circle-2 {
  width: 150px;
  height: 150px;
  top: 70%;
  right: 10%;
  animation-delay: 2s;
}

.circle-3 {
  width: 100px;
  height: 100px;
  bottom: 20%;
  left: 50%;
  animation-delay: 4s;
}

@keyframes float {
  0%, 100% { transform: translateY(0px) rotate(0deg); }
  50% { transform: translateY(-20px) rotate(180deg); }
}

/* Main card */
.invitation-card {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 20px;
  padding: 0;
  width: 100%;
  max-width: 520px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(255, 255, 255, 0.2);
  position: relative;
  z-index: 1;
  overflow: hidden;
}

/* Logo section */
.logo-section {
  text-align: center;
  padding: 2.5rem 2rem 1.5rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.logo-icon {
  margin-bottom: 1rem;
  color: white;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.05); opacity: 0.9; }
}

.app-title {
  font-size: 2rem;
  font-weight: 700;
  margin: 0 0 0.5rem;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.app-subtitle {
  font-size: 0.95rem;
  opacity: 0.9;
  margin: 0;
  font-weight: 400;
}

/* Content sections */
.loading-section,
.error-section,
.auth-required-section,
.invitation-info-section,
.success-section {
  padding: 2.5rem 2rem;
  text-align: center;
}

/* Loading animation */
.loading-animation {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  margin-bottom: 2rem;
}

.spinner {
  border: 3px solid rgba(102, 126, 234, 0.2);
  border-top: 3px solid #667eea;
  border-radius: 50%;
  width: 50px;
  height: 50px;
  animation: spin 1s linear infinite;
}

.loading-dots {
  display: flex;
  gap: 0.5rem;
}

.loading-dots span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #667eea;
  animation: bounce 1.4s ease-in-out infinite both;
}

.loading-dots span:nth-child(1) { animation-delay: -0.32s; }
.loading-dots span:nth-child(2) { animation-delay: -0.16s; }

@keyframes bounce {
  0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; }
  40% { transform: scale(1); opacity: 1; }
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* Icons */
.error-icon, .info-icon, .success-icon {
  margin-bottom: 1.5rem;
  animation: iconAppear 0.6s ease-out;
}

.error-icon { color: #ef4444; }
.info-icon { color: #667eea; }
.success-icon { color: #10b981; }

@keyframes iconAppear {
  0% { transform: scale(0); opacity: 0; }
  50% { transform: scale(1.1); }
  100% { transform: scale(1); opacity: 1; }
}

.error-section h2,
.auth-required-section h2,
.invitation-info-section h2,
.success-section h2 {
  color: #1f2937;
  margin-bottom: 1rem;
  font-size: 1.5rem;
  font-weight: 600;
}

.error-section p,
.invitation-description {
  color: #6b7280;
  margin-bottom: 2rem;
  line-height: 1.6;
}

/* Invitation details */
.invitation-details {
  margin: 2rem 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.detail-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 1.25rem;
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  transition: all 0.3s ease;
}

.detail-card:hover {
  background: #f1f5f9;
  border-color: #cbd5e1;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

.detail-icon {
  color: #667eea;
  flex-shrink: 0;
  margin-top: 2px;
}

.detail-content {
  flex: 1;
  text-align: left;
}

.detail-content label {
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
  display: block;
  margin-bottom: 0.5rem;
}

.detail-content p {
  color: #1f2937;
  margin: 0;
  font-weight: 500;
}

/* Alerts */
.alert {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  border-radius: 10px;
  margin-bottom: 1.5rem;
  font-size: 0.95rem;
  font-weight: 500;
  animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
  from { transform: translateY(-10px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.alert-error {
  background: #fef2f2;
  color: #dc2626;
  border: 1px solid #fecaca;
}

/* Action buttons container */
.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 2rem;
}

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 2rem;
  border: none;
  border-radius: 10px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  text-decoration: none;
  text-align: center;
  justify-content: center;
  min-height: 48px;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
}

.btn-primary:active:not(:disabled) {
  transform: translateY(0);
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.95);
  color: #667eea;
  border: 2px solid #667eea;
  backdrop-filter: blur(10px);
}

.btn-secondary:hover:not(:disabled) {
  background: #667eea;
  color: white;
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.3);
}

.btn-secondary:active:not(:disabled) {
  transform: translateY(0);
}

.btn-large {
  width: 100%;
  font-size: 1.1rem;
  padding: 1.125rem 2rem;
}

.btn-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top: 2px solid white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

/* Responsive design */
@media (max-width: 640px) {
  .accept-invitation-container {
    padding: 0.5rem;
  }

  .invitation-card {
    max-width: 100%;
    border-radius: 16px;
  }

  .logo-section {
    padding: 2rem 1.5rem 1rem;
  }

  .app-title {
    font-size: 1.75rem;
  }

  .loading-section,
  .error-section,
  .auth-required-section,
  .invitation-info-section,
  .success-section {
    padding: 2rem 1.5rem;
  }

  .detail-card {
    padding: 1rem;
  }

  .btn {
    padding: 0.875rem 1.5rem;
  }
}
</style>
