import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useResizableSplit } from '../useResizableSplit';

/**
 * Draggable split of the WhatsApp inbox (v1.4, D24): bounded drag, keyboard,
 * double-click reset and per-browser persistence.
 */
const KEY = 'test.split';
const options = { storageKey: KEY, defaultSize: 340, min: 260, max: 560 };

function pointer(type: string, clientX: number): PointerEvent {
  const target = { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() };
  return {
    type,
    clientX,
    button: 0,
    pointerId: 1,
    currentTarget: target,
    preventDefault: vi.fn(),
  } as unknown as PointerEvent;
}

function key(name: string): KeyboardEvent {
  return { key: name, preventDefault: vi.fn() } as unknown as KeyboardEvent;
}

describe('useResizableSplit', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts at the default and restores a stored size (clamped)', () => {
    expect(useResizableSplit(options).size.value).toBe(340);
    localStorage.setItem(KEY, '9999');
    expect(useResizableSplit(options).size.value).toBe(560);
    localStorage.setItem(KEY, 'not-a-number');
    expect(useResizableSplit(options).size.value).toBe(340);
  });

  it('drags within the limits and remembers the size on release', () => {
    const split = useResizableSplit(options);
    split.onPointerDown(pointer('pointerdown', 500));
    expect(split.dragging.value).toBe(true);
    split.onPointerMove(pointer('pointermove', 560));
    expect(split.size.value).toBe(400);
    split.onPointerMove(pointer('pointermove', 1500));
    expect(split.size.value).toBe(560);
    split.onPointerMove(pointer('pointermove', 0));
    expect(split.size.value).toBe(260);
    split.onPointerUp(pointer('pointerup', 0));
    expect(split.dragging.value).toBe(false);
    expect(localStorage.getItem(KEY)).toBe('260');
  });

  it('ignores moves without a drag and non-primary buttons', () => {
    const split = useResizableSplit(options);
    split.onPointerMove(pointer('pointermove', 900));
    expect(split.size.value).toBe(340);
    split.onPointerDown({ ...pointer('pointerdown', 0), button: 2 } as PointerEvent);
    expect(split.dragging.value).toBe(false);
  });

  it('moves with the arrow keys, Home/End, and resets on double-click', () => {
    const split = useResizableSplit(options);
    split.onKeydown(key('ArrowRight'));
    expect(split.size.value).toBe(360);
    split.onKeydown(key('ArrowLeft'));
    split.onKeydown(key('ArrowLeft'));
    expect(split.size.value).toBe(320);
    split.onKeydown(key('End'));
    expect(split.size.value).toBe(560);
    split.onKeydown(key('Home'));
    expect(split.size.value).toBe(260);
    expect(localStorage.getItem(KEY)).toBe('260');
    const other = key('a');
    split.onKeydown(other);
    expect(other.preventDefault).not.toHaveBeenCalled();
    split.reset();
    expect(split.size.value).toBe(340);
    expect(localStorage.getItem(KEY)).toBe('340');
  });

  it('keeps working when storage throws (private mode)', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const split = useResizableSplit(options);
    expect(split.size.value).toBe(340);
    split.onKeydown(key('ArrowRight'));
    expect(split.size.value).toBe(360);
    getItem.mockRestore();
    setItem.mockRestore();
  });
});
