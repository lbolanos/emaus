<template>
  <div class="accept-invitation-container">
    <div class="invitation-card">
      <div v-if="loading" class="loading">
        <div class="spinner"></div>
        <p>Verificando invitación...</p>
      </div>

      <div v-else-if="error" class="error">
        <h2>Invitación Inválida</h2>
        <p>{{ error }}</p>
        <button class="btn btn-primary" @click="goToLogin">Ir al Inicio de Sesión</button>
      </div>

      <div v-else-if="invitationData && !showForm" class="invitation-info">
        <h2>Has sido invitado a unirte a Emaús</h2>
        <div class="user-info">
          <p><strong>Correo:</strong> {{ invitationData.user.email }}</p>
          <div class="retreats-list">
            <p><strong>Retiros:</strong></p>
            <ul>
              <li v-for="retreat in invitationData.retreats" :key="retreat.id">
                {{ retreat.parish }} ({{ formatDate(retreat.startDate) }} - {{ formatDate(retreat.endDate) }})
              </li>
            </ul>
          </div>
        </div>
        <button class="btn btn-primary" @click="showForm = true">Aceptar Invitación</button>
      </div>

      <div v-else-if="showForm" class="accept-form">
        <h2>Completa tu Registro</h2>
        <form @submit.prevent="acceptInvitation">
          <div class="form-group">
            <label for="displayName">Nombre Completo</label>
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
            <label for="password">Contraseña</label>
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
            <label for="confirmPassword">Confirmar Contraseña</label>
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

          <div v-if="formError" class="error-message">
            {{ formError }}
          </div>

          <div v-if="formSuccess" class="success-message">
            {{ formSuccess }}
          </div>

          <button type="submit" class="btn btn-primary" :disabled="isSubmitting">
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

const formatDate = (date: Date | string) => {
  return new Date(date).toLocaleDateString('es-ES');
};

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
}

.invitation-card {
  background: white;
  border-radius: 12px;
  padding: 2rem;
  width: 100%;
  max-width: 500px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
}

.loading {
  text-align: center;
  padding: 2rem;
}

.spinner {
  border: 3px solid #f3f4f6;
  border-top: 3px solid #3b82f6;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  animation: spin 1s linear infinite;
  margin: 0 auto 1rem;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.error {
  text-align: center;
  padding: 2rem;
}

.error h2 {
  color: #dc2626;
  margin-bottom: 1rem;
}

.error p {
  color: #6b7280;
  margin-bottom: 1.5rem;
}

.invitation-info {
  text-align: center;
}

.invitation-info h2 {
  color: #1f2937;
  margin-bottom: 1.5rem;
}

.user-info {
  text-align: left;
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: #f8fafc;
  border-radius: 8px;
}

.user-info p {
  margin-bottom: 0.5rem;
  color: #374151;
}

.retreats-list {
  margin-top: 1rem;
}

.retreats-list ul {
  margin: 0.5rem 0 0 1.5rem;
  color: #6b7280;
}

.accept-form h2 {
  color: #1f2937;
  margin-bottom: 1.5rem;
  text-align: center;
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: #374151;
}

.form-control {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 1rem;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.form-control:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.error-message {
  background: #fee2e2;
  color: #dc2626;
  padding: 0.75rem;
  border-radius: 4px;
  margin-bottom: 1rem;
  font-size: 0.875rem;
}

.success-message {
  background: #d1fae5;
  color: #059669;
  padding: 0.75rem;
  border-radius: 4px;
  margin-bottom: 1rem;
  font-size: 0.875rem;
}

.btn {
  display: inline-block;
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 4px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s, transform 0.1s;
  text-decoration: none;
  text-align: center;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.btn-primary {
  background: #3b82f6;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #2563eb;
  transform: translateY(-1px);
}

.btn-primary:active:not(:disabled) {
  transform: translateY(0);
}
</style>