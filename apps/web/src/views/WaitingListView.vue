<script setup lang="ts">
import ParticipantList from '@/components/ParticipantList.vue'

const tableColumns = ['firstName', 'lastName', 'type', 'isCancelled'];
const formShowColumns = ['firstName', 'lastName', 'type', 'isCancelled'];
const nonEditableColumns = ['firstName', 'lastName', 'type'];
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
