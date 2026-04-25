import { ref } from 'vue';
import type { Participant } from '@repo/types';

const tappedParticipant = ref<(Participant & { sourceTableId?: string; sourceRole?: string }) | null>(null);

let touchStartTime = 0;
let didScroll = false;

const PILL_TAP_MAX_MS = 800;

// Any touchmove on the page means the gesture was a scroll, not a tap.
// Runs once at module load (singleton), lives for the app lifetime.
if (typeof window !== 'undefined') {
	window.addEventListener('touchmove', () => { didScroll = true; }, { passive: true });
}

export function useTapAssign() {
	const onTouchStart = (_e: TouchEvent) => {
		touchStartTime = Date.now();
		didScroll = false;
	};

	const onTouchEnd = (e: TouchEvent, participant: Participant, sourceTableId?: string, sourceRole?: string) => {
		if (Date.now() - touchStartTime > PILL_TAP_MAX_MS || didScroll) return;

		// Suppress the synthetic click that mobile browsers fire ~300ms after touchend.
		// Without this, any @click handler on the pill immediately undoes the selection
		// we just set (e.g., BedAssignmentsView's onPillClickWithLongPress).
		if (e.cancelable) e.preventDefault();
		e.stopPropagation();

		if (tappedParticipant.value?.id === participant.id) {
			tappedParticipant.value = null;
			return;
		}
		tappedParticipant.value = { ...participant, sourceTableId, sourceRole } as any;
	};

	const onTapZone = (e: TouchEvent, callback: () => void) => {
		if (!tappedParticipant.value || didScroll) return;
		e.stopPropagation();
		callback();
	};

	// Click fallback for zones — works in DevTools and desktop. On real phones,
	// touchend fires first and clears tappedParticipant, so click becomes a no-op.
	const onZoneClick = (callback: () => void) => {
		if (!tappedParticipant.value) return;
		callback();
	};

	const clearSelection = () => {
		tappedParticipant.value = null;
	};

	const isSelected = (participantId: string) => {
		return tappedParticipant.value?.id === participantId;
	};

	return {
		tappedParticipant,
		onTouchStart,
		onTouchEnd,
		onTapZone,
		onZoneClick,
		clearSelection,
		isSelected,
	};
}
