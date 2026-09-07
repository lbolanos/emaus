<template>
	<div class="p-4">
		<h3
			v-if="content.registerText"
			class="text-[22px] font-black text-[color:var(--fb-heading)] uppercase mb-2 tracking-[0.15em]"
		>
			{{ content.registerText }}
		</h3>
		<p
			v-if="content.scanToRegisterText"
			class="text-[11px] text-[color:var(--fb-text)] mb-4 font-bold leading-tight whitespace-pre-line"
		>
			{{ content.scanToRegisterText }}
		</p>

		<div class="fb-row flex mb-4">
			<div class="p-3 bg-white rounded-xl shadow-xl border-2 border-blue-300">
				<QrcodeVue
					:value="content.registrationUrl"
					:size="110"
					level="L"
					background="#ffffff"
					class="rounded-lg"
				/>
			</div>
		</div>
		<!--
			inline-block so the plate is as wide as the address and no wider: as a block it
			stretched across the column and read as an empty white bar with the text stranded
			at one end. It lines up by the block's own alignment, like everything else here.
		-->
		<div
			data-registration-domain
			class="mt-2 inline-block max-w-full text-[9px] text-blue-700 font-black font-mono lowercase tracking-normal bg-white/80 px-2 py-1.5 rounded-lg border border-blue-200/50 shadow-sm break-all leading-tight"
		>
			{{ content.registrationDomain }}
		</div>
	</div>
</template>

<script setup lang="ts">
import QrcodeVue from 'qrcode.vue';
import type { FlyerContent } from '@/composables/useFlyerContent';

defineProps<{ content: FlyerContent }>();
</script>
