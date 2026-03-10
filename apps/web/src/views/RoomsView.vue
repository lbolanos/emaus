<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useRetreatStore } from '@/stores/retreatStore';
import { api, exportRoomLabelsToDocx } from '@/services/api';
import { Button } from '@repo/ui';
import { useToast } from '@repo/ui';
import { Loader2 } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import type { RetreatBed } from '@repo/types';

const route = useRoute();
const retreatStore = useRetreatStore();
const { toast } = useToast();
const { t } = useI18n();
const beds = ref<RetreatBed[]>([]);
const loading = ref(true);
const isExporting = ref(false);
const printSize = ref<'small' | 'medium' | 'large'>('medium');

const retreatId = computed(() => route.params.id as string || retreatStore.selectedRetreatId);

const retreatName = computed(() => {
  return retreatStore.selectedRetreat?.parish || '';
});

const retreatData = computed(() => {
  return (retreatStore.selectedRetreat as any) || null;
});

const retreatNumber = computed(() => {
  return retreatData.value?.retreat_number_version || '';
});

const retreatTypeLogo = computed(() => {
  if (retreatData.value?.retreat_type) {
    const logos: Record<string, string> = {
      men: '/man_logo.png',
      women: '/woman_logo.png',
      couples: '/crossRoseButtT.png',
      effeta: '/crossRoseButtT.png'
    };
    return logos[retreatData.value.retreat_type] || '/crossRoseButtT.png';
  }

  const parish = retreatData.value?.parish?.toLowerCase() || '';
  const houseName = retreatData.value?.house?.name?.toLowerCase() || '';
  const paymentInfo = retreatData.value?.paymentInfo?.toLowerCase() || '';

  if (parish.includes('mujer') || houseName.includes('mujer') || paymentInfo.includes('mujer')) {
    return '/woman_logo.png';
  }
  if (parish.includes('matrimonio') || houseName.includes('matrimonio') || paymentInfo.includes('matrimonio')) {
    return '/man_logo.png';
  }

  return '/man_logo.png';
});

const colorScheme = computed(() => {
  const type = retreatData.value?.retreat_type || '';
  const parish = retreatData.value?.parish?.toLowerCase() || '';
  const houseName = retreatData.value?.house?.name?.toLowerCase() || '';

  let detected = type;
  if (!detected) {
    if (parish.includes('mujer') || houseName.includes('mujer')) detected = 'women';
    else if (parish.includes('matrimonio') || houseName.includes('matrimonio')) detected = 'couples';
    else if (parish.includes('effeta') || houseName.includes('effeta')) detected = 'effeta';
    else detected = 'men';
  }

  const schemes: Record<string, Record<string, string>> = {
    men: {
      '--rc-primary': '#2563eb',
      '--rc-primary-dark': '#1d4ed8',
      '--rc-header-from': '#eff6ff',
      '--rc-header-via': '#dbeafe',
      '--rc-header-to': '#bfdbfe',
      '--rc-border': 'rgba(37, 99, 235, 0.1)',
      '--rc-label': '#1e40af',
      '--rc-count-bg': 'rgba(37, 99, 235, 0.1)',
      '--rc-shadow': 'rgba(37, 99, 235, 0.3)',
      '--rc-line-mid': '#bfdbfe',
      '--rc-emaus': '#2563eb',
      '--rc-print-number': '#2563eb',
    },
    women: {
      '--rc-primary': '#e11d48',
      '--rc-primary-dark': '#be123c',
      '--rc-header-from': '#fff1f2',
      '--rc-header-via': '#ffe4e6',
      '--rc-header-to': '#fecdd3',
      '--rc-border': 'rgba(225, 29, 72, 0.1)',
      '--rc-label': '#9f1239',
      '--rc-count-bg': 'rgba(225, 29, 72, 0.1)',
      '--rc-shadow': 'rgba(225, 29, 72, 0.3)',
      '--rc-line-mid': '#fecdd3',
      '--rc-emaus': '#e11d48',
      '--rc-print-number': '#e11d48',
    },
    couples: {
      '--rc-primary': '#7c3aed',
      '--rc-primary-dark': '#6d28d9',
      '--rc-header-from': '#f5f3ff',
      '--rc-header-via': '#ede9fe',
      '--rc-header-to': '#ddd6fe',
      '--rc-border': 'rgba(124, 58, 237, 0.1)',
      '--rc-label': '#5b21b6',
      '--rc-count-bg': 'rgba(124, 58, 237, 0.1)',
      '--rc-shadow': 'rgba(124, 58, 237, 0.3)',
      '--rc-line-mid': '#ddd6fe',
      '--rc-emaus': '#7c3aed',
      '--rc-print-number': '#7c3aed',
    },
    effeta: {
      '--rc-primary': '#0d9488',
      '--rc-primary-dark': '#0f766e',
      '--rc-header-from': '#f0fdfa',
      '--rc-header-via': '#ccfbf1',
      '--rc-header-to': '#99f6e4',
      '--rc-border': 'rgba(13, 148, 136, 0.1)',
      '--rc-label': '#115e59',
      '--rc-count-bg': 'rgba(13, 148, 136, 0.1)',
      '--rc-shadow': 'rgba(13, 148, 136, 0.3)',
      '--rc-line-mid': '#99f6e4',
      '--rc-emaus': '#0d9488',
      '--rc-print-number': '#0d9488',
    },
  };

  return schemes[detected] || schemes.men;
});

