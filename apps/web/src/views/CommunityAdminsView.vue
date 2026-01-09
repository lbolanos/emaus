<template>
  <div class="p-4 space-y-4">
    <div v-if="loadingCommunity" class="flex justify-center py-12">
      <Loader2 class="w-8 h-8 animate-spin text-primary" />
    </div>

    <template v-else-if="currentCommunity">
      <div class="flex justify-between items-center">
        <div>
          <h1 class="text-2xl font-bold">{{ currentCommunity.name }} - {{ $t('community.admin.admins') }}</h1>
          <div class="flex items-center text-sm text-muted-foreground">
            <router-link :to="{ name: 'community-dashboard', params: { id: currentCommunity.id } }" class="hover:underline">
              {{ $t('community.dashboard') }}
            </router-link>
            <ChevronRight class="w-4 h-4 mx-1" />
            <span>{{ $t('community.admin.admins') }}</span>
          </div>
        </div>
        <Button @click="isInviteModalOpen = true">
          <UserPlus class="w-4 h-4 mr-2" />
          {{ $t('community.admin.invite') }}
        </Button>
      </div>

      <div class="grid gap-6">
        <!-- Current Admins -->
        <Card>
          <CardHeader>
            <CardTitle>{{ $t('community.admin.currentAdmins') }}</CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{{ $t('participants.name') }}</TableHead>
                <TableHead>{{ $t('participants.email') }}</TableHead>
                <TableHead>{{ $t('community.admin.status') }}</TableHead>
                <TableHead class="text-right">{{ $t('participants.actions') }}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="admin in activeAdmins" :key="admin.id">
                <TableCell class="font-medium">
                  {{ admin.user.displayName }}
                  <Badge v-if="admin.userId === currentCommunity.createdBy" variant="outline" class="ml-2">Creator</Badge>
                </TableCell>
                <TableCell>{{ admin.user.email }}</TableCell>
                <TableCell>
                  <Badge variant="default">{{ $t('community.admin.active') }}</Badge>
                </TableCell>
                <TableCell class="text-right">
                  <Button 
                    v-if="admin.userId !== currentCommunity.createdBy" 
                    variant="ghost" 
                    size="icon" 
                    class="text-destructive"
                    @click="confirmRevoke(admin)"
                  >
                    <UserX class="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Card>

        <!-- Pending Invitations -->
        <Card v-if="pendingAdmins.length > 0">
          <CardHeader>
            <CardTitle>{{ $t('community.admin.pendingInvitations') }}</CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{{ $t('participants.email') }}</TableHead>
                <TableHead>{{ $t('community.admin.status') }}</TableHead>
                <TableHead class="text-right">{{ $t('participants.actions') }}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="invitation in pendingAdmins" :key="invitation.id">
                <TableCell class="font-medium">{{ invitation.user?.email || 'N/A' }}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{{ $t('community.admin.pending') }}</Badge>
                </TableCell>
                <TableCell class="text-right">
                  <div class="flex justify-end space-x-2">
                    <Button variant="ghost" size="icon" @click="copyInviteLink(invitation)">
                      <Copy class="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" class="text-destructive" @click="confirmRevoke(invitation)">
                      <Trash2 class="w-4 h-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Card>
      </div>
    </template>

    <InviteAdminModal 
      v-if="currentCommunity"
      v-model:open="isInviteModalOpen" 
      :community-id="currentCommunity.id" 
      @invited="fetchAdmins"
    />

    <Dialog :open="!!adminToRevoke" @update:open="adminToRevoke = null">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ $t('delete.confirmTitle') }}</DialogTitle>
          <DialogDescription>
            Are you sure you want to revoke admin access for this user?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="adminToRevoke = null">Cancel</Button>
          <Button @click="handleRevoke" variant="destructive">
            Revoke Access
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useCommunityStore } from '@/stores/communityStore';
import { storeToRefs } from 'pinia';
import { Loader2, UserPlus, UserX, Copy, Trash2, ChevronRight } from 'lucide-vue-next';
import { 
  Button, Card, CardHeader, CardTitle, Badge,
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@repo/ui';
import { useToast } from '@repo/ui';
import InviteAdminModal from '@/components/community/InviteAdminModal.vue';

const props = defineProps<{
  id: string;
}>();

const communityStore = useCommunityStore();
const { currentCommunity, admins, loadingCommunity } = storeToRefs(communityStore);
const { toast } = useToast();

const isInviteModalOpen = ref(false);
const adminToRevoke = ref<any>(null);

onMounted(async () => {
  await communityStore.fetchCommunity(props.id);
  await fetchAdmins();
});

const fetchAdmins = async () => {
  await communityStore.fetchAdmins(props.id);
};

const activeAdmins = computed(() => admins.value.filter(a => a.status === 'active'));
const pendingAdmins = computed(() => admins.value.filter(a => a.status === 'pending'));

const confirmRevoke = (admin: any) => {
  adminToRevoke.value = admin;
};

const handleRevoke = async () => {
  if (!adminToRevoke.value) return;
  try {
    await communityStore.revokeAdmin(props.id, adminToRevoke.value.userId);
    toast({
      title: 'Access Revoked',
      description: 'The admin access has been removed.'
    });
  } catch (error) {
    console.error('Failed to revoke admin access:', error);
  } finally {
    adminToRevoke.value = null;
  }
};

const copyInviteLink = (invitation: any) => {
  const link = `${window.location.origin}/accept-invitation/${invitation.invitationToken}`;
  navigator.clipboard.writeText(link);
  toast({
    title: 'Copied',
    description: 'Invitation link copied to clipboard.'
  });
};
</script>
