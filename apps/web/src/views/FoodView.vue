<script setup lang="ts">
import { storeToRefs } from 'pinia'
import ParticipantList from '@/components/ParticipantList.vue'
import HealthNeedsConnection from '@/components/offline/HealthNeedsConnection.vue'
import { useParticipantStore } from '@/stores/participantStore'

// Health data is never saved on the device (specs/offline-mode): without signal
// this report says so instead of showing a list without the diets.
const { fromCache } = storeToRefs(useParticipantStore())

const tableColumns = ['id_on_retreat','firstName', 'lastName', 'hasDietaryRestrictions', 'dietaryRestrictionsDetails'];
const formShowColumns = ['id_on_retreat','firstName', 'lastName', 'hasDietaryRestrictions', 'dietaryRestrictionsDetails'];
const nonEditableColumns = ['firstName', 'lastName'];
const formEditColumns = tableColumns.filter(c => !nonEditableColumns.includes(c));
</script>

<template>
  <HealthNeedsConnection v-if="fromCache" />
  <ParticipantList v-else type="walker"
    :columns-to-show-in-table="tableColumns"
    :columns-to-show-in-form="formShowColumns"
    :columns-to-edit-in-form="formEditColumns"
 />
</template>
