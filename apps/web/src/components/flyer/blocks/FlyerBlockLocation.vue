<template>
	<div class="p-4 rounded-2xl bg-white/85 backdrop-blur-sm shadow-md print:bg-white print:backdrop-blur-none">
		<div class="flex gap-4 items-start group">
			<div
				class="bg-gradient-to-br from-green-500 to-green-700 p-2.5 rounded-xl text-white shadow-xl flex-shrink-0"
			>
				<MapPin class="w-5 h-5" />
			</div>
			<div class="flex-1 min-w-0">
				<h4
					class="font-black text-[15px] uppercase text-green-700 tracking-[0.15em] mb-1.5 drop-shadow-lg"
				>
					{{ t('retreatFlyer.location') }}
				</h4>
				<p class="text-[18px] font-black text-black leading-tight">{{ content.retreatLocation }}</p>
				<p class="text-[11px] text-blue-900 leading-snug mt-1 font-medium">
					{{ content.retreatAddress }}
				</p>
			</div>
			<div
				v-if="content.googleMapsUrl && content.showQrCodesLocation"
				class="flex flex-col items-center gap-2 flex-shrink-0"
			>
				<div class="p-2.5 bg-white rounded-xl shadow-xl border-2 border-red-200">
					<QrcodeVue
						:value="content.googleMapsUrl"
						:size="95"
						level="M"
						background="#ffffff"
						class="rounded-lg"
					/>
				</div>
				<span class="text-[11px] text-black font-black uppercase tracking-wider">
					{{ t('retreatFlyer.locationQR') }}
				</span>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { MapPin } from 'lucide-vue-next';
import QrcodeVue from 'qrcode.vue';
import type { FlyerContent } from '@/composables/useFlyerContent';

defineProps<{ content: FlyerContent }>();

const { t } = useI18n();
</script>
