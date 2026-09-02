<template>
	<!-- Capped so the divider under the price doesn't stretch across the column -->
	<div class="max-w-[360px] mx-auto p-3 rounded-2xl bg-white/85 backdrop-blur-sm shadow-md print:bg-white print:backdrop-blur-none">
		<div class="text-center mb-3 pb-3 border-b-2 border-yellow-200">
			<span class="text-[20px] font-black uppercase text-blue-700 tracking-[0.2em] block mb-1">
				{{ t('retreatFlyer.cost') }}
			</span>
			<div
				class="text-[38px] font-black text-gray-900 leading-none font-header drop-shadow-md bg-gradient-to-r from-yellow-200/50 to-orange-200/50 px-4 py-2 rounded-xl inline-block border-2 border-yellow-300/50"
			>
				{{ content.formatCost }}
			</div>
		</div>
		<div class="space-y-2 text-[12px]">
			<div
				v-if="content.paymentInfo"
				class="text-gray-700 text-center leading-relaxed bg-white/60 p-2 rounded-lg"
			>
				<span v-html="content.paymentInfo" class="font-semibold text-[10px] leading-relaxed"></span>
			</div>
			<div
				v-if="content.paymentMethods"
				class="bg-white/80 p-3 rounded-xl shadow-md border border-yellow-200"
			>
				<span class="block text-[10px] text-gray-500 uppercase tracking-[0.15em] mb-1 font-black">
					{{ t('retreatFlyer.paymentMethods') }}
				</span>
				<span class="font-bold text-gray-900 text-center block text-[12px]">
					{{ content.paymentMethods }}
				</span>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { FlyerContent } from '@/composables/useFlyerContent';

defineProps<{ content: FlyerContent }>();

const { t } = useI18n();
</script>
