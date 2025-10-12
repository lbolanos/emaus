<script setup lang="ts">
import ParticipantList from '@/components/ParticipantList.vue'

const tableColumns = ['id_on_retreat','firstName', 'lastName', 'email', 'cellPhone', 'parish', 'paymentAmount'];
const formShowColumns = ['id_on_retreat','firstName', 'lastName', 'cellPhone', 'parish', 'paymentAmount', 'email'];
const nonEditableColumns = ['email'];
const formEditColumns = tableColumns.filter(c => !nonEditableColumns.includes(c));
</script>

<template>
  <ParticipantList type="partial_server"
    :columns-to-show-in-table="tableColumns"
    :columns-to-show-in-form="formShowColumns"
    :columns-to-edit-in-form="formEditColumns"
    :default-filters="{}"
  />
</template>

<style scoped>
/* Estilos específicos para esta vista si son necesarios */
</style>
