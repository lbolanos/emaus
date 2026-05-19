<template>
  <TooltipProvider>
    <div class="p-4 space-y-4">
    <div v-if="loadingCommunity" class="flex justify-center py-12">
      <Loader2 class="w-8 h-8 animate-spin text-primary" />
    </div>

    <template v-else-if="currentCommunity">
      <div class="flex justify-between items-center">
        <div>
          <h1 class="text-2xl font-bold">{{ currentCommunity.name }} - {{ $t('community.meeting.title') }}</h1>
          <div class="flex items-center text-sm text-muted-foreground">
            <router-link :to="{ name: 'community-dashboard', params: { id: currentCommunity.id } }" class="hover:underline">
              {{ $t('community.dashboard') }}
            </router-link>
            <ChevronRight class="w-4 h-4 mx-1" />
            <span>{{ $t('community.meeting.title') }}</span>
          </div>
        </div>
        <Button @click="openCreateModal">
          <CalendarPlus class="w-4 h-4 mr-2" />
          {{ $t('community.meeting.addMeeting') }}
        </Button>
      </div>

      <!-- Filter bar: tabs + search -->
      <div class="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <Tabs v-model="activeTab" class="w-full sm:w-auto">
          <TabsList>
            <TabsTrigger value="upcoming">
              {{ $t('community.meeting.filters.upcoming') }}
              <span class="ml-1.5 text-xs text-muted-foreground">({{ counts.upcoming }})</span>
            </TabsTrigger>
            <TabsTrigger value="past">
              {{ $t('community.meeting.filters.past') }}
              <span class="ml-1.5 text-xs text-muted-foreground">({{ counts.past }})</span>
            </TabsTrigger>
            <TabsTrigger value="all">
              {{ $t('community.meeting.filters.all') }}
              <span class="ml-1.5 text-xs text-muted-foreground">({{ counts.all }})</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div class="relative w-full sm:w-64">
          <Search class="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            v-model="searchQuery"
            type="search"
            :placeholder="$t('community.meeting.searchPlaceholder')"
            class="pl-9"
          />
        </div>
      </div>

      <div class="grid gap-4">
        <Card v-for="meeting in filteredMeetings" :key="meeting.id" :class="{ 'border-l-4 border-l-blue-500': meeting.isAnnouncement, 'opacity-75': isPastMeeting(meeting) }">
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <div class="flex-1">
              <div class="flex items-center gap-2 flex-wrap">
                <Badge v-if="meeting.isAnnouncement" variant="secondary">
                  {{ $t('community.meeting.isAnnouncement') }}
                </Badge>
                <Tooltip v-if="meeting.isRecurrenceTemplate">
                  <TooltipTrigger as-child>
                    <Badge variant="outline" class="flex items-center gap-1 cursor-help">
                      <RefreshCw class="w-3 h-3" />
                      {{ getRecurrenceBadge(meeting) }}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p class="text-xs">{{ getSeriesTooltip(meeting) }}</p>
                  </TooltipContent>
                </Tooltip>
                <CardTitle class="text-xl">{{ meeting.title }}</CardTitle>
              </div>
              <CardDescription class="flex items-center gap-4 mt-1">
                <span class="flex items-center">
                  <Calendar class="w-4 h-4 mr-1" />
                  {{ formatDateTime(meeting.startDate) }}
                </span>
                <template v-if="!meeting.isAnnouncement">
                  <span class="flex items-center">
                    <Clock class="w-4 h-4 mr-1" />
                    {{ meeting.durationMinutes }} min
                  </span>
                  <span class="flex items-center text-green-600 dark:text-green-400">
                    <UserCheck class="w-4 h-4 mr-1" />
                    {{ (meeting as any).attendeeCount ?? 0 }}
                  </span>
                  <span class="flex items-center text-red-600 dark:text-red-400">
                    <UserX class="w-4 h-4 mr-1" />
                    {{ (meeting as any).absentCount ?? 0 }}
                  </span>
                </template>
              </CardDescription>
              <CardDescription v-if="meeting.description" class="mt-2 line-clamp-2">
                {{ meeting.description }}
              </CardDescription>
            </div>
            <div class="flex items-center -space-x-3">
              <Tooltip v-if="!meeting.isAnnouncement">
                <TooltipTrigger as-child>
                  <Button size="sm" variant="outline" as-child>
                    <router-link :to="{ name: 'community-attendance', params: { id: currentCommunity.id, meetingId: meeting.id } }">
                      <CheckSquare class="w-4 h-4" />
                    </router-link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{{ $t('community.meeting.recordAttendance') }}</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button size="sm" variant="ghost" as-child>
                    <router-link :to="{ name: 'community-meeting-flyer', params: { id: currentCommunity.id, meetingId: meeting.id } }">
                      <FileText class="w-4 h-4" />
                    </router-link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Generar Flyer PDF</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip v-if="!meeting.isAnnouncement">
                <TooltipTrigger as-child>
                  <Button size="sm" variant="ghost" @click="copyAttendanceLink(meeting)">
                    <Share class="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{{ $t('community.attendance.copyPublicLink') }}</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip v-if="meeting.isRecurrenceTemplate">
                <TooltipTrigger as-child>
                  <Button size="sm" variant="ghost" @click="handleCreateNextInstance(meeting)" :disabled="loadingCommunity">
                    <CalendarPlus class="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{{ $t('community.meeting.createNextInstance') }}</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button size="sm" variant="ghost" @click="openEditModal(meeting)">
                    <Pencil class="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{{ $t('common.edit') }}</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button size="sm" variant="ghost" class="text-destructive hover:text-destructive" @click="confirmDelete(meeting)">
                    <Trash2 class="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{{ $t('common.delete') }}</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </CardHeader>
        </Card>

        <div v-if="filteredMeetings.length === 0" class="text-center py-12 border rounded-lg bg-muted/50 text-muted-foreground">
          <Calendar class="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p class="text-lg font-medium mb-1">
            {{ meetings.length === 0
              ? $t('community.meeting.noMeetingsFound')
              : $t('community.meeting.noMeetingsMatch') }}
          </p>
          <p class="text-sm">
            {{ meetings.length === 0
              ? 'Crea tu primera reunión o anuncio para comenzar'
              : $t('community.meeting.tryAnotherFilter') }}
          </p>
        </div>
      </div>
    </template>

    <MeetingFormModal
      v-if="currentCommunity"
      v-model:open="isMeetingModalOpen"
      :community-id="currentCommunity.id"
      :meeting-to-edit="meetingToEdit"
      @created="handleMeetingCreated"
      @updated="handleMeetingUpdated"
      @deleted="handleMeetingDeleted"
    />

    <Dialog :open="!!meetingToDelete" @update:open="meetingToDelete = null">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ $t('delete.confirmTitle') }}</DialogTitle>
          <DialogDescription>
            <div v-if="meetingToDelete?.isRecurrenceTemplate" class="space-y-4">
              <p>¿Qué quieres eliminar?</p>
              <RadioGroup v-model="deleteScope">
                <div class="flex items-center gap-2 mb-2">
                  <RadioGroupItem value="this" id="del-this" />
                  <Label for="del-this" class="cursor-pointer">
                    Solo esta reunión
                  </Label>
                </div>
                <div class="flex items-center gap-2">
                  <RadioGroupItem value="all" id="del-all" />
                  <Label for="del-all" class="cursor-pointer">
                    Todas las repeticiones
                  </Label>
                </div>
              </RadioGroup>
            </div>
            <div v-else>
              {{ meetingToDelete?.isAnnouncement
                ? `¿Estás seguro de que quieres eliminar el anuncio "${meetingToDelete?.title}"?`
                : `¿Estás seguro de que quieres eliminar la reunión "${meetingToDelete?.title}"? Todos los registros de asistencia también se eliminarán.`
              }}
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="meetingToDelete = null">{{ $t('common.cancel') }}</Button>
          <Button variant="destructive" @click="handleDelete">
            {{ $t('common.delete') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog :open="!!pastEditConfirm" @update:open="(v: boolean) => !v && (pastEditConfirm = null)">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ $t('community.meeting.editPastTitle') }}</DialogTitle>
          <DialogDescription>
            {{ $t('community.meeting.editPastBody') }}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="pastEditConfirm = null">{{ $t('common.cancel') }}</Button>
          <Button @click="proceedEditPast">
            {{ $t('community.meeting.editAnyway') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </div>
  </TooltipProvider>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { useCommunityStore } from '@/stores/communityStore';
import { storeToRefs } from 'pinia';
import { Loader2, CalendarPlus, Calendar, Clock, CheckSquare, ChevronRight, Pencil, Trash2, RefreshCw, Share, FileText, UserCheck, UserX, Search } from 'lucide-vue-next';
import {
  Button, Card, CardHeader, CardTitle, CardDescription, Badge,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
  RadioGroup, RadioGroupItem, Label, useToast,
  Tabs, TabsList, TabsTrigger, Input,
} from '@repo/ui';
import MeetingFormModal from '@/components/community/MeetingFormModal.vue';
import { formatDateInCommunityTimezone } from '@repo/utils';

const { t: $t } = useI18n();
const { toast } = useToast();

const props = defineProps<{
  id: string;
}>();

const communityStore = useCommunityStore();
const { currentCommunity, meetings, loadingCommunity } = storeToRefs(communityStore);

const isMeetingModalOpen = ref(false);
const meetingToEdit = ref<any>(null);
const meetingToDelete = ref<any>(null);
const deleteScope = ref<'this' | 'all'>('this');

const route = useRoute();
const router = useRouter();

type MeetingFilter = 'upcoming' | 'past' | 'all';
const VALID_FILTERS: readonly MeetingFilter[] = ['upcoming', 'past', 'all'] as const;
const initialFilter = (route.query.filter as MeetingFilter | undefined) ?? 'upcoming';
const activeTab = ref<MeetingFilter>(
  VALID_FILTERS.includes(initialFilter) ? initialFilter : 'upcoming',
);
const searchQuery = ref('');

// Sincronizar filtro con URL para que el back/forward y el deep-link preserven la vista.
watch(activeTab, (value) => {
  router.replace({ query: { ...route.query, filter: value === 'upcoming' ? undefined : value } });
});

const isPastMeeting = (meeting: any) => {
  if (!meeting?.startDate) return false;
  return new Date(meeting.startDate).getTime() < Date.now();
};

const counts = computed(() => {
  const all = meetings.value.length;
  const past = meetings.value.filter(isPastMeeting).length;
  return { all, upcoming: all - past, past };
});

const filteredMeetings = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  let base = meetings.value;
  if (activeTab.value === 'upcoming') {
    base = base.filter((m) => !isPastMeeting(m));
  } else if (activeTab.value === 'past') {
    base = base.filter(isPastMeeting);
  }
  if (q) {
    base = base.filter((m) => {
      const title = (m.title || '').toLowerCase();
      const description = (m.description || '').toLowerCase();
      return title.includes(q) || description.includes(q);
    });
  }
  // Próximas ascendentes (la más cercana primero); pasadas descendentes; todas descendentes.
  const sorted = [...base];
  if (activeTab.value === 'upcoming') {
    sorted.sort(
      (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
    );
  } else {
    sorted.sort(
      (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
    );
  }
  return sorted;
});

onMounted(async () => {
  await communityStore.fetchCommunity(props.id);
  await fetchMeetings();
});

const fetchMeetings = async () => {
  await communityStore.fetchMeetings(props.id);
};

const formatDateTime = (date: string | Date) => {
  // Render en el timezone de la comunidad para que el coordinador vea la hora
  // local independientemente del TZ de su navegador.
  return formatDateInCommunityTimezone(date, currentCommunity.value, {
    locale: 'es-ES',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

/**
 * Devuelve un tooltip describiendo la posición de esta meeting en su serie.
 * - Template raíz: "Serie iniciada el X (N reuniones generadas)".
 * - Instancia: "Ocurrencia N de N (serie iniciada el X)".
 *
 * Las "hermanas" se calculan localmente sobre `meetings` ya cargadas; si la serie
 * fue truncada por filtros en la API, el conteo puede subestimar — es informativo,
 * no contractual.
 */
const getSeriesTooltip = (meeting: any): string => {
  const rootId = meeting.parentMeetingId ?? meeting.id;
  const siblings = meetings.value
    .filter((m) => m.id === rootId || m.parentMeetingId === rootId)
    .sort(
      (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
    );
  const idx = siblings.findIndex((m) => m.id === meeting.id);
  const total = siblings.length;
  const seriesStart = siblings[0]?.startDate;
  const seriesStartStr = seriesStart
    ? formatDateInCommunityTimezone(seriesStart, currentCommunity.value, {
        locale: 'es-ES',
        dateStyle: 'medium',
      })
    : '';

  if (!meeting.parentMeetingId) {
    return `Serie iniciada el ${seriesStartStr} · ${total} reunión${total === 1 ? '' : 'es'} en el listado`;
  }
  return `Ocurrencia ${idx + 1} de ${total} · serie iniciada el ${seriesStartStr}`;
};

const getRecurrenceBadge = (meeting: any) => {
  const { recurrenceFrequency, recurrenceInterval, recurrenceDayOfWeek } = meeting;
  if (recurrenceFrequency === 'daily') return 'Diaria';
  if (recurrenceFrequency === 'weekly') {
    const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const dayIndex = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].indexOf(recurrenceDayOfWeek);
    const dayLabel = dayIndex >= 0 ? days[dayIndex] : '';
    return recurrenceInterval === 1 ? `Cada semana (${dayLabel})` : `Cada ${recurrenceInterval} semanas (${dayLabel})`;
  }
  if (recurrenceFrequency === 'monthly') return 'Mensual';
  return 'Recurrente';
};

const openCreateModal = () => {
  meetingToEdit.value = null;
  isMeetingModalOpen.value = true;
};

const pastEditConfirm = ref<any>(null);

const openEditModal = (meeting: any) => {
  // Si la reunión ya pasó, pedir confirmación antes de abrir el modal.
  // Evita ediciones accidentales sobre historial (e.g. cambiar la hora de algo
  // que ya ocurrió, lo que dejaría inconsistente la asistencia ya registrada).
  if (isPastMeeting(meeting)) {
    pastEditConfirm.value = meeting;
    return;
  }
  meetingToEdit.value = meeting;
  isMeetingModalOpen.value = true;
};

const proceedEditPast = () => {
  if (!pastEditConfirm.value) return;
  meetingToEdit.value = pastEditConfirm.value;
  pastEditConfirm.value = null;
  isMeetingModalOpen.value = true;
};

const confirmDelete = (meeting: any) => {
  meetingToDelete.value = meeting;
  deleteScope.value = 'this';
};

const handleDelete = async () => {
  if (!meetingToDelete.value) return;
  try {
    const scope = meetingToDelete.value.isRecurrenceTemplate ? deleteScope.value : 'this';
    await communityStore.deleteMeeting(meetingToDelete.value.id, scope);
    meetingToDelete.value = null;
  } catch (error) {
    console.error('Failed to delete meeting:', error);
  }
};

// Reset meetingToEdit when modal closes so the watcher fires on next edit
watch(isMeetingModalOpen, (isOpen) => {
  if (!isOpen) {
    meetingToEdit.value = null;
  }
});

const handleMeetingCreated = () => {
  fetchMeetings();
};

const handleMeetingUpdated = (meetingId: string) => {
  fetchMeetings();
};

const handleMeetingDeleted = (meetingId: string) => {
  fetchMeetings();
};

const copyAttendanceLink = (meeting: any) => {
  const link = `${window.location.origin}/public/attendance/${props.id}/${meeting.id}`;
  navigator.clipboard.writeText(link);
  toast({
    title: $t('community.attendance.publicLinkCopied'),
    description: $t('community.attendance.publicLinkWarning'),
  });
};

const handleCreateNextInstance = async (meeting: any) => {
  try {
    const newMeeting = await communityStore.createNextMeetingInstance(meeting.id);
    if (newMeeting?.isPastDate) {
      toast({
        title: $t('community.meeting.nextInstanceCreated'),
        description: 'La reunión fue creada en una fecha anterior a la actual.',
        variant: 'destructive',
      });
    } else {
      toast({
        title: $t('community.meeting.nextInstanceCreated'),
        description: $t('community.meeting.nextInstanceCreatedDesc'),
      });
    }
  } catch (error: any) {
    console.error('Failed to create next instance:', error);
    toast({
      title: $t('community.meeting.nextInstanceError'),
      description: error.response?.data?.message || error.message,
      variant: 'destructive',
    });
  }
};
</script>
