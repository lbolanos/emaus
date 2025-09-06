<script setup lang="ts">
import ParticipantList from '@/components/ParticipantList.vue'

const tableColumns = ['id_on_retreat','firstName', 'lastName', 'type', 'isCancelled'];
const formShowColumns = ['id_on_retreat','firstName', 'lastName', 'type', 'isCancelled'];
const nonEditableColumns = ['id_on_retreat','firstName', 'lastName', 'type'];
const formEditColumns = tableColumns.filter(c => !nonEditableColumns.includes(c));
</script>

<template>
  <ParticipantList type="waiting"
    :columns-to-show-in-table="tableColumns"
    :columns-to-show-in-form="formShowColumns"
    :columns-to-edit-in-form="formEditColumns"
    :filter-by-no-table="true"
 />
</template>
