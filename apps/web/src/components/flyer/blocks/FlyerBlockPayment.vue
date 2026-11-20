<template>
	<!--
		Capped so the divider under the price doesn't stretch across the column.

		The two white plates inside are part of the original design, not a block background:
		this is the smallest print on the flyer and it falls on the brightest part of the
		artwork. Keeping them here — rather than as a default block veil — is what lets the
		design panel say "no background" and be telling the truth.
	-->
	<div class="fb-box max-w-[360px] p-3">
		<div class="mb-3 pb-3 border-b-2 border-current/25">
			<span class="fb-title text-[length:calc(1.25rem*var(--fb-title-scale,1))] font-black uppercase text-[color:var(--fb-heading)] tracking-[0.2em] block mb-1">
				{{ t('retreatFlyer.cost') }}
			</span>
			<div
				class="fb-emphasis text-[length:calc(2.375rem*var(--fb-emphasis-scale,1))] font-black text-gray-900 leading-none drop-shadow-md bg-gradient-to-r from-yellow-200/50 to-orange-200/50 px-4 py-2 rounded-xl inline-block border-2 border-yellow-300/50"
			>
				{{ content.formatCost }}
			</div>
		</div>
		<div class="space-y-2 fb-body text-[length:calc(0.75rem*var(--fb-body-scale,1))]">
			<div
				v-if="content.paymentInfo"
				class="text-gray-700 leading-relaxed bg-white/60 p-2 rounded-lg"
			>
				<span v-html="content.paymentInfo" class="font-semibold fb-body text-[length:calc(0.625rem*var(--fb-body-scale,1))] leading-relaxed"></span>
			</div>
			<div
				v-if="content.paymentMethods"
				class="bg-white/80 p-3 rounded-xl shadow-md border border-yellow-200"
			>
				<span class="block fb-body text-[length:calc(0.625rem*var(--fb-body-scale,1))] text-gray-500 uppercase tracking-[0.15em] mb-1 font-black">
					{{ t('retreatFlyer.paymentMethods') }}
				</span>
				<span
					class="font-bold text-gray-900 block text-[12px] whitespace-pre-line"
				>
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
