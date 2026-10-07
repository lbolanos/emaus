<script setup lang="ts">
import ParticipantList from '@/components/ParticipantList.vue'

// palancasReceivedCount = numeric letter count (source of truth for hitos); the
// legacy prose field is no longer a list/form column. cellPhone entra a la tabla
// (con ✏ de edición rápida) pero no al form del diálogo: ahí lo corrige el
// mini-editor de M3, no el PUT genérico sin validación.
const palancaTableColumns = ['id_on_retreat','firstName', 'lastName', 'cellPhone', 'lastPaymentDate', 'messageCount', 'palancasCoordinator', 'palancasRequested', 'palancasReceivedCount', 'palancasNotes'];
const palancaFormShowColumns = ['id_on_retreat','firstName', 'lastName', 'lastPaymentDate', 'messageCount', 'palancasCoordinator', 'palancasRequested', 'palancasReceivedCount', 'palancasNotes'];
const nonEditableColumns = ['id_on_retreat','firstName', 'lastName', 'cellPhone', 'lastPaymentDate', 'messageCount'];
const palancaFormEditColumns = palancaTableColumns.filter(c => !nonEditableColumns.includes(c));
</script>

<template>
  <ParticipantList type="walker"
    :columns-to-show-in-table="palancaTableColumns"
    :columns-to-show-in-form="palancaFormShowColumns"
    :columns-to-edit-in-form="palancaFormEditColumns"
    show-attendance-confirmation
    inline-phone-edit
 />
</template>
