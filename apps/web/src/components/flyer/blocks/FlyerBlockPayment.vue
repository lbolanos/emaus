<template>
	<!-- Capped so the divider under the price doesn't stretch across the column -->
	<div class="max-w-[360px] mx-auto p-3">
		<div class="text-center mb-3 pb-3 border-b-2 border-current/25">
			<span class="text-[20px] font-black uppercase text-[color:var(--fb-heading)] tracking-[0.2em] block mb-1">
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
				class="text-[color:var(--fb-text)] text-center leading-relaxed p-2"
			>
				<span v-html="content.paymentInfo" class="font-semibold text-[10px] leading-relaxed"></span>
			</div>
			<div
				v-if="content.paymentMethods"
				class="p-3 rounded-xl border border-current/25"
			>
				<span class="block text-[10px] text-[color:var(--fb-text)] uppercase tracking-[0.15em] mb-1 font-black opacity-80">
					{{ t('retreatFlyer.paymentMethods') }}
				</span>
				<span class="font-bold text-[color:var(--fb-text)] text-center block text-[12px]">
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
