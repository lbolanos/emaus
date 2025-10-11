<template>
  <Dialog :open="isOpen" @update:open="$emit('close')">
    <DialogContent class="sm:max-w-[500px]">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <Mail class="w-5 h-5" />
          Invitar Alguien
        </DialogTitle>
        <DialogDescription>
          Invita usuarios a este retiro con un rol específico
        </DialogDescription>
      </DialogHeader>

      <form @submit.prevent="sendInvitations">
        <div class="grid gap-4 py-4">
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="emails" class="text-right">Correos Electrónicos</Label>
            <div class="col-span-3">
              <Textarea
                id="emails"
                v-model="emailsText"
                rows="4"
                placeholder="usuario1@ejemplo.com&#10;usuario2@ejemplo.com"
                class="resize-none"
              />
              <p class="text-xs text-gray-500 mt-1">Un correo por línea, máximo 10 invitaciones</p>
            </div>
          </div>

          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="role" class="text-right">Rol</Label>
            <Select v-model="selectedRole" required>
              <SelectTrigger class="col-span-3">
                <SelectValue placeholder="Seleccionar rol" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem v-for="role in availableRoles" :key="role" :value="role">
                    {{ role }}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div v-if="error" class="col-span-4 bg-red-50 border border-red-200 rounded-lg p-3">
            <p class="text-red-800 text-sm">{{ error }}</p>
          </div>

          <div v-if="success" class="col-span-4 bg-green-50 border border-green-200 rounded-lg p-3">
            <p class="text-green-800 text-sm">{{ success }}</p>
          </div>

          <div v-if="invitationResults.length > 0" class="col-span-4">
            <h4 class="font-medium mb-2">Resultados:</h4>
            <div class="space-y-2">
              <div v-for="result in invitationResults" :key="result.email"
                   class="flex items-center gap-2 p-2 rounded border"
                   :class="result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'">
                <span :class="result.success ? 'text-green-600' : 'text-red-600'">
                  {{ result.success ? '✓' : '✗' }}
                </span>
                <span class="font-medium">{{ result.email }}</span>
                <span class="text-sm text-gray-600">{{ result.message }}</span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" @click="$emit('close')">
            Cancelar
          </Button>
          <Button type="submit" :disabled="isSending || !isValid">
            {{ isSending ? 'Enviando...' : 'Enviar Invitaciones' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useToast } from '@repo/ui';
import { api } from '@/services/api';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Label, Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem,
  Textarea, Button
} from '@repo/ui';
import { Mail } from 'lucide-vue-next';

interface Props {
  isOpen: boolean;
  retreatId?: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  close: [];
}>();

const emailsText = ref('');
const selectedRole = ref('');
const isSending = ref(false);
const error = ref('');
const success = ref('');
const invitationResults = ref<any[]>([]);

const { toast } = useToast();

const availableRoles = [
  'servidor', 'tesorero', 'logística', 'palancas'
];

const isValid = computed(() => {
  const emails = emailsText.value.split('\n').filter(email => email.trim());
  const hasValidEmails = emails.length > 0 && emails.length <= 10;
  const hasSelectedRole = selectedRole.value !== '';
  const hasRetreatId = props.retreatId && props.retreatId !== '';
  
  return hasValidEmails && hasSelectedRole && hasRetreatId;
});

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

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = emails.filter(email => !emailRegex.test(email));
    if (invalidEmails.length > 0) {
      error.value = `Correos inválidos: ${invalidEmails.join(', ')}`;
      return;
    }

    // Map string role to numeric ID (assuming API expects numeric IDs)
    const roleIdMap: Record<string, number> = {
      'servidor': 2,
      'tesorero': 3,
      'logística': 4,
      'palancas': 5
    };

    const invitations = emails.map(email => ({
      email,
      roleId: roleIdMap[selectedRole.value] || 2,
      retreatId: props.retreatId,
    }));

    const response = await api.post('/invitations', { invitations });
    const data = response.data;

    if (response.status === 200) {
      success.value = 'Invitaciones enviadas exitosamente';
      invitationResults.value = data.usersInvited;

      // Show success toast
      toast({
        title: 'Invitaciones Enviadas',
        description: `Se enviaron ${emails.length} invitaciones correctamente`,
      });

      // Show toast for users created
      if (data.usersCreated && data.usersCreated.length > 0) {
        toast({
          title: 'Usuarios Creados',
          description: `Se crearon ${data.usersCreated.length} nuevas cuentas de usuario`,
        });
      }

      // Reset form after successful submission
      emailsText.value = '';
      selectedRole.value = '';
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
</script>
