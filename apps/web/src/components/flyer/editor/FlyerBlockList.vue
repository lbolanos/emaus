<template>
	<div class="space-y-4">
		<p class="text-sm text-muted-foreground">{{ t('retreatFlyerEditor.dragHint') }}</p>

		<div v-for="slot in FLYER_SLOTS" :key="slot" class="space-y-2">
			<h4 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				{{ t(`retreatFlyerEditor.slots.${slot}`) }}
			</h4>

			<ul
				class="min-h-[3rem] rounded-lg border-2 border-dashed p-2 space-y-2 transition-colors"
				:class="
					dragOverSlot === slot && dragOverIndex === null
						? 'border-primary bg-primary/5'
						: 'border-muted'
				"
				:data-slot="slot"
				@dragover.prevent="onSlotDragOver(slot)"
				@drop.prevent="onDrop(slot, blocksBySlot[slot].length)"
			>
				<li
					v-for="(block, index) in blocksBySlot[slot]"
					:key="block.id"
					draggable="true"
					class="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 cursor-grab active:cursor-grabbing"
					:class="[
						block.visible === false ? 'opacity-50' : '',
						draggingId === block.id ? 'ring-2 ring-primary' : '',
						dragOverSlot === slot && dragOverIndex === index ? 'border-t-4 border-t-primary' : '',
					]"
					:data-block="block.id"
					@dragstart="onDragStart(block.id)"
					@dragend="onDragEnd"
					@dragover.prevent.stop="onBlockDragOver(slot, index)"
					@drop.prevent.stop="onDrop(slot, index)"
				>
					<GripVertical class="h-4 w-4 flex-shrink-0 text-muted-foreground" />
					<span class="flex-1 truncate text-sm">
						{{ t(`retreatFlyerEditor.blocks.${block.id}`) }}
					</span>
					<span v-if="block.visible === false" class="text-[10px] uppercase text-muted-foreground">
						{{ t('retreatFlyerEditor.hidden') }}
					</span>
					<button
						type="button"
						class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
						:aria-label="
							block.visible === false ? t('retreatFlyerEditor.show') : t('retreatFlyerEditor.hide')
						"
						:title="
							block.visible === false ? t('retreatFlyerEditor.show') : t('retreatFlyerEditor.hide')
						"
						@click="emit('toggle', block.id)"
					>
						<component :is="block.visible === false ? EyeOff : Eye" class="h-4 w-4" />
					</button>
				</li>

				<li
					v-if="!blocksBySlot[slot].length"
					class="px-2 py-1.5 text-xs text-muted-foreground select-none"
				>
					{{ t('retreatFlyerEditor.emptySlot') }}
				</li>
			</ul>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Eye, EyeOff, GripVertical } from 'lucide-vue-next';
import type { FlyerBlockId, FlyerBlockLayout, FlyerSlot } from '@repo/types';
import { FLYER_SLOTS } from '../blockRegistry';

defineProps<{
	blocksBySlot: Record<FlyerSlot, FlyerBlockLayout[]>;
}>();

const emit = defineEmits<{
	move: [blockId: FlyerBlockId, toSlot: FlyerSlot, toIndex: number];
	toggle: [blockId: FlyerBlockId];
}>();

const { t } = useI18n();

// Native HTML5 drag and drop, like DashboardCustomizePanel. The dragged id lives in a
// ref because dataTransfer.getData() is not readable during dragover, which is where
// the drop indicator has to be decided.
const draggingId = ref<FlyerBlockId | null>(null);
const dragOverSlot = ref<FlyerSlot | null>(null);
const dragOverIndex = ref<number | null>(null);

function onDragStart(blockId: FlyerBlockId) {
	draggingId.value = blockId;
}

function onSlotDragOver(slot: FlyerSlot) {
	dragOverSlot.value = slot;
	dragOverIndex.value = null;
}

function onBlockDragOver(slot: FlyerSlot, index: number) {
	dragOverSlot.value = slot;
	dragOverIndex.value = index;
}

function onDrop(slot: FlyerSlot, index: number) {
	if (draggingId.value) {
		emit('move', draggingId.value, slot, index);
	}
	onDragEnd();
}

function onDragEnd() {
	draggingId.value = null;
	dragOverSlot.value = null;
	dragOverIndex.value = null;
}
</script>
