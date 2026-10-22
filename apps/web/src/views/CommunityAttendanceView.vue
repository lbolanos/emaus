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
      <div class="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-start">
        <div class="flex items-start gap-3 min-w-0">
          <img
            v-if="(currentMeeting as any).photoUrl"
            :src="(currentMeeting as any).photoUrl"
            :alt="currentMeeting.title"
            class="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-lg border flex-shrink-0 cursor-pointer transition hover:opacity-90"
            role="button"
            tabindex="0"
            aria-label="Ver foto de la reunión"
            @click="openPhotoPreview()"
            @keydown.enter="openPhotoPreview()"
          />
          <div class="min-w-0">
            <h1 class="text-xl sm:text-2xl font-bold">{{ currentMeeting.title }} - {{ $t('community.meeting.recordAttendance') }}</h1>
            <p class="text-muted-foreground">{{ formatMeetingDate(currentMeeting.startDate) }}</p>
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
        </div>
        <Button class="w-full sm:w-auto sm:flex-shrink-0" @click="isCreateModalOpen = true">
          <UserPlus class="w-4 h-4 mr-2" />
          Crear miembro
        </Button>
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

      <!-- Search, filters and sort: sticky so they stay reachable while scrolling the list.
           The negative top cancels <main>'s top padding (pt-14 on mobile, p-4 from md), which
           would otherwise leave a strip where the cards show through above the bar. On mobile
           the app header is already hidden by then: it hides once scrollTop passes 20px. -->
      <div class="sticky -top-14 md:-top-4 z-10 space-y-2 border-b bg-gray-100 py-2">
        <div class="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
          <div class="flex items-center gap-2 md:contents">
          <!-- ml-6 on mobile clears the app's floating menu button once the bar is stuck -->
          <div class="relative ml-6 flex-1 md:ml-0 md:flex-none lg:w-64">
            <Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              v-model="searchQuery"
              :placeholder="$t('community.attendance.searchPlaceholder')"
              class="pl-8 pr-8 bg-background"
            />
            <button
              v-if="searchQuery"
              type="button"
              class="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground transition-colors"
              @click="searchQuery = ''"
              aria-label="Limpiar búsqueda"
            >
              <X class="h-4 w-4" />
            </button>
          </div>
          <!-- Below md the selects fold behind this button; the search stays in view -->
          <Button
            variant="outline"
            class="shrink-0 md:hidden"
            :aria-expanded="showFilters"
            @click="showFilters = !showFilters"
          >
            <SlidersHorizontal class="mr-2 h-4 w-4" />
            Filtros ({{ activeFilterCount }})
          </Button>
          </div>
          <div
            class="grid-cols-2 gap-2 md:flex md:flex-wrap md:items-center"
            :class="showFilters ? 'grid' : 'hidden'"
          >
            <Select v-model="statusFilter">
              <SelectTrigger class="w-full md:w-40" aria-label="Filtrar por asistencia">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="present">Presentes</SelectItem>
                <SelectItem value="absent">Sin marcar</SelectItem>
              </SelectContent>
            </Select>
            <Select v-model="retreatFilter">
              <SelectTrigger class="w-full md:w-56" aria-label="Filtrar por retiro">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los retiros</SelectItem>
                <SelectItem v-for="retreat in retreatOptions" :key="retreat.id" :value="retreat.id">
                  {{ formatSourceRetreat(retreat) }}
                </SelectItem>
                <SelectItem value="none">Sin retiro</SelectItem>
              </SelectContent>
            </Select>
            <Select v-model="frequencyFilter">
              <SelectTrigger class="w-full md:w-44" aria-label="Filtrar por frecuencia de asistencia">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toda frecuencia</SelectItem>
                <SelectItem value="high">Frecuencia alta</SelectItem>
                <SelectItem value="medium">Frecuencia media</SelectItem>
                <SelectItem value="low">Frecuencia baja</SelectItem>
                <SelectItem value="none">Sin asistencias</SelectItem>
              </SelectContent>
            </Select>
            <Select v-model="photoFilter">
              <SelectTrigger class="w-full md:w-40" aria-label="Filtrar por foto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las fotos</SelectItem>
                <SelectItem value="with">Con foto</SelectItem>
                <SelectItem value="without">Sin foto</SelectItem>
              </SelectContent>
            </Select>
            <Select v-model="sortBy">
              <SelectTrigger class="w-full md:w-52" aria-label="Ordenar">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Nombre (A–Z)</SelectItem>
                <SelectItem value="attendance">Más asistencia primero</SelectItem>
                <SelectItem value="retreat">Retiro más reciente primero</SelectItem>
                <SelectItem value="joined">Ingreso más reciente primero</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div class="flex min-h-7 items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>
            <strong class="text-foreground">{{ presentCount }}</strong> presentes · mostrando
            {{ filteredMembers.length }} de {{ membersWithAttendance.length }}
          </span>
          <Button v-if="hasActiveFilters" variant="ghost" size="sm" class="h-7 px-2" @click="clearFilters">
            Limpiar filtros
          </Button>
        </div>
      </div>

      <!-- Members List - Card-based Layout -->
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
        <div
          v-for="member in filteredMembers"
          :key="member.id"
          class="member-card flex items-center justify-between p-4 border rounded-lg transition-all cursor-pointer"
          :class="{
            'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800': member.attended,
            'bg-card': !member.attended,
            'opacity-50 cursor-not-allowed': savingStates[member.id]
          }"
          @click="toggleAttendance(member)"
        >
          <!-- A button of its own: tapping the photo edits it and must not toggle attendance -->
          <button
            type="button"
            class="mr-3 flex-shrink-0 self-start rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            :aria-label="`Cambiar la foto de ${resolveMemberProfile(member).fullName}`"
            @click.stop="openPhotoDialog(member)"
          >
            <MemberAvatar
              :photo-url="member.photoUrl"
              :full-name="resolveMemberProfile(member).fullName"
              size="lg"
              @error="refreshExpiredPhotos"
            />
          </button>
          <div class="flex-1 min-w-0">
            <div class="font-medium break-words">
              {{ resolveMemberProfile(member).fullName }}
            </div>
            <div class="text-sm text-muted-foreground truncate" v-if="resolveMemberProfile(member).email">
              {{ resolveMemberProfile(member).email }}
            </div>
            <div v-if="member.sourceRetreat" class="text-xs text-muted-foreground">
              Retiro: {{ formatSourceRetreat(member.sourceRetreat) }}
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
        <p v-if="membersWithAttendance.length === 0">No hay miembros en esta comunidad.</p>
        <template v-else>
          <p>Ningún miembro coincide con la búsqueda o los filtros.</p>
          <Button variant="link" @click="clearFilters">Limpiar filtros</Button>
        </template>
      </div>

      <!-- Modal: crear miembro de la comunidad -->
      <CreateMemberModal
        v-model:open="isCreateModalOpen"
        :community-id="currentCommunity.id"
        @created="handleMemberCreated"
      />

      <!-- Foto del miembro: un solo diálogo para todas las tarjetas -->
      <MemberPhotoDialog
        v-model:open="isPhotoDialogOpen"
        :community-id="currentCommunity.id"
        :member-id="photoMember?.id ?? null"
        :member-name="photoMember ? resolveMemberProfile(photoMember).fullName : ''"
        :current-photo-url="photoMember?.photoUrl ?? null"
        @saved="handlePhotoSaved"
      />

      <!-- Lightbox: foto de la reunión ampliada -->
      <Dialog :open="photoPreview" @update:open="(v: boolean) => (photoPreview = v)">
        <DialogContent class="max-w-3xl p-4">
          <DialogHeader>
            <DialogTitle class="text-base pr-8">{{ currentMeeting.title }}</DialogTitle>
          </DialogHeader>
          <img
            v-if="(currentMeeting as any).photoUrl"
            :src="(currentMeeting as any).photoUrl"
            :alt="currentMeeting.title"
            class="w-full max-h-[75vh] object-contain rounded-md"
          />
        </DialogContent>
      </Dialog>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useCommunityStore } from '@/stores/communityStore';
import { storeToRefs } from 'pinia';
import { ChevronRight, Check, Users, Search, Loader2, UserPlus, X, SlidersHorizontal } from 'lucide-vue-next';
import {
  Button,
  Card,
  Badge,
  Input,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui';
import { useToast } from '@repo/ui';
import { formatDate, resolveMemberProfile, formatDateInCommunityTimezone } from '@repo/utils';
import CreateMemberModal from '@/components/community/CreateMemberModal.vue';
import MemberAvatar from '@/components/community/MemberAvatar.vue';
import MemberPhotoDialog from '@/components/community/MemberPhotoDialog.vue';
import {
  DEFAULT_ATTENDANCE_LIST_OPTIONS,
  filterAndSortAttendanceMembers,
  formatSourceRetreat,
  loadAttendancePrefs,
  mergeMembers,
  saveAttendancePrefs,
  sourceRetreatOptions,
  type AttendanceSort,
  type AttendanceStatusFilter,
  type FrequencyFilter,
  type PhotoFilter,
} from '@/utils/communityAttendanceList';

const { t: $t } = useI18n();

const props = defineProps<{
  id: string; // communityId
  meetingId: string;
}>();

const communityStore = useCommunityStore();
const { currentCommunity, members, loadingCommunity } = storeToRefs(communityStore);
const { toast } = useToast();

const currentMeeting = ref<any>(null);

const formatMeetingDate = (date: string | Date) =>
  formatDateInCommunityTimezone(date, currentCommunity.value, {
    locale: 'es-MX',
    preset: 'datetime-long',
  });
const loadingMeeting = ref(true);
const searchQuery = ref('');
const savingStates = ref<Record<string, boolean>>({});
const isCreateModalOpen = ref(false);
const photoPreview = ref(false);

const openPhotoPreview = () => {
  if (!(currentMeeting.value as any)?.photoUrl) return;
  photoPreview.value = true;
};

// Make members reactive with attended property
const membersWithAttendance = ref<any[]>([]);

// Re-reads the members and rebuilds the rows, keeping the attendance marked in
// this session (a new member enters as absent). By default photo URLs that point
// to the same object are kept so the browser does not download them again; pass
// `freshPhotos` to take the new signatures (expired ones).
const reloadMembers = async ({ freshPhotos = false } = {}) => {
  const fresh = await communityStore.fetchMembers(props.id);
  if (!fresh) return;
  const prev = membersWithAttendance.value;
  const attendedById = new Map(prev.map((m) => [m.id, m.attended]));
  const next = members.value.map((m) => ({ ...m, attended: attendedById.get(m.id) ?? false }));
  membersWithAttendance.value = freshPhotos ? next : mergeMembers(prev, next);
};

const handleMemberCreated = () => reloadMembers();

// Filters and sort are remembered per community; the search text is not.
const saved = loadAttendancePrefs(props.id);
const statusFilter = ref<AttendanceStatusFilter>(saved.status);
const retreatFilter = ref<string>(saved.retreat);
const frequencyFilter = ref<FrequencyFilter>(saved.frequency);
const photoFilter = ref<PhotoFilter>(saved.photo);
// Alphabetical by default: it is how people are looked up at the door, and it
// keeps a card in place when a tap refreshes the attendance rates.
const sortBy = ref<AttendanceSort>(saved.sort);
const showFilters = ref(false);

watch([statusFilter, retreatFilter, frequencyFilter, photoFilter, sortBy], () =>
  saveAttendancePrefs(props.id, {
    status: statusFilter.value,
    retreat: retreatFilter.value,
    frequency: frequencyFilter.value,
    photo: photoFilter.value,
    sort: sortBy.value,
  }),
);

// Order frozen by the background refresh while sorting by attendance: the rates
// change under the finger and a card must not jump. Dropped when the sort changes.
const frozenOrder = ref<Map<string, number> | null>(null);
watch(sortBy, () => (frozenOrder.value = null));

const retreatOptions = computed(() => sourceRetreatOptions(membersWithAttendance.value));

const filteredMembers = computed(() => {
  const list = filterAndSortAttendanceMembers(membersWithAttendance.value, {
    query: searchQuery.value,
    status: statusFilter.value,
    retreat: retreatFilter.value,
    frequency: frequencyFilter.value,
    photo: photoFilter.value,
    sort: sortBy.value,
  });
  const order = sortBy.value === 'attendance' ? frozenOrder.value : null;
  if (!order) return list;
  // Stable sort: members the snapshot does not know (new ones) go after it.
  const rank = (id: string) => order.get(id) ?? order.size;
  return [...list].sort((a, b) => rank(a.id) - rank(b.id));
});

// Filters other than the search, which has its own box and is always visible.
const activeFilterCount = computed(
  () =>
    [statusFilter, retreatFilter, frequencyFilter, photoFilter].filter((f) => f.value !== 'all')
      .length,
);

const hasActiveFilters = computed(() => !!searchQuery.value || activeFilterCount.value > 0);

const clearFilters = () => {
  searchQuery.value = '';
  statusFilter.value = 'all';
  retreatFilter.value = 'all';
  frequencyFilter.value = 'all';
  photoFilter.value = 'all';
};

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

    // A remembered retreat filter may point to a retreat that is gone: it would hide everyone.
    if (
      !['all', 'none'].includes(retreatFilter.value) &&
      !retreatOptions.value.some((r) => r.id === retreatFilter.value)
    ) {
      retreatFilter.value = 'all';
    }
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

// Background refresh of the attendance rates, 4 s after the last tap, so a tap
// only touches its own card.
const RATES_REFRESH_DELAY_MS = 4000;
let ratesTimer: ReturnType<typeof setTimeout> | undefined;

const refreshRates = async () => {
  ratesTimer = undefined;
  // Never rebuild the rows while a save is in flight.
  if (Object.values(savingStates.value).some(Boolean)) return scheduleRatesRefresh();
  if (sortBy.value === 'attendance') {
    const order = filterAndSortAttendanceMembers(membersWithAttendance.value, {
      ...DEFAULT_ATTENDANCE_LIST_OPTIONS,
      sort: 'attendance',
    });
    frozenOrder.value = new Map(order.map((m, i) => [m.id, i]));
  }
  try {
    await reloadMembers();
  } catch (error) {
    console.error('Failed to refresh attendance rates:', error);
  }
};

const scheduleRatesRefresh = () => {
  clearTimeout(ratesTimer);
  ratesTimer = setTimeout(refreshRates, RATES_REFRESH_DELAY_MS);
};

// Signed photo URLs expire (1 h). When an image fails, ask for new signatures,
// at most once a minute: if the new ones fail too there is no retry storm.
const SIGNATURE_REFRESH_MIN_GAP_MS = 60_000;
let lastSignatureRefresh = 0;

const refreshExpiredPhotos = async () => {
  const now = Date.now();
  if (now - lastSignatureRefresh < SIGNATURE_REFRESH_MIN_GAP_MS) return;
  lastSignatureRefresh = now;
  try {
    await reloadMembers({ freshPhotos: true });
  } catch (error) {
    console.error('Failed to refresh member photos:', error);
  }
};

onBeforeUnmount(() => clearTimeout(ratesTimer));

// Photo dialog: mounted once, pointed at whichever member's avatar was tapped.
const isPhotoDialogOpen = ref(false);
const photoMemberId = ref<string | null>(null);
const photoMember = computed(
  () => membersWithAttendance.value.find((m) => m.id === photoMemberId.value) ?? null,
);

const openPhotoDialog = (member: any) => {
  photoMemberId.value = member.id;
  isPhotoDialogOpen.value = true;
};

const handlePhotoSaved = (updated: any) => {
  if (!updated?.id) return;
  membersWithAttendance.value = membersWithAttendance.value.map((m) =>
    m.id === updated.id ? { ...m, ...updated, attended: m.attended } : m,
  );
};

// Toggle attendance with auto-save
const toggleAttendance = async (member: any) => {
  if (savingStates.value[member.id]) return;

  savingStates.value[member.id] = true;
  const newStatus = !member.attended;
  // Look the row up again after the await: a refresh may have replaced the object.
  const setAttended = (value: boolean) => {
    const row = membersWithAttendance.value.find((m) => m.id === member.id);
    if (row) row.attended = value;
  };

  try {
    await communityStore.recordSingleAttendance(props.id, props.meetingId, member.id, newStatus);
    setAttended(newStatus);
    scheduleRatesRefresh();

    // Show subtle feedback
    if (newStatus) {
      toast({
        title: `${resolveMemberProfile(member).firstName} marcado como presente`,
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
    setAttended(!newStatus);
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
