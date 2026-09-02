<template>
	<div class="space-y-2">
		<div class="flex items-center justify-between gap-2">
			<Label class="text-xs">{{ t(`retreatFlyerEditor.images.${imageKey}`) }}</Label>
			<button
				v-if="modelValue"
				type="button"
				class="text-[11px] text-muted-foreground underline hover:text-foreground"
				@click="emit('update', undefined)"
			>
				{{ t('retreatFlyerEditor.images.useDefault') }}
			</button>
		</div>

		<div class="flex flex-wrap gap-2">
			<button
				v-for="preset in presets"
				:key="preset.url"
				type="button"
				class="h-12 w-16 overflow-hidden rounded border-2 bg-muted transition-colors"
				:class="modelValue === preset.url ? 'border-primary' : 'border-transparent hover:border-muted-foreground/40'"
				:title="preset.label"
				:aria-label="preset.label"
				:aria-pressed="modelValue === preset.url"
				@click="emit('update', preset.url)"
			>
				<img :src="preset.url" :alt="preset.label" class="h-full w-full object-cover" />
			</button>

			<!-- A <label> wrapping the input, not a button calling input.click(): a stale
			     ref after hours of HMR makes click() a silent no-op. -->
			<label
				class="flex h-12 w-16 cursor-pointer flex-col items-center justify-center gap-0.5 rounded border-2 border-dashed border-muted-foreground/40 text-muted-foreground hover:border-muted-foreground hover:text-foreground"
				:title="t('retreatFlyerEditor.images.upload')"
			>
				<Loader2 v-if="uploading" class="h-4 w-4 animate-spin" />
				<ImagePlus v-else class="h-4 w-4" />
				<span class="text-[9px] leading-none">
					{{ uploading ? t('retreatFlyerEditor.images.uploading') : t('retreatFlyerEditor.images.upload') }}
				</span>
				<input
					type="file"
					accept="image/png,image/jpeg,image/webp,image/gif"
					class="hidden"
					:disabled="uploading"
					@change="onFileChange"
				/>
			</label>
		</div>

		<!-- An uploaded image is not in the gallery, so show what is actually in use -->
		<p v-if="isCustom" class="flex items-center gap-1.5 text-[11px] text-muted-foreground">
			<img :src="modelValue" alt="" class="h-6 w-8 rounded object-cover" />
			{{ t('retreatFlyerEditor.images.current') }}
		</p>
		<p v-if="error" class="text-[11px] text-destructive">{{ error }}</p>
	</div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ImagePlus, Loader2 } from 'lucide-vue-next';
import { Label } from '@repo/ui';
import type { FlyerImages } from '@repo/types';
import { resizeImageToDataUrl } from '@/utils/imageResize';
import { uploadFlyerAsset } from '@/services/api';
import { apiErrorMessage } from '@/services/apiError';
import { FLYER_PRESET_ASSETS } from '../flyerPresetAssets';

const props = defineProps<{
	imageKey: keyof FlyerImages;
	modelValue?: string;
}>();

const emit = defineEmits<{
	update: [url: string | undefined];
}>();

const { t } = useI18n();

const uploading = ref(false);
const error = ref('');

const presets = computed(() => FLYER_PRESET_ASSETS[props.imageKey] ?? []);

const isCustom = computed(
	() => !!props.modelValue && !presets.value.some((p) => p.url === props.modelValue),
);

/** Backgrounds are exported at pixelRatio 2, so they need more than the 512px default. */
const maxSide = computed(() => (props.imageKey === 'logo' ? 512 : 1600));

async function onFileChange(event: Event) {
	const input = event.target as HTMLInputElement;
	const file = input.files?.[0];
	if (!file) return;

	error.value = '';
	uploading.value = true;
	try {
		const dataUrl = await resizeImageToDataUrl(file, { maxSide: maxSide.value, quality: 0.9 });
		const url = await uploadFlyerAsset(props.imageKey, dataUrl);
		emit('update', url);
	} catch (err) {
		error.value = apiErrorMessage(err, t('retreatFlyerEditor.images.failed'));
	} finally {
		uploading.value = false;
		// Clearing the value lets the same file be picked again after an error
		input.value = '';
	}
}
</script>
