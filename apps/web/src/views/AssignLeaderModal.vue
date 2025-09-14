<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle>{{ $t('tables.assignLeaderModal.title', { role: $t(`tables.roles.${role}`) }) }}</DialogTitle>
        <DialogDescription>{{ $t('tables.assignLeaderModal.description') }}</DialogDescription>
      </DialogHeader>
      <div class="py-4">
        <Command>
          <CommandInput :placeholder="$t('tables.assignLeaderModal.searchPlaceholder')" />
          <CommandList>
            <CommandEmpty>{{ $t('common.noResults') }}</CommandEmpty>
            <CommandGroup :heading="$t('sidebar.servers')">
              <CommandItem
                v-for="server in availableServers"
                :key="server.id"
                :value="`${server.firstName} ${server.lastName}`"
                @select="handleSelect(server.id)"
              >
                {{ server.firstName }} {{ server.lastName }}
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </div>
      <DialogFooter>
        <Button variant="outline" @click="$emit('update:open', false)">{{ $t('common.cancel') }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useParticipantStore } from '@/stores/participantStore';
import { useTableMesaStore } from '@/stores/tableMesaStore';
import { Button } from '@repo/ui';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@repo/ui';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@repo/ui';

const props = defineProps<{
  open: boolean;
  tableId: string;
  role: 'lider' | 'colider1' | 'colider2';
}>();

const emit = defineEmits(['update:open']);

const participantStore = useParticipantStore();
const tableMesaStore = useTableMesaStore();

const availableServers = computed(() => {
  return participantStore.participants.filter(p => p.type === 'server' && !p.isCancelled);
});

const handleSelect = async (participantId: string) => {
  await tableMesaStore.assignLeader(props.tableId, participantId, props.role);
  emit('update:open', false);
};

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    participantStore.filters.type = 'server';
    participantStore.fetchParticipants();
  }
});

</script>