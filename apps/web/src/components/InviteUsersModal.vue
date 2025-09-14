<template>
  <div class="modal-overlay" @click="$emit('close')">
    <div class="modal-content" @click.stop>
      <div class="modal-header">
        <h2>Invitar Usuarios</h2>
        <button class="close-button" @click="$emit('close')">×</button>
      </div>

      <div class="modal-body">
        <div class="form-group">
          <label>Correos Electrónicos (uno por línea)</label>
          <textarea
            v-model="emailsText"
            rows="5"
            placeholder="usuario1@ejemplo.com&#10;usuario2@ejemplo.com"
            class="form-control"
          ></textarea>
        </div>

        <div class="form-group">
          <label>Retiro</label>
          <select v-model="selectedRetreatId" class="form-control">
            <option value="">Seleccionar Retiro</option>
            <option v-for="retreat in retreats" :key="retreat.id" :value="retreat.id">
              {{ retreat.parish }} ({{ formatDate(retreat.startDate) }})
            </option>
          </select>
        </div>

        <div class="form-group">
          <label>Rol</label>
          <select v-model="selectedRoleId" class="form-control">
            <option value="">Seleccionar Rol</option>
            <option v-for="role in roles" :key="role.id" :value="role.id">
              {{ role.name }}
            </option>
          </select>
        </div>

        <div v-if="error" class="error-message">
          {{ error }}
        </div>

        <div v-if="success" class="success-message">
          {{ success }}
        </div>

        <div v-if="invitationResults.length > 0" class="results-section">
          <h3>Resultados:</h3>
          <div class="result-item" v-for="result in invitationResults" :key="result.email">
            <span :class="['status', result.success ? 'success' : 'error']">
              {{ result.success ? '✓' : '✗' }}
            </span>
            <span class="email">{{ result.email }}</span>
            <span class="message">{{ result.message }}</span>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" @click="$emit('close')">Cancelar</button>
        <button
          class="btn btn-primary"
          @click="sendInvitations"
          :disabled="isSending || !isValid"
        >
          {{ isSending ? 'Enviando...' : 'Enviar Invitaciones' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRetreatStore } from '@/stores/retreatStore';
import { useToast } from '@repo/ui';

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const emailsText = ref('');
const selectedRetreatId = ref('');
const selectedRoleId = ref('');
const isSending = ref(false);
const error = ref('');
const success = ref('');
const invitationResults = ref<any[]>([]);

const retreatStore = useRetreatStore();
const retreats = computed(() => retreatStore.retreats);
const roles = ref([
  { id: 1, name: 'Administrador' },
  { id: 2, name: 'Coordinador' },
  { id: 3, name: 'Colaborador' },
]);

const { toast } = useToast();

const isValid = computed(() => {
  const emails = emailsText.value.split('\n').filter(email => email.trim());
  return emails.length > 0 && emails.length <= 10 && selectedRetreatId.value && selectedRoleId.value;
});

const formatDate = (date: Date | string) => {
  return new Date(date).toLocaleDateString('es-ES');
};

const sendInvitations = async () => {
  try {
    isSending.value = true;
    error.value = '';
    success.value = '';
    invitationResults.value = [];

    const emails = emailsText.value
      .split('\n')
      .map(email => email.trim())
      .filter(email => email);

    if (emails.length === 0) {
      error.value = 'Por favor ingrese al menos un correo electrónico';
      return;
    }

    if (emails.length > 10) {
      error.value = 'Máximo 10 invitaciones por solicitud';
      return;
    }

    const invitations = emails.map(email => ({
      email,
      roleId: selectedRoleId.value,
      retreatId: selectedRetreatId.value,
    }));

    const response = await fetch('/api/invitations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ invitations }),
    });

    const data = await response.json();

    if (response.ok) {
      success.value = 'Proceso de invitación completado';
      invitationResults.value = data.usersInvited;

      // Show toast for users created
      if (data.usersCreated.length > 0) {
        toast({
          title: 'Usuarios Creados',
          description: `Se crearon ${data.usersCreated.length} nuevas cuentas de usuario`,
        });
      }
    } else {
      error.value = data.error || 'Error al enviar invitaciones';
    }
  } catch (err) {
    error.value = 'Error de conexión. Por favor intente nuevamente.';
    console.error('Error sending invitations:', err);
  } finally {
    isSending.value = false;
  }
};

onMounted(async () => {
  await retreatStore.fetchRetreats();
});
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  border-radius: 8px;
  width: 90%;
  max-width: 600px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-header {
  padding: 1.5rem;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-header h2 {
  margin: 0;
  color: #1f2937;
}

.close-button {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #6b7280;
  padding: 0;
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}

.close-button:hover {
  background: #f3f4f6;
}

.modal-body {
  padding: 1.5rem;
}

.modal-footer {
  padding: 1.5rem;
  border-top: 1px solid #e5e7eb;
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
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
}

.form-control:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

textarea.form-control {
  resize: vertical;
  min-height: 100px;
}

.btn {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 4px;
  font-size: 1rem;
  cursor: pointer;
  transition: background-color 0.2s;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: #6b7280;
  color: white;
}

.btn-secondary:hover:not(:disabled) {
  background: #4b5563;
}

.btn-primary {
  background: #3b82f6;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #2563eb;
}

.error-message {
  color: #dc2626;
  background: #fee2e2;
  padding: 0.75rem;
  border-radius: 4px;
  margin-bottom: 1rem;
}

.success-message {
  color: #059669;
  background: #d1fae5;
  padding: 0.75rem;
  border-radius: 4px;
  margin-bottom: 1rem;
}

.results-section {
  margin-top: 1.5rem;
}

.results-section h3 {
  margin: 0 0 1rem 0;
  color: #1f2937;
}

.result-item {
  display: flex;
  align-items: center;
  padding: 0.5rem;
  border-bottom: 1px solid #f3f4f6;
}

.result-item:last-child {
  border-bottom: none;
}

.status {
  width: 1.5rem;
  text-align: center;
  margin-right: 0.5rem;
}

.status.success {
  color: #059669;
}

.status.error {
  color: #dc2626;
}

.email {
  font-weight: 500;
  color: #1f2937;
  margin-right: 0.5rem;
}

.message {
  color: #6b7280;
  font-size: 0.875rem;
}
</style>