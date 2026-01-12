<template>
  <div class="p-4 space-y-4">
    <!-- Skeleton Loading -->
    <div v-if="loadingCommunity || loadingMeeting" class="space-y-4" role="status" aria-live="polite">
      <div v-for="i in 5" :key="i" class="p-4 border rounded-lg bg-card">
        <div class="flex items-center space-x-4">
          <div class="w-12 h-12 rounded-full bg-muted animate-pulse"></div>
          <div class="flex-1 space-y-2">
            <div class="h-4 bg-muted rounded w-3/4 animate-pulse"></div>
            <div class="h-3 bg-muted rounded w-1/2 animate-pulse"></div>
          </div>
        </div>
      </div>
      <span class="sr-only">Cargando miembros...</span>
    </div>

    <template v-else-if="currentMeeting && currentCommunity">
      <div class="flex justify-between items-center">
        <div>
          <h1 class="text-2xl font-bold">{{ currentMeeting.title }} - {{ $t('community.meeting.recordAttendance') }}</h1>
          <p class="text-muted-foreground">{{ formatDate(currentMeeting.startDate) }}</p>
          <div class="flex items-center text-sm text-muted-foreground">
            <router-link
              :to="{ name: 'community-meetings', params: { id: currentCommunity.id } }"
              class="hover:underline"
            >
              {{ $t('community.meeting.title') }}
            </router-link>
            <ChevronRight class="w-4 h-4 mx-1" />
            <span>{{ $t('community.meeting.recordAttendance') }}</span>
          </div>
        </div>
        <div class="relative max-w-xs">
          <Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            v-model="searchQuery"
            :placeholder="$t('community.attendance.searchPlaceholder')"
            class="pl-8"
          />
        </div>
      </div>

      <!-- Stats Summary -->
      <div class="flex gap-4">
        <Card class="flex-1 p-4">
          <div class="text-center">
            <div class="text-2xl font-bold text-primary">{{ presentCount }}</div>
            <div class="text-sm text-muted-foreground">{{ $t('community.attendance.present') }}</div>
          </div>
        </Card>
        <Card class="flex-1 p-4">
          <div class="text-center">
            <div class="text-2xl font-bold text-muted-foreground">{{ members.length }}</div>
            <div class="text-sm text-muted-foreground">{{ $t('community.attendance.total') }}</div>
          </div>
        </Card>
      </div>

      <!-- Members List - Card-based Layout -->
      <div class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="member in filteredMembers"
          :key="member.id"
          class="member-card flex items-center justify-between p-4 border rounded-lg transition-all cursor-pointer"
          :class="{
            'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800': member.attended,
            'opacity-50 cursor-not-allowed': savingStates[member.id]
          }"
          @click="toggleAttendance(member)"
        >
          <div class="flex-1 min-w-0">
            <div class="font-medium truncate">
              {{ member.participant.firstName }} {{ member.participant.lastName }}
            </div>
            <div class="text-sm text-muted-foreground truncate" v-if="member.participant.email">
              {{ member.participant.email }}
            </div>
            <div class="flex items-center gap-2 mt-1">
              <Badge :variant="getFrequencyBadgeVariant(member.lastMeetingsFrequency)">
                {{ Math.round(member.lastMeetingsAttendanceRate || 0) }}%
              </Badge>
            </div>
          </div>
          <button
            class="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center transition-all"
            :class="member.attended
              ? 'bg-green-600 text-white'
              : 'bg-muted text-muted-foreground'"
          >
            <Loader2 v-if="savingStates[member.id]" class="w-6 h-6 animate-spin" />
            <Check v-else-if="member.attended" class="w-6 h-6" />
            <div v-else class="w-4 h-4 rounded-full border-2 border-current" />
          </button>
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="filteredMembers.length === 0" class="text-center py-12 border rounded-lg bg-muted/50 text-muted-foreground">
        <Users class="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>No hay miembros en esta comunidad.</p>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useCommunityStore } from '@/stores/communityStore';
