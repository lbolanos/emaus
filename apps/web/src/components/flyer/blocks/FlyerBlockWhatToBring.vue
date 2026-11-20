<template>
	<div class="p-2.5">
		<h4
			v-if="content.whatToBringText"
			data-text-override="whatToBringOverride"
			class="fb-lead font-black fb-title text-[length:calc(0.8125rem*var(--fb-title-scale,1))] uppercase text-[color:var(--fb-title-color)] mb-2 flex items-center gap-2 border-b border-current/30 pb-2 tracking-[0.1em]"
		>
			<div
				class="bg-gradient-to-br from-purple-400 to-purple-600 p-2.5 rounded-xl text-white shadow-xl flex-shrink-0"
			>
				<Backpack class="w-5 h-5" />
			</div>
			{{ content.whatToBringText }}
			<span
				v-if="content.thingsToBringSubtitle"
				class="text-[color:var(--fb-body-color)] ml-2 fb-body text-[length:calc(0.6875rem*var(--fb-body-scale,1))] normal-case tracking-normal font-bold"
			>
				{{ content.thingsToBringSubtitle }}
			</span>
		</h4>

		<ul class="grid grid-cols-3 gap-x-3 gap-y-1.5 fb-body text-[length:calc(0.6875rem*var(--fb-body-scale,1))] text-[color:var(--fb-body-color)]">
			<li v-for="item in items" :key="item" class="fb-row flex items-start gap-1.5">
				<div
					class="w-1.5 h-1.5 mt-1.5 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex-shrink-0"
				></div>
				<span class="font-medium">{{ item }}</span>
			</li>
		</ul>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Backpack } from 'lucide-vue-next';
import type { FlyerContent } from '@/composables/useFlyerContent';

const props = defineProps<{ content: FlyerContent }>();

const { t } = useI18n();

const defaultItems = computed(() => [
	t('retreatFlyer.defaultItems.personalThermos'),
	t('retreatFlyer.defaultItems.towel'),
	t('retreatFlyer.defaultItems.toiletries'),
	t('retreatFlyer.defaultItems.jacketSweatshirt'),
	t('retreatFlyer.defaultItems.comfortableClothes'),
]);

const items = computed(() =>
	props.content.thingsToBringItems.length > 0
		? props.content.thingsToBringItems
		: defaultItems.value,
);
</script>
