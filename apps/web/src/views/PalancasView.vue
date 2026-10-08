<script setup lang="ts">
import ParticipantList from '@/components/ParticipantList.vue'

// palancasReceivedCount = numeric letter count (source of truth for hitos); the
// legacy prose field is no longer a list/form column. cellPhone joins the table
// (with the quick-edit ✏) but not the dialog form: the M3 mini-editor fixes it
// there, not the generic unvalidated PUT.
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
