<template>
	<!-- No maps URL, no QR: the block keeps its slot but renders nothing -->
	<div v-if="content.googleMapsUrl" class="p-4">
		<div class="fb-row flex flex-col items-center gap-2">
			<!--
				Fixed white plate, deliberately ignoring the theme: a tinted or translucent
				plate is exactly what stops a phone camera from locking onto the code.
			-->
			<div class="p-2.5 bg-white rounded-xl shadow-xl border-2 border-green-200">
				<QrcodeVue
					:value="content.googleMapsUrl"
					:size="95"
					level="L"
					background="#ffffff"
					render-as="canvas"
					class="rounded-lg"
				/>
			</div>
			<span
				v-if="content.qrCaptionText"
				class="text-[10px] text-[color:var(--fb-text)] font-black uppercase tracking-wider text-center"
			>
				{{ content.qrCaptionText }}
			</span>
		</div>
	</div>
</template>

<script setup lang="ts">
import QrcodeVue from 'qrcode.vue';
import type { MeetingFlyerContent } from '@/composables/useMeetingFlyerContent';

defineProps<{ content: MeetingFlyerContent }>();
</script>
