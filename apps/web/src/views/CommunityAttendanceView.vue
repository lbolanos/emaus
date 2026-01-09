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
        <div class="flex gap-2">
          <div class="relative max-w-xs">
            <Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              v-model="searchQuery"
              :placeholder="$t('community.attendance.searchPlaceholder')"
              class="pl-8"
            />
          </div>
          <Button variant="outline" @click="markAllPresent" :disabled="isSaving">
            <UserCheck class="w-4 h-4 mr-2" />
            {{ $t('community.attendance.markAllPresent') }}
          </Button>
          <Button @click="saveAttendance" :disabled="isSaving || hasNoChanges">
            <Loader2 v-if="isSaving" class="w-4 h-4 mr-2 animate-spin" />
            <Check v-else class="w-4 h-4 mr-2" />
            {{ $t('community.attendance.save') }}
          </Button>
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
            <div class="text-2xl font-bold text-destructive">{{ absentCount }}</div>
            <div class="text-sm text-muted-foreground">{{ $t('community.attendance.absent') }}</div>
          </div>
        </Card>
        <Card class="flex-1 p-4">
          <div class="text-center">
            <div class="text-2xl font-bold text-muted-foreground">{{ pendingCount }}</div>
            <div class="text-sm text-muted-foreground">{{ $t('community.attendance.pending') }}</div>
          </div>
        </Card>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{{ $t('participants.name') }}</TableHead>
              <TableHead>{{ $t('community.participationRate') }}</TableHead>
              <TableHead class="text-center">{{ $t('community.meeting.status') }}</TableHead>
              <TableHead class="text-right">{{ $t('community.meeting.recordAttendance') }}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow
              v-for="member in filteredMembers"
              :key="member.id"
              :class="{ 'bg-muted/30': attendanceMap[member.id] === true }"
            >
              <TableCell class="font-medium">
                {{ member.participant.firstName }} {{ member.participant.lastName }}
              </TableCell>
              <TableCell>
                <Badge variant="outline">
                  {{ Math.round(member.lastMeetingsAttendanceRate || 0) }}%
                </Badge>
              </TableCell>
              <TableCell class="text-center">
                <Badge
                  v-if="attendanceMap[member.id] === true"
                  variant="default"
                  class="gap-1"
                >
                  <Check class="w-3 h-3" />
                  {{ $t('community.attendance.present') }}
                </Badge>
                <Badge
                  v-else-if="attendanceMap[member.id] === false"
                  variant="destructive"
                  class="gap-1"
                >
                  <X class="w-3 h-3" />
                  {{ $t('community.attendance.absent') }}
                </Badge>
                <Badge
                  v-else
                  variant="outline"
                  class="gap-1"
                >
                  <Clock class="w-3 h-3" />
                  {{ $t('community.attendance.pending') }}
                </Badge>
              </TableCell>
              <TableCell class="text-right">
                <div class="flex justify-end items-center gap-2">
                  <!-- Quick Present Button (Primary Action) -->
                  <Button
                    size="sm"
                    :variant="attendanceMap[member.id] === true ? 'default' : 'outline'"
                    :class="{
                      'bg-green-600 hover:bg-green-700': attendanceMap[member.id] === true,
                      'hover:bg-green-50 hover:text-green-700 hover:border-green-700 dark:hover:bg-green-950': attendanceMap[member.id] !== true
                    }"
                    @click="togglePresent(member.id)"
                    :aria-label="`${attendanceMap[member.id] === true ? 'Marcar como pendiente' : 'Marcar como presente'}: ${member.participant.firstName} ${member.participant.lastName}`"
                  >
                    <Check class="w-4 h-4 mr-1" />
                    {{ $t('community.attendance.present') }}
                  </Button>

                  <!-- Absent Button (Secondary - Icon Only) -->
                  <Button
                    size="sm"
                    variant="ghost"
                    :class="{
                      'text-destructive hover:bg-destructive/10': attendanceMap[member.id] === false
                    }"
                    @click="setAbsent(member.id)"
                    :aria-label="`Marcar como ausente: ${member.participant.firstName} ${member.participant.lastName}`"
                  >
                    <X class="w-4 h-4" />
                  </Button>

                  <!-- Clear Button (Tertiary - Icon Only) -->
                  <Button
                    v-if="attendanceMap[member.id] !== null"
                    size="sm"
                    variant="ghost"
                    @click="clearAttendance(member.id)"
                    :aria-label="`Limpiar asistencia: ${member.participant.firstName} ${member.participant.lastName}`"
                  >
                    <RotateCcw class="w-4 h-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
            <TableRow v-if="filteredMembers.length === 0">
              <TableCell colspan="4" class="text-center py-8 text-muted-foreground">
                <Users class="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No hay miembros en esta comunidad.</p>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Card>

      <!-- Quick Actions Footer -->
      <Card v-if="hasUnsavedChanges" class="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
        <div class="flex items-center justify-between p-4">
          <div class="flex items-center gap-2">
            <Badge variant="outline" class="bg-amber-100 dark:bg-amber-900">
              {{ unsavedCount }} {{ $t('community.attendance.unsavedChanges') }}
            </Badge>
            <span class="text-sm text-muted-foreground">{{ $t('community.attendance.unsavedWarning') }}</span>
          </div>
          <Button @click="saveAttendance" :disabled="isSaving">
            <Loader2 v-if="isSaving" class="w-4 h-4 mr-2 animate-spin" />
            {{ $t('community.attendance.save') }}
          </Button>
        </div>
      </Card>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useCommunityStore } from '@/stores/communityStore';
