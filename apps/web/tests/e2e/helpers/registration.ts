import { type Page } from '@playwright/test';

/**
 * Confirma el aviso "¿No necesitas playera?" cuando el registro se envía sin
 * ninguna talla elegida.
 *
 * El select de playeras trae "No necesita" preseleccionado, así que la app
 * pregunta una vez antes de registrar. En retiros sin playeras para servidores
 * el aviso no existe y esto no hace nada, por eso se espera con timeout corto
 * en vez de asumir que aparece.
 */
export async function confirmNoShirtIfNeeded(page: Page) {
	const noShirtButton = page.getByRole('button', { name: /No necesito playera, regístrame/i });
	const appeared = await noShirtButton
		.waitFor({ state: 'visible', timeout: 3000 })
		.then(() => true, () => false);
	if (appeared) await noShirtButton.click();
}
