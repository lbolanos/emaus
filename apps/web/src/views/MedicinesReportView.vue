<script setup lang="ts">
import ParticipantList from '@/components/ParticipantList.vue'

const tableColumns = ['firstName', 'lastName', 'hasMedication', 'medicationDetails', 'medicationSchedule'];
const formShowColumns = ['firstName', 'lastName', 'hasMedication', 'medicationDetails', 'medicationSchedule'];
const nonEditableColumns = ['firstName', 'lastName', 'hasMedication', 'medicationDetails', 'medicationSchedule'];
const formEditColumns = tableColumns.filter(c => !nonEditableColumns.includes(c));
</script>

<template>
  <ParticipantList type="walker"
    :columns-to-show-in-table="tableColumns"
    :columns-to-show-in-form="formShowColumns"
    :columns-to-edit-in-form="formEditColumns"
 />
</template>
