<template>
	<!-- A heading with no numbers under it reads as a mistake, so render nothing -->
	<div v-if="content.totalContactItems > 0" class="p-2.5">
		<h4
			class="fb-lead text-[14px] font-black text-[color:var(--fb-heading)] uppercase mb-1.5 flex items-center gap-3 tracking-[0.1em]"
		>
			<div
				class="bg-gradient-to-br from-blue-400 to-blue-600 p-2.5 rounded-xl text-white shadow-xl flex-shrink-0"
			>
				<Info class="w-5 h-5" />
			</div>
			{{ t('retreatFlyer.information') }}
		</h4>
		<!-- Capped: the phone cards read as a stretched box across a whole column otherwise -->
		<div
			:class="[
				'fb-box gap-1 max-w-[320px]',
				content.totalContactItems > 2 ? 'grid grid-cols-2' : 'space-y-1',
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
							class="font-bold text-[color:var(--fb-text)] block text-[8px] uppercase tracking-wider truncate opacity-80"
						>
							{{ phone?.name || t('retreatFlyer.contact') }}
						</span>
						<span
							:class="[
								'font-black font-mono text-[color:var(--fb-text)]',
								content.totalContactItems > 2 ? 'text-[11px]' : 'text-[13px]',
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
				class="p-1.5 rounded-lg shadow-sm border border-blue-200/60"
				:class="content.totalContactItems > 2 ? 'col-span-2' : ''"
			>
				<div class="fb-row flex items-center gap-1.5">
					<div
						class="bg-gradient-to-br from-blue-500 to-blue-600 p-1.5 rounded-full text-white flex-shrink-0 shadow"
					>
						<Mail class="w-3.5 h-3.5" />
					</div>
					<div class="min-w-0">
						<span class="font-bold text-[color:var(--fb-text)] block text-[8px] uppercase tracking-wider opacity-80">
							Email
						</span>
						<span
							:class="[
								'font-black break-all text-[color:var(--fb-text)]',
								content.totalContactItems > 2 ? 'text-[11px]' : 'text-[12px]',
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
