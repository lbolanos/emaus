import { type Page } from '@playwright/test';

/**
 * Confirms the "¿No necesitas playera?" notice when the registration is
 * submitted without a single size chosen.
 *
 * The shirt select ships with "No necesita" preselected, so the app asks once
 * before registering. On retreats with no shirts for servers the notice does
 * not exist and this does nothing, which is why it waits with a short timeout
 * instead of assuming it appears.
 */
export async function confirmNoShirtIfNeeded(page: Page) {
	const noShirtButton = page.getByRole('button', { name: /No necesito playera, regístrame/i });
	const appeared = await noShirtButton
		.waitFor({ state: 'visible', timeout: 3000 })
		.then(() => true, () => false);
	if (appeared) await noShirtButton.click();
}
