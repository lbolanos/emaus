<template>
	<Dialog :open="open" @update:open="$emit('update:open', $event)">
		<DialogContent class="max-w-lg">
			<DialogHeader>
				<DialogTitle>Notas de {{ member?.participant?.firstName }} {{ member?.participant?.lastName }}</DialogTitle>
				<DialogDescription>
					Agrega notas sobre este miembro de la comunidad
				</DialogDescription>
			</DialogHeader>
			<Textarea
				v-model="localNotes"
				placeholder="Escribe tus notas aquí..."
				rows="8"
				class="min-h-[200px]"
			/>
			<DialogFooter>
				<Button variant="outline" @click="$emit('update:open', false)">Cancelar</Button>
				<Button @click="handleSave" :disabled="isSaving">
					<span v-if="isSaving" class="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
					Guardar
				</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from '@repo/ui';
import { Button } from '@repo/ui';
import { Textarea } from '@repo/ui';

interface Member {
	id: string;
	notes?: string | null;
	participant?: {
		firstName?: string;
		lastName?: string;
	};
}

interface Props {
	open: boolean;
	member: Member | null;
}

interface Emits {
	(e: 'update:open', value: boolean): void;
	(e: 'save', notes: string | null): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const localNotes = ref<string>('');
const isSaving = ref(false);

// Initialize local notes when member changes
watch(
	() => props.member,
	(newMember) => {
		if (newMember) {
			localNotes.value = newMember.notes || '';
		}
	},
	{ immediate: true },
);

const handleSave = () => {
	isSaving.value = true;
	// Emit the save event with the notes (null if empty string)
	emit('save', localNotes.value.trim() || null);
	// Reset saving state after a short delay
	setTimeout(() => {
		isSaving.value = false;
	}, 500);
};
</script>