import { storeToRefs } from 'pinia';
import { ChevronRight, Check, Users, Search, Loader2 } from 'lucide-vue-next';
import { Button, Card, Badge, Input } from '@repo/ui';
import { useToast } from '@repo/ui';
import { formatDate } from '@repo/utils';

const { t: $t } = useI18n();

const props = defineProps<{
  id: string; // communityId
  meetingId: string;
}>();

const communityStore = useCommunityStore();
const { currentCommunity, members, loadingCommunity } = storeToRefs(communityStore);
const { toast } = useToast();

const currentMeeting = ref<any>(null);
const loadingMeeting = ref(true);
const searchQuery = ref('');
const savingStates = ref<Record<string, boolean>>({});

// Make members reactive with attended property
const membersWithAttendance = ref<any[]>([]);

// Computed property for filtered members
const filteredMembers = computed(() => {
  if (!searchQuery.value) return membersWithAttendance.value;
  const query = searchQuery.value.toLowerCase().trim();
  return membersWithAttendance.value.filter(member => {
    const fullName = `${member.participant.firstName} ${member.participant.lastName}`.toLowerCase();
    return fullName.includes(query) || (member.participant.email && member.participant.email.toLowerCase().includes(query));
  });
});

// Computed property for present count
const presentCount = computed(() =>
  membersWithAttendance.value.filter(m => m.attended).length
);

onMounted(async () => {
  await communityStore.fetchCommunity(props.id);
  await communityStore.fetchMembers(props.id);

  try {
    const resMeetings = await communityStore.fetchMeetings(props.id);
    currentMeeting.value = resMeetings?.find((m: any) => m.id === props.meetingId);

    // Fetch current attendance to populate
    const existingAttendance = await communityStore.fetchAttendance(props.id, props.meetingId);

    // Initialize members with attendance (default to absent = false)
    membersWithAttendance.value = members.value.map(member => {
      const record = existingAttendance?.find((a: any) => a.memberId === member.id);
      return {
        ...member,
        attended: record ? record.attended : false // Default to absent
      };
    });
  } catch (error) {
    console.error('Failed to load meeting or attendance:', error);
    toast({
      title: 'Error',
      description: 'No se pudo cargar la asistencia',
      variant: 'destructive',
    });
  } finally {
    loadingMeeting.value = false;
  }
});

// Toggle attendance with auto-save
const toggleAttendance = async (member: any) => {
  if (savingStates.value[member.id]) return;

  savingStates.value[member.id] = true;
  const newStatus = !member.attended;

  try {
    await communityStore.recordSingleAttendance(props.id, props.meetingId, member.id, newStatus);

    // Update local state
    member.attended = newStatus;

    // Refetch members to get updated attendance rates
    await communityStore.fetchMembers(props.id);

    // Update membersWithAttendance with new rates while preserving current meeting attendance
    membersWithAttendance.value = members.value.map(m => {
      const existingMember = membersWithAttendance.value.find(mwa => mwa.id === m.id);
      return {
        ...m,
        attended: existingMember?.attended ?? false,
      };
    });

    // Show subtle feedback
    if (newStatus) {
      toast({
        title: `${member.participant.firstName} marcado como presente`,
        duration: 1500,
      });
    }
  } catch (error) {
    console.error('Failed to save attendance:', error);
    toast({
      title: 'Error',
      description: $t('community.attendance.saveError'),
      variant: 'destructive',
    });
    // Revert the change on error
    member.attended = !newStatus;
  } finally {
    savingStates.value[member.id] = false;
  }
};

// Helper function to get badge variant based on frequency
const getFrequencyBadgeVariant = (frequency: string | undefined): any => {
  switch (frequency?.toLowerCase()) {
    case 'high': return 'success';
    case 'medium': return 'warning';
    case 'low': return 'danger';
    case 'none': return 'neutral';
    default: return 'neutral';
  }
};
</script>

<style scoped>
.member-card {
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

.member-card:active:not(.cursor-not-allowed) {
  transform: scale(0.98);
}

/* Ensure touch targets are at least 44x44px for iOS */
.member-card button {
  min-width: 44px;
  min-height: 44px;
}
</style>
