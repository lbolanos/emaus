<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle } from '@repo/ui';
import { ChevronLeft, ChevronRight, Download } from 'lucide-vue-next';
import type { LetterAttachment } from '@repo/types';
import { openAttachment } from '@/utils/letterAttachments';

/**
 * Las fotos de una carta en grande: flechas (o ←/→) para pasar entre ellas y
 * descarga de la que se ve. Solo fotos imprimibles; los documentos se abren
 * o descargan aparte (openAttachment).
 */
const props = defineProps<{
	open: boolean;
	photos: Pick<LetterAttachment, 'id' | 'fileName' | 'storageUrl' | 'mimeType' | 'isBrowserSafeImage'>[];
	index: number;
}>();

const emit = defineEmits<{
	'update:open': [value: boolean];
	'update:index': [value: number];
}>();

const { t } = useI18n();

const current = computed(() => props.photos[props.index] ?? null);
const hasMany = computed(() => props.photos.length > 1);

const go = (delta: number) => {
	if (!hasMany.value) return;
	const n = props.photos.length;
	emit('update:index', (props.index + delta + n) % n);
};

const onKey = (e: KeyboardEvent) => {
	if (e.key === 'ArrowRight') go(1);
	else if (e.key === 'ArrowLeft') go(-1);
};

watch(
	() => props.open,
	(open) => {
		if (open) window.addEventListener('keydown', onKey);
		else window.removeEventListener('keydown', onKey);
	},
	{ immediate: true },
);
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
	<Dialog :open="props.open" @update:open="emit('update:open', $event)">
		<DialogContent class="max-w-5xl">
			<DialogHeader>
				<DialogTitle class="truncate">
					{{ current?.fileName }}
					<span v-if="hasMany" class="ml-2 text-sm font-normal text-muted-foreground">
						{{ props.index + 1 }} / {{ props.photos.length }}
					</span>
				</DialogTitle>
			</DialogHeader>
			<div class="relative flex items-center justify-center bg-muted/30" data-testid="photo-viewer">
				<Button
					v-if="hasMany"
					variant="ghost"
					size="icon"
					class="absolute left-1 top-1/2 -translate-y-1/2"
					:aria-label="t('letters.viewer.previous')"
					data-testid="photo-prev"
					@click="go(-1)"
				>
					<ChevronLeft class="h-6 w-6" />
				</Button>
				<img
					v-if="current"
					:src="current.storageUrl"
					:alt="current.fileName"
					class="max-h-[75vh] w-auto max-w-full object-contain"
				/>
				<Button
					v-if="hasMany"
					variant="ghost"
					size="icon"
					class="absolute right-1 top-1/2 -translate-y-1/2"
					:aria-label="t('letters.viewer.next')"
					data-testid="photo-next"
					@click="go(1)"
				>
					<ChevronRight class="h-6 w-6" />
				</Button>
			</div>
			<div class="flex justify-end">
				<Button v-if="current" variant="outline" size="sm" @click="openAttachment(current)">
					<Download class="mr-2 h-4 w-4" />
					{{ t('letters.viewer.download') }}
				</Button>
			</div>
		</DialogContent>
	</Dialog>
</template>
