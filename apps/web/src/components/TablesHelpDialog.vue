<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="max-w-lg max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <HelpCircle class="w-5 h-5" />
          {{ $t('tables.help.title') }}
        </DialogTitle>
      </DialogHeader>

      <div class="space-y-5 text-sm">
        <!-- El Santísimo process -->
        <section>
          <h3 class="font-semibold text-base mb-2 flex items-center gap-2">
            <span class="text-lg">✝️</span> {{ $t('tables.help.santisimo.title') }}
          </h3>
          <p class="text-gray-600 dark:text-gray-400 mb-3">{{ $t('tables.help.santisimo.description') }}</p>
          <ol class="space-y-2 list-none">
            <li class="flex gap-3">
              <span class="flex-none w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">1</span>
              <div>
                <p class="font-medium">{{ $t('tables.help.santisimo.step1Title') }}</p>
                <p class="text-gray-500 text-xs mt-0.5">{{ $t('tables.help.santisimo.step1Desc') }}</p>
              </div>
            </li>
            <li class="flex gap-3">
              <span class="flex-none w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">2</span>
              <div>
                <p class="font-medium">{{ $t('tables.help.santisimo.step2Title') }}</p>
                <p class="text-gray-500 text-xs mt-0.5">{{ $t('tables.help.santisimo.step2Desc') }}</p>
              </div>
            </li>
            <li class="flex gap-3">
              <span class="flex-none w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">3</span>
              <div>
                <p class="font-medium">{{ $t('tables.help.santisimo.step3Title') }}</p>
                <p class="text-gray-500 text-xs mt-0.5">{{ $t('tables.help.santisimo.step3Desc') }}</p>
              </div>
            </li>
            <li class="flex gap-3">
              <span class="flex-none w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">4</span>
              <div>
                <p class="font-medium">{{ $t('tables.help.santisimo.step4Title') }}</p>
                <p class="text-gray-500 text-xs mt-0.5">{{ $t('tables.help.santisimo.step4Desc') }}</p>
              </div>
            </li>
          </ol>
        </section>

        <hr class="border-gray-100 dark:border-gray-800" />

        <!-- Ways to assign -->
        <section>
          <h3 class="font-semibold text-base mb-3 flex items-center gap-2">
            <span class="text-lg">📋</span> {{ $t('tables.help.methods.title') }}
          </h3>
          <div class="space-y-3">
            <div class="flex gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
              <span class="text-xl flex-none">🖱️</span>
              <div>
                <p class="font-medium">{{ $t('tables.help.methods.dragDrop.title') }}</p>
                <p class="text-gray-500 text-xs mt-0.5">{{ $t('tables.help.methods.dragDrop.desc') }}</p>
              </div>
            </div>
            <div class="flex gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
              <span class="text-xl flex-none">👆</span>
              <div>
                <p class="font-medium">{{ $t('tables.help.methods.tap.title') }}</p>
                <p class="text-gray-500 text-xs mt-0.5">{{ $t('tables.help.methods.tap.desc') }}</p>
              </div>
            </div>
            <div class="flex gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
              <span class="text-xl flex-none">📷</span>
              <div>
                <p class="font-medium">{{ $t('tables.help.methods.photo.title') }}</p>
                <p class="text-gray-500 text-xs mt-0.5">{{ $t('tables.help.methods.photo.desc') }}</p>
              </div>
            </div>
            <div class="flex gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
              <span class="text-xl flex-none">🤖</span>
              <div>
                <p class="font-medium">{{ $t('tables.help.methods.chatbot.title') }}</p>
                <p class="text-gray-500 text-xs mt-0.5">{{ $t('tables.help.methods.chatbot.desc') }}</p>
              </div>
            </div>
          </div>
        </section>

        <hr class="border-gray-100 dark:border-gray-800" />

        <!-- Colors -->
        <section>
          <h3 class="font-semibold text-base mb-2 flex items-center gap-2">
            <span class="text-lg">🎨</span> {{ $t('tables.help.colors.title') }}
          </h3>
          <p class="text-gray-600 dark:text-gray-400 mb-2">{{ $t('tables.help.colors.desc') }}</p>
          <div class="flex flex-wrap gap-2">
            <span v-for="color in sampleColors" :key="color" class="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded border-l-4" :style="{ borderLeftColor: color, backgroundColor: color + '22' }">
              <span class="w-2.5 h-2.5 rounded-full inline-block" :style="{ backgroundColor: color }"></span>
              {{ color }}
            </span>
          </div>
          <p class="text-gray-400 text-xs mt-2 italic">{{ $t('tables.help.colors.noColor') }}</p>
        </section>

        <hr class="border-gray-100 dark:border-gray-800" />

        <!-- Unassign -->
        <section>
          <h3 class="font-semibold text-base mb-2 flex items-center gap-2">
            <span class="text-lg">❌</span> {{ $t('tables.help.unassign.title') }}
          </h3>
          <p class="text-gray-600 dark:text-gray-400">{{ $t('tables.help.unassign.desc') }}</p>
        </section>
      </div>

      <DialogFooter class="mt-4">
        <Button @click="$emit('update:open', false)">{{ $t('common.close') }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Button } from '@repo/ui';
import { HelpCircle } from 'lucide-vue-next';

defineProps({ open: { type: Boolean, required: true } });
defineEmits(['update:open']);

const sampleColors = ['#FF5733', '#33A1FF', '#28B463', '#F39C12', '#8E44AD', '#E91E63'];
</script>