import { storeToRefs } from 'pinia';
import { Loader2, ChevronRight, Check, X, Clock, UserCheck, RotateCcw, Users, Search } from 'lucide-vue-next';
import {
  Button, Card, Table, TableHeader, TableRow, TableHead, TableBody, TableCell, Badge, Input
} from '@repo/ui';
import { useToast } from '@repo/ui';
import { useRouter } from 'vue-router';

const { t: $t } = useI18n();

const props = defineProps<{
  id: string; // communityId
  meetingId: string;
}>();

const router = useRouter();
const communityStore = useCommunityStore();
const { currentCommunity, members, loadingCommunity } = storeToRefs(communityStore);
const { toast } = useToast();

const currentMeeting = ref<any>(null);
const loadingMeeting = ref(true);
const isSaving = ref(false);
const searchQuery = ref('');
const attendanceMap = reactive<Record<string, boolean | null>>({});
const initialAttendanceMap = reactive<Record<string, boolean | null>>({});

// Computed property for filtered members
const filteredMembers = computed(() => {
  if (!searchQuery.value) return members.value;
  const query = searchQuery.value.toLowerCase().trim();
  return members.value.filter(member => {
    const fullName = `${member.participant.firstName} ${member.participant.lastName}`.toLowerCase();
    return fullName.includes(query) || (member.participant.email && member.participant.email.toLowerCase().includes(query));
  });
});

onMounted(async () => {
  await communityStore.fetchCommunity(props.id);
  await communityStore.fetchMembers(props.id);

  try {
    const resMeetings = await communityStore.fetchMeetings(props.id);
    currentMeeting.value = resMeetings?.find((m: any) => m.id === props.meetingId);

    // Fetch current attendance to populate
    const existingAttendance = await communityStore.fetchAttendance(props.id, props.meetingId);

    // Initialize maps
    members.value.forEach(member => {
      const record = existingAttendance?.find((a: any) => a.memberId === member.id);
      const value = record ? record.attended : null;
      attendanceMap[member.id] = value;
      initialAttendanceMap[member.id] = value;
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

// Computed properties for stats
const presentCount = computed(() =>
  Object.values(attendanceMap).filter(v => v === true).length
);

const absentCount = computed(() =>
  Object.values(attendanceMap).filter(v => v === false).length
);

const pendingCount = computed(() =>
  Object.values(attendanceMap).filter(v => v === null).length
);

const hasUnsavedChanges = computed(() => {
  return Object.keys(attendanceMap).some(id => attendanceMap[id] !== initialAttendanceMap[id]);
});

const unsavedCount = computed(() => {
  return Object.keys(attendanceMap).filter(id => attendanceMap[id] !== initialAttendanceMap[id]).length;
});

const hasNoChanges = computed(() => !hasUnsavedChanges.value);

// Toggle present status (if present -> clear, if not present -> mark present)
const togglePresent = (memberId: string) => {
  if (attendanceMap[memberId] === true) {
    attendanceMap[memberId] = null; // Clear if already present
  } else {
    attendanceMap[memberId] = true; // Mark as present
  }
};

// Set as absent
const setAbsent = (memberId: string) => {
  attendanceMap[memberId] = false;
};

// Clear attendance (reset to null)
const clearAttendance = (memberId: string) => {
  attendanceMap[memberId] = null;
};

// Mark all as present
const markAllPresent = () => {
  members.value.forEach(member => {
    attendanceMap[member.id] = true;
  });
  toast({
    title: $t('community.attendance.markedAllPresent'),
    description: `${members.value.length} miembros marcados como presentes`,
  });
};

const saveAttendance = async () => {
  const records = Object.entries(attendanceMap)
    .filter(([_, value]) => value !== null)
    .map(([memberId, isPresent]) => ({
      memberId,
      attended: isPresent === true
    }));

  if (records.length === 0) {
    toast({
      title: $t('community.attendance.noChanges'),
      description: $t('community.attendance.noChangesDesc'),
      variant: 'destructive',
    });
    return;
  }

  isSaving.value = true;
  try {
    await communityStore.recordAttendance(props.id, props.meetingId, records);

    // Update initial map to reflect saved state
    Object.assign(initialAttendanceMap, attendanceMap);

    toast({
      title: $t('community.attendance.saved'),
      description: `${records.length} registros de asistencia guardados`,
    });

    router.push({ name: 'community-meetings', params: { id: props.id } });
  } catch (error) {
    console.error('Failed to save attendance:', error);
    toast({
      title: 'Error',
      description: $t('community.attendance.saveError'),
      variant: 'destructive',
    });
  } finally {
    isSaving.value = false;
  }
};
</script>
