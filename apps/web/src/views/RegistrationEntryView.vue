<script setup lang="ts">
/**
 * Dispatcher de las rutas públicas de registro: resuelve el retiro (slug o id) y
 * monta el wizard correcto según su tipo — CoupleRegistrationView cuando
 * retreat_type='couples', el ParticipantRegistrationView existente (intacto) en
 * cualquier otro caso. Si la consulta falla, cae al wizard individual, que ya
 * maneja sus propios estados de error.
 */
import { onMounted, ref } from 'vue'
import { getApiUrl } from '@/config/runtimeConfig'
import ParticipantRegistrationView from '@/views/ParticipantRegistrationView.vue'
import CoupleRegistrationView from '@/views/CoupleRegistrationView.vue'

const props = defineProps<{ retreatId?: string; slug?: string; type: string }>()

const isResolving = ref(true)
const isCouplesRetreat = ref(false)

onMounted(async () => {
	try {
		const url = props.slug
			? `${getApiUrl()}/retreats/public/slug/${props.slug}`
			: props.retreatId
				? `${getApiUrl()}/retreats/public/${props.retreatId}`
				: null
		if (url) {
			const response = await fetch(url)
			if (response.ok) {
				const retreat = await response.json()
				isCouplesRetreat.value = retreat?.retreat_type === 'couples'
			}
		}
	} catch {
		// Sin datos del retiro: el wizard individual muestra su propio error.
	} finally {
		isResolving.value = false
	}
})
</script>

<template>
	<div
		v-if="isResolving"
		class="min-h-screen flex items-center justify-center"
		data-testid="registration-entry-loading"
	>
		<div class="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
	</div>
	<CoupleRegistrationView
		v-else-if="isCouplesRetreat"
		:retreat-id="props.retreatId"
		:slug="props.slug"
		:type="props.type"
	/>
	<ParticipantRegistrationView
		v-else
		:retreat-id="props.retreatId"
		:slug="props.slug"
		:type="props.type"
	/>
</template>
