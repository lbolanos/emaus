<template>
  <div class="w-80 border-l pl-6 space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <h3 class="text-lg font-semibold">Historial de Mensajes</h3>
      <Button
        variant="ghost"
        size="sm"
        @click="loadHistory"
        :disabled="loading"
        v-if="memberId && communityId"
        title="Recargar historial"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
        </svg>
      </Button>
    </div>

    <!-- Loading State -->
    <div v-if="loading && !communications.length" class="text-center py-8">
      <div class="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
      <p class="text-sm text-muted-foreground mt-2">Cargando historial...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="bg-red-50 border border-red-200 rounded-lg p-3">
      <p class="text-sm text-red-600">{{ error }}</p>
      <Button
        variant="outline"
        size="sm"
        @click="loadHistory"
        class="mt-2"
      >
        Reintentar
      </Button>
    </div>

    <!-- Empty State -->
    <div v-else-if="!communications.length" class="text-center py-8">
      <svg class="w-12 h-12 mx-auto text-muted-foreground/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/>
      </svg>
      <p class="text-sm text-muted-foreground mt-2">No hay mensajes enviados</p>
      <p class="text-xs text-muted-foreground mt-1">
        Los mensajes enviados aparecerán aquí
      </p>
    </div>

    <!-- History List -->
    <div v-else class="space-y-3 max-h-96 overflow-y-auto">
      <div
        v-for="message in communications"
        :key="message.id"
        class="border rounded-lg p-3 space-y-2 hover:bg-muted/50 transition-colors cursor-pointer"
        @click="$emit('message-click', message)"
      >
        <!-- Message Header -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-lg">{{ getMessageTypeIcon(message.messageType) }}</span>
            <span :class="getMessageTypeColor(message.messageType)" class="text-sm font-medium">
              {{ getMessageTypeLabel(message.messageType) }}
            </span>
          </div>
          <div class="flex items-center gap-1">
            <span class="text-xs text-muted-foreground">
              {{ formatDate(message.sentAt) }}
            </span>
            <Button
              variant="ghost"
              size="sm"
              @click.stop="$emit('copy-message', message)"
              class="h-6 w-6 p-0"
              title="Copiar mensaje"
            >
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
              </svg>
            </Button>
          </div>
        </div>

        <!-- Message Content Preview -->
        <div class="text-sm text-muted-foreground">
          {{ formatMessageContent(message.messageContent, 80) }}
        </div>

        <!-- Template Info -->
        <div v-if="message.templateName" class="flex items-center gap-1">
          <Badge variant="secondary" class="text-xs">
            {{ message.templateName }}
          </Badge>
        </div>

        <!-- Recipient Info -->
        <div class="text-xs text-muted-foreground">
          Enviado a: {{ message.recipientContact }}
        </div>

        <!-- Sender Info -->
        <div v-if="message.sender" class="text-xs text-muted-foreground">
          Enviado por: {{ message.sender.email }}
        </div>
      </div>
    </div>

    <!-- Load More -->
    <div v-if="hasMore && communications.length > 0" class="text-center">
      <Button
        variant="outline"
        size="sm"
        @click="loadMore"
        :disabled="loading"
      >
        <span v-if="loading" class="w-4 h-4 mr-2 border-2 border-primary border-t-transparent rounded-full animate-spin"></span>
        Cargar más
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { Button } from '@repo/ui';
import { Badge } from '@repo/ui';
import { useCommunityCommunicationStore } from '@/stores/communityCommunicationStore';

interface CommunityCommunication {
  id: string;
  communityMemberId: string;
  communityId: string;
  messageType: 'whatsapp' | 'email';
  recipientContact: string;
  messageContent: string;
  templateId?: string;
  templateName?: string;
  subject?: string;
  sentAt: string;
  sentBy?: string;
  communityMember?: {
    id: string;
    participant: {
      id: string;
      firstName: string;
      lastName: string;
    };
  };
  community?: {
    id: string;
    name: string;
  };
  template?: {
    id: string;
    name: string;
    type: string;
  };
  sender?: {
    id: string;
    email: string;
  };
}

interface Props {
  memberId: string;
  communityId: string | undefined;
  visible?: boolean;
  autoLoad?: boolean;
}

interface Emits {
  (e: 'message-click', message: CommunityCommunication): void;
  (e: 'copy-message', message: CommunityCommunication): void;
  (e: 'loading-changed', loading: boolean): void;
  (e: 'count-changed', count: number): void;
}

const props = withDefaults(defineProps<Props>(), {
  visible: true,
  autoLoad: true
});

const emit = defineEmits<Emits>();

const communicationStore = useCommunityCommunicationStore();

const {
  communications,
  loading,
  error,
  total,
  limit,
  offset
} = storeToRefs(communicationStore);

const {
  fetchMemberCommunications,
  formatDate,
  formatMessageContent,
  getMessageTypeLabel,
  getMessageTypeIcon,
  getMessageTypeColor,
  clearCommunications
} = communicationStore;

// Local state
const localLoading = ref(false);
const hasMore = computed(() => {
  return communications.value.length < total.value;
});

// Load history function
const loadHistory = async (loadMore = false) => {
  if (!props.memberId || !props.communityId) return;

  localLoading.value = true;
  emit('loading-changed', true);

  try {
    await fetchMemberCommunications(
      props.memberId,
      {
        communityId: props.communityId,
        limit: loadMore ? limit.value + 20 : 20,
        offset: loadMore ? offset.value + limit.value : 0
      }
    );
  } catch (error) {
    console.error('Error loading message history:', error);
  } finally {
    localLoading.value = false;
    emit('loading-changed', false);
  }
};

// Load more function
const loadMore = () => {
  loadHistory(true);
};

// Watch communications count and emit changes
watch(communications, (newCommunications) => {
  emit('count-changed', newCommunications.length);
}, { immediate: true });

// Auto-load when component mounts or props change
watch(
  [() => props.memberId, () => props.communityId, () => props.visible],
  ([newMemberId, newCommunityId, newVisible]) => {
    if (newMemberId && newCommunityId && newVisible && props.autoLoad) {
      loadHistory();
    }
  },
  { immediate: true }
);

// Clear communications when member or community changes
watch(
  [() => props.memberId, () => props.communityId],
  () => {
    clearCommunications();
  }
);

// Initialize on mount
onMounted(() => {
  if (props.memberId && props.communityId && props.visible && props.autoLoad) {
    loadHistory();
  }
});
</script>

<style scoped>
.max-h-96 {
  max-height: 24rem;
}

.overflow-y-auto {
  overflow-y: auto;
}

.hover\:bg-muted\/50:hover {
  background-color: hsl(var(--muted) / 0.5);
}

.transition-colors {
  transition-property: color, background-color, border-color;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  transition-duration: 150ms;
}
</style>
