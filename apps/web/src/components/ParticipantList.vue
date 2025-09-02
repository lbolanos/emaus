<script setup lang="ts">
import { useParticipantStore } from '@/stores/participantStore';
import { useRetreatStore } from '@/stores/retreatStore';
import { watch } from 'vue'; // Removed onMounted
import { storeToRefs } from 'pinia';
import { Button } from '@repo/ui/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableCaption,
} from '@repo/ui/components/ui/table';

const participantStore = useParticipantStore();
const { participants, loading, error } = storeToRefs(participantStore);

const retreatStore = useRetreatStore();
const { selectedRetreatId, serverRegistrationLink, walkerRegistrationLink } = storeToRefs(retreatStore);
const props = defineProps<{ type: 'walker' | 'server' }>();

watch(selectedRetreatId, (newId) => {
  if (newId) {
    participantStore.fetchParticipants(newId, props.type);
  } else {
    participantStore.clearParticipants();
  }
}, { immediate: true });

const openRegistrationLink = () => {
  if ( props.type === 'walker' && walkerRegistrationLink.value) {
    window.open(walkerRegistrationLink.value, '_blank');
  } else if (props.type === 'server' && serverRegistrationLink.value) {
    window.open(serverRegistrationLink.value, '_blank');
  }
};

</script>

<template>
  <div>
    <div class="flex justify-between items-center mb-4">
      <h2 class="text-xl font-semibold">{{ $t('participants.title') }}</h2>
      <Button
        @click="openRegistrationLink"
        :disabled="!selectedRetreatId"
      >
        {{ $t('participants.addParticipant') }}
      </Button>
    </div>
    <div v-if="loading">{{ $t('participants.loading') }}</div>
    <div v-else-if="error" class="text-red-500">{{ error }}</div>
    <div v-else-if="!selectedRetreatId" class="text-center text-gray-500 py-8">
      <p>{{ $t('participants.selectRetreatPrompt') }}</p>
    </div>
    <Table v-else>
      <TableCaption v-if="participants.length === 0">{{ $t('participants.noParticipantsFound') }}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>{{ $t('participants.name') }}</TableHead>
          <TableHead>{{ $t('participants.email') }}</TableHead>
          <TableHead>{{ $t('participants.actions') }}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="participant in participants" :key="participant.id">
          <TableCell>{{ participant.firstName }} {{ participant.lastName }}</TableCell>
          <TableCell>{{ participant.email }}</TableCell>
          <TableCell></TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </div>
</template>