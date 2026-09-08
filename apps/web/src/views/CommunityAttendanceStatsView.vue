<template>
  <div class="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
    <!-- Header -->
    <div>
      <div class="flex items-center text-sm text-muted-foreground/80">
        <router-link :to="{ name: 'communities' }" class="hover:underline hover:text-foreground transition-colors">
          {{ $t('community.title') }}
        </router-link>
        <ChevronRight class="w-4 h-4 mx-1" />
        <router-link
          :to="{ name: 'community-dashboard', params: { id } }"
          class="hover:underline hover:text-foreground transition-colors"
        >
          {{ communityName || $t('community.dashboard') }}
        </router-link>
        <ChevronRight class="w-4 h-4 mx-1" />
        <span>{{ $t('community.attendanceStats.title') }}</span>
      </div>
      <h1 class="text-2xl md:text-3xl font-bold tracking-tight mt-2">
        {{ $t('community.attendanceStats.title') }}
      </h1>
      <p class="text-muted-foreground mt-1">{{ $t('community.attendanceStats.description') }}</p>
    </div>

    <!-- Filtros -->
    <Card>
      <CardContent class="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
        <div class="space-y-1">
          <Label for="statsType">{{ $t('community.meeting.meetingType') }}</Label>
          <Select :model-value="filters.meetingType || ALL_TYPES" @update:model-value="onTypeSelect">
            <SelectTrigger id="statsType">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem :value="ALL_TYPES">{{ $t('community.attendanceStats.allTypes') }}</SelectItem>
              <SelectItem v-for="type in typeOptions" :key="type.meetingType" :value="type.meetingType">
                {{ $t(`community.meetingTypes.${type.meetingType}`) }} ({{ type.count }})
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div class="space-y-1">
          <Label for="statsFrom">{{ $t('community.attendanceStats.from') }}</Label>
          <Input id="statsFrom" v-model="filters.from" type="date" />
        </div>
        <div class="space-y-1">
          <Label for="statsTo">{{ $t('community.attendanceStats.to') }}</Label>
          <Input id="statsTo" v-model="filters.to" type="date" />
        </div>
        <div class="space-y-1">
          <Label for="statsRetreat">{{ $t('community.attendanceStats.retreat') }}</Label>
          <Select :model-value="filters.retreatId || ALL_MEMBERS" @update:model-value="onRetreatSelect">
            <SelectTrigger id="statsRetreat">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem :value="ALL_MEMBERS">
                {{ $t('community.attendanceStats.allRetreats') }}
              </SelectItem>
              <SelectItem v-for="retreat in stats?.retreats ?? []" :key="retreat.id" :value="retreat.id">
                {{ retreat.label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div class="flex gap-2">
          <Button variant="outline" :disabled="!hasFilters" @click="clearFilters">
            <X class="w-4 h-4 mr-2" />
            {{ $t('community.attendanceStats.clearFilters') }}
          </Button>
        </div>
      </CardContent>
    </Card>

    <div v-if="loading" class="flex justify-center items-center py-24">
      <Loader2 class="w-10 h-10 animate-spin text-primary" />
    </div>

    <template v-else-if="stats">
      <!-- KPIs -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader class="pb-2">
            <CardTitle class="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CalendarDays class="w-4 h-4" />
              {{ $t('community.attendanceStats.meetingsConsidered') }}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p class="text-3xl font-bold">{{ stats.totals.meetingCount }}</p>
            <p class="text-xs text-muted-foreground mt-1">
              {{ $t('community.attendanceStats.meetingsConsideredHint') }}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader class="pb-2">
            <CardTitle class="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users class="w-4 h-4" />
              {{ $t('community.attendanceStats.membersOnRoster') }}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p class="text-3xl font-bold">{{ stats.totals.memberCount }}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader class="pb-2">
            <CardTitle class="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp class="w-4 h-4" />
              {{ $t('community.attendanceStats.averageAttendance') }}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p class="text-3xl font-bold">{{ Math.round(stats.totals.averageRatePercent) }}%</p>
            <Progress :model-value="stats.totals.averageRatePercent" class="h-1.5 mt-2" />
          </CardContent>
        </Card>
      </div>

      <!-- Vacío. Dos causas distintas y dos mensajes distintos: un retiro sin
           preparaciones sincronizadas no es "no fue nadie", es "todavía no
           existen las reuniones", y eso tiene un arreglo concreto. -->
      <Card v-if="stats.meetings.length === 0">
        <CardContent class="py-12 text-center space-y-2">
          <CalendarOff class="w-10 h-10 mx-auto text-muted-foreground" />
          <template v-if="retreatNotSynced">
            <p class="font-medium">{{ $t('community.attendanceStats.retreatNotSynced') }}</p>
            <p class="text-sm text-muted-foreground">
              {{ $t('community.attendanceStats.retreatNotSyncedHint') }}
            </p>
            <Button variant="outline" size="sm" as-child class="mt-2">
              <router-link :to="{ name: 'retreat-preparations', params: { id: filters.retreatId } }">
                {{ $t('community.attendanceStats.goToPreparations') }}
              </router-link>
            </Button>
          </template>
          <template v-else>
            <p class="font-medium">{{ $t('community.attendanceStats.noMeetings') }}</p>
            <p class="text-sm text-muted-foreground">
              {{ $t('community.attendanceStats.noMeetingsHint') }}
            </p>
          </template>
        </CardContent>
      </Card>

      <template v-else>
        <!-- Evolución -->
        <Card>
          <CardHeader>
            <CardTitle class="text-lg">{{ $t('community.attendanceStats.evolution') }}</CardTitle>
          </CardHeader>
          <CardContent class="h-[300px]">
            <Line :data="evolutionChartData" :options="lineOptions" />
          </CardContent>
        </Card>

        <!-- Por reunión -->
        <Card>
          <CardHeader>
            <CardTitle class="text-lg">{{ $t('community.attendanceStats.byMeeting') }}</CardTitle>
          </CardHeader>
          <CardContent class="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{{ $t('community.attendanceStats.date') }}</TableHead>
                  <TableHead>{{ $t('community.attendanceStats.meeting') }}</TableHead>
                  <TableHead class="text-right">{{ $t('community.attendanceStats.attendees') }}</TableHead>
                  <TableHead class="w-[180px]">{{ $t('community.attendanceStats.attendance') }}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="meeting in stats.meetings" :key="meeting.id">
                  <TableCell class="whitespace-nowrap">{{ formatMeetingDate(meeting.startDate) }}</TableCell>
                  <TableCell>
                    <div class="flex items-center gap-2">
                      <span>{{ meeting.title }}</span>
                      <Badge v-if="meeting.meetingType !== 'general'" variant="outline">
                        {{ $t(`community.meetingTypes.${meeting.meetingType}`) }}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell class="text-right whitespace-nowrap">
                    {{ meeting.attended }} / {{ meeting.eligible }}
                  </TableCell>
                  <TableCell>
                    <div class="flex items-center gap-2">
                      <span class="text-sm font-bold w-10 text-right">{{ Math.round(meeting.ratePercent) }}%</span>
                      <Progress :model-value="meeting.ratePercent" class="h-2 flex-1" />
                    </div>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <!-- Ranking de miembros -->
        <Card>
          <CardHeader class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle class="text-lg">{{ $t('community.attendanceStats.byMember') }}</CardTitle>
            <div class="flex flex-wrap items-center gap-2">
              <label class="flex items-center gap-2 text-sm text-muted-foreground mr-2">
                <Checkbox :model-value="showDeclined" @update:model-value="showDeclined = $event === true" />
                {{ $t('community.attendanceStats.showDeclined') }}
              </label>
              <Button variant="outline" size="sm" :disabled="exporting" @click="exportExcel">
                <Download class="w-4 h-4 mr-2" />
                {{ $t('community.attendanceStats.exportExcel') }}
              </Button>
              <Button variant="outline" size="sm" :disabled="exporting" @click="exportPdf">
                <FileDown class="w-4 h-4 mr-2" />
                {{ $t('community.attendanceStats.exportPdf') }}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <!-- Escritorio -->
            <div class="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <button class="flex items-center gap-1" @click="sortBy('name')">
                        {{ $t('community.attendanceStats.member') }}
                        <component :is="sortIcon('name')" class="w-3 h-3" />
                      </button>
                    </TableHead>
                    <TableHead>{{ $t('community.attendanceStats.state') }}</TableHead>
                    <TableHead class="text-right">
                      <button class="flex items-center gap-1 ml-auto" @click="sortBy('served')">
                        {{ $t('community.attendanceStats.retreatsServed') }}
                        <component :is="sortIcon('served')" class="w-3 h-3" />
                      </button>
                    </TableHead>
                    <TableHead class="text-right">
                      <button class="flex items-center gap-1 ml-auto" @click="sortBy('rate')">
                        {{ $t('community.attendanceStats.attendance') }}
                        <component :is="sortIcon('rate')" class="w-3 h-3" />
                      </button>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-for="member in paginatedMembers" :key="member.memberId">
                    <TableCell class="font-medium">{{ member.firstName }} {{ member.lastName }}</TableCell>
                    <TableCell class="text-muted-foreground text-sm">
                      {{ $t(`community.memberStates.${member.state}`) }}
                    </TableCell>
                    <TableCell class="text-right tabular-nums">{{ member.retreatsServed }}</TableCell>
                    <TableCell class="text-right">
                      <Badge :variant="frequencyVariant(member.frequency)">
                        {{ Math.round(member.ratePercent) }}% · {{ member.attended }}/{{ member.total }}
                      </Badge>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            <!-- Móvil -->
            <div class="md:hidden space-y-2">
              <div
                v-for="member in paginatedMembers"
                :key="member.memberId"
                class="flex items-center justify-between gap-3 p-3 border rounded-lg"
              >
                <div class="min-w-0">
                  <p class="font-medium truncate">{{ member.firstName }} {{ member.lastName }}</p>
                  <p class="text-xs text-muted-foreground">
                    {{ $t(`community.memberStates.${member.state}`) }}
                    ·
                    {{ $t('community.attendanceStats.retreatsServedShort', { count: member.retreatsServed }) }}
                  </p>
                </div>
                <Badge :variant="frequencyVariant(member.frequency)" class="shrink-0">
                  {{ Math.round(member.ratePercent) }}% · {{ member.attended }}/{{ member.total }}
                </Badge>
              </div>
            </div>

            <p v-if="visibleMembers.length === 0" class="py-8 text-center text-muted-foreground">
              {{ $t('community.attendanceStats.noMembers') }}
            </p>

            <!-- Paginación -->
            <div v-if="totalPages > 1" class="flex items-center justify-between pt-4">
              <Button variant="outline" size="sm" :disabled="page === 1" @click="page--">
                {{ $t('common.previous') }}
              </Button>
              <span class="text-sm text-muted-foreground">{{ page }} / {{ totalPages }}</span>
              <Button variant="outline" size="sm" :disabled="page === totalPages" @click="page++">
                {{ $t('common.next') }}
              </Button>
            </div>
          </CardContent>
        </Card>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  Badge, Button, Card, CardContent, CardHeader, CardTitle, Checkbox, Input, Label, Progress,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  useToast,
} from '@repo/ui';
import {
  CalendarDays, CalendarOff, ChevronDown, ChevronRight, ChevronUp, ChevronsUpDown,
  Download, FileDown, Loader2, TrendingUp, Users, X,
} from 'lucide-vue-next';
import { Line } from 'vue-chartjs';
import {
  CategoryScale, Chart as ChartJS, Legend, LineElement, LinearScale, PointElement, Title, Tooltip,
} from 'chart.js';
import { formatDateInCommunityTimezone } from '@repo/utils';
import { getCommunityAttendanceStats } from '@/services/api';
import { useCommunityStore } from '@/stores/communityStore';
import type { AttendanceStatsMemberRow, CommunityAttendanceStats, ParticipationFrequency } from '@repo/types';

// El dashboard solo registra los elementos del Pie. Sin LineElement/PointElement/
// LinearScale la gráfica de línea no dibuja nada y no avisa.
ChartJS.register(Title, Tooltip, Legend, CategoryScale, LinearScale, LineElement, PointElement);

const props = defineProps<{ id: string }>();

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const { toast } = useToast();
const communityStore = useCommunityStore();

/** Sentinel del Select: reka-ui no admite '' como valor de SelectItem. */
const ALL_TYPES = '__all__';
/** Sentinel del selector de alcance: todo el padrón, sin acotar a un retiro. */
const ALL_MEMBERS = '__roster__';
const PAGE_SIZE = 25;

const loading = ref(true);
const exporting = ref(false);
const stats = ref<CommunityAttendanceStats | null>(null);
const showDeclined = ref(false);
const page = ref(1);
const sortKey = ref<'rate' | 'name' | 'served'>('rate');
const sortDir = ref<'asc' | 'desc'>('desc');

const asQueryString = (value: unknown): string =>
  typeof value === 'string' ? value : '';

const filters = ref({
  meetingType: asQueryString(route.query.meetingType),
  from: asQueryString(route.query.from),
  to: asQueryString(route.query.to),
  retreatId: asQueryString(route.query.retreatId),
});

const hasFilters = computed(
  () =>
    Boolean(
      filters.value.meetingType ||
        filters.value.from ||
        filters.value.to ||
        filters.value.retreatId,
    ),
);

const communityName = computed(() => communityStore.currentCommunity?.name ?? '');

/**
 * Hay un retiro elegido y NINGUNA de sus preparaciones está sincronizada como
 * reunión de comunidad. Es la causa más probable de un informe vacío al filtrar
 * por retiro, y tiene arreglo concreto (el botón "Sincronizar" del calendario),
 * así que se distingue del "no hubo reuniones" genérico.
 */
const retreatNotSynced = computed(
  () => Boolean(filters.value.retreatId) && stats.value?.retreatLinkedMeetingCount === 0,
);

// Los tipos vienen del backend (solo los que la comunidad usa), pero el tipo
// seleccionado se mantiene en la lista aunque su conteo caiga a 0 por el rango
// de fechas: si desapareciera, el Select se quedaría sin opción y en blanco.
const typeOptions = computed(() => {
  const available = stats.value?.availableTypes ?? [];
  const selected = filters.value.meetingType;
  if (selected && !available.some((entry) => entry.meetingType === selected)) {
    return [...available, { meetingType: selected as never, count: 0 }];
  }
  return available;
});

const onTypeSelect = (value: unknown) => {
  filters.value.meetingType = value === ALL_TYPES ? '' : String(value ?? '');
};

const clearFilters = () => {
  filters.value = { meetingType: '', from: '', to: '', retreatId: '' };
};

const onRetreatSelect = (value: unknown) => {
  filters.value.retreatId = value === ALL_MEMBERS ? '' : String(value ?? '');
};

// Lista POSITIVA a propósito (regla del skill `community-state-semantics`): con un
// `NOT IN [declinados]` cualquier estado nuevo entra al ranking sin que nadie lo
// decida. Son los mismos dos estados que el `ROSTER_STATES` del backend.
const ROSTER_STATES = new Set(['active_member', 'pending_verification']);

const visibleMembers = computed<AttendanceStatsMemberRow[]>(() => {
  const members = stats.value?.members ?? [];
  const filtered = showDeclined.value
    ? members
    : members.filter((member) => ROSTER_STATES.has(member.state));
  const direction = sortDir.value === 'asc' ? 1 : -1;
  return [...filtered].sort((a, b) => {
    if (sortKey.value === 'name') {
      return direction * `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`);
    }
    if (sortKey.value === 'served') {
      return direction * (a.retreatsServed - b.retreatsServed);
    }
    return direction * (a.ratePercent - b.ratePercent);
  });
});

