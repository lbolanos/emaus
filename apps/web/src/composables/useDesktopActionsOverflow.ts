import { ref, type Ref } from 'vue';
import { useEventListener, useResizeObserver } from '@vueuse/core';

const TOLERANCE = 2;

/**
 * Pure decision for the desktop actions overflow (unit-testable without layout).
 *
 * Expanded, the only reason to collapse is the title actually truncating.
 * Collapsed, the actions come back only if the real gap left between the
 * title block and the right block fits the extra width the actions group
 * would add over the "⋮" trigger. Both thresholds carry a small tolerance so
 * a title sitting exactly at the boundary doesn't flip-flop.
 *
 * @param currentlyCollapsed Whether the actions are currently in the "⋮" menu.
 * @param titleNatural       Natural (untruncated) width of the title text, px.
 * @param titleAvailable     Width the title can use in its CURRENT state, px.
 * @param freeSpace          Gap between title block and right block, px
 *                           (only meaningful while collapsed).
 * @param actionsWidth       Width of the desktop actions group, px (0 if unknown).
 * @param moreWidth          Width of the "⋮" trigger that replaces it, px.
 * @returns Whether the actions SHOULD be collapsed into the menu now.
 */
export function decideActionsCollapse(
  currentlyCollapsed: boolean,
  titleNatural: number,
  titleAvailable: number,
  freeSpace: number,
  actionsWidth: number,
  moreWidth: number,
): boolean {
  if (!currentlyCollapsed) {
    return titleNatural > titleAvailable + TOLERANCE;
  }
  const extraNeeded = Math.max(0, actionsWidth - moreWidth);
  return extraNeeded > freeSpace - TOLERANCE;
}

/**
 * On desktop the table name always wins: if the direct action buttons would
 * truncate it, they collapse into the "⋮" menu (the same one mobile uses) and
 * come back when there is room again. Below `breakpointPx` this stays out of
 * the way — mobile already renders the menu unconditionally.
 *
 * The re-expansion check measures the REAL gap between the title block and
 * the right block: with `justify-between` the title span does not grow when
 * we collapse, so the span's own width can't tell us whether the actions fit
 * back in — the leftover gap can.
 */
export function useDesktopActionsOverflow(
  titleTextRef: Ref<HTMLElement | null>,
  actionsRef: Ref<HTMLElement | null>,
  moreWrapRef: Ref<HTMLElement | null>,
  headerRef: Ref<{ $el?: HTMLElement } | null>,
  breakpointPx = 640,
) {
  const overflowing = ref(false);
  // Cached width of the desktop actions group: it can't be measured while
  // collapsed (display:none reports 0), so we keep the last known value.
  let cachedActionsWidth = 0;
  let desktopMedia: MediaQueryList | null = null;
  // Re-measure cap after a state change, so a pathological boundary can't
  // oscillate forever (each layout change triggers one re-check).
  let rechecks = 0;

  const measure = () => {
    const title = titleTextRef.value;
    if (!title) return;
    desktopMedia ??= window.matchMedia(`(min-width: ${breakpointPx}px)`);
    if (!desktopMedia.matches) {
      overflowing.value = false;
      return;
    }
    // title span → CardTitle root (span + pencil) → right block (counter +
    // actions/⋮). With `truncate`, scrollWidth is the natural text width.
    const titleBlock = title.parentElement;
    const rightBlock = titleBlock?.nextElementSibling;
    if (!titleBlock || !rightBlock) return;

    if (actionsRef.value && actionsRef.value.offsetWidth > 0) {
      cachedActionsWidth = actionsRef.value.offsetWidth;
    }
    const freeSpace = rightBlock.getBoundingClientRect().left - titleBlock.getBoundingClientRect().right;
    const was = overflowing.value;
    overflowing.value = decideActionsCollapse(
      overflowing.value,
      title.scrollWidth,
      title.clientWidth,
      freeSpace,
      cachedActionsWidth,
      moreWrapRef.value?.offsetWidth || 32,
    );
    // The new layout may invalidate the measurements we just used (collapsing
    // widens the gap, expanding shrinks it) — verify once more, bounded.
    if (overflowing.value !== was && rechecks < 4) {
      rechecks += 1;
      requestAnimationFrame(measure);
    } else {
      rechecks = 0;
    }
  };

  // The span catches layout/text changes (its width follows truncation); the
  // window resize covers grid re-flows where the span width doesn't move.
  useResizeObserver(titleTextRef, measure);
  useEventListener(window, 'resize', measure);
  // The header mounts later than the composable setup runs.
  useResizeObserver(() => headerRef.value?.$el ?? null, measure);

  return { overflowing, measure };
}
