<script setup lang="ts">
import { computed } from 'vue';
import { Button } from '@repo/ui';
import { Play } from 'lucide-vue-next';
import { getHelpVideo } from '@/config/helpVideos';

const props = withDefaults(
  defineProps<{
    /** Clave en helpVideos.ts (p. ej. 'pre-retreat-tasks'). */
    feature: string;
    /** Texto del botón. */
    label?: string;
  }>(),
  { label: 'Ver video' },
);

// Se oculta solo si la feature aún no tiene URL configurada.
const video = computed(() => getHelpVideo(props.feature));
</script>

<template>
  <Button
    v-if="video"
    as-child
    variant="ghost"
    size="sm"
    class="flex items-center gap-1 text-purple-600 hover:text-purple-700"
    :title="video.title"
    data-testid="help-video"
  >
    <a :href="video.url" target="_blank" rel="noopener noreferrer" :aria-label="video.title || label">
      <Play class="w-4 h-4" /> {{ label }}
    </a>
  </Button>
</template>
