/**
 * The fixed 850px flyer design has to fit the available width, and
 * `clientWidth` counts the element's own padding as usable — it isn't: the
 * design has to fit inside the padding box. Measure the computed padding out.
 *
 * Shared by the published flyer view and the editor's preview so the two
 * scales can't drift (the editor measured raw clientWidth, which quietly
 * overflowed by the width of its own padding).
 */
export function innerAvailableWidth(el: HTMLElement): number {
	const styles = window.getComputedStyle(el);
	const horizontalPadding =
		parseFloat(styles.paddingLeft || '0') + parseFloat(styles.paddingRight || '0');
	return el.clientWidth - horizontalPadding;
}
