<script setup lang="ts">
import ParticipantList from '@/components/ParticipantList.vue'

const walkerTableColumns = ['firstName', 'lastName', 'email', 'cellPhone', 'parish', 'paymentAmount'];
const walkerFormShowColumns = ['firstName', 'lastName', 'cellPhone', 'parish', 'paymentAmount', 'email'];
const walkerFormEditColumns = ['firstName', 'lastName', 'cellPhone', 'parish', 'paymentAmount'];
</script>

<template>
  <ParticipantList type="walker"
    :is-canceled="false"
    :columns-to-show-in-table="walkerTableColumns"
    :columns-to-show-in-form="walkerFormShowColumns"
    :columns-to-edit-in-form="walkerFormEditColumns"
 />
</template>