<template>
  <Dialog :open="open" @update:open="handleClose">
    <DialogContent class="sm:max-w-[520px] max-h-[85vh] flex flex-col">
      <DialogHeader>
        <DialogTitle>{{ $t('community.attendance.recordFor') }}</DialogTitle>
        <DialogDescription v-if="member">
          {{ resolveMemberProfile(member).fullName }}
        </DialogDescription>
      </DialogHeader>

      <div v-if="loading" class="flex justify-center py-10">
        <Loader2 class="w-6 h-6 animate-spin text-primary" />
      </div>

      <template v-else>
        <div
          v-if="attendableMeetings.length === 0"
          class="text-center py-10 text-muted-foreground text-sm"
        >
          No hay reuniones para registrar asistencia.
        </div>

        <template v-else>
          <!-- Acciones rápidas -->
          <div class="flex items-center justify-between text-sm">
            <span class="text-muted-foreground">
              {{ selectedCount }} de {{ attendableMeetings.length }} marcadas
            </span>
            <div class="flex gap-1">
              <Button variant="ghost" size="sm" @click="markAll(true)">Marcar todas</Button>
              <Button variant="ghost" size="sm" @click="markAll(false)">Limpiar</Button>
            </div>
          </div>

          <!-- Lista de reuniones (más recientes primero) -->
          <div class="flex-1 overflow-y-auto -mx-1 px-1 py-1 space-y-2">
            <button
              v-for="m in attendableMeetings"
              :key="m.id"
              type="button"
              class="w-full flex items-center gap-3 p-3 border rounded-lg text-left transition-colors"
              :class="localState[m.id]
                ? 'bg-green-50 border-green-300 dark:bg-green-950 dark:border-green-800'
                : 'hover:bg-muted/50'"
              :aria-pressed="!!localState[m.id]"
              @click="toggle(m.id)"
            >
              <span
                class="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center border transition-colors"
                :class="localState[m.id]
                  ? 'bg-green-600 border-green-600 text-white'
                  : 'border-muted-foreground/40 text-transparent'"
              >
                <Check class="w-4 h-4" />
              </span>
              <div class="min-w-0 flex-1">
                <div class="font-medium truncate">{{ m.title }}</div>
                <div class="text-xs text-muted-foreground">{{ formatMeetingDate(m.startDate) }}</div>
              </div>
            </button>
          </div>
        </template>
      </template>

      <DialogFooter>
        <Button variant="outline" :disabled="saving" @click="handleClose">
          {{ $t('common.cancel') }}
        </Button>
        <Button :disabled="saving || loading || !hasChanges" @click="handleSave">
          <Loader2 v-if="saving" class="w-4 h-4 mr-2 animate-spin" />
          {{ $t('common.save') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Button, useToast,
} from '@repo/ui';
import { Loader2, Check } from 'lucide-vue-next';
import { resolveMemberProfile, formatDateInCommunityTimezone } from '@repo/utils';
import {
  getCommunityMeetings,
  getMemberAttendance,
  bulkRecordMemberAttendance,
} from '@/services/api';

const { t: $t } = useI18n();
const { toast } = useToast();

const props = defineProps<{
  open: boolean;
  member: any | null;
  communityId: string;
  community?: any;
}>();

const emit = defineEmits(['update:open', 'saved']);

const loading = ref(false);
const saving = ref(false);
const attendableMeetings = ref<any[]>([]);
// Estado local por reunión (objeto plano → reactivo; NO Set/Map).
const localState = ref<Record<string, boolean>>({});
const initialState = ref<Record<string, boolean>>({});

const formatMeetingDate = (date: string | Date) =>
  formatDateInCommunityTimezone(date, props.community, {
    locale: 'es-MX',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

const selectedCount = computed(
  () => Object.values(localState.value).filter(Boolean).length,
);

const hasChanges = computed(() =>
  attendableMeetings.value.some(
    (m) => (localState.value[m.id] || false) !== (initialState.value[m.id] || false),
  ),
);

const toggle = (id: string) => {
  localState.value[id] = !localState.value[id];
};

const markAll = (value: boolean) => {
  attendableMeetings.value.forEach((m) => {
    localState.value[m.id] = value;
  });
};

const load = async () => {
  if (!props.member || !props.communityId) return;
  loading.value = true;
  try {
    const meetings = await getCommunityMeetings(props.communityId);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    // Reuniones a las que tiene sentido registrar asistencia: reales (no anuncios),
    // no canceladas, ya ocurridas o de hoy. Más recientes primero.
    const filtered = (meetings || [])
      .filter(
        (m: any) =>
          !m.isAnnouncement &&
          m.exceptionType !== 'cancelled' &&
          new Date(m.startDate).getTime() <= endOfToday.getTime(),
      )
      .sort(
        (a: any, b: any) =>
          new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
      );
    attendableMeetings.value = filtered;

    // Una sola llamada: asistencia de este miembro a través de reuniones.
    const memberRecords = await getMemberAttendance(props.communityId, props.member.id);
    const attendedByMeeting = new Map<string, boolean>(
      memberRecords.map((r) => [r.meetingId, r.attended]),
    );
    const state: Record<string, boolean> = {};
    filtered.forEach((m: any) => {
      state[m.id] = attendedByMeeting.get(m.id) === true;
    });
    localState.value = { ...state };
    initialState.value = { ...state };
  } catch (error) {
    console.error('Failed to load member attendance:', error);
    toast({
      title: 'Error',
      description: 'No se pudo cargar la asistencia.',
      variant: 'destructive',
    });
  } finally {
    loading.value = false;
  }
};

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      load();
    } else {
      attendableMeetings.value = [];
      localState.value = {};
      initialState.value = {};
    }
  },
);

const handleClose = () => {
  if (!saving.value) emit('update:open', false);
};

const handleSave = async () => {
  if (!props.member) return;
  // Solo persistir las reuniones cuyo estado cambió (recordSingle es upsert).
  const changed = attendableMeetings.value.filter(
    (m) => (localState.value[m.id] || false) !== (initialState.value[m.id] || false),
  );
  if (changed.length === 0) {
    emit('update:open', false);
    return;
  }
  saving.value = true;
  try {
    await bulkRecordMemberAttendance(
      props.communityId,
      props.member.id,
      changed.map((m) => ({ meetingId: m.id, attended: !!localState.value[m.id] })),
    );
    toast({
      title: 'Asistencia actualizada',
      description: `${changed.length} reunión(es) actualizada(s).`,
    });
    emit('saved');
    emit('update:open', false);
  } catch (error) {
    console.error('Failed to save member attendance:', error);
    toast({
      title: 'Error',
      description: 'No se pudo guardar la asistencia.',
      variant: 'destructive',
    });
  } finally {
    saving.value = false;
  }
};
</script>