const totalPages = computed(() => Math.max(1, Math.ceil(visibleMembers.value.length / PAGE_SIZE)));
const paginatedMembers = computed(() =>
  visibleMembers.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE),
);

const sortBy = (key: 'rate' | 'name' | 'served') => {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = key;
    sortDir.value = key === 'name' ? 'asc' : 'desc';
  }
};

const sortIcon = (key: 'rate' | 'name' | 'served') => {
  if (sortKey.value !== key) return ChevronsUpDown;
  return sortDir.value === 'asc' ? ChevronUp : ChevronDown;
};

const frequencyVariant = (frequency: ParticipationFrequency) => {
  if (frequency === 'high') return 'success';
  if (frequency === 'medium') return 'warning';
  if (frequency === 'low') return 'danger';
  return 'neutral';
};

const formatMeetingDate = (date: string | Date) =>
  formatDateInCommunityTimezone(date, communityStore.currentCommunity, {
    locale: 'es-MX',
    dateStyle: 'medium',
  });

const evolutionChartData = computed(() => ({
  labels: (stats.value?.meetings ?? []).map((meeting) => formatMeetingDate(meeting.startDate)),
  datasets: [
    {
      label: t('community.attendanceStats.attendance'),
      data: (stats.value?.meetings ?? []).map((meeting) => Math.round(meeting.ratePercent)),
      borderColor: '#10b981',
      backgroundColor: 'rgba(16, 185, 129, 0.2)',
      tension: 0.3,
      pointRadius: 4,
    },
  ],
}));

