<template>
	<!-- A heading with no numbers under it reads as a mistake, so render nothing -->
	<div v-if="content.totalContactItems > 0" class="p-2.5">
		<h4
			class="fb-lead fb-title text-[length:calc(0.875rem*var(--fb-title-scale,1))] font-black text-[color:var(--fb-title-color)] uppercase mb-1.5 flex items-center gap-3 tracking-[0.1em]"
		>
			<div
				class="fb-title-chip bg-gradient-to-br from-blue-400 to-blue-600 p-2.5 rounded-xl text-white shadow-xl flex-shrink-0"
			>
				<Info class="w-5 h-5" />
			</div>
			{{ t('retreatFlyer.information') }}
		</h4>
		<!--
			Capped: the phone cards read as a stretched box across a whole column otherwise.
			Always a grid — one column or two — because that is what lets .fb-stack size each
			card to its own number instead of to the width of the widest one.
		-->
		<div
			:class="[
				// Auto-fit instead of a fixed 2 columns: a block shrunk with the
				// resize edge reflows the cards to one column instead of spilling
				// them past the block's edge
				'fb-box fb-stack grid gap-1 max-w-[320px] w-full',
				// 9rem floor: two tracks (2×144px+gap) fit the 320px cap, so full width
				// keeps the classic two columns and only a truly shrunk block reflows
				'grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]',
			]"
		>
			<div
				v-for="(phone, index) in content.contactPhones"
				:key="phone?.number || index"
				class="p-1.5 rounded-lg shadow-sm border border-green-200/60"
			>
				<div class="fb-row flex items-center gap-1.5">
					<div
						class="bg-gradient-to-br from-green-500 to-green-600 p-1.5 rounded-full text-white flex-shrink-0 shadow"
					>
						<Phone class="w-3.5 h-3.5" />
					</div>
					<div class="min-w-0">
						<span
							class="font-bold text-[color:var(--fb-body-color)] block fb-body text-[length:calc(0.5rem*var(--fb-body-scale,1))] uppercase tracking-wider truncate opacity-80"
						>
							{{ phone?.name || t('retreatFlyer.contact') }}
						</span>
						<span
							:class="[
								'font-black fb-emphasis text-[color:var(--fb-emphasis-color)]',
								content.totalContactItems > 2 ? 'text-[length:calc(0.6875rem*var(--fb-emphasis-scale,1))]' : 'text-[length:calc(0.8125rem*var(--fb-emphasis-scale,1))]',
							]"
						>
							{{ phone?.number }}
						</span>
					</div>
				</div>
			</div>
			<div
				v-for="email in content.contactEmails"
				:key="email"
				class="p-1.5 rounded-lg shadow-sm border border-blue-200/60 col-span-full"
			>
				<div class="fb-row flex items-center gap-1.5">
					<div
						class="bg-gradient-to-br from-blue-500 to-blue-600 p-1.5 rounded-full text-white flex-shrink-0 shadow"
					>
						<Mail class="w-3.5 h-3.5" />
					</div>
					<div class="min-w-0">
						<span class="font-bold text-[color:var(--fb-body-color)] block fb-body text-[length:calc(0.5rem*var(--fb-body-scale,1))] uppercase tracking-wider opacity-80">
							Email
						</span>
						<span
							:class="[
								'font-black break-all fb-body text-[color:var(--fb-body-color)]',
								content.totalContactItems > 2 ? 'text-[length:calc(0.6875rem*var(--fb-body-scale,1))]' : 'text-[length:calc(0.75rem*var(--fb-body-scale,1))]',
							]"
						>
							{{ email }}
						</span>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Info, Mail, Phone } from 'lucide-vue-next';
import type { FlyerContent } from '@/composables/useFlyerContent';

defineProps<{ content: FlyerContent }>();

const { t } = useI18n();
</script>
