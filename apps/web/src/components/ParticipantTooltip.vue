<template>
  <Tooltip>
    <TooltipTrigger as-child>
      <slot />
    </TooltipTrigger>
    <TooltipContent side="top" class="max-w-xs">
      <div class="text-xs space-y-0.5">
        <div v-if="participant.id_on_retreat" class="font-semibold">
          # {{ participant.id_on_retreat }}
        </div>
        <div>{{ participant.firstName }} {{ participant.lastName }}</div>
        <div v-if="participant.invitedBy" class="text-muted-foreground">
          {{ $t('tables.invitedBy') }}: {{ participant.invitedBy }}
        </div>
        <div v-if="bedLocation" class="text-muted-foreground">
          {{ $t('tables.tableCard.bedLocation') }}: {{ bedLocation }}
        </div>
      </div>
    </TooltipContent>
  </Tooltip>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Participant } from '@repo/types';
import { Tooltip, TooltipContent, TooltipTrigger } from '@repo/ui';

const props = defineProps<{
  participant: Participant;
}>();

const bedLocation = computed(() => {
  const bed = props.participant.retreatBed;
  if (!bed) return null;
  const floor = bed.floor !== undefined && bed.floor !== null ? bed.floor : '-';
  const room = bed.roomNumber || '-';
  const bedNum = bed.bedNumber || '-';
  return `${floor}-${room}-${bedNum}`;
});
</script>
