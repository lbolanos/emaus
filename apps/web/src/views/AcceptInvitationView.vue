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

      <!-- Invitation Info -->
      <div v-else-if="invitationData && !showForm" class="invitation-info-section">
        <div class="success-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M22 11.08V12C21.9988 14.1564 21.3005 16.2547 20.0093 17.9818C18.7182 19.709 16.9033 20.9725 14.8354 21.5839C12.7674 22.1953 10.5573 22.1219 8.53447 21.3746C6.51168 20.6273 4.78465 19.2461 3.61096 17.4371C2.43727 15.628 1.87979 13.4881 2.02168 11.3363C2.16356 9.18455 2.99721 7.13631 4.39828 5.49706C5.79935 3.85781 7.69279 2.71537 9.79619 2.24013C11.8996 1.7649 14.1003 1.98232 16.07 2.86" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M22 4L12 14.01L9 11.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <h2>¡Has sido invitado a unirte a Emaús!</h2>
        <p class="invitation-description">Estás a un paso de ser parte de nuestra comunidad. Revisa los detalles de tu invitación a continuación.</p>
        
        <div class="invitation-details">
          <div class="detail-card">
            <div class="detail-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 4H20C21.1 4 22 4.9 22 6V18C22 19.1 21.1 20 20 20H4C2.9 20 2 19.1 2 18V6C2 4.9 2.9 4 4 4Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <polyline points="22,6 12,13 2,6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <div class="detail-content">
              <label>Correo Electrónico</label>
              <p>{{ invitationData.user.email }}</p>
            </div>
          </div>

          <div class="detail-card" v-if="invitationData.retreats && invitationData.retreats.length > 0">
            <div class="detail-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 9L12 2L21 9V20C21 20.5304 20.7893 21.0391 20.4142 21.4142C20.0391 21.7893 19.5304 22 19 22H5C4.46957 22 3.96086 21.7893 3.58579 21.4142C3.21071 21.0391 3 20.5304 3 20V9Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <polyline points="9,22 9,12 15,12 15,22" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <div class="detail-content">
              <label>Retiros Asignados</label>
              <div class="retreats-list">
                <div v-for="retreat in invitationData.retreats" :key="retreat.id" class="retreat-item">
                  <strong>{{ retreat.parish }}</strong>
                  <span class="retreat-dates">{{ formatDate(retreat.startDate) }} - {{ formatDate(retreat.endDate) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="action-buttons">
          <button class="btn btn-primary btn-large" @click="showForm = true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M16 21V5C16 4.46957 15.7893 3.96086 15.4142 3.58579C15.0391 3.21071 14.5304 3 14 3H10C9.46957 3 8.96086 3.21071 8.58579 3.58579C8.21071 3.96086 8 4.46957 8 5V21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M3 21H21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M12 11V15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M10 13H14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Aceptar Invitación
          </button>

          <button class="btn btn-secondary btn-large" @click="goToLogin">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M15 3H19C20.1046 3 21 3.89543 21 5V19C21 20.1046 20.1046 21 19 21H15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M10 17L15 12L10 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <line x1="15" y1="12" x2="3" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            Ir al Inicio de Sesión
          </button>
        </div>
      </div>

      <!-- Registration Form -->
      <div v-else-if="showForm" class="form-section">
        <div class="form-header">
          <h2>Completa tu Registro</h2>
          <p>Crea tu cuenta para acceder al sistema</p>
        </div>

        <form @submit.prevent="acceptInvitation" class="registration-form">
          <div class="form-group">
            <label for="displayName">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 21V19C20 17.9391 19.5786 16.9217 18.8284 16.1716C18.0783 15.4214 17.0609 15 16 15H8C6.93913 15 5.92172 15.4214 5.17157 16.1716C4.42143 16.9217 4 17.9391 4 19V21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <circle cx="12" cy="7" r="4" stroke="currentColor" stroke-width="2"/>
              </svg>
              Nombre Completo
            </label>
            <input
              id="displayName"
              v-model="formData.displayName"
              type="text"
              class="form-control"
              required
              placeholder="Ingresa tu nombre completo"
            />
          </div>

          <div class="form-group">
            <label for="password">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" stroke="currentColor" stroke-width="2"/>
                <path d="M7 11V7C7 5.67392 7.52678 4.40215 8.46447 3.46447C9.40215 2.52678 10.6739 2 12 2C13.3261 2 14.5979 2.52678 15.5355 3.46447C16.4732 4.40215 17 5.67392 17 7V11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Contraseña
            </label>
            <input
              id="password"
              v-model="formData.password"
              type="password"
              class="form-control"
              required
              minlength="6"
              placeholder="Mínimo 6 caracteres"
            />
          </div>

          <div class="form-group">
            <label for="confirmPassword">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" stroke="currentColor" stroke-width="2"/>
                <path d="M7 11V7C7 5.67392 7.52678 4.40215 8.46447 3.46447C9.40215 2.52678 10.6739 2 12 2C13.3261 2 14.5979 2.52678 15.5355 3.46447C16.4732 4.40215 17 5.67392 17 7V11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Confirmar Contraseña
            </label>
            <input
              id="confirmPassword"
              v-model="formData.confirmPassword"
              type="password"
              class="form-control"
              required
              minlength="6"
              placeholder="Confirma tu contraseña"
            />
          </div>

          <div v-if="formError" class="alert alert-error">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
              <line x1="12" y1="8" x2="12" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              <line x1="12" y1="16" x2="12.01" y2="16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            {{ formError }}
          </div>

          <div v-if="formSuccess" class="alert alert-success">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M22 11.08V12C21.9988 14.1564 21.3005 16.2547 20.0093 17.9818C18.7182 19.709 16.9033 20.9725 14.8354 21.5839C12.7674 22.1953 10.5573 22.1219 8.53447 21.3746C6.51168 20.6273 4.78465 19.2461 3.61096 17.4371C2.43727 15.628 1.87979 13.4881 2.02168 11.3363C2.16356 9.18455 2.99721 7.13631 4.39828 5.49706C5.79935 3.85781 7.69279 2.71537 9.79619 2.24013C11.8996 1.7649 14.1003 1.98232 16.07 2.86" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M22 4L12 14.01L9 11.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            {{ formSuccess }}
          </div>

          <button type="submit" class="btn btn-primary btn-large" :disabled="isSubmitting">
            <div v-if="isSubmitting" class="btn-spinner"></div>
            <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M16 21V5C16 4.46957 15.7893 3.96086 15.4142 3.58579C15.0391 3.21071 14.5304 3 14 3H10C9.46957 3 8.96086 3.21071 8.58579 3.58579C8.21071 3.96086 8 4.46957 8 5V21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M3 21H21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M12 11V15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M10 13H14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            {{ isSubmitting ? 'Procesando...' : 'Aceptar Invitación' }}
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/services/api';
import { formatDate } from '@repo/utils';

const route = useRoute();
const router = useRouter();

const loading = ref(true);
const error = ref('');
const invitationData = ref<any>(null);
const showForm = ref(false);
const isSubmitting = ref(false);
const formError = ref('');
const formSuccess = ref('');

const formData = ref({
  displayName: '',
  password: '',
  confirmPassword: '',
});

const token = route.params.token as string;

const goToLogin = () => {
  router.push('/login');
};

const validateInvitation = async () => {
  try {
    const response = await api.get(`/invitations/status/${token}`);

    if (response.data.valid) {
      invitationData.value = response.data;
    } else {
      error.value = response.data.message || 'Invitación no válida o expirada';
    }
  } catch (err: any) {
    error.value = 'Error al verificar la invitación';
    console.error('Error validating invitation:', err);
    if (err.response?.data?.message) {
      error.value = err.response.data.message;
    }
  } finally {
    loading.value = false;
  }
};

const acceptInvitation = async () => {
  try {
    formError.value = '';
    formSuccess.value = '';

    if (formData.value.password !== formData.value.confirmPassword) {
      formError.value = 'Las contraseñas no coinciden';
      return;
    }

    if (formData.value.password.length < 6) {
      formError.value = 'La contraseña debe tener al menos 6 caracteres';
      return;
    }

    isSubmitting.value = true;

    const response = await api.post(`/invitations/${invitationData.value.user.id}/accept`, {
      displayName: formData.value.displayName,
      password: formData.value.password,
    });

    if (response.data.success) {
      formSuccess.value = '¡Invitación aceptada exitosamente!';

      // Redirect to login after successful acceptance
      setTimeout(() => {
        router.push('/login');
      }, 2000);
    } else {
      formError.value = response.data.message || 'Error al aceptar la invitación';
    }
  } catch (err: any) {
    formError.value = 'Error de conexión. Por favor intente nuevamente.';
    console.error('Error accepting invitation:', err);
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
.invitation-info-section,
.form-section {
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

/* Error section */
.error-section {
  color: #374151;
}

.error-icon {
  color: #ef4444;
  margin-bottom: 1.5rem;
  animation: shake 0.5s ease-in-out;
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-5px); }
  75% { transform: translateX(5px); }
}

.error-section h2 {
  color: #1f2937;
  margin-bottom: 1rem;
  font-size: 1.5rem;
  font-weight: 600;
}

.error-section p {
  color: #6b7280;
  margin-bottom: 2rem;
  line-height: 1.6;
}

/* Success section */
.invitation-info-section h2 {
  color: #1f2937;
  margin-bottom: 1rem;
  font-size: 1.5rem;
  font-weight: 600;
}

.success-icon {
  color: #10b981;
  margin-bottom: 1.5rem;
  animation: checkmark 0.6s ease-in-out;
}

@keyframes checkmark {
  0% { transform: scale(0) rotate(-45deg); }
  50% { transform: scale(1.2) rotate(-45deg); }
  100% { transform: scale(1) rotate(0deg); }
}

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

.retreats-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.retreat-item {
  background: white;
  padding: 0.75rem;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
}

.retreat-item strong {
  display: block;
  color: #1f2937;
  margin-bottom: 0.25rem;
}

.retreat-dates {
  font-size: 0.875rem;
  color: #6b7280;
}

/* Action buttons container */
.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 2rem;
}

/* Form section */
.form-header {
  margin-bottom: 2rem;
}

.form-header h2 {
  color: #1f2937;
  margin-bottom: 0.5rem;
  font-size: 1.5rem;
  font-weight: 600;
}

.form-header p {
  color: #6b7280;
  margin: 0;
}

.registration-form {
  text-align: left;
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  font-weight: 500;
  color: #374151;
}

.form-control {
  width: 100%;
  padding: 0.875rem 1rem;
  border: 2px solid #e5e7eb;
  border-radius: 10px;
  font-size: 1rem;
  transition: all 0.3s ease;
  background: white;
}

.form-control:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  transform: translateY(-1px);
}

.form-control::placeholder {
  color: #9ca3af;
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

.alert-success {
  background: #f0fdf4;
  color: #16a34a;
  border: 1px solid #bbf7d0;
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
  .invitation-info-section,
  .form-section {
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
