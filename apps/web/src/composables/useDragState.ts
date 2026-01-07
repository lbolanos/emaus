import { ref } from 'vue';

// Track the type of participant being dragged
// This is needed because dataTransfer.getData() doesn't work in dragover events
const draggedParticipantType = ref<'server' | 'walker' | null>(null);

export function useDragState() {
	const startDrag = (type: 'server' | 'walker') => {
		draggedParticipantType.value = type;
	};

	const endDrag = () => {
		draggedParticipantType.value = null;
	};

	const getDraggedType = () => draggedParticipantType.value;

	return {
		draggedParticipantType,
		startDrag,
		endDrag,
		getDraggedType,
	};
}
