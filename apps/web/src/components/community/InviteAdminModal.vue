<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="sm:max-w-[480px]">
      <DialogHeader>
        <DialogTitle>{{ $t('community.admin.invite') }}</DialogTitle>
      </DialogHeader>

      <Tabs v-model="activeTab" class="w-full">
        <TabsList class="grid w-full grid-cols-2">
          <TabsTrigger value="search">{{ $t('community.admin.tabSearch') }}</TabsTrigger>
          <TabsTrigger value="link">{{ $t('community.admin.tabLink') }}</TabsTrigger>
        </TabsList>

        <!-- Modo 1: Buscar usuario + acceso inmediato (1 clic) -->
        <TabsContent value="search" class="space-y-4 py-2">
          <p class="text-sm text-muted-foreground">
            {{ $t('community.admin.inviteDesc') }}
          </p>

          <!-- Paso 1: buscador (cuando no hay usuario seleccionado) -->
          <div v-if="!selectedUser">
            <Command
              v-model:search-term="searchQuery"
              :filter-function="(list: string[]) => list"
              class="border rounded-lg"
            >
              <CommandInput :placeholder="$t('community.admin.searchUser')" />
              <CommandList class="max-h-[200px]">
                <CommandEmpty>
                  {{ searchQuery.length < 2 ? $t('community.admin.searchHint') : $t('community.admin.noUsersFound') }}
                </CommandEmpty>
                <CommandGroup v-if="searchResults.length > 0">
                  <CommandItem
                    v-for="user in searchResults"
                    :key="user.id"
                    :value="user.email"
                    class="flex items-center gap-3 cursor-pointer"
                    @select="selectUser(user)"
                  >
                    <Avatar class="h-8 w-8 flex-shrink-0">
                      <AvatarImage v-if="user.photo" :src="user.photo" />
                      <AvatarFallback class="text-xs">{{ getInitials(user.displayName) }}</AvatarFallback>
                    </Avatar>
                    <div class="flex flex-col min-w-0">
                      <span class="text-sm font-medium truncate">{{ user.displayName }}</span>
                      <span class="text-xs text-muted-foreground truncate">{{ user.email }}</span>
                    </div>
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          </div>

          <!-- Paso 2: usuario seleccionado + botón dar acceso -->
          <div v-else class="space-y-4">
            <div class="flex items-center gap-3 p-3 border rounded-lg bg-muted">
              <Avatar class="h-10 w-10 flex-shrink-0">
                <AvatarImage v-if="selectedUser.photo" :src="selectedUser.photo" />
                <AvatarFallback>{{ getInitials(selectedUser.displayName) }}</AvatarFallback>
              </Avatar>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium truncate">{{ selectedUser.displayName }}</p>
                <p class="text-xs text-muted-foreground truncate">{{ selectedUser.email }}</p>
              </div>
              <Button size="sm" variant="ghost" @click="selectedUser = null">
                {{ $t('addRetreatModal.cancel') }}
              </Button>
            </div>

            <Button class="w-full" :disabled="isAdding" @click="handleAddAccess">
              <Loader2 v-if="isAdding" class="w-4 h-4 mr-2 animate-spin" />
              {{ $t('community.admin.giveAccess') }}
            </Button>
          </div>
        </TabsContent>

        <!-- Modo 2: Invitar por enlace (flujo de respaldo) -->
        <TabsContent value="link" class="space-y-4 py-2">
          <p class="text-sm text-muted-foreground">
            {{ $t('community.admin.linkDesc') }}
          </p>
          <div class="space-y-2">
            <Label for="email">{{ $t('community.admin.email') }}</Label>
            <Input id="email" type="email" v-model="email" placeholder="email@example.com" required />
          </div>

          <Button class="w-full" @click="handleInvite" :disabled="!isValidEmail || isInviting">
            <Loader2 v-if="isInviting" class="w-4 h-4 mr-2 animate-spin" />
            {{ $t('community.admin.invite') }}
          </Button>

          <!-- Enlace de invitación generado -->
          <div v-if="invitationLink" class="mt-2 p-4 bg-muted rounded-md space-y-2">
            <Label>{{ $t('community.admin.shareableLink') }}</Label>
            <div class="flex space-x-2">
              <Input :model-value="invitationLink" readonly />
              <Button size="icon" variant="outline" @click="copyLink">
                <Copy class="w-4 h-4" />
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <DialogFooter>
        <Button variant="outline" @click="$emit('update:open', false)">{{ $t('addRetreatModal.cancel') }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useCommunityStore } from '@/stores/communityStore';
