import { describe, it, expect, beforeEach } from 'vitest';
import { useTapAssign } from '../useTapAssign';

// Helper to build a fake TouchEvent; happy-dom supports it well enough for our needs.
const makeTouchEvent = (type: string, cancelable = true): TouchEvent => {
	const e = new Event(type, { cancelable }) as any;
	// stopPropagation is used by onTouchEnd — make sure it exists as a noop.
	e.stopPropagation = () => {};
	return e as TouchEvent;
};

const makeParticipant = (id: string, snores = false): any => ({
	id,
	firstName: `User${id}`,
	lastName: 'Test',
	birthDate: '1990-01-01',
	snores,
});

describe('useTapAssign', () => {
	beforeEach(() => {
		// Clear any prior selection — the composable is a module-level singleton
		const { clearSelection } = useTapAssign();
		clearSelection();
	});

	it('starts with no tapped participant', () => {
		const { tappedParticipant, isSelected } = useTapAssign();
		expect(tappedParticipant.value).toBeNull();
		expect(isSelected('anything')).toBe(false);
	});

	it('selects a participant on touchend within the tap window', () => {
		const { onTouchStart, onTouchEnd, tappedParticipant, isSelected } = useTapAssign();
		const p = makeParticipant('1');
		onTouchStart(makeTouchEvent('touchstart'));
		onTouchEnd(makeTouchEvent('touchend'), p);
		expect(tappedParticipant.value?.id).toBe('1');
		expect(isSelected('1')).toBe(true);
		expect(isSelected('2')).toBe(false);
	});

	it('deselects when tapping the same participant again', () => {
		const { onTouchStart, onTouchEnd, tappedParticipant } = useTapAssign();
		const p = makeParticipant('1');
		onTouchStart(makeTouchEvent('touchstart'));
		onTouchEnd(makeTouchEvent('touchend'), p);
		expect(tappedParticipant.value?.id).toBe('1');

		onTouchStart(makeTouchEvent('touchstart'));
		onTouchEnd(makeTouchEvent('touchend'), p);
		expect(tappedParticipant.value).toBeNull();
	});

	it('switches selection when tapping a different participant', () => {
		const { onTouchStart, onTouchEnd, tappedParticipant } = useTapAssign();
		onTouchStart(makeTouchEvent('touchstart'));
		onTouchEnd(makeTouchEvent('touchend'), makeParticipant('1'));
		onTouchStart(makeTouchEvent('touchstart'));
		onTouchEnd(makeTouchEvent('touchend'), makeParticipant('2'));
		expect(tappedParticipant.value?.id).toBe('2');
	});

	it('clearSelection nulls out state', () => {
		const { onTouchStart, onTouchEnd, clearSelection, tappedParticipant } = useTapAssign();
		onTouchStart(makeTouchEvent('touchstart'));
		onTouchEnd(makeTouchEvent('touchend'), makeParticipant('1'));
		expect(tappedParticipant.value).not.toBeNull();
		clearSelection();
		expect(tappedParticipant.value).toBeNull();
	});

	it('stores sourceTableId and sourceRole metadata when provided', () => {
		const { onTouchStart, onTouchEnd, tappedParticipant } = useTapAssign();
		onTouchStart(makeTouchEvent('touchstart'));
		onTouchEnd(makeTouchEvent('touchend'), makeParticipant('1'), 'table-123', 'lider');
		expect((tappedParticipant.value as any)?.sourceTableId).toBe('table-123');
		expect((tappedParticipant.value as any)?.sourceRole).toBe('lider');
	});

	it('onZoneClick invokes callback only when a participant is selected', () => {
		const { onZoneClick, onTouchStart, onTouchEnd } = useTapAssign();
		let called = 0;
		const cb = () => { called++; };

		onZoneClick(cb);
		expect(called).toBe(0);

		onTouchStart(makeTouchEvent('touchstart'));
		onTouchEnd(makeTouchEvent('touchend'), makeParticipant('1'));
		onZoneClick(cb);
		expect(called).toBe(1);
	});

	it('singleton state is shared across hook invocations', () => {
		const a = useTapAssign();
		const b = useTapAssign();
		a.onTouchStart(makeTouchEvent('touchstart'));
		a.onTouchEnd(makeTouchEvent('touchend'), makeParticipant('1'));
		expect(b.tappedParticipant.value?.id).toBe('1');
	});

	it('onTouchEnd calls preventDefault when tap is processed (suppresses synthetic click)', () => {
		const { onTouchStart, onTouchEnd } = useTapAssign();
		onTouchStart(makeTouchEvent('touchstart'));
		const e = makeTouchEvent('touchend');
		onTouchEnd(e, makeParticipant('1'));
		// Mobile browsers fire a synthetic click ~300ms after touchend; calling
		// preventDefault in the handler is the standard way to suppress it.
		// Without this, the @click handler would immediately toggle the selection off.
		expect(e.defaultPrevented).toBe(true);
	});

	it('onTouchEnd does NOT preventDefault when the tap window elapsed (lets click fallback run)', () => {
		const { onTouchStart, onTouchEnd } = useTapAssign();
		onTouchStart(makeTouchEvent('touchstart'));
		// Age the touchStartTime past the 800ms window by spying on Date.now.
		const realNow = Date.now;
		const origin = realNow();
		(Date as any).now = () => origin + 2000;
		try {
			const e = makeTouchEvent('touchend');
			onTouchEnd(e, makeParticipant('1'));
			expect(e.defaultPrevented).toBe(false);
		} finally {
			(Date as any).now = realNow;
		}
	});
});
