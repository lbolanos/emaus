<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';
import { useRetreatStore } from '@/stores/retreatStore';
import { getWalkersByRetreat, exportBadgesToDocx } from '@/services/api';
import { Button } from '@repo/ui';
import { useToast } from '@repo/ui';
import { Loader2, Printer, MoreVertical, FileDown } from 'lucide-vue-next';
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

const retreatId = computed(() => route.params.id as string || retreatStore.selectedRetreatId);

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

onMounted(fetchWalkers);
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
        </DropdownMenuContent>
      </DropdownMenu>
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
        v-for="walker in walkers"
        :key="walker.id"
        class="badge-item"
      >
        <div class="badge-content">
          <!-- Decorative header -->
          <div class="badge-header">
            <div class="css-rose">
              <div class="rose-petals">
                <div class="petal petal-1"></div>
                <div class="petal petal-2"></div>
                <div class="petal petal-3"></div>
                <div class="petal petal-4"></div>
                <div class="petal petal-5"></div>
              </div>
              <div class="rose-center"></div>
            </div>
          </div>

          <!-- Name section -->
          <div class="name-section">
            <h2 class="walker-name">{{ getDisplayName(walker) }}</h2>
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

          <!-- Footer decoration -->
          <div class="badge-footer">
            <div class="footer-dots">
              <span></span><span></span><span></span>
            </div>
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
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
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
  min-height: 220px;
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
  padding: 24px;
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
}

/* Header with rose */
.badge-header {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 8px;
}

.css-rose {
  width: 48px;
  height: 48px;
  background: linear-gradient(135deg, #fef3f2 0%, #fee2e2 100%);
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow:
    0 4px 12px rgba(225, 29, 72, 0.15),
    inset 0 1px 0 rgba(255, 255, 255, 0.8);
  position: relative;
}

.rose-petals {
  position: relative;
  width: 32px;
  height: 32px;
}

.petal {
  position: absolute;
  width: 14px;
  height: 14px;
  background: linear-gradient(135deg, #e11d48 0%, #f43f5e 100%);
  border-radius: 50% 50% 50% 0;
  box-shadow: 0 2px 4px rgba(225, 29, 72, 0.3);
}

.petal-1 {
  top: 0;
  left: 50%;
  transform: translateX(-50%) rotate(0deg);
}

.petal-2 {
  top: 6px;
  right: 2px;
  transform: rotate(72deg);
}

.petal-3 {
  bottom: 4px;
  right: 4px;
  transform: rotate(144deg);
}

.petal-4 {
  bottom: 4px;
  left: 4px;
  transform: rotate(216deg);
}

.petal-5 {
  top: 6px;
  left: 2px;
  transform: rotate(288deg);
}

.rose-center {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 8px;
  height: 8px;
  background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
  border-radius: 50%;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.2);
  z-index: 10;
}

/* Name section */
.name-section {
  text-align: center;
  margin-bottom: 24px;
  padding-top: 8px;
}

.walker-name {
  font-size: 26px;
  font-weight: 800;
  background: linear-gradient(135deg, #1e293b 0%, #475569 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 2px;
  line-height: 1.3;
}

.name-underline {
  width: 60px;
  height: 4px;
  background: linear-gradient(90deg, #e11d48 0%, #f43f5e 50%, #e11d48 100%);
  margin: 12px auto 0;
  border-radius: 2px;
}

/* Info section */
.info-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 14px;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 12px;
  background: linear-gradient(135deg, #fefefe 0%, #f9fafb 100%);
  padding: 12px 16px;
  border-radius: 14px;
  border: 1px solid rgba(229, 231, 235, 0.8);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  transition: all 0.2s ease;
}

.info-item:hover {
  background: linear-gradient(135deg, #fefefe 0%, #f3f4f6 100%);
  transform: translateX(2px);
}

.info-icon {
  font-size: 20px;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #fef3f2 0%, #fee2e2 100%);
  border-radius: 10px;
  flex-shrink: 0;
  box-shadow: 0 2px 6px rgba(225, 29, 72, 0.1);
}

.info-label {
  font-size: 13px;
  font-weight: 600;
  color: #475569;
  letter-spacing: 0.3px;
}

/* Footer decoration */
.badge-footer {
  margin-top: auto;
  padding-top: 16px;
  display: flex;
  justify-content: center;
}

.footer-dots {
  display: flex;
  gap: 8px;
}

.footer-dots span {
  width: 8px;
  height: 8px;
  background: linear-gradient(135deg, #e11d48 0%, #f43f5e 100%);
  border-radius: 50%;
  opacity: 0.6;
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

/* Print styles */
@media print {
  body {
    background: white;
  }

  .no-print {
    display: none !important;
  }

  .badges-container {
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin: 0;
    padding: 0;
  }

  .badge-item {
    break-inside: avoid;
    box-shadow:
      0 4px 12px rgba(0, 0, 0, 0.08),
      inset 0 1px 0 rgba(255, 255, 255, 0.8);
    margin-bottom: 16px;
    min-height: 200px;
    border: 1px solid #e5e7eb;
  }

  .badge-content {
    padding: 16px;
  }

  .walker-name {
    font-size: 22px;
  }

  .info-item {
    padding: 10px 12px;
  }

  .info-label {
    font-size: 11px;
  }

  .footer-dots span {
    opacity: 0.5;
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
    min-height: 200px;
  }
}

@media print and (max-width: 768px) {
  .badges-container {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
