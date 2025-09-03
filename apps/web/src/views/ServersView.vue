<script setup lang="ts">
import ParticipantList from '@/components/ParticipantList.vue'

const serverTableColumns = ['firstName', 'lastName', 'email', 'cellPhone', 'parish', 'paymentAmount'];
const serverFormShowColumns = ['firstName', 'lastName', 'cellPhone', 'parish', 'paymentAmount', 'email'];
const nonEditableColumns = ['email'];
const serverFormEditColumns = serverTableColumns.filter(c => !nonEditableColumns.includes(c));
</script>

<template>
  <ParticipantList
    type="server"
    :is-canceled="false"
    :columns-to-show-in-table="serverTableColumns"
    :columns-to-show-in-form="serverFormShowColumns"
    :columns-to-edit-in-form="serverFormEditColumns"
  />
</template>

<style scoped>
/* Estilos específicos para esta vista si son necesarios */
</style>
