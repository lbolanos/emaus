<template>
	<Dialog :open="open" @update:open="$emit('update:open', $event)">
		<DialogContent class="max-w-md">
			<DialogHeader>
				<DialogTitle>{{ $t('tables.photoMemory.title', { name: table.name }) }}</DialogTitle>
				<DialogDescription>{{ $t('tables.photoMemory.description') }}</DialogDescription>
			</DialogHeader>

			<!-- Current photo, or the pending replacement -->
			<div
				v-if="previewUrl || table.photoUrl"
				class="overflow-hidden rounded-lg border bg-secondary/30"
			>
				<img
					:src="previewUrl ?? table.photoUrl!"
					:alt="$t('tables.photoMemory.title', { name: table.name })"
					class="max-h-64 w-full object-contain"
				/>
			</div>

			<p
				v-if="previewUrl"
				class="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
			>
				{{ $t('tables.photoMemory.pendingReplace') }}
			</p>

			<div class="flex flex-col gap-2">
				<Button :disabled="saving" data-testid="table-photo-choose" @click="triggerFileInput">
					<Loader2 v-if="saving" class="h-4 w-4 animate-spin" />
					<ImagePlus v-else class="h-4 w-4" />
					{{ previewUrl ? $t('tables.photoMemory.chooseOther') : $t('tables.photoMemory.choose') }}
				</Button>
				<p class="text-xs text-muted-foreground">{{ $t('tables.photoMemory.hint') }}</p>
			</div>

			<DialogFooter>
				<Button
					v-if="table.photoUrl"
					variant="destructive"
					:disabled="saving"
					data-testid="table-photo-remove"
					@click="removePhoto"
				>
					{{ $t('tables.photoMemory.remove') }}
				</Button>
				<Button variant="outline" :disabled="saving" @click="$emit('update:open', false)">
					{{ $t('common.cancel') }}
				</Button>
				<Button :disabled="!previewUrl || saving" data-testid="table-photo-save" @click="save">
					{{ saving ? $t('tables.photoMemory.saving') : $t('tables.photoMemory.save') }}
				</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import type { PropType } from 'vue';
import type { TableMesa } from '@repo/types';
import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	useToast,
} from '@repo/ui';
import { ImagePlus, Loader2 } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import { pickFile } from '@/utils/filePicker';
import { MAX_PHOTO_SOURCE_BYTES, PHOTO_MAX_SIDE, resizeImageToDataUrl } from '@/utils/imageResize';
import { useTableMesaStore } from '@/stores/tableMesaStore';
import { apiErrorMessage } from '@/services/apiError';

/**
 * Uploads/replaces/removes the group photo of a table for the retreat keepsake
 * (spec table-memory-photo). The photo is resized client-side (1600px) before
 * upload, same as the memories gallery.
 */
const props = defineProps({
	open: { type: Boolean, required: true },
	table: { type: Object as PropType<TableMesa>, required: true },
});
const emit = defineEmits(['update:open']);

const { t } = useI18n();
const { toast } = useToast();
const tableStore = useTableMesaStore();

const previewUrl = ref<string | null>(null);
const saving = ref(false);

// Drop any pending preview when the dialog (re)opens.
watch(
	() => props.open,
	(open) => {
		if (open) previewUrl.value = null;
	},
);

const triggerFileInput = async () => {
	const file = await pickFile({ accept: 'image/jpeg,image/png,image/webp' });
	if (file) void chooseFile(file);
};

const chooseFile = async (file: File) => {
	if (file.size > MAX_PHOTO_SOURCE_BYTES) {
		toast({
			title: t('tables.photoMemory.tooLargeTitle'),
			description: t('tables.photoMemory.tooLarge', { name: file.name }),
			variant: 'destructive',
		});
		return;
	}
	if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
		toast({
			title: t('tables.photoMemory.badFormatTitle'),
			description: t('tables.photoMemory.badFormat', { name: file.name }),
			variant: 'destructive',
		});
		return;
	}
	try {
		// Resize before upload: keeps the payload under the request body cap.
		previewUrl.value = await resizeImageToDataUrl(file, { maxSide: PHOTO_MAX_SIDE });
	} catch {
		toast({
			title: t('tables.photoMemory.decodeErrorTitle'),
			description: t('tables.photoMemory.decodeError', { name: file.name }),
			variant: 'destructive',
		});
	}
};

const save = async () => {
	if (!previewUrl.value || saving.value) return;
	saving.value = true;
	try {
		await tableStore.setTablePhoto(props.table.id, previewUrl.value);
		previewUrl.value = null;
		toast({ title: t('tables.photoMemory.savedTitle') });
		emit('update:open', false);
	} catch (error) {
		toast({
			title: t('tables.photoMemory.saveErrorTitle'),
			description: apiErrorMessage(error),
			variant: 'destructive',
		});
	} finally {
		saving.value = false;
	}
};

const removePhoto = async () => {
	if (saving.value) return;
	saving.value = true;
	try {
		await tableStore.removeTablePhoto(props.table.id);
		previewUrl.value = null;
		toast({ title: t('tables.photoMemory.removedTitle') });
		emit('update:open', false);
	} catch (error) {
		toast({
			title: t('tables.photoMemory.removeErrorTitle'),
			description: apiErrorMessage(error),
			variant: 'destructive',
		});
	} finally {
		saving.value = false;
	}
};
</script>
