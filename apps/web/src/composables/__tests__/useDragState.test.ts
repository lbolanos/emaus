import { describe, it, expect, beforeEach } from 'vitest';
import { useDragState } from '../useDragState';

describe('useDragState', () => {
	beforeEach(() => {
		const { endDrag } = useDragState();
		endDrag();
	});

	it('starts with no dragged participant type', () => {
		const { draggedParticipantType, getDraggedType } = useDragState();
		expect(draggedParticipantType.value).toBeNull();
		expect(getDraggedType()).toBeNull();
	});

	it('startDrag sets the dragged participant type', () => {
		const { draggedParticipantType, startDrag } = useDragState();
		startDrag('walker');
		expect(draggedParticipantType.value).toBe('walker');
	});

	it('endDrag clears the dragged participant type', () => {
		const { draggedParticipantType, startDrag, endDrag } = useDragState();
		startDrag('server');
		expect(draggedParticipantType.value).toBe('server');
		endDrag();
		expect(draggedParticipantType.value).toBeNull();
	});

	it('is a singleton shared across hook invocations', () => {
		// Critical: this is how dragover handlers can read state set by dragstart
		// without needing dataTransfer.getData (which Safari blocks during dragover).
		const a = useDragState();
		const b = useDragState();
		a.startDrag('walker');
		expect(b.draggedParticipantType.value).toBe('walker');
		b.endDrag();
		expect(a.draggedParticipantType.value).toBeNull();
	});

	it('switches type when startDrag is called again', () => {
		const { draggedParticipantType, startDrag } = useDragState();
		startDrag('walker');
		startDrag('server');
		expect(draggedParticipantType.value).toBe('server');
	});
});
