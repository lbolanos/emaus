<script setup lang="ts">
import ParticipantList from '@/components/ParticipantList.vue'

// palancasReceivedCount = numeric letter count (source of truth for hitos); the
// legacy prose field is no longer a list/form column. cellPhone joins the table
// (with the quick-edit ✏) but not the dialog form: the M3 mini-editor fixes it
// there, not the generic unvalidated PUT. The dialog's edit list unions the
// table's visible columns, so the exclusion has to be explicit
// (columnsExcludedFromFormEdit) — without it the dialog rendered a generic
// editable Celular input that saved through the unvalidated PUT.
const palancaTableColumns = ['id_on_retreat','firstName', 'lastName', 'cellPhone', 'lastPaymentDate', 'messageCount', 'palancasCoordinator', 'palancasRequested', 'palancasReceivedCount', 'palancasNotes'];
const palancaFormShowColumns = ['id_on_retreat','firstName', 'lastName', 'lastPaymentDate', 'messageCount', 'palancasCoordinator', 'palancasRequested', 'palancasReceivedCount', 'palancasNotes'];
const nonEditableColumns = ['id_on_retreat','firstName', 'lastName', 'cellPhone', 'lastPaymentDate', 'messageCount'];
const palancaFormEditColumns = palancaTableColumns.filter(c => !nonEditableColumns.includes(c));
// cellPhone is visible in the table but edited ONLY through the quick editor;
// the generic dialog input would bypass its per-country validation.
const palancaFormExcludedColumns = ['cellPhone'];
</script>

<template>
  <ParticipantList type="walker"
    :columns-to-show-in-table="palancaTableColumns"
    :columns-to-show-in-form="palancaFormShowColumns"
    :columns-to-edit-in-form="palancaFormEditColumns"
    :columns-excluded-from-form-edit="palancaFormExcludedColumns"
    show-attendance-confirmation
    inline-phone-edit
 />
</template>
