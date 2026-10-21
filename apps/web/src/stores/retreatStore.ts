import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import { useToast } from '@repo/ui';
import type { Retreat, CreateRetreat, RetreatCloneResult, RetreatCloneSections } from '@repo/types';
import { api } from '@/services/api';
import { cloneRetreatSections } from '@/services/api';
import { apiErrorMessage } from '@/services/apiError';

/** Texto del toast tras copiar secciones: "11 mesas, 49 responsabilidades…". */
function cloneSummaryText(result: RetreatCloneResult): string {
	const labels: Record<string, [string, number]> = {
		tables: ['mesas', result.sections.tables],
		responsibilities: ['responsabilidades', result.sections.responsibilities],
		serviceTeams: ['equipos', result.sections.serviceTeams],
		shirtTypes: ['tallas', result.sections.shirtTypes],
		inventory: ['inventario', result.sections.inventory],
		messageTemplates: ['plantillas', result.sections.messageTemplates],
		messageSequences: ['secuencias', result.sections.messageSequences],
		schedule: ['minuto a minuto', result.sections.schedule],
		preRetreatTasks: ['tareas pre-retiro', result.sections.preRetreatTasks],
	};
	const parts = Object.values(labels)
		.filter(([, n]) => n > 0)
		.map(([label, n]) => `${n} ${label}`);
	return parts.length ? `Copiado: ${parts.join(', ')}.` : 'No había nada que copiar de esas secciones.';
}

const STORAGE_KEY = 'selectedRetreatId';

