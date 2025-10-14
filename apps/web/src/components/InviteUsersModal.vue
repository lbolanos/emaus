<template>
  <Dialog :open="isOpen" @update:open="$emit('close')">
    <DialogContent class="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
      <DialogHeader class="pb-6">
        <DialogTitle class="flex items-center gap-3 text-xl">
          <div class="p-2 bg-blue-50 rounded-lg">
            <Mail class="w-5 h-5 text-blue-600" />
          </div>
          {{ t('inviteUsersModal.title') }}
        </DialogTitle>
        <DialogDescription class="text-base mt-2">
          {{ t('inviteUsersModal.description') }}
        </DialogDescription>
      </DialogHeader>

      <form @submit.prevent="sendInvitations" class="space-y-6">
        <!-- Email Input Section -->
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <Label for="emails" class="text-sm font-medium text-gray-900">
              {{ t('inviteUsersModal.emailLabel') }}
            </Label>
            <div class="flex items-center gap-2">
              <span 
                class="text-xs font-medium px-3 py-1 rounded-full transition-colors"
                :class="emailCount > 10 ? 'bg-red-100 text-red-700 border border-red-200' : 
                       emailCount > 0 ? 'bg-green-100 text-green-700 border border-green-200' : 
                       'bg-gray-100 text-gray-600 border border-gray-200'"
              >
                {{ emailCount }}/10 {{ t('inviteUsersModal.emails') }}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                @click="addSampleEmails"
                class="text-xs h-7 px-3 border-dashed"
              >
                {{ t('inviteUsersModal.addSampleEmails') }}
              </Button>
            </div>
          </div>
          
          <div class="relative">
            <Textarea
              id="emails"
              v-model="emailsText"
              rows="5"
              :placeholder="t('inviteUsersModal.emailPlaceholder', ['@'])"
              class="resize-none text-sm leading-relaxed pr-20 border-2 transition-colors focus:border-blue-500"
              :class="{ 'border-red-300 bg-red-50': error && emailsText.trim() }"
            />
            <div class="absolute top-3 right-3">
              <div class="flex items-center gap-1">
                <div 
                  class="w-2 h-2 rounded-full"
                  :class="emailCount > 10 ? 'bg-red-500' : emailCount > 0 ? 'bg-green-500' : 'bg-gray-400'"
                ></div>
              </div>
            </div>
          </div>
          
          <p class="text-xs text-gray-500 flex items-center gap-1">
            <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
            </svg>
            {{ t('inviteUsersModal.emailHelp') }}
          </p>
        </div>

        <!-- Role Selection Section -->
        <div class="space-y-3">
          <Label for="role" class="text-sm font-medium text-gray-900">
            {{ t('inviteUsersModal.roleLabel') }}
          </Label>
          
          <Select v-model="selectedRole" required>
            <SelectTrigger class="h-12 border-2 transition-colors focus:border-blue-500" 
                          :class="{ 'border-red-300 bg-red-50': error && !selectedRole }">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                  <svg class="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <SelectValue :placeholder="availableRoles.length === 0 ? t('inviteUsersModal.loadingRoles') : t('inviteUsersModal.rolePlaceholder')" />
              </div>
            </SelectTrigger>
            <SelectContent class="max-h-60">
              <SelectGroup>
                <SelectItem v-for="role in availableRoles" :key="role.id" :value="role.id.toString()" class="py-3">
                  <div class="flex items-start gap-3">
                    <div class="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg class="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="font-medium text-gray-900">{{ role.name }}</div>
                      <div v-if="role.description" class="text-sm text-gray-500 mt-1">{{ role.description }}</div>
                    </div>
                  </div>
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          
          <div v-if="getSelectedRoleName" class="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
            <svg class="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
            </svg>
            <span class="text-sm font-medium text-green-800">
              {{ t('inviteUsersModal.selectedRole') }}: {{ getSelectedRoleName }}
            </span>
          </div>
        </div>

        <!-- Status Messages -->
        <div v-if="error || success" class="space-y-3">
          <div v-if="error" class="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
            <svg class="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
            </svg>
            <div class="flex-1">
              <p class="text-sm font-medium text-red-800">{{ error }}</p>
            </div>
          </div>

          <div v-if="success" class="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
            <svg class="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
            </svg>
            <div class="flex-1">
              <p class="text-sm font-medium text-green-800">{{ success }}</p>
            </div>
          </div>
        </div>

        <!-- Results Section -->
        <div v-if="invitationResults.length > 0" class="space-y-3">
          <div class="flex items-center gap-2">
            <h4 class="text-sm font-medium text-gray-900">{{ t('inviteUsersModal.resultsTitle') }}</h4>
            <span class="text-xs text-gray-500">({{ invitationResults.length }} {{ t('inviteUsersModal.invitations') }})</span>
          </div>
          
          <div class="space-y-2 max-h-48 overflow-y-auto">
            <div v-for="result in invitationResults" :key="result.email"
                 class="flex items-center gap-3 p-3 rounded-lg border transition-colors"
                 :class="result.success ? 'bg-green-50 border-green-200 hover:bg-green-100' : 'bg-red-50 border-red-200 hover:bg-red-100'">
              <div class="flex-shrink-0">
                <div v-if="result.success" class="w-6 h-6 rounded-full bg-green-600 flex items-center justify-center">
                  <svg class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                  </svg>
                </div>
                <div v-else class="w-6 h-6 rounded-full bg-red-600 flex items-center justify-center">
                  <svg class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                  </svg>
                </div>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-medium text-sm text-gray-900 truncate">{{ result.email }}</div>
                <div class="text-xs text-gray-600 mt-0.5">{{ result.message }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Form Actions -->
        <DialogFooter class="pt-6 border-t border-gray-200">
          <div class="flex flex-col-reverse sm:flex-row gap-3 w-full sm:w-auto">
            <Button 
              type="button" 
              variant="outline" 
              @click="$emit('close')"
              class="w-full sm:w-auto"
            >
              {{ t('inviteUsersModal.cancelButton') }}
            </Button>
            <Button 
              type="submit" 
              :disabled="isSending || !isValid"
              class="w-full sm:w-auto"
            >
              <div v-if="isSending" class="flex items-center gap-2">
                <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {{ t('inviteUsersModal.sendingButton') }}
              </div>
              <div v-else class="flex items-center gap-2">
                <Mail class="w-4 h-4" />
                {{ t('inviteUsersModal.sendButton') }}
              </div>
            </Button>
          </div>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
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

const { t } = useI18n();

const emailsText = ref('');
const selectedRole = ref('');
const isSending = ref(false);
const error = ref('');
const success = ref('');
const invitationResults = ref<any[]>([]);
const availableRoles = ref<any[]>([]);

const { toast } = useToast();

// Fetch available roles from API
const fetchRoles = async () => {
  try {
    const response = await api.get('/retreat-roles/roles');
    availableRoles.value = response.data;
  } catch (err) {
    console.error('Error fetching roles:', err);
    error.value = t('inviteUsersModal.errors.fetchRolesError');
  }
};

// Watch for modal open to fetch roles
watch(() => props.isOpen, (isOpen) => {
  if (isOpen && availableRoles.value.length === 0) {
    fetchRoles();
  }
});

// Fetch roles on component mount
onMounted(() => {
  fetchRoles();
});

const emailCount = computed(() => {
  return emailsText.value.split('\n').filter(email => email.trim()).length;
});

const isValid = computed(() => {
  const emails = emailsText.value.split('\n').filter(email => email.trim());
  const hasValidEmails = emails.length > 0 && emails.length <= 10;
  const hasSelectedRole = selectedRole.value !== '';
  const hasRetreatId = props.retreatId && props.retreatId !== '';
  
  return hasValidEmails && hasSelectedRole && hasRetreatId;
});

const getSelectedRoleName = computed(() => {
  if (!selectedRole.value) return '';
  const role = availableRoles.value.find(r => r.id.toString() === selectedRole.value);
  return role ? role.name : '';
});

const clearForm = () => {
  emailsText.value = '';
  selectedRole.value = '';
  error.value = '';
  success.value = '';
  invitationResults.value = [];
};

const addSampleEmails = () => {
  emailsText.value = ['user1@example.com', 'user2@example.com', 'user3@example.com'].join('\n');
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
      error.value = t('inviteUsersModal.errors.noEmails');
      return;
    }

    if (emails.length > 10) {
      error.value = t('inviteUsersModal.errors.maxInvitations');
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = emails.filter(email => !emailRegex.test(email));
    if (invalidEmails.length > 0) {
      error.value = t('inviteUsersModal.errors.invalidEmails', { emails: invalidEmails.join(', ') });
      return;
    }

    const invitations = emails.map(email => ({
      email,
      roleId: parseInt(selectedRole.value),
      retreatId: props.retreatId,
    }));

    const response = await api.post('/invitations', { invitations });
    const data = response.data;

    if (response.status === 200) {
      success.value = t('inviteUsersModal.success.invitationsSent');
      invitationResults.value = data.usersInvited;

      // Show success toast
      toast({
        title: t('inviteUsersModal.toasts.invitationsSent'),
        description: t('inviteUsersModal.toasts.invitationsSentDesc', { count: emails.length }),
      });

      // Show toast for users created
      if (data.usersCreated && data.usersCreated.length > 0) {
        toast({
          title: t('inviteUsersModal.success.usersCreated'),
          description: t('inviteUsersModal.success.usersCreatedDesc', { count: data.usersCreated.length }),
        });
      }

      // Reset form after successful submission
      emailsText.value = '';
      selectedRole.value = '';
    } else {
      error.value = data.error || t('inviteUsersModal.errors.sendError');
    }
  } catch (err) {
    error.value = t('inviteUsersModal.errors.connectionError');
    console.error('Error sending invitations:', err);
  } finally {
    isSending.value = false;
  }
};
</script>
