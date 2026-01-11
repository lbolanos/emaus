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

      <div class="grid gap-4">
        <Card v-for="meeting in meetings" :key="meeting.id" :class="{ 'border-l-4 border-l-blue-500': meeting.isAnnouncement }">
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <div class="flex-1">
              <div class="flex items-center gap-2 flex-wrap">
                <Badge v-if="meeting.isAnnouncement" variant="secondary">
                  {{ $t('community.meeting.isAnnouncement') }}
                </Badge>
                <Badge v-if="meeting.isRecurrenceTemplate" variant="outline" class="flex items-center gap-1">
                  <RefreshCw class="w-3 h-3" />
                  {{ getRecurrenceBadge(meeting) }}
                </Badge>
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
                    {{ meeting.attendeeCount ?? 0 }}
                  </span>
                  <span class="flex items-center text-red-600 dark:text-red-400">
                    <UserX class="w-4 h-4 mr-1" />
                    {{ meeting.absentCount ?? 0 }}
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

        <div v-if="meetings.length === 0" class="text-center py-12 border rounded-lg bg-muted/50 text-muted-foreground">
          <Calendar class="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p class="text-lg font-medium mb-1">{{ $t('community.meeting.noMeetingsFound') }}</p>
          <p class="text-sm">Crea tu primera reunión o anuncio para comenzar</p>
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
    </div>
  </TooltipProvider>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useCommunityStore } from '@/stores/communityStore';
import { storeToRefs } from 'pinia';
import { Loader2, CalendarPlus, Calendar, Clock, CheckSquare, ChevronRight, Pencil, Trash2, RefreshCw, Share, FileText, UserCheck, UserX } from 'lucide-vue-next';
import {
  Button, Card, CardHeader, CardTitle, CardDescription, Badge,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
  RadioGroup, RadioGroupItem, Label, useToast
} from '@repo/ui';
import MeetingFormModal from '@/components/community/MeetingFormModal.vue';

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

onMounted(async () => {
  await communityStore.fetchCommunity(props.id);
  await fetchMeetings();
});

const fetchMeetings = async () => {
  await communityStore.fetchMeetings(props.id);
};

const formatDateTime = (date: string | Date) => {
  return new Date(date).toLocaleString('es-ES', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
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

const openEditModal = (meeting: any) => {
  meetingToEdit.value = meeting;
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
    await communityStore.createNextMeetingInstance(meeting.id);
    toast({
      title: $t('community.meeting.nextInstanceCreated'),
      description: $t('community.meeting.nextInstanceCreatedDesc'),
    });
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