export const useRetreatStore = defineStore('retreat', () => {
	const retreats = ref<Retreat[]>([]);
	const selectedRetreatId = ref<string | null>(loadFromStorage());
	const loading = ref(false);
	const { toast } = useToast();

	function loadFromStorage(): string | null {
		try {
			return localStorage.getItem(STORAGE_KEY);
		} catch {
			return null;
		}
	}

	function saveToStorage(id: string | null) {
		try {
			if (id) {
				localStorage.setItem(STORAGE_KEY, id);
			} else {
				localStorage.removeItem(STORAGE_KEY);
			}
		} catch {
			// Silently fail if localStorage is not available
		}
	}

	// Watch for changes to selectedRetreatId and persist to localStorage
	watch(selectedRetreatId, (newId) => {
		saveToStorage(newId);
	});

	const mostRecentRetreat = computed(() => {
		if (retreats.value.length > 0) {
			return retreats.value[0]; // Assumes retreats are sorted by date descending
		}
		return null;
	});

	const selectedRetreat = computed(() => {
		// New computed property
		if (selectedRetreatId.value) {
			return retreats.value.find((retreat) => retreat.id === selectedRetreatId.value) || null;
		}
		return null;
	});

	const walkerRegistrationLink = computed(() => {
		// When the parish runs walker registration on its own site, that URL is
		// the single source of truth: it feeds the dashboard link, the flyer QR
		// and the message templates, so none of them can drift to the built-in
		// form and split registrations across two systems.
		const external = selectedRetreat.value?.externalRegistrationUrl;
		if (external) {
			return external;
		}
		if (selectedRetreat.value?.slug) {
			return `${window.location.origin}/${selectedRetreat.value.slug}`;
		}
		if (selectedRetreatId.value) {
			return `${window.location.origin}/register/walker/${selectedRetreatId.value}`;
		}
		return '';
	});

	// Servers always register through emaus.cc, even when walkers do not: the
	// parish only collects walkers.
	const serverRegistrationLink = computed(() => {
		if (selectedRetreat.value?.slug) {
			return `${window.location.origin}/${selectedRetreat.value.slug}/server`;
		}
		if (selectedRetreatId.value) {
			return `${window.location.origin}/register/server/${selectedRetreatId.value}`;
		}
		return '';
	});

	function selectRetreat(retreatId: string) {
		selectedRetreatId.value = retreatId;
	}

	async function fetchRetreats() {
		loading.value = true;
		try {
			const response = await api.get('/retreats');
			retreats.value = response.data;
			const storedIsValid =
				selectedRetreatId.value &&
				retreats.value.some((r) => r.id === selectedRetreatId.value);
			if (!storedIsValid && mostRecentRetreat.value) {
				selectRetreat(mostRecentRetreat.value.id);
			}
		} catch (err: any) {
			toast({
				title: 'Error',
				description: apiErrorMessage(err, 'Failed to fetch retreats.'),
				variant: 'destructive',
			});
		} finally {
			loading.value = false;
		}
	}

	async function fetchRetreat(id: string) {
		loading.value = true;
		try {
			const response = await api.get(`/retreats/${id}`);
			const index = retreats.value.findIndex((r) => r.id === id);
			if (index !== -1) {
				retreats.value[index] = response.data;
			} else {
				retreats.value.push(response.data);
			}
			selectRetreat(response.data.id);
		} catch (err: any) {
			toast({
				title: 'Error',
				description: apiErrorMessage(err, 'Failed to fetch retreat.'),
				variant: 'destructive',
			});
		} finally {
			loading.value = false;
		}
	}

	/**
	 * Crea un retiro y, opcionalmente, copia secciones de un retiro anterior
	 * (ver `cloneRetreatSections` en services/api). Retorna el retreat creado:
	 * RetreatModal encadena el auto-materialize y el diálogo de éxito.
	 * Si la copia falla, el retiro YA existe — se avisa y no se relanza.
	 */
	async function createRetreat(
		retreatData: CreateRetreat,
		opts?: { cloneFrom?: { sourceRetreatId: string; sections: RetreatCloneSections } },
	): Promise<Retreat> {
		let created: Retreat;
		loading.value = true;
		try {
			const response = await api.post('/retreats', retreatData);
			created = response.data;
			retreats.value.unshift(created); // Add to the beginning of the list
			selectRetreat(created.id);
			toast({
				title: 'Success',
				description: 'Retreat created successfully.',
			});
		} catch (err: any) {
			toast({
				title: 'Error',
				description: apiErrorMessage(err, 'Failed to create retreat.'),
				variant: 'destructive',
			});
			throw err;
		} finally {
			loading.value = false;
		}

		const cloneFrom = opts?.cloneFrom;
		if (cloneFrom && Object.values(cloneFrom.sections).some(Boolean)) {
			try {
				const result = await cloneRetreatSections(created.id, cloneFrom.sourceRetreatId, cloneFrom.sections);
				toast({
					title: 'Success',
					description: cloneSummaryText(result),
				});
			} catch (err: any) {
				toast({
					title: 'Warning',
					description: apiErrorMessage(err, 'Retreat created, but the section copy failed.'),
					variant: 'destructive',
				});
			}
		}
		return created;
	}

	// Add updateRetreat action for EditRetreatModal
	async function updateRetreat(retreatData: Partial<Retreat> & { id: string }, refreshBeds?: boolean) {
		loading.value = true;
		try {
			const url = refreshBeds
				? `/retreats/${retreatData.id}?refreshBeds=true`
				: `/retreats/${retreatData.id}`;
			const response = await api.put(url, retreatData);

			// Debug logging
			//console.log('RetreatStore - API response:', response.data);
			//console.log('RetreatStore - Response isPublic:', response.data.isPublic);

			const index = retreats.value.findIndex((r) => r.id === retreatData.id);
			if (index !== -1) {
				retreats.value[index] = response.data;
			}
			toast({
				title: 'Success',
				description: 'Retreat updated successfully.',
			});
		} catch (err: any) {
			//console.error('RetreatStore - Update failed:', err);
			toast({
				title: 'Error',
				description: apiErrorMessage(err, 'Failed to update retreat.'),
				variant: 'destructive',
			});
			throw err;
		} finally {
			loading.value = false;
		}
	}

	// Delete a retreat (superadmin: cualquiera; admin: solo propios y sin participantes).
	// El backend valida la autorización y responde 403/409 si no procede.
	async function deleteRetreat(retreatId: string) {
		loading.value = true;
		try {
			await api.delete(`/retreats/${retreatId}`);
			retreats.value = retreats.value.filter((r) => r.id !== retreatId);
			// Si borramos el retiro seleccionado, pasar al más reciente (o ninguno).
			if (selectedRetreatId.value === retreatId) {
				selectedRetreatId.value = mostRecentRetreat.value?.id ?? null;
			}
			toast({
				title: 'Éxito',
				description: 'Retiro eliminado correctamente.',
			});
		} catch (err: any) {
			toast({
				title: 'Error',
				description: apiErrorMessage(err, 'No se pudo eliminar el retiro.'),
				variant: 'destructive',
			});
			throw err;
		} finally {
			loading.value = false;
		}
	}

	return {
		retreats,
		selectedRetreatId,
		loading,
		mostRecentRetreat,
		selectedRetreat, // Export new computed property
		selectRetreat,
		fetchRetreats,
		fetchRetreat,
		createRetreat,
		updateRetreat, // Export new action
		deleteRetreat, // Export delete action
		walkerRegistrationLink,
		serverRegistrationLink,
	};
});
