<script setup lang="ts">
import ParticipantList from '@/components/ParticipantList.vue'

const palancaTableColumns = ['id_on_retreat','firstName', 'lastName', 'paymentDate', 'palancasCoordinator', 'palancasRequested', 'palancasReceived', 'palancasNotes'];
const palancaFormShowColumns = ['id_on_retreat','firstName', 'lastName', 'paymentDate', 'palancasCoordinator', 'palancasRequested', 'palancasReceived', 'palancasNotes'];
const nonEditableColumns = ['id_on_retreat','firstName', 'lastName', 'paymentDate'];
const palancaFormEditColumns = palancaTableColumns.filter(c => !nonEditableColumns.includes(c));
</script>

<template>
  <ParticipantList type="walker"
    :columns-to-show-in-table="palancaTableColumns"
    :columns-to-show-in-form="palancaFormShowColumns"
    :columns-to-edit-in-form="palancaFormEditColumns"
 />
</template>
