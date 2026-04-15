<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 bg-black/50 flex items-start justify-center z-50 overflow-y-auto"
      @click.self="$emit('close')"
    >
      <div class="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-4xl my-4 mx-2 sm:mx-4">
        <!-- Header (hidden when printing) -->
        <div class="flex items-center justify-between p-4 border-b no-print">
          <div>
            <h2 class="text-lg font-semibold">{{ $t('tables.lotteryCards.title') }}</h2>
            <p class="text-sm text-gray-500 dark:text-gray-400">{{ $t('tables.lotteryCards.description') }}</p>
          </div>
          <div class="flex items-center gap-2">
            <Button @click="printCards">
              <Printer class="mr-2 h-4 w-4" />
              {{ $t('tables.lotteryCards.print') }}
            </Button>
            <Button variant="ghost" size="icon" @click="$emit('close')">
              <X class="h-4 w-4" />
            </Button>
          </div>
        </div>

        <!-- Cards Grid -->
        <div v-if="walkers.length > 0" ref="cardsContainer" class="p-4 lottery-cards-container">
          <div class="lottery-cards-grid">
            <div
              v-for="walker in sortedWalkers"
              :key="walker.id"
              class="lottery-card"
              :style="{ borderLeftColor: walker.family_friend_color || '#e5e7eb' }"
            >
              <span class="lottery-card-id">{{ walker.id_on_retreat || '?' }}</span>
              <span class="lottery-card-name">{{ walker.firstName }} {{ walker.lastName }}</span>
            </div>
          </div>
        </div>

        <div v-else class="p-8 text-center text-gray-500">
          {{ $t('tables.lotteryCards.noWalkers') }}
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Participant } from '@repo/types';
import { Button } from '@repo/ui';
import { Printer, X } from 'lucide-vue-next';

const props = defineProps<{
  open: boolean;
  walkers: Participant[];
}>();

defineEmits<{
  close: [];
}>();

const sortedWalkers = computed(() => {
  return [...props.walkers].sort((a, b) => (a.id_on_retreat || 0) - (b.id_on_retreat || 0));
});

const printCards = () => {
  window.print();
};
</script>

<style>
/* Lottery cards grid - both screen and print */
.lottery-cards-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}

.lottery-card {
  border: 1px dashed #9ca3af;
  border-left: 6px solid #e5e7eb;
  border-radius: 4px;
  padding: 6px 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60px;
  background: white;
}

.lottery-card-id {
  font-size: 28px;
  font-weight: 800;
  line-height: 1;
  color: #111;
}

.lottery-card-name {
  font-size: 10px;
  color: #555;
  text-align: center;
  margin-top: 2px;
  line-height: 1.2;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Print styles for lottery cards */
@media print {
  body * {
    visibility: hidden !important;
  }

  .lottery-cards-container,
  .lottery-cards-container * {
    visibility: visible !important;
  }

  .lottery-cards-container {
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    box-sizing: border-box !important;
    padding: 0 !important;
    margin: 0 !important;
    background: white !important;
  }

  .no-print {
    display: none !important;
  }

  .lottery-cards-grid {
    grid-template-columns: repeat(4, 1fr) !important;
    gap: 1.5mm !important;
    box-sizing: border-box !important;
    width: 100% !important;
  }

  .lottery-card {
    break-inside: avoid;
    page-break-inside: avoid;
    border-top: 1px dashed #999 !important;
    border-right: 1px dashed #999 !important;
    border-bottom: 1px dashed #999 !important;
    /* border-left keeps the inline style color from Vue :style binding */
    border-left-width: 6px !important;
    border-left-style: solid !important;
    box-sizing: border-box !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  .lottery-card-id {
    color: #000 !important;
  }

  .lottery-card-name {
    color: #333 !important;
  }

  @page {
    size: A4;
    margin: 8mm;
  }

  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
}

@media (max-width: 640px) {
  .lottery-cards-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
</style>
