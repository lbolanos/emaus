import { onMounted, onUnmounted } from 'vue';

/**
 * Mitiga el bug recurrente de reka-ui (port de Radix): cuando un
 * DropdownMenu cierra y un Dialog/AlertDialog/Sheet/Drawer abre en el
 * mismo tick, Radix deja `pointer-events: none` en <body> y la UI queda
 * inutilizable. También limpia overflow/scroll-lock huérfanos al cerrar
 * dialogs.
 *
 * Reglas obligatorias (documentadas en `.ruler/skills/troubleshooting/SKILL.md`):
 *  - Regla 1: `<DropdownMenuItem @select="deferOpen(abrirDialog)">` — nunca `@click="abrirDialog"`.
 *  - Regla 2: `restoreBodyOverflow()` debe limpiar `body.style.pointerEvents`.
 *  - Regla 3: `confirmX()` cierra el Dialog antes del `await` pesado.
 *
 * Por defecto registra un polling cada 500ms para auto-reparar estado
 * huérfano. Pasar `{ poll: false }` para desactivar (e.g. en tests).
 */
export function useRekaDialogFix(options: { poll?: boolean } = {}) {
	const poll = options.poll !== false;

	/**
	 * Garantiza que `body` no quede con `pointer-events:none`, `overflow:hidden`
	 * ni `data-scroll-locked` huérfanos tras cerrar Dialogs/Menús de reka-ui.
	 * Es no-op si hay un dialog/menú legítimamente abierto.
	 */
	function restoreBodyOverflow() {
		if (document.querySelectorAll('[role="dialog"][data-state="open"]').length > 0) return;
		if (document.querySelectorAll('[role="menu"][data-state="open"]').length > 0) return;
		if (document.body.style.overflow === 'hidden') document.body.style.overflow = '';
		if (document.body.style.paddingRight) document.body.style.paddingRight = '';
		if (document.body.style.pointerEvents === 'none') document.body.style.pointerEvents = '';
		document.body.removeAttribute('data-scroll-locked');
	}

	/**
	 * Abre un Dialog tras dejar que el DropdownMenu se cierre limpiamente.
	 * Usar en `@select="deferOpen(abrirDialog)"`.
	 */
	function deferOpen(fn: () => void) {
		setTimeout(() => {
			fn();
			setTimeout(restoreBodyOverflow, 50);
		}, 80);
	}

	if (poll) {
		let interval: ReturnType<typeof setInterval> | null = null;
		onMounted(() => {
			interval = setInterval(restoreBodyOverflow, 500);
		});
		onUnmounted(() => {
			if (interval) clearInterval(interval);
			// Por si el componente se desmonta con scroll-lock activo.
			document.body.style.overflow = '';
			document.body.style.paddingRight = '';
			document.body.style.pointerEvents = '';
			document.body.removeAttribute('data-scroll-locked');
		});
	}

	return { deferOpen, restoreBodyOverflow };
}
