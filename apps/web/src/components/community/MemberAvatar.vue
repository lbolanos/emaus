<template>
  <span
    :class="[
      'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted font-medium text-muted-foreground select-none',
      sizeClass,
    ]"
    :title="fullName || undefined"
  >
    <img
      v-if="photoUrl && !failed"
      :src="photoUrl"
      :alt="fullName ? `Foto de ${fullName}` : 'Foto del miembro'"
      class="h-full w-full object-cover"
      loading="lazy"
      @error="failed = true"
    />
    <span v-else aria-hidden="true">{{ initials }}</span>
  </span>
</template>

<script setup lang="ts">
/**
 * Avatar de un miembro de comunidad. Si no hay foto —o si la URL firmada ya
 * caducó y la imagen no carga— cae a las iniciales, que es mejor que un hueco.
 */
import { computed, ref, watch } from 'vue';

interface Props {
  photoUrl?: string | null;
  fullName?: string | null;
  size?: 'sm' | 'md' | 'lg';
}

const props = withDefaults(defineProps<Props>(), {
  photoUrl: null,
  fullName: '',
  size: 'md',
});

// Las URLs de S3 vienen firmadas y caducan en una hora. Si la pestaña llevaba
// mucho abierta, la imagen falla: en vez de un roto, iniciales.
const failed = ref(false);
watch(() => props.photoUrl, () => (failed.value = false));

const sizeClass = computed(
  () =>
    ({
      sm: 'h-8 w-8 text-xs',
      md: 'h-10 w-10 text-sm',
      lg: 'h-20 w-20 text-xl',
    })[props.size],
);

const initials = computed(() => {
  const parts = (props.fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const second = parts.length > 1 ? (parts[1][0] ?? '') : '';
  return (first + second).toUpperCase();
});
</script>