const bedTypeLabel = (type: string): string => {
  const map: Record<string, string> = {
    'normal': t('badges.normalBed'),
    'litera_abajo': t('badges.bottomBunk'),
    'litera_arriba': t('badges.topBunk'),
    'colchon': t('badges.mattress'),
  };
  return map[type] || type;
};

const bedTypeIcon = (type: string): string => {
  const map: Record<string, string> = {
    'normal': '🛏️',
    'litera_abajo': '⬇️',
    'litera_arriba': '⬆️',
    'colchon': '🛌',
  };
  return map[type] || '🛏️';
};

const totalBeds = computed(() => beds.value.length);
const assignedBeds = computed(() => beds.value.filter(b => b.participant).length);
const totalRooms = computed(() => {
  const rooms = new Set(beds.value.map(b => `${b.floor}-${b.roomNumber}`));
  return rooms.size;
});

const fetchBeds = async () => {
  if (!retreatId.value) return;
  loading.value = true;
  try {
    const response = await api.get(`/retreats/${retreatId.value}/beds`);
    beds.value = response.data;
  } catch (error) {
    console.error('Error fetching beds:', error);
  } finally {
    loading.value = false;
  }
};

const printContent = () => {
  window.print();
};

const handleExportRoomLabels = async () => {
  if (!retreatId.value) {
    toast({
      title: t('common.error'),
      description: 'Por favor, selecciona un retiro.',
      variant: 'destructive',
    });
    return;
  }

  isExporting.value = true;
  try {
    await exportRoomLabelsToDocx(retreatId.value);
    toast({
      title: t('rooms.exportSuccess.title'),
      description: t('rooms.exportSuccess.description'),
    });
  } catch (error) {
    console.error('Error exporting room labels:', error);
    toast({
      title: t('rooms.exportError.title'),
      description: t('rooms.exportError.description'),
      variant: 'destructive',
    });
  } finally {
    isExporting.value = false;
  }
};

onMounted(async () => {
  const id = retreatId.value;
  if (id && !retreatStore.selectedRetreat) {
    await retreatStore.fetchRetreat(id);
  }
  await fetchBeds();
});

watch(retreatId, async (newId) => {
  if (newId) {
    await fetchBeds();
  }
});

const groupedBeds = computed(() => {
  return beds.value.reduce((acc, bed) => {
    const floor = bed.floor ?? 'Sin piso';
    const roomNumber = bed.roomNumber;

    if (!acc[floor]) {
      acc[floor] = {};
    }
    if (!acc[floor][roomNumber]) {
      acc[floor][roomNumber] = [];
    }
    acc[floor][roomNumber].push(bed);
    return acc;
  }, {} as Record<string | number, Record<string, RetreatBed[]>>);
});

const roomAssignedCount = (roomBeds: RetreatBed[]): number => {
  return roomBeds.filter(b => b.participant).length;
};
</script>

<template>
  <div class="p-4 print-container" :class="`print-size-${printSize}`" :style="colorScheme">
    <!-- Print Header (only visible when printing) -->
    <div class="print-header">
      <div class="print-header-left">
        <img :src="retreatTypeLogo" alt="Logo" class="print-logo" />
        <span class="print-emaus">Emaús</span>
      </div>
      <div class="print-header-center">
        <h1 class="print-title">{{ $t('rooms.title') }}</h1>
        <p v-if="retreatName" class="print-retreat-name">{{ retreatName }}</p>
        <span v-if="retreatNumber" class="print-retreat-number">{{ retreatNumber }}</span>
      </div>
      <div class="print-header-right">
        <span class="print-stat">{{ totalRooms }} habitaciones</span>
        <span class="print-stat">{{ assignedBeds }}/{{ totalBeds }} camas</span>
      </div>
      <div class="print-header-line"></div>
    </div>

    <!-- Toolbar (no-print) -->
    <div class="flex justify-between items-center mb-4 no-print">
      <h1 class="text-2xl font-bold">{{ $t('rooms.title') }}</h1>
      <div class="flex gap-2 items-center">
        <label class="text-sm text-gray-600 mr-1">Tamaño impresión:</label>
        <select
          v-model="printSize"
          class="text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="small">Pequeño</option>
          <option value="medium">Mediano</option>
          <option value="large">Grande</option>
        </select>
        <Button @click="handleExportRoomLabels" :disabled="isExporting">
          <Loader2 v-if="isExporting" class="w-4 h-4 mr-2 animate-spin" />
          {{ isExporting ? $t('rooms.exporting') : $t('rooms.exportLabels') }}
        </Button>
        <Button @click="printContent">
          {{ $t('common.actions.print') }}
        </Button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="text-center py-8">
      <Loader2 class="w-8 h-8 mx-auto animate-spin mb-4" />
      <p>{{ $t('participants.loading') }}</p>
    </div>

    <!-- Empty state -->
    <div v-else-if="!beds.length" class="text-center py-8">
      <p>{{ $t('rooms.noRoomsFound') }}</p>
    </div>

    <!-- Room cards -->
    <div v-else>
      <div v-for="(floorRooms, floor) in groupedBeds" :key="floor" class="mb-8 print-section">
        <!-- Floor header -->
        <div class="floor-header">
          <div class="floor-accent"></div>
          <h2 class="floor-title">{{ $t('rooms.floor') }} {{ floor }}</h2>
          <div class="floor-line"></div>
        </div>

        <!-- Rooms grid -->
        <div class="rooms-grid">
          <div v-for="(roomBeds, roomNumber) in floorRooms" :key="roomNumber" class="room-card">
            <!-- Room card header -->
            <div class="room-card-header">
              <img :src="retreatTypeLogo" alt="Logo" class="room-logo" />
              <div class="room-number-badge">{{ roomNumber }}</div>
              <span class="room-label">{{ $t('rooms.room') }}</span>
              <span class="room-bed-count">{{ roomAssignedCount(roomBeds) }}/{{ roomBeds.length }}</span>
            </div>

            <!-- Bed rows -->
            <div class="room-card-body">
              <div
                v-for="bed in roomBeds"
                :key="bed.id"
                class="bed-row"
                :class="{ 'bed-unassigned': !bed.participant }"
              >
                <span class="bed-number-badge">{{ bed.bedNumber }}</span>
                <span class="bed-participant">
                  {{ bed.participant ? `${bed.participant.firstName} ${bed.participant.lastName}` : $t('rooms.unassigned') }}
                </span>
                <span class="bed-type">
                  <span class="bed-type-icon">{{ bedTypeIcon(bed.type) }}</span>
                  {{ bedTypeLabel(bed.type) }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Print header - hidden on screen */
.print-header {
  display: none;
}

/* Floor header */
.floor-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.floor-accent {
  width: 5px;
  height: 32px;
  background: linear-gradient(180deg, var(--rc-primary) 0%, var(--rc-primary-dark) 100%);
  border-radius: 3px;
  flex-shrink: 0;
}

.floor-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: #1e293b;
  white-space: nowrap;
}

.floor-line {
  flex: 1;
  height: 2px;
  background: linear-gradient(90deg, var(--rc-primary) 0%, var(--rc-line-mid) 40%, transparent 100%);
  border-radius: 1px;
}

/* Rooms grid */
.rooms-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
}

