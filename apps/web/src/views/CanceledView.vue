<script setup lang="ts">
import ParticipantList from '@/components/ParticipantList.vue'

const serverTableColumns = ['id_on_retreat','firstName', 'lastName', 'email', 'cellPhone', 'parish', 'paymentAmount'];
const serverFormShowColumns = ['id_on_retreat','firstName', 'lastName', 'cellPhone', 'parish', 'paymentAmount', 'email'];
const nonEditableColumns = ['email'];
const serverFormEditColumns = serverTableColumns.filter(c => !nonEditableColumns.includes(c));
</script>

<template>
  <ParticipantList
    :is-canceled=true
    :columns-to-show-in-table="serverTableColumns"
    :columns-to-show-in-form="serverFormShowColumns"
    :columns-to-edit-in-form="serverFormEditColumns"
    :default-filters="{ isCancelled: true }"
  />
</template>

<style scoped>
/* Estilos específicos para esta vista si son necesarios */
</style>