import { Loader2, Copy } from 'lucide-vue-next';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Tabs, TabsList, TabsTrigger, TabsContent,
  Command, CommandInput, CommandList, CommandGroup, CommandItem, CommandEmpty,
  Avatar, AvatarImage, AvatarFallback,
  Button, Label, Input
} from '@repo/ui';
import { useToast } from '@repo/ui';
import { searchUsers } from '@/services/api';
import type { User } from '@repo/types';

const props = defineProps<{
  open: boolean;
  communityId: string;
}>();

const emit = defineEmits(['update:open', 'invited']);

const { t: $t } = useI18n();
const communityStore = useCommunityStore();
const { toast } = useToast();

const activeTab = ref<'search' | 'link'>('search');

// --- Modo buscar usuario ---
const searchQuery = ref('');
const searchResults = ref<User[]>([]);
const selectedUser = ref<User | null>(null);
const isAdding = ref(false);
let searchTimeout: ReturnType<typeof setTimeout> | null = null;
let searchGeneration = 0;

watch(searchQuery, (query) => {
  if (searchTimeout) clearTimeout(searchTimeout);
  if (query.length < 2) {
    searchResults.value = [];
    return;
  }
  searchGeneration++;
  const currentGeneration = searchGeneration;
  searchTimeout = setTimeout(async () => {
    try {
      const results = (await searchUsers(query)).map((r: any) => r.user);
      if (currentGeneration === searchGeneration) {
        searchResults.value = results;
      }
    } catch {
      if (currentGeneration === searchGeneration) {
        searchResults.value = [];
      }
    }
  }, 300);
});

const selectUser = (user: User) => {
  selectedUser.value = user;
  searchQuery.value = '';
  searchResults.value = [];
};

const handleAddAccess = async () => {
  if (!selectedUser.value || isAdding.value) return;
  isAdding.value = true;
  try {
    await communityStore.addAdmin(props.communityId, selectedUser.value.id);
    toast({
      title: $t('community.admin.addSuccess'),
      description: $t('community.admin.addSuccessDesc', { name: selectedUser.value.displayName })
    });
    emit('invited');
    emit('update:open', false);
  } catch (error: any) {
    toast({
      title: $t('community.admin.addError'),
      description: error?.response?.data?.message || error?.message || '',
      variant: 'destructive'
    });
  } finally {
    isAdding.value = false;
  }
};

const getInitials = (name: string) => {
  return (name || '')
    .split(' ')
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);
};

// --- Modo invitar por enlace ---
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
      title: $t('community.admin.linkCreated'),
      description: $t('community.admin.linkCreatedDesc')
    });
    emit('invited');
    // No cerramos para que el usuario pueda copiar el enlace.
  } catch (error: any) {
    toast({
      title: $t('community.admin.addError'),
      description: error?.response?.data?.message || error?.message || '',
      variant: 'destructive'
    });
  } finally {
    isInviting.value = false;
  }
};

const copyLink = () => {
  navigator.clipboard.writeText(invitationLink.value);
  toast({
    title: $t('community.admin.copied'),
    description: $t('community.admin.copiedDesc')
  });
};

// Reset al cerrar
watch(() => props.open, (isOpen) => {
  if (!isOpen) {
    activeTab.value = 'search';
    searchQuery.value = '';
    searchResults.value = [];
    selectedUser.value = null;
    email.value = '';
    invitationLink.value = '';
  }
});
</script>
