<template>
  <!--
    Fail-soft deliberado: sin duplicados pendientes o si el count falla (403 de
    un co-admin, red caída) el botón queda igual que antes — el badge es un
    aviso, no una feature que pueda romper la vista.
  -->
  <Badge v-if="count > 0" variant="secondary" class="ml-1">{{ count }}</Badge>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { Badge } from '@repo/ui';
import { getCommunityDuplicateCount } from '@/services/api';

const props = defineProps<{ communityId: string }>();

const count = ref(0);

watch(
  () => props.communityId,
  async (id) => {
    try {
      count.value = await getCommunityDuplicateCount(id);
    } catch {
      count.value = 0;
    }
  },
  { immediate: true },
);
</script>
