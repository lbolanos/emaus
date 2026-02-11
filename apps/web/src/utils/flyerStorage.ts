/**
 * Utility for managing flyer style preference using localStorage
 */

const FLYER_STYLE_KEY = 'emaus_flyer_style';
const VALID_STYLES = ['default', 'poster', 'whatsapp'] as const;
export type FlyerStyle = (typeof VALID_STYLES)[number];

/**
 * Gets the saved flyer style from localStorage
 * @returns The saved flyer style, or 'default' if none saved or invalid
 */
export function getSavedFlyerStyle(): FlyerStyle {
	if (typeof window === 'undefined') return 'default';
	const saved = localStorage.getItem(FLYER_STYLE_KEY);
	return VALID_STYLES.includes(saved as FlyerStyle) ? (saved as FlyerStyle) : 'default';
}

/**
 * Saves the flyer style preference to localStorage
 * @param style The flyer style to save
 */
export function saveFlyerStyle(style: FlyerStyle): void {
	if (typeof window === 'undefined') return;
	localStorage.setItem(FLYER_STYLE_KEY, style);
}
