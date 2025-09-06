<script setup lang="ts">
import ParticipantList from '@/components/ParticipantList.vue'

const tableColumns = ['id_on_retreat','firstName', 'lastName', 'hasDietaryRestrictions', 'dietaryRestrictionsDetails'];
const formShowColumns = ['id_on_retreat','firstName', 'lastName', 'hasDietaryRestrictions', 'dietaryRestrictionsDetails'];
const nonEditableColumns = ['firstName', 'lastName'];
const formEditColumns = tableColumns.filter(c => !nonEditableColumns.includes(c));
</script>

<template>
  <ParticipantList type="walker"
    :columns-to-show-in-table="tableColumns"
    :columns-to-show-in-form="formShowColumns"
    :columns-to-edit-in-form="formEditColumns"
 />
</template>