/* Room card */
.room-card {
  background: #ffffff;
  border-radius: 14px;
  box-shadow:
    0 4px 16px rgba(0, 0, 0, 0.06),
    0 1px 4px rgba(0, 0, 0, 0.03);
  overflow: hidden;
  border: 1px solid rgba(231, 229, 228, 0.6);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.room-card:hover {
  transform: translateY(-3px);
  box-shadow:
    0 12px 32px rgba(0, 0, 0, 0.1),
    0 2px 8px rgba(0, 0, 0, 0.05);
}

/* Room card header */
.room-card-header {
  background: linear-gradient(135deg, var(--rc-header-from) 0%, var(--rc-header-via) 50%, var(--rc-header-to) 100%);
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid var(--rc-border);
}

.room-logo {
  width: 28px;
  height: 40px;
  object-fit: contain;
  flex-shrink: 0;
}

.room-number-badge {
  width: 36px;
  height: 36px;
  background: linear-gradient(135deg, var(--rc-primary) 0%, var(--rc-primary-dark) 100%);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 15px;
  flex-shrink: 0;
  box-shadow: 0 2px 6px var(--rc-shadow);
}

.room-label {
  font-weight: 600;
  color: var(--rc-label);
  font-size: 14px;
  flex: 1;
}

.room-bed-count {
  font-size: 12px;
  font-weight: 600;
  color: var(--rc-primary);
  background: var(--rc-count-bg);
  padding: 3px 10px;
  border-radius: 12px;
}

/* Room card body */
.room-card-body {
  padding: 8px 12px;
}

/* Bed row */
.bed-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 6px;
  border-bottom: 1px solid #f1f5f9;
  transition: background 0.15s;
}

.bed-row:last-child {
  border-bottom: none;
}

.bed-row:hover {
  background: #f8fafc;
}

.bed-unassigned {
  opacity: 0.5;
}

.bed-unassigned .bed-participant {
  font-style: italic;
  color: #94a3b8;
}

.bed-number-badge {
  width: 26px;
  height: 26px;
  background: #f1f5f9;
  color: #64748b;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 12px;
  flex-shrink: 0;
}

.bed-participant {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
  color: #334155;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bed-type {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #64748b;
  white-space: nowrap;
  flex-shrink: 0;
}

.bed-type-icon {
  font-size: 14px;
}
</style>

