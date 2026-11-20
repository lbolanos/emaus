<template>
	<div class="p-4">
		<h3
			v-if="content.registerText"
			data-text-override="registerOverride"
			class="fb-title text-[length:calc(1.375rem*var(--fb-title-scale,1))] font-black text-[color:var(--fb-title-color)] uppercase mb-2 tracking-[0.15em]"
		>
			{{ content.registerText }}
		</h3>
		<p
			v-if="content.scanToRegisterText"
			data-text-override="scanToRegisterOverride"
			class="fb-body text-[length:calc(0.6875rem*var(--fb-body-scale,1))] text-[color:var(--fb-body-color)] mb-4 font-bold leading-tight whitespace-pre-line"
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
			A width-capped block (w-fit), not running text: it lines up by the auto
			margins the canvas drives with the emphasis slot's alignment. As a plain
			block it would stretch across the column and read as an empty white bar
			with the text stranded at one end.
		-->
		<div
			data-registration-domain
			class="mt-2 block w-fit max-w-full fb-emphasis text-[length:calc(0.5625rem*var(--fb-emphasis-scale,1))] text-[color:var(--fb-emphasis-color)] font-black lowercase tracking-normal bg-white/80 px-2 py-1.5 rounded-lg border border-blue-200/50 shadow-sm break-all leading-tight"
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
