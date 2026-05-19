import { computed, ref, watch, type Ref } from 'vue';

/**
 * Marcas "ya contacté a este miembro" persistidas SOLO en localStorage por
 * comunidad. No se sincronizan al backend ni entre dispositivos — son notas
 * efímeras del coordinador para no perder el track durante una sesión de
 * follow-up (e.g., "ya hablé con estos 12 de los 60, ahora voy por los demás").
 *
 * El coordinador puede borrar todas las marcas de su comunidad con `clear()`
 * para empezar de nuevo (ronda nueva de contactos).
 *
 * Formato en localStorage:
 *   key: `community-contacted-${communityId}`
 *   value: JSON object `{ [memberId]: ISO timestamp }`
 *
 * Por qué NO en `participant_communications`:
 *   - El user pidió explícitamente "que pueda borrar para iniciar nuevamente".
 *   - No queremos contaminar el historial real con "marqué pero no envié nada".
 *   - Es perspectiva del coordinador, no del miembro.
 */
export function useContactedMarks(communityId: Ref<string>) {
	const marks = ref<Record<string, string>>({});

	const storageKey = computed(() => `community-contacted-${communityId.value}`);

	const load = () => {
		try {
			const raw = localStorage.getItem(storageKey.value);
			marks.value = raw ? JSON.parse(raw) : {};
		} catch {
			// localStorage corrupto o JSON inválido — reset silencioso.
			marks.value = {};
		}
	};

	const save = () => {
		try {
			localStorage.setItem(storageKey.value, JSON.stringify(marks.value));
		} catch {
			// QuotaExceeded u otro fallo de localStorage — el toggle no persiste
			// pero al menos no rompe la UI. Silencioso a propósito: el coordinador
			// no debe verse interrumpido por un error de storage.
		}
	};

	const isMarked = (memberId: string): boolean => !!marks.value[memberId];

	const getMarkedAt = (memberId: string): string | undefined => marks.value[memberId];

	const toggle = (memberId: string) => {
		if (marks.value[memberId]) {
			const next = { ...marks.value };
			delete next[memberId];
			marks.value = next;
		} else {
			marks.value = { ...marks.value, [memberId]: new Date().toISOString() };
		}
		save();
	};

	/** Marca explícitamente (idempotente). Útil cuando se quiere setear sin importar el estado previo. */
	const mark = (memberId: string) => {
		if (!marks.value[memberId]) {
			marks.value = { ...marks.value, [memberId]: new Date().toISOString() };
			save();
		}
	};

	/** Desmarca explícitamente (idempotente). */
	const unmark = (memberId: string) => {
		if (marks.value[memberId]) {
			const next = { ...marks.value };
			delete next[memberId];
			marks.value = next;
			save();
		}
	};

	/** Borra TODAS las marcas de esta comunidad — empezar nueva ronda. */
	const clear = () => {
		marks.value = {};
		try {
			localStorage.removeItem(storageKey.value);
		} catch {
			// no-op
		}
	};

	const count = computed(() => Object.keys(marks.value).length);

	// Reload cuando la comunidad cambia (e.g., el coordinador navega entre
	// comunidades sin desmontar el composable).
	watch(
		() => communityId.value,
		() => load(),
		{ immediate: true },
	);

	return {
		marks,
		isMarked,
		getMarkedAt,
		toggle,
		mark,
		unmark,
		clear,
		count,
	};
}
