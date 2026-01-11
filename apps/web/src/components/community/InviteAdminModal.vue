<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle>{{ $t('community.admin.invite') }}</DialogTitle>
      </DialogHeader>
      
      <div class="space-y-4 py-4">
        <p class="text-sm text-muted-foreground">
          {{ $t('community.admin.inviteDesc') || 'Invite another user to help manage this community as a co-admin.' }}
        </p>
        <div class="space-y-2">
          <Label for="email">{{ $t('community.admin.email') }}</Label>
          <Input id="email" type="email" v-model="email" placeholder="email@example.com" required />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="$emit('update:open', false)">{{ $t('addRetreatModal.cancel') }}</Button>
        <Button @click="handleInvite" :disabled="!isValidEmail || isInviting">
          <Loader2 v-if="isInviting" class="w-4 h-4 mr-2 animate-spin" />
          {{ $t('community.admin.invite') }}
        </Button>
      </DialogFooter>

      <!-- Invitation Link Display (Optional, if we want to show it immediately) -->
      <div v-if="invitationLink" class="mt-4 p-4 bg-muted rounded-md space-y-2">
        <Label>Shareable Link</Label>
        <div class="flex space-x-2">
          <Input :model-value="invitationLink" readonly />
          <Button size="icon" variant="outline" @click="copyLink">
            <Copy class="w-4 h-4" />
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useCommunityStore } from '@/stores/communityStore';
import { Loader2, Copy } from 'lucide-vue-next';
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Button, Label, Input
} from '@repo/ui';
import { useToast } from '@repo/ui';

const props = defineProps<{
  open: boolean;
  communityId: string;
}>();

const emit = defineEmits(['update:open', 'invited']);

const communityStore = useCommunityStore();
const { toast } = useToast();

const email = ref('');
const isInviting = ref(false);
const invitationLink = ref('');

const isValidEmail = computed(() => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value);
});

const handleInvite = async () => {
  if (!isValidEmail.value) return;
  
  isInviting.value = true;
  try {
    const response = await communityStore.inviteAdmin(props.communityId, email.value);
    if (response && response.invitationToken) {
      invitationLink.value = `${window.location.origin}/accept-community-invitation/${response.invitationToken}`;
    }
    toast({
      title: 'Invitation Created',
      description: 'You can now share the link with the co-admin.'
    });
    emit('invited');
    // We don't close immediately so the user can copy the link if they want
  } catch (error) {
    console.error('Failed to invite admin:', error);
  } finally {
    isInviting.value = false;
  }
};

const copyLink = () => {
  navigator.clipboard.writeText(invitationLink.value);
  toast({
    title: 'Copied',
    description: 'Invitation link copied to clipboard.'
  });
};
</script>
