<script setup lang="ts">
import ParticipantList from '@/components/ParticipantList.vue'

const tableColumns = ['id_on_retreat','firstName', 'lastName', 'paymentAmount', 'paymentDate', 'isScholarship','pickupLocation','notes'];
const formShowColumns = ['id_on_retreat','firstName', 'lastName', 'paymentAmount', 'paymentDate', 'isScholarship','pickupLocation','notes'];
const nonEditableColumns = ['id_on_retreat','firstName', 'lastName','pickupLocation','notes'];
const formEditColumns = tableColumns.filter(c => !nonEditableColumns.includes(c));
</script>

<template>
  <ParticipantList type="walker"
    :columns-to-show-in-table="tableColumns"
    :columns-to-show-in-form="formShowColumns"
    :columns-to-edit-in-form="formEditColumns"
    :default-filters="{}"
 />
</template>