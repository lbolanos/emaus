<script setup lang="ts">
import ParticipantList from '@/components/ParticipantList.vue'

const palancaTableColumns = ['firstName', 'lastName', 'palancasCoordinator', 'palancasRequested', 'palancasReceived', 'palancasNotes'];
const palancaFormShowColumns = ['firstName', 'lastName', 'palancasCoordinator', 'palancasRequested', 'palancasReceived', 'palancasNotes'];
const nonEditableColumns = ['firstName', 'lastName'];
const palancaFormEditColumns = palancaTableColumns.filter(c => !nonEditableColumns.includes(c));
</script>

<template>
  <ParticipantList type="walker"
    :columns-to-show-in-table="palancaTableColumns"
    :columns-to-show-in-form="palancaFormShowColumns"
    :columns-to-edit-in-form="palancaFormEditColumns"
 />
</template>
