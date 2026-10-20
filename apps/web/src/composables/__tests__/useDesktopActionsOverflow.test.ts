import { describe, it, expect } from 'vitest';
import { decideActionsCollapse } from '../useDesktopActionsOverflow';

// Real-world ballpark numbers: "Mesa 3" ≈ 70px, the actions group ≈ 200px
// (five h-8 buttons + gap), the "⋮" trigger ≈ 32px.
describe('decideActionsCollapse', () => {
  it('stays expanded when the title fits alongside the actions', () => {
    // 70px of text in a 90px slot while the actions are visible.
    expect(decideActionsCollapse(false, 70, 90, 0, 200, 32)).toBe(false);
  });

  it('collapses when the title would truncate with the actions visible', () => {
    // 180px of text in a 90px slot: the name loses to the buttons.
    expect(decideActionsCollapse(false, 180, 90, 0, 200, 32)).toBe(true);
  });

  it('stays collapsed while the leftover gap cannot fit the actions back', () => {
    // Collapsed, only 30px of slack between title and counter — the actions
    // group would need 168px more than the "⋮" trigger it replaces.
    expect(decideActionsCollapse(true, 0, 0, 30, 200, 32)).toBe(true);
  });

  it('expands back once the gap fits the actions difference', () => {
    // A widened window leaves 200px of slack: 168px needed → fits.
    expect(decideActionsCollapse(true, 0, 0, 200, 200, 32)).toBe(false);
  });

  it('does not flip-flop at the exact boundary (tolerance)', () => {
    // extraNeeded = 168; the threshold sits at freeSpace - 2. 169px stays
    // collapsed, 171px expands.
    expect(decideActionsCollapse(true, 0, 0, 169, 200, 32)).toBe(true);
    expect(decideActionsCollapse(true, 0, 0, 171, 200, 32)).toBe(false);
  });

  it('expands when the actions width is unknown, so the group can be measured', () => {
    // No cached width yet (never measured expanded): expanding lets the next
    // measurement capture the group width and decide with real numbers.
    expect(decideActionsCollapse(true, 0, 0, 4, 0, 32)).toBe(false);
  });

  it('keeps a collapsed card collapsed when the title still truncates', () => {
    // Abnormally long name: collapsing gave it everything there is to give
    // (no gap left), and it still overflows — nothing left to remove.
    expect(decideActionsCollapse(true, 400, 258, 0, 200, 32)).toBe(true);
  });
});