const lineOptions = {
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    y: { beginAtZero: true, max: 100, ticks: { callback: (value: number | string) => `${value}%` } },
  },
  plugins: { legend: { display: false } },
};

const load = async () => {
  loading.value = true;
  try {
    stats.value = await getCommunityAttendanceStats(props.id, {
      meetingType: filters.value.meetingType || undefined,
      from: filters.value.from || undefined,
      to: filters.value.to || undefined,
      retreatId: filters.value.retreatId || undefined,
    });
    page.value = 1;
  } catch (error) {
    console.error('Failed to load attendance stats:', error);
    toast({
      title: t('community.attendanceStats.loadError'),
      variant: 'destructive',
    });
  } finally {
    loading.value = false;
  }
};

const exportRows = () => [
  ['Miembro', 'Estado', 'Retiros servidos', 'Asistidas', 'Reuniones', '%'],
  ...visibleMembers.value.map((member) => [
    `${member.firstName} ${member.lastName}`.trim(),
    t(`community.memberStates.${member.state}`),
    member.retreatsServed,
    member.attended,
    member.total,
    Math.round(member.ratePercent),
  ]),
];

const exportFileName = () => {
  const type = filters.value.meetingType
    ? t(`community.meetingTypes.${filters.value.meetingType}`)
    : t('community.attendanceStats.allTypes');
  const slug = `${type}-${communityName.value}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `asistencia-${slug}-${new Date().toISOString().slice(0, 10)}`;
};

const downloadBlob = (blob: Blob, filename: string) => {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.URL.revokeObjectURL(url);
};

const exportExcel = async () => {
  exporting.value = true;
  try {
    // Import dinámico: exceljs pesa lo suyo y solo lo necesita quien exporta.
    const { default: ExcelJS } = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Asistencia');
    exportRows().forEach((row) => sheet.addRow(row));
    sheet.getRow(1).font = { bold: true };
    sheet.columns.forEach((column, index) => {
      column.width = index === 0 ? 32 : 16;
    });
    const buffer = await workbook.xlsx.writeBuffer();
    downloadBlob(
      new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      `${exportFileName()}.xlsx`,
    );
    toast({ title: t('community.attendanceStats.exportSuccess') });
  } catch (error) {
    console.error('Failed to export attendance stats to Excel:', error);
    toast({ title: t('community.attendanceStats.exportFailed'), variant: 'destructive' });
  } finally {
    exporting.value = false;
  }
};

const exportPdf = async () => {
  exporting.value = true;
  try {
    const { default: JsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');
    const doc = new JsPDF({ unit: 'mm', format: 'a4', compress: true });
    const [header, ...body] = exportRows();
    const typeLabel = filters.value.meetingType
      ? t(`community.meetingTypes.${filters.value.meetingType}`)
      : t('community.attendanceStats.allTypes');
    doc.setFontSize(14);
    doc.text(`${t('community.attendanceStats.title')} — ${typeLabel}`, 14, 16);
    doc.setFontSize(10);
    doc.text(communityName.value, 14, 22);
    autoTable(doc, {
      head: [header as string[]],
      body: body as (string | number)[][],
      startY: 28,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [37, 99, 235] },
      alternateRowStyles: { fillColor: [244, 246, 251] },
    });
    doc.save(`${exportFileName()}.pdf`);
    toast({ title: t('community.attendanceStats.exportSuccess') });
  } catch (error) {
    console.error('Failed to export attendance stats to PDF:', error);
    toast({ title: t('community.attendanceStats.exportFailed'), variant: 'destructive' });
  } finally {
    exporting.value = false;
  }
};

// Los filtros viven en la URL para poder compartir el enlace y para que el
// back/forward del navegador funcione, igual que el `?filter=past` del listado
// de reuniones.
watch(
  filters,
  () => {
    router.replace({
      query: {
        ...route.query,
        meetingType: filters.value.meetingType || undefined,
        from: filters.value.from || undefined,
        to: filters.value.to || undefined,
        retreatId: filters.value.retreatId || undefined,
      },
    });
    load();
  },
  { deep: true },
);

watch(visibleMembers, () => {
  if (page.value > totalPages.value) page.value = 1;
});

watch(
  () => props.id,
  async (communityId) => {
    if (!communityId) return;
    if (communityStore.currentCommunity?.id !== communityId) {
      await communityStore.fetchCommunity(communityId).catch(() => undefined);
    }
    await load();
  },
  { immediate: true },
);
</script>
