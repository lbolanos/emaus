<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';
import { useRetreatStore } from '@/stores/retreatStore';
import { getWalkersByRetreat, exportBadgesToDocx } from '@/services/api';
import { Button } from '@repo/ui';
import { useToast } from '@repo/ui';
import { Loader2, Printer, MoreVertical, FileDown, Check, Search, X } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import type { Participant } from '@repo/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@repo/ui';

const route = useRoute();
const retreatStore = useRetreatStore();
const { toast } = useToast();
const { t } = useI18n();
const walkers = ref<Participant[]>([]);
const loading = ref(true);
const isExporting = ref(false);

// Selection and filter state
const selectedBadges = ref<Set<string>>(new Set());
const nameFilter = ref('');
const isPrinting = ref(false);

const retreatId = computed(() => route.params.id as string || retreatStore.selectedRetreatId);

const retreatName = computed(() => {
  // Retreat schema doesn't have 'name', use 'parish' instead
  return retreatStore.selectedRetreat?.parish || '';
});

// Dynamic data from retreat store
const retreatData = computed(() => {
  return (retreatStore.selectedRetreat as any) || null;
});

// Filtered walkers based on name search
const filteredWalkers = computed(() => {
  if (!nameFilter.value.trim()) {
    return walkers.value;
  }
  const filter = nameFilter.value.toLowerCase();
  return walkers.value.filter(walker => {
    const name = getDisplayName(walker).toLowerCase();
    return name.includes(filter);
  });
});

// Count of selected badges
const selectedCount = computed(() => selectedBadges.value.size);

// Check if a walker is selected
const isSelected = (id: string): boolean => {
  return selectedBadges.value.has(id);
};

// Toggle selection of a walker
const toggleSelection = (id: string): void => {
  if (selectedBadges.value.has(id)) {
    selectedBadges.value.delete(id);
  } else {
    selectedBadges.value.add(id);
  }
};

// Select all visible (filtered) walkers
const selectAllVisible = (): void => {
  filteredWalkers.value.forEach(walker => {
    selectedBadges.value.add(walker.id);
  });
};

// Clear all selections
const clearSelection = (): void => {
  selectedBadges.value.clear();
};

// Print only selected badges
const printSelectedBadges = (): void => {
  if (selectedBadges.value.size === 0) {
    toast({
      title: 'Aviso',
      description: 'Por favor, selecciona al menos un gafete para imprimir.',
      variant: 'destructive',
    });
    return;
  }

  // Add hidden class to non-selected badges
  const badgeItems = document.querySelectorAll('.badge-item');
  badgeItems.forEach(item => {
    const walkerId = item.getAttribute('data-walker-id');
    if (walkerId && !selectedBadges.value.has(walkerId)) {
      item.classList.add('badge-hidden');
    }
  });

  // Print
  window.print();

  // Remove hidden class after print
  badgeItems.forEach(item => {
    item.classList.remove('badge-hidden');
  });
};

const retreatTypeLogo = computed(() => {
  // Use explicit type if available
  if (retreatData.value?.retreat_type) {
    const logos: Record<string, string> = {
      men: '/man_logo.png',
      women: '/woman_logo.png',
      couples: '/crossRoseButtT.png',
      effeta: '/crossRoseButtT.png'
    };
    return logos[retreatData.value.retreat_type] || '/crossRoseButtT.png';
  }

  // Try to determine retreat type from available data
  const parish = retreatData.value?.parish?.toLowerCase() || '';
  const houseName = retreatData.value?.house?.name?.toLowerCase() || '';
  const paymentInfo = retreatData.value?.paymentInfo?.toLowerCase() || '';

  // Simple heuristic-based type detection
  if (parish.includes('mujer') || houseName.includes('mujer') || paymentInfo.includes('mujer')) {
    return '/woman_logo.png';
  }
  if (parish.includes('matrimonio') || houseName.includes('matrimonio') || paymentInfo.includes('matrimonio')) {
    return '/man_logo.png';
  }

  // Default fallback (men, joven, effeta, and unknown)
  return '/man_logo.png';
});

const getDisplayName = (walker: Participant): string => {
  return walker.nickname || walker.firstName;
};

const getRoomInfo = (walker: Participant): string => {
  if (!walker.retreatBed) return t('badges.noRoomAssigned');
  const bed = walker.retreatBed;
  const bedTypeMap = {
    'normal': t('badges.normalBed'),
    'litera_abajo': t('badges.bottomBunk'),
    'litera_arriba': t('badges.topBunk'),
    'colchon': t('badges.mattress')
  };
  return `${t('badges.room')} ${bed.roomNumber || '?'}, ${bedTypeMap[bed.type as keyof typeof bedTypeMap] || bed.type}`;
};