<style>
/* Print styles (unscoped) */
@media print {
  @page {
    margin: 0.8cm;
    size: A4;
  }

  body * {
    visibility: hidden;
  }

  .print-container,
  .print-container * {
    visibility: visible;
  }

  .print-container {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    padding: 0 !important;
  }

  .no-print {
    display: none !important;
  }

  /* Print header */
  .print-header {
    display: flex !important;
    flex-wrap: wrap;
    align-items: center;
    padding-bottom: 10px;
    margin-bottom: 16px;
    position: relative;
  }

  .print-header-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .print-logo {
    width: 40px;
    height: 58px;
    object-fit: contain;
  }

  .print-emaus {
    font-size: 16px;
    font-weight: 800;
    color: var(--rc-emaus);
    text-transform: uppercase;
    letter-spacing: 2px;
  }

  .print-header-center {
    flex: 1;
    text-align: center;
  }

  .print-title {
    font-size: 18px;
    font-weight: 800;
    color: #1e293b;
    margin: 0;
  }

  .print-retreat-name {
    font-size: 11px;
    color: #64748b;
    margin: 2px 0 0;
  }

  .print-retreat-number {
    font-size: 10px;
    font-weight: 700;
    color: var(--rc-print-number);
  }

  .print-header-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
  }

  .print-stat {
    font-size: 10px;
    font-weight: 600;
    color: #64748b;
  }

  .print-header-line {
    width: 100%;
    height: 3px;
    background: linear-gradient(90deg, var(--rc-primary) 0%, var(--rc-primary-dark) 40%, var(--rc-line-mid) 70%, transparent 100%);
    border-radius: 2px;
    margin-top: 8px;
  }

  /* Floor headers */
  .floor-header {
    margin-bottom: 10px !important;
  }

  .floor-accent {
    width: 4px !important;
    height: 22px !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  .floor-line {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  /* Grid: 2 columns for print */
  .rooms-grid {
    display: grid !important;
    grid-template-columns: repeat(2, 1fr) !important;
    gap: 10px !important;
  }

  /* Room cards for print */
  .room-card {
    break-inside: avoid;
    page-break-inside: avoid;
    box-shadow: none !important;
    border: 1px solid #d1d5db !important;
    border-radius: 8px !important;
    transition: none !important;
  }

  .room-card:hover {
    transform: none !important;
    box-shadow: none !important;
  }

  .room-card-header {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  .room-number-badge {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  .room-bed-count {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  .bed-number-badge {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  .bed-unassigned {
    opacity: 0.5 !important;
  }

  /* ===== Print Size: Small ===== */
  .print-size-small .floor-title {
    font-size: 14px !important;
  }
  .print-size-small .room-card-header {
    padding: 6px 10px !important;
  }
  .print-size-small .room-logo {
    width: 20px !important;
    height: 30px !important;
  }
  .print-size-small .room-number-badge {
    width: 26px !important;
    height: 26px !important;
    font-size: 12px !important;
  }
  .print-size-small .room-label {
    font-size: 11px !important;
  }
  .print-size-small .room-bed-count {
    font-size: 9px !important;
    padding: 2px 6px !important;
  }
  .print-size-small .room-card-body {
    padding: 4px 8px !important;
  }
  .print-size-small .bed-row {
    padding: 4px 4px !important;
    gap: 6px !important;
  }
  .print-size-small .bed-number-badge {
    width: 20px !important;
    height: 20px !important;
    font-size: 10px !important;
    border-radius: 4px !important;
  }
  .print-size-small .bed-participant {
    font-size: 11px !important;
  }
  .print-size-small .bed-type {
    font-size: 9px !important;
  }
  .print-size-small .bed-type-icon {
    font-size: 10px !important;
  }

  /* ===== Print Size: Medium (default) ===== */
  .print-size-medium .floor-title {
    font-size: 16px !important;
  }
  .print-size-medium .room-card-header {
    padding: 8px 12px !important;
  }
  .print-size-medium .room-logo {
    width: 24px !important;
    height: 34px !important;
  }
  .print-size-medium .room-number-badge {
    width: 30px !important;
    height: 30px !important;
    font-size: 14px !important;
  }
  .print-size-medium .room-label {
    font-size: 13px !important;
  }
  .print-size-medium .room-bed-count {
    font-size: 11px !important;
    padding: 3px 8px !important;
  }
  .print-size-medium .room-card-body {
    padding: 6px 10px !important;
  }
  .print-size-medium .bed-row {
    padding: 5px 5px !important;
    gap: 8px !important;
  }
  .print-size-medium .bed-number-badge {
    width: 24px !important;
    height: 24px !important;
    font-size: 12px !important;
    border-radius: 5px !important;
  }
  .print-size-medium .bed-participant {
    font-size: 13px !important;
  }
  .print-size-medium .bed-type {
    font-size: 11px !important;
  }
  .print-size-medium .bed-type-icon {
    font-size: 12px !important;
  }

  /* ===== Print Size: Large (1 card per row, ~2 per page) ===== */
  .print-size-large .rooms-grid {
    grid-template-columns: 1fr !important;
    gap: 14px !important;
  }
  .print-size-large .floor-title {
    font-size: 20px !important;
  }
  .print-size-large .room-card-header {
    padding: 12px 18px !important;
  }
  .print-size-large .room-logo {
    width: 32px !important;
    height: 46px !important;
  }
  .print-size-large .room-number-badge {
    width: 40px !important;
    height: 40px !important;
    font-size: 18px !important;
  }
  .print-size-large .room-label {
    font-size: 17px !important;
  }
  .print-size-large .room-bed-count {
    font-size: 14px !important;
    padding: 4px 12px !important;
  }
  .print-size-large .room-card-body {
    padding: 10px 16px !important;
  }
  .print-size-large .bed-row {
    padding: 8px 8px !important;
    gap: 12px !important;
  }
  .print-size-large .bed-number-badge {
    width: 32px !important;
    height: 32px !important;
    font-size: 15px !important;
    border-radius: 7px !important;
  }
  .print-size-large .bed-participant {
    font-size: 17px !important;
  }
  .print-size-large .bed-type {
    font-size: 14px !important;
  }
  .print-size-large .bed-type-icon {
    font-size: 16px !important;
  }

  /* Section breaks */
  .print-section {
    page-break-after: auto;
  }

  .mb-8 {
    margin-bottom: 12px !important;
  }
}
</style>
