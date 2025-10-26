<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';
import { useRetreatStore } from '@/stores/retreatStore';
import { getWalkersByRetreat, exportBadgesToDocx } from '@/services/api';
import { Button } from '@repo/ui';
import { useToast } from '@repo/ui';
import { Loader2, Printer } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import type { Participant } from '@repo/types';

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
    'litera': t('badges.bunkBed'),
    'colchon': t('badges.mattress')
  };
  return `${t('badges.floor')} ${bed.floor || '?'}, ${t('badges.room')} ${bed.roomNumber || '?'}, ${bedTypeMap[bed.type as keyof typeof bedTypeMap] || bed.type}`;
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
    <div class="flex justify-between items-center mb-6 no-print">
      <div>
        <h1 class="text-2xl font-bold mb-2">{{ $t('badges.title') }}</h1>
        <p class="text-gray-600">{{ $t('badges.description') }}</p>
      </div>
      <div class="flex gap-2">
        <Button @click="exportBadges" :disabled="isExporting || loading || !walkers.length">
          <Loader2 v-if="isExporting" class="w-4 h-4 mr-2 animate-spin" />
          Exportar DOCX
        </Button>
        <Button @click="printBadges" :disabled="loading || !walkers.length">
          <Print v-if="!loading" class="w-4 h-4 mr-2" />
          <Loader2 v-else class="w-4 h-4 mr-2 animate-spin" />
          {{ $t('badges.printBadges') }}
        </Button>
      </div>
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
          <!-- Rose decoration -->
          <div class="rose-decoration">
            <img
              src="/rose.svg"
              :alt="$t('badges.rose')"
              class="rose-image"
              onerror="this.style.display='none'"
            />
          </div>

          <!-- Name section -->
          <div class="name-section">
            <h2 class="walker-name">{{ getDisplayName(walker) }}</h2>
          </div>

          <!-- Info section -->
          <div class="info-section">
            <div class="info-item">
              <span class="info-label">{{ getTableInfo(walker) }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">{{ getRoomInfo(walker) }}</span>
            </div>
          </div>

          <!-- Decorative elements -->
          <div class="badge-border"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.badges-container {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 20px;
  padding: 20px 0;
}

.badge-item {
  background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
  border-radius: 15px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  position: relative;
  min-height: 200px;
  transition: transform 0.2s ease;
}

.badge-item:hover {
  transform: translateY(-2px);
}

.badge-content {
  padding: 20px;
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
}

.badge-border {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  border: 3px solid #e74c3c;
  border-radius: 12px;
  pointer-events: none;
}

.rose-decoration {
  position: absolute;
  top: 15px;
  right: 15px;
  width: 40px;
  height: 40px;
}

.rose-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  opacity: 0.8;
}

.name-section {
  text-align: center;
  margin-bottom: 20px;
  padding-top: 10px;
}

.walker-name {
  font-size: 28px;
  font-weight: bold;
  color: #2c3e50;
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.info-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 12px;
}

.info-item {
  text-align: center;
}

.info-label {
  font-size: 14px;
  color: #7f8c8d;
  background: rgba(255, 255, 255, 0.7);
  padding: 8px 12px;
  border-radius: 20px;
  display: inline-block;
  font-weight: 500;
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
    gap: 15px;
    margin: 0;
    padding: 0;
  }

  .badge-item {
    break-inside: avoid;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    margin-bottom: 15px;
  }

  .badge-content {
    padding: 15px;
  }

  .walker-name {
    font-size: 24px;
  }

  .info-label {
    font-size: 12px;
    background: white;
    border: 1px solid #e0e0e0;
  }

  .rose-image {
    opacity: 0.6;
  }

  /* Adjust for badge printing */
  @page {
    margin: 1cm;
    size: A4;
  }
}

/* Responsive design */
@media (max-width: 768px) {
  .badges-container {
    grid-template-columns: 1fr;
  }
}

@media print and (max-width: 768px) {
  .badges-container {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
