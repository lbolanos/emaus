<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
	Input,
	Label,
	Button,
} from '@repo/ui';
import type { Retreat } from '@repo/types';
import { useRetreatStore } from '@/stores/retreatStore';
import { getRetreatDeletionImpact, type RetreatDeletionImpact } from '@/services/api';

const props = defineProps<{
	open: boolean;
	retreat: Retreat | null;
}>();

const emit = defineEmits<{
	(e: 'update:open', value: boolean): void;
	(e: 'deleted', id: string): void;
}>();

const retreatStore = useRetreatStore();
const confirmText = ref('');

// Impacto del borrado (para advertir qué se pierde si el retiro tiene datos).
const impact = ref<RetreatDeletionImpact | null>(null);
const hasImpact = computed(() => {
	const i = impact.value;
	return (
		!!i &&
		(i.activeParticipants > 0 || i.payments > 0 || i.tables > 0 || i.scheduledMessages > 0)
	);
});

// Confirmación fuerte: hay que teclear el nombre del retiro. Trimeamos AMBOS lados
// porque algunos nombres guardados traen espacios al borde (p. ej. "… | Mexico City ").
const canConfirm = computed(
	() => !!props.retreat && confirmText.value.trim() === (props.retreat.parish ?? '').trim(),
);

// Al abrir: limpiar el input y traer el impacto del borrado.
watch(
	() => props.open,
	async (isOpen) => {
		confirmText.value = '';
		impact.value = null;
		if (isOpen && props.retreat) {
			try {
				impact.value = await getRetreatDeletionImpact(props.retreat.id);
			} catch {
				impact.value = null; // si falla el conteo, no bloqueamos el borrado
			}
		}
	},
);

function setOpen(value: boolean) {
	emit('update:open', value);
}

async function confirmDelete() {
	const target = props.retreat;
	if (!target || confirmText.value.trim() !== (target.parish ?? '').trim()) return;
	// Cerrar el diálogo ANTES del await pesado (evita el freeze de reka-ui).
	emit('update:open', false);
	try {
		await retreatStore.deleteRetreat(target.id);
		emit('deleted', target.id);
	} catch {
		/* el store ya muestra el toast de error */
	} finally {
		confirmText.value = '';
	}
}
</script>

<template>
	<Dialog :open="open" @update:open="setOpen">
		<DialogContent class="max-w-md">
			<DialogHeader>
				<DialogTitle>Eliminar retiro</DialogTitle>
				<DialogDescription>
					Esta acción es permanente y no se puede deshacer. Se eliminará el retiro y toda su
					información asociada (mesas, horario, inventario, mensajes, etc.).
				</DialogDescription>
			</DialogHeader>
			<div
				v-if="hasImpact"
				class="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
			>
				<p class="font-medium">Este retiro tiene información que se perderá:</p>
				<ul class="mt-1 list-disc pl-5 space-y-0.5">
					<li v-if="impact!.activeParticipants > 0">
						{{ impact!.activeParticipants }} participante(s) inscrito(s)
					</li>
					<li v-if="impact!.payments > 0">{{ impact!.payments }} pago(s)</li>
					<li v-if="impact!.tables > 0">{{ impact!.tables }} mesa(s)</li>
					<li v-if="impact!.scheduledMessages > 0">
						{{ impact!.scheduledMessages }} mensaje(s) programado(s)
					</li>
				</ul>
			</div>
			<div class="space-y-2">
				<Label>
					Escribe
					<span class="font-semibold">{{ retreat?.parish }}</span>
					para confirmar
				</Label>
				<Input v-model="confirmText" placeholder="Nombre del retiro" />
			</div>
			<DialogFooter>
				<Button variant="outline" @click="setOpen(false)">Cancelar</Button>
				<Button
					variant="destructive"
					:disabled="!canConfirm || retreatStore.loading"
					@click="confirmDelete"
				>
					Eliminar
				</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>
</template>
