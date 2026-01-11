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
                  <Badge v-if="admin.userId === currentCommunity.createdBy" variant="outline" class="ml-2">{{ $t('community.admin.creator') }}</Badge>
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
            {{ $t('community.admin.revokeConfirm') }}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="adminToRevoke = null">{{ $t('common.actions.cancel') }}</Button>
          <Button @click="handleRevoke" variant="destructive">
            {{ $t('community.admin.revokeAdmin') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
/**
 * Community Admin Management Page
 *
 * PURPOSE:
 * This page allows community administrators to manage other administrators for their community.
 * It displays current active admins, pending invitations, and provides actions for inviting
 * new admins and revoking access.
 *
 * ROLES & PERMISSIONS:
 * - Only active community admins can access this page (enforced by requireCommunityAccess middleware)
 * - The community creator (createdBy user) cannot be removed
 * - All admins can invite new admins and revoke pending invitations
 * - Only the creator can revoke other active admins
 *
 * ADMIN STATUS FLOW:
 * 1. PENDING → User has been invited but hasn't accepted yet
 *    - Shows in "Pending Invitations" section
 *    - Can copy invitation link or revoke invitation
 *    - invitationToken is set, acceptedAt is null
 *
 * 2. ACTIVE → User has accepted the invitation
 *    - Shows in "Current Admins" section
 *    - Has full admin access to the community
 *    - invitationToken is null, acceptedAt is set
 *
 * 3. REVOKED → Admin access has been removed
 *    - No longer shown in any list
 *    - Cannot access community features
 *
 * INVITATION PROCESS:
 * 1. Click "Invite Admin" button → Opens InviteAdminModal
 * 2. Enter email address of existing user
 * 3. System calls POST /api/communities/:id/admins/invite
 *    - Validates user exists in the system
 *    - Creates CommunityAdmin record with status='pending'
 *    - Generates unique invitationToken (UUID)
 *    - Sets invitationExpiresAt = 7 days from now
 *    - Returns the token
 * 4. Modal displays invitation link: /accept-community-invitation/{token}
 * 5. Admin copies link and sends it to the invited user (via email, chat, etc.)
 * 6. Invited user visits link and accepts (see AcceptCommunityInvitationView docs)
 *
 * REVOCATION PROCESS:
 * 1. Click revoke button on admin or pending invitation
 * 2. Confirmation dialog appears
 * 3. System calls DELETE /api/communities/:id/admins/:userId
 *    - Updates CommunityAdmin record: status='revoked'
 *    - Clears invitationToken
 *    - Invalidates user's permission cache
 * 4. User no longer has admin access
 *
 * DATA STRUCTURE:
 * - CommunityAdmin entity fields:
 *   - id: UUID
 *   - communityId: UUID (foreign key to Community)
 *   - userId: UUID (foreign key to User)
 *   - status: 'pending' | 'active' | 'revoked'
 *   - role: 'admin' | 'owner' (owner is the creator)
 *   - invitationToken: UUID | null (set when pending, cleared when accepted)
 *   - invitationExpiresAt: Date | null (7 days after creation)
 *   - acceptedAt: Date | null (set when user accepts)
 *   - createdAt: Date
 *   - updatedAt: Date
 *
 * API ENDPOINTS:
 * - GET /api/communities/:id/admins - List all admins (requires community access)
 * - POST /api/communities/:id/admins/invite - Invite new admin (requires community access)
 * - DELETE /api/communities/:id/admins/:userId - Revoke admin (requires community access)
 *
 * SECURITY:
 * - Only existing users can be invited (user must exist in User table)
 * - Creator cannot be revoked
 * - Invited user's email must match the email they use to login
 * - Tokens expire after 7 days
 * - Permission cache is invalidated on revoke
 */
import { ref, onMounted, computed } from 'vue';
import { useI18n } from 'vue-i18n';
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

const { t: $t } = useI18n();

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
      title: $t('community.admin.revokeSuccess'),
      description: $t('community.admin.revokeSuccessDesc')
    });
  } catch (error) {
    console.error('Failed to revoke admin access:', error);
  } finally {
    adminToRevoke.value = null;
  }
};

const copyInviteLink = (invitation: any) => {
  const link = `${window.location.origin}/accept-community-invitation/${invitation.invitationToken}`;
  navigator.clipboard.writeText(link);
  toast({
    title: 'Copied',
    description: 'Invitation link copied to clipboard.'
  });
};
</script>
