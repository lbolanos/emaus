import { watch, onUnmounted, type Ref, type ComputedRef } from 'vue';

const FOCUSABLE = [
	'a[href]',
	'button:not([disabled])',
	'input:not([disabled]):not([type="hidden"])',
	'select:not([disabled])',
	'textarea:not([disabled])',
	'[tabindex]:not([tabindex="-1"])',
].join(', ');

// Pila de modales abiertos: con dos superpuestos (editor + reprogramar paso),
// Escape debe cerrar sólo el de arriba — el que se abrió último.
const CLOSE_STACK: Array<() => void> = [];

/**
 * Accesibilidad para los modales hechos a mano de la vista (overlay `fixed
 * inset-0` con `@click.self`): Escape cierra, Tab queda atrapado dentro del
 * diálogo, el foco entra al contenedor al abrir y vuelve al elemento que lo
 * abrió al cerrar. El contenedor del diálogo debe llevar `tabindex="-1"` y
 * `role="dialog"` para poder recibir el foco.
 */
export function useModalA11y(
	isOpen: Ref<boolean> | ComputedRef<boolean>,
	onClose: () => void,
	root?: Ref<HTMLElement | null>,
): void {
	let previouslyFocused: HTMLElement | null = null;
	let closer: () => void = () => {};

	function onKeydown(e: KeyboardEvent): void {
		if (e.key === 'Escape') {
			// Sólo cierra el modal de arriba de la pila.
			if (CLOSE_STACK[CLOSE_STACK.length - 1] !== closer) return;
			e.preventDefault();
			onClose();
			return;
		}
		if (e.key !== 'Tab' || !root?.value) return;
		const items = Array.from(root.value.querySelectorAll<HTMLElement>(FOCUSABLE));
		if (!items.length) return;
		const first = items[0];
		const last = items[items.length - 1];
		const active = document.activeElement as HTMLElement | null;
		if (!e.shiftKey && (active === last || !root.value.contains(active))) {
			e.preventDefault();
			first.focus();
		} else if (e.shiftKey && (active === first || !root.value.contains(active))) {
			e.preventDefault();
			last.focus();
		}
	}

	watch(
		isOpen,
		(open) => {
			if (open) {
				previouslyFocused = (document.activeElement as HTMLElement) || null;
				closer = () => onClose();
				CLOSE_STACK.push(closer);
				document.addEventListener('keydown', onKeydown, true);
				// rAF: el diálogo es v-if — esperar un frame a que esté en el DOM.
				requestAnimationFrame(() => root?.value?.focus());
			} else {
				const i = CLOSE_STACK.indexOf(closer);
				if (i !== -1) CLOSE_STACK.splice(i, 1);
				document.removeEventListener('keydown', onKeydown, true);
				previouslyFocused?.focus?.();
				previouslyFocused = null;
			}
		},
		{ immediate: true },
	);

	onUnmounted(() => {
		const i = CLOSE_STACK.indexOf(closer);
		if (i !== -1) CLOSE_STACK.splice(i, 1);
		document.removeEventListener('keydown', onKeydown, true);
	});
}