const getTableInfo = (walker: Participant): string => {
  if (!walker.tableMesa) return t('badges.noTableAssigned');
  return `${t('badges.table')} ${walker.tableMesa.name}`;
};

const fetchWalkers = async () => {
  if (!retreatId.value) return;
  loading.value = true;
  try {
    walkers.value = await getWalkersByRetreat(retreatId.value);
  } catch (error) {
    console.error('Error fetching walkers:', error);
    toast({
      title: t('common.error'),
      description: t('badges.fetchError'),
      variant: 'destructive',
    });
  } finally {
    loading.value = false;
  }
};

const printBadges = () => {
  window.print();
};

const exportBadges = async () => {
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
    await exportBadgesToDocx(retreatId.value);
    toast({
      title: '¡Éxito!',
      description: 'Los gafetes han sido exportados correctamente.',
    });
  } catch (error) {
    console.error('Error exporting badges:', error);
    toast({
      title: 'Error',
      description: 'Ha ocurrido un error al exportar los gafetes.',
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
  await fetchWalkers();
});
</script>

<template>
  <div class="p-4">
    <!-- Print Container - wraps content that should be visible when printing -->
    <div class="print-container">
      <div class="flex justify-between items-center mb-6 no-print">
      <div>
        <h1 class="text-2xl font-bold mb-2">{{ $t('badges.title') }}</h1>
        <p class="text-gray-600">{{ $t('badges.description') }}</p>
      </div>

      <!-- Three dot dropdown menu -->
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="outline" size="icon" :disabled="loading || !walkers.length">
            <MoreVertical class="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{{ $t('participants.actions') }}</DropdownMenuLabel>
          <DropdownMenuSeparator />

          <!-- Export DOCX -->
          <DropdownMenuItem @click="exportBadges" :disabled="isExporting">
            <Loader2 v-if="isExporting" class="mr-2 h-4 w-4 animate-spin" />
            <FileDown v-else class="mr-2 h-4 w-4" />
            {{ $t('badges.exportDocx') || 'Exportar DOCX' }}
          </DropdownMenuItem>

          <!-- Print -->
          <DropdownMenuItem @click="printBadges">
            <Printer class="mr-2 h-4 w-4" />
            {{ $t('badges.printBadges') }}
          </DropdownMenuItem>

          <DropdownMenuSeparator v-if="selectedCount > 0" />

          <!-- Print selected -->
          <DropdownMenuItem
            v-if="selectedCount > 0"
            @click="printSelectedBadges"
            class="text-rose-600"
          >
            <Check class="mr-2 h-4 w-4" />
            Imprimir seleccionados ({{ selectedCount }})
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>

    <!-- Filter section -->
    <div v-if="!loading && walkers.length" class="filter-section no-print">
      <div class="filter-input-wrapper">
        <Search class="search-icon" />
        <input
          v-model="nameFilter"
          type="text"
          placeholder="Filtrar por nombre..."
          class="filter-input"
        />
        <X
          v-if="nameFilter"
          @click="nameFilter = ''"
          class="clear-icon"
        />
      </div>
      <span class="badge-count">
        {{ filteredWalkers.length }} de {{ walkers.length }} gafetes
      </span>
      <button
        v-if="nameFilter || selectedCount > 0"
        @click="selectAllVisible"
        class="filter-btn"
      >
        Seleccionar todos
      </button>
      <button
        v-if="selectedCount > 0"
        @click="clearSelection"
        class="filter-btn"
      >
        Deseleccionar
      </button>
    </div>

    <div v-if="loading" class="text-center py-8">
      <Loader2 class="w-8 h-8 mx-auto animate-spin mb-4" />
      <p>{{ $t('participants.loading') }}</p>
    </div>

    <div v-else-if="!walkers.length" class="text-center py-8">
      <p>{{ $t('badges.noWalkersFound') }}</p>
    </div>

    <div v-else class="badges-container">
      <div
        v-for="walker in filteredWalkers"
        :key="walker.id"
        :data-walker-id="walker.id"
        class="badge-item"
        :class="{ 'selected': isSelected(walker.id) }"
        @click="toggleSelection(walker.id)"
      >
        <!-- Checkbox -->
        <input
          type="checkbox"
          :checked="isSelected(walker.id)"
          @click.stop
          @change="toggleSelection(walker.id)"
          class="no-print badge-checkbox"
        />
        <div class="badge-content">
          <!-- Logo on left side -->
          <div class="badge-header">
            <img :src="retreatTypeLogo" alt="Logo" class="badge-logo" />
          </div>

          <!-- Right side content: name and info -->
          <div class="badge-right">
            <!-- Name section -->
            <div class="name-section">
              <h2 class="walker-name">{{ getDisplayName(walker) }}</h2>
              <p v-if="retreatName" class="retreat-name">{{ retreatName }}</p>
              <div class="name-underline"></div>
            </div>

            <!-- Info section -->
            <div class="info-section">
              <div class="info-item">
                <div class="info-icon">🍽️</div>
                <span class="info-label">{{ getTableInfo(walker) }}</span>
              </div>
              <div class="info-item">
                <div class="info-icon">🛏️</div>
                <span class="info-label">{{ getRoomInfo(walker) }}</span>
              </div>
            </div>
          </div>

          <!-- Emaus text at bottom -->
          <div class="badge-footer">
            <span class="emaus-text">Emaús</span>
          </div>
        </div>
      </div>
    </div>
    </div>
    <!-- End Print Container -->
  </div>
</template>

<style scoped>
.badges-container {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
  gap: 24px;
  padding: 24px 0;
}

.badge-item {
  background: linear-gradient(145deg, #ffffff 0%, #f8fafc 100%);
  border-radius: 20px;
  box-shadow:
    0 10px 40px rgba(0, 0, 0, 0.08),
    0 2px 8px rgba(0, 0, 0, 0.04),
    inset 0 1px 0 rgba(255, 255, 255, 0.8);
  overflow: hidden;
  position: relative;
  cursor: pointer;
  min-height: 180px;
  aspect-ratio: 2.2 / 1;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border: 1px solid rgba(231, 229, 228, 0.8);
}

.badge-item:hover {
  transform: translateY(-4px);
  box-shadow:
    0 20px 60px rgba(0, 0, 0, 0.12),
    0 4px 16px rgba(0, 0, 0, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 0.8);
}

.badge-content {
  padding: 12px 20px 16px;
  height: 100%;
  display: grid;
  grid-template-columns: 100px 1fr;
  grid-template-rows: auto 1fr auto;
  gap: 8px 16px;
  position: relative;
}

/* Header with logo - left side, upper position */
.badge-header {
  grid-column: 1;
  grid-row: 1 / 3;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 8px;
}

.badge-logo {
  width: 90px;
  height: 133px;
  object-fit: contain;
}

/* Right side wrapper - contains name and info */
.badge-right {
  grid-column: 2;
  grid-row: 1 / 3;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 10px;
  padding-top: 10px;
}

/* Name section - right side, top */
.name-section {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
}

.walker-name {
  font-size: 22px;
  font-weight: 800;
  background: linear-gradient(135deg, #1e293b 0%, #475569 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  line-height: 1.3;
}

.retreat-name {
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  margin: 4px 0 0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  line-height: 1.2;
}

.name-underline {
  width: 50px;
  height: 4px;
  background: linear-gradient(90deg, #e11d48 0%, #f43f5e 50%, #e11d48 100%);
  margin: 10px 0 0;
  border-radius: 2px;
}

/* Info section - right side, below name */
.info-section {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 10px;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 10px;
  background: linear-gradient(135deg, #fefefe 0%, #f9fafb 100%);
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid rgba(229, 231, 235, 0.8);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  transition: all 0.2s ease;
}

.info-item:hover {
  background: linear-gradient(135deg, #fefefe 0%, #f3f4f6 100%);
  transform: translateX(2px);
}

.info-icon {
  font-size: 18px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #fef3f2 0%, #fee2e2 100%);
  border-radius: 9px;
  flex-shrink: 0;
  box-shadow: 0 2px 6px rgba(225, 29, 72, 0.1);
}

.info-label {
  font-size: 16px;
  font-weight: 600;
  color: #475569;
  letter-spacing: 0.2px;
}

/* Footer decoration - Emaus text at bottom below logo */
.badge-footer {
  grid-column: 1;
  grid-row: 3;
  display: flex;
  justify-content: center;
  align-items: flex-end;
  padding-bottom: 4px;
}

.emaus-text {
  font-size: 14px;
  font-weight: 700;
  color: #e11d48;
  text-transform: uppercase;
  letter-spacing: 2px;
  text-shadow: 0 1px 2px rgba(225, 29, 72, 0.2);
}

.footer-dots {
  display: flex;
  gap: 6px;
}

.footer-dots span {
  width: 6px;
  height: 6px;
  background: linear-gradient(135deg, #e11d48 0%, #f43f5e 100%);
  border-radius: 50%;
  opacity: 0.5;
  transition: all 0.3s ease;
}

.badge-item:hover .footer-dots span {
  opacity: 1;
}

.footer-dots span:nth-child(2) {
  animation: pulse 1.5s ease-in-out infinite;
}

.footer-dots span:nth-child(3) {
  animation: pulse 1.5s ease-in-out infinite 0.3s;
}

@keyframes pulse {
  0%, 100% {
    opacity: 0.4;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.1);
  }
}

/* Filter section styles */
.filter-section {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.filter-input-wrapper {
  position: relative;
  flex: 1;
  min-width: 200px;
}

.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  width: 18px;
  height: 18px;
  color: #9ca3af;
  pointer-events: none;
}

.filter-input {
  width: 100%;
  padding: 10px 12px 10px 40px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  transition: all 0.2s;
}

.filter-input:focus {
  border-color: #e11d48;
  box-shadow: 0 0 0 3px rgba(225, 29, 72, 0.1);
}

.clear-icon {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  width: 18px;
  height: 18px;
  color: #9ca3af;
  cursor: pointer;
  transition: color 0.2s;
}

.clear-icon:hover {
  color: #6b7280;
}

.badge-count {
  font-size: 14px;
  color: #6b7280;
  font-weight: 500;
}

.filter-btn {
  padding: 8px 16px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: white;
  font-size: 13px;
  font-weight: 500;
  color: #374151;
  cursor: pointer;
  transition: all 0.2s;
}

.filter-btn:hover {
  background: #f9fafb;
  border-color: #d1d5db;
}

/* Badge checkbox */
.badge-checkbox {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 22px;
  height: 22px;
  cursor: pointer;
  z-index: 10;
  accent-color: #e11d48;
}

.badge-item.selected {
  border: 2px solid #e11d48 !important;
  box-shadow: 0 0 0 4px rgba(225, 29, 72, 0.15) !important;
}

.badge-hidden {
  display: none !important;
}

/* Print styles */
@media print {
  body {
    background: white;
  }

  .no-print {
    display: none !important;
  }

  .badges-container {
    display: grid !important;
    grid-template-columns: repeat(2, 1fr) !important;
    column-gap: 10mm;
    row-gap: 8mm;
    margin: 0;
    padding: 0;
  }

  .badge-item {
    break-inside: avoid;
    box-shadow:
      0 4px 12px rgba(0, 0, 0, 0.08),
      inset 0 1px 0 rgba(255, 255, 255, 0.8);
    margin-bottom: 0;
    min-height: 180px;
    max-width: 85mm;
    width: 100%;
    border: 1px solid #e5e7eb;
    aspect-ratio: 2.2 / 1;
  }

  .badge-content {
    padding: 8px 14px 10px;
    gap: 6px 12px;
    grid-template-columns: 80px 1fr;
    grid-template-rows: auto 1fr auto;
  }

  .badge-header {
    grid-row: 1 / 3;
    padding-top: 4px;
  }

  .badge-right {
    grid-column: 2;
    grid-row: 1 / 3;
    gap: 6px;
    padding-top: 6px;
  }

  .badge-logo {
    width: 65px;
    height: 113px;
  }

  .walker-name {
    font-size: 16px;
  }

  .retreat-name {
    font-size: 8px;
    margin: 2px 0 0;
  }

  .name-underline {
    width: 35px;
    height: 3px;
  }

  .info-section {
    gap: 6px;
  }

  .info-item {
    padding: 6px 8px;
  }

  .info-icon {
    width: 24px;
    height: 24px;
    font-size: 14px;
  }

  .info-label {
    font-size: 12px;
  }

  .badge-footer {
    grid-column: 1;
    grid-row: 3;
    padding-bottom: 2px;
  }

  .emaus-text {
    font-size: 10px;
    letter-spacing: 1.5px;
  }

  .footer-dots span {
    opacity: 0.4;
    animation: none;
  }

  /* Adjust for badge printing */
  @page {
    margin: 0.8cm;
    size: A4;
  }
}

/* Responsive design */
@media (max-width: 768px) {
  .badges-container {
    grid-template-columns: 1fr;
    gap: 20px;
  }

  .badge-item {
    min-height: 160px;
  }

  .badge-content {
    grid-template-columns: 80px 1fr;
    grid-template-rows: auto 1fr auto;
    gap: 6px 12px;
  }

  .badge-header {
    grid-row: 1 / 3;
    padding-top: 6px;
  }

  .badge-right {
    grid-column: 2;
    grid-row: 1 / 3;
    gap: 8px;
    padding-top: 8px;
  }

  .badge-footer {
    grid-column: 1;
    grid-row: 3;
  }
}
</style>
