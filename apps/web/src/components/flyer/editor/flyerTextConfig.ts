/**
 * What a flyer flavour's Texts tab needs: which override keys exist, which ones
 * edit long copy, and where each one's fallback text lives. The retreat panel
 * defaults to its own config (see FlyerTextPanel.vue); the meeting editor passes
 * one built from its schema.
 */
export interface FlyerTextPanelConfig {
	/** Override keys in the order they appear on the flyer. */
	keys: readonly string[];
	/** Keys that get a textarea instead of a single-line input. */
	multilineKeys: readonly string[];
	/** Maps each override key to the i18n key under `defaultPrefix` used as placeholder. */
	defaultKeys: Record<string, string>;
	/** Where the fallback texts live (retreatFlyer, meetingFlyer). */
	defaultPrefix: string;
}
