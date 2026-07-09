import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useToast } from '@repo/ui';
import { api } from '@/services/api';
import { apiErrorMessage } from '@/services/apiError';

export const useInventoryStore = defineStore('inventory', () => {
	const categories = ref<any[]>([]);
	const teams = ref<any[]>([]);
	const items = ref<any[]>([]);
	const retreatInventory = ref<any[]>([]);
	const retreatInventoryByCategory = ref<Record<string, any[]>>({});
	const inventoryAlerts = ref<any[]>([]);
	const loading = ref(false);
	const error = ref<string | null>(null);
	const { toast } = useToast();

	// Categories
	async function fetchCategories() {
		loading.value = true;
		error.value = null;
		try {
			const response = await api.get('/inventory/categories');
			categories.value = response.data;
		} catch (e: any) {
			error.value = 'Failed to fetch inventory categories.';
			toast({ title: 'Error', description: error.value, variant: 'destructive' });
			console.error(e);
		} finally {
			loading.value = false;
		}
	}

	async function createCategory(data: { name: string; description?: string }) {
		try {
			const { data: newCategory } = await api.post('/inventory/categories', data);
			categories.value.push(newCategory);
			toast({ title: 'Success', description: 'Category created successfully.' });
		} catch (e: any) {
			toast({ title: 'Error', description: 'Failed to create category.', variant: 'destructive' });
			console.error(e);
		}
	}

	// Teams
	async function fetchTeams() {
		loading.value = true;
		error.value = null;
		try {
			const response = await api.get('/inventory/teams');
			teams.value = response.data;
		} catch (e: any) {
			error.value = 'Failed to fetch inventory teams.';
			toast({ title: 'Error', description: error.value, variant: 'destructive' });
			console.error(e);
		} finally {
			loading.value = false;
		}
	}

	async function createTeam(data: { name: string; description?: string }) {
		try {
			const { data: newTeam } = await api.post('/inventory/teams', data);
			teams.value.push(newTeam);
			toast({ title: 'Success', description: 'Team created successfully.' });
		} catch (e: any) {
			toast({ title: 'Error', description: 'Failed to create team.', variant: 'destructive' });
			console.error(e);
		}
	}

	// Items
	async function fetchItems() {
		loading.value = true;
		error.value = null;
		try {
			const response = await api.get('/inventory/items');
			items.value = response.data;
		} catch (e: any) {
			error.value = 'Failed to fetch inventory items.';
			toast({ title: 'Error', description: error.value, variant: 'destructive' });
			console.error(e);
		} finally {
			loading.value = false;
		}
	}

	async function createItem(data: {
		name: string;
		description?: string;
		categoryId: string;
		teamId: string;
		ratio: number;
		unit: string;
	}) {
		try {
			const { data: newItem } = await api.post('/inventory/items', data);
			items.value.push(newItem);
			toast({ title: 'Success', description: 'Item created successfully.' });
		} catch (e: any) {
			toast({ title: 'Error', description: 'Failed to create item.', variant: 'destructive' });
			console.error(e);
		}
	}

	async function updateItem(
		itemId: string,
		data: Partial<{
			name: string;
			description?: string;
			categoryId: string;
			teamId: string;
			ratio: number;
			unit: string;
			isActive: boolean;
		}>,
	) {
		try {
			const { data: updatedItem } = await api.put(`/inventory/items/${itemId}`, data);
			const index = items.value.findIndex((i) => i.id === itemId);
			if (index !== -1) {
				items.value[index] = updatedItem;
			}
			toast({ title: 'Success', description: 'Item updated successfully.' });
		} catch (e: any) {
			toast({ title: 'Error', description: 'Failed to update item.', variant: 'destructive' });
			console.error(e);
		}
	}

	// Retreat Inventory
	async function fetchRetreatInventory(retreatId: string) {
		loading.value = true;
		error.value = null;
		try {
			const response = await api.get(`/inventory/retreat/${retreatId}`);
			retreatInventory.value = response.data;
		} catch (e: any) {
			error.value = 'Failed to fetch retreat inventory.';
			toast({ title: 'Error', description: error.value, variant: 'destructive' });
			console.error(e);
		} finally {
			loading.value = false;
		}
	}

	async function fetchRetreatInventoryByCategory(retreatId: string) {
		loading.value = true;
		error.value = null;
		try {
			const response = await api.get(`/inventory/retreat/${retreatId}/by-category`);
			retreatInventoryByCategory.value = response.data;
		} catch (e: any) {
			error.value = 'Failed to fetch retreat inventory by category.';
			toast({ title: 'Error', description: error.value, variant: 'destructive' });
			console.error(e);
		} finally {
			loading.value = false;
		}
	}

	async function updateRetreatInventory(
		retreatId: string,
		itemId: string,
		data: {
			currentQuantity?: number;
			notes?: string;
			boxLabel?: string | null;
			status?: 'pending' | 'packed' | 'onsite' | 'consumed' | 'returned';
			ratioOverride?: number | null;
			requiredQtyOverride?: number | null;
			isExcluded?: boolean;
		},
	) {
		try {
			const { data: updatedInventory } = await api.put(
				`/inventory/retreat/${retreatId}/${itemId}`,
				data,
			);

			// Update in arrays
			const index = retreatInventory.value.findIndex((i) => i.inventoryItemId === itemId);
			if (index !== -1) {
				retreatInventory.value[index] = updatedInventory;
			}

			// Update in category view
			for (const category in retreatInventoryByCategory.value) {
				const categoryIndex = retreatInventoryByCategory.value[category].findIndex(
					(i) => i.inventoryItemId === itemId,
				);
				if (categoryIndex !== -1) {
					retreatInventoryByCategory.value[category][categoryIndex] = updatedInventory;
				}
			}

			// Auto-save silencioso (sin toast). El error sí se muestra.
		} catch (e: any) {
			toast({
				title: 'Error',
				description:
					apiErrorMessage(e, 'No se pudo guardar el cambio en inventario.'),
				variant: 'destructive',
			});
			console.error(e);
			throw e;
		}
	}

	async function removeItemFromRetreat(retreatId: string, itemId: string) {
		try {
			await api.delete(`/inventory/retreat/${retreatId}/items/${itemId}`);
		} catch (e: any) {
			if (e?.response?.status === 404) {
				await api.delete(`/inventory/retreat/${retreatId}/${itemId}`);
			} else {
				throw e;
			}
		}
		await fetchRetreatInventoryByCategory(retreatId);
	}

	async function bulkRemoveItemsFromRetreat(retreatId: string, itemIds: string[]) {
		// Intenta el endpoint bulk primero. Si falla (404 cuando el server
		// no tiene la ruta registrada, o conflicto con `:itemId`), cae a
		// DELETE individuales en paralelo.
		try {
			const { data } = await api.post(
				`/inventory/retreat/${retreatId}/items/bulk-delete`,
				{ itemIds },
			);
			await fetchRetreatInventoryByCategory(retreatId);
			return data as { removed: number };
		} catch (e: any) {
			if (e?.response?.status === 404) {
				let removed = 0;
				for (const id of itemIds) {
					try {
						await api.delete(`/inventory/retreat/${retreatId}/items/${id}`);
						removed++;
					} catch {
						// fallback al endpoint sin "items/" por si tampoco existe
						try {
							await api.delete(`/inventory/retreat/${retreatId}/${id}`);
							removed++;
						} catch {
							/* ignore */
						}
					}
				}
				await fetchRetreatInventoryByCategory(retreatId);
				return { removed };
			}
			throw e;
		}
	}

	async function addItemToRetreat(
		retreatId: string,
		itemId: string,
		overrides?: { ratioOverride?: number | null; requiredQtyOverride?: number | null },
	) {
		let data: any;
		const body = overrides && (overrides.ratioOverride != null || overrides.requiredQtyOverride != null)
			? overrides
			: undefined;
		try {
			const r = await api.post(`/inventory/retreat/${retreatId}/items/${itemId}`, body);
			data = r.data;
		} catch (e: any) {
			if (e?.response?.status === 404) {
				const r = await api.post(`/inventory/retreat/${retreatId}/${itemId}`, body);
				data = r.data;
			} else {
				throw e;
			}
		}
		await fetchRetreatInventoryByCategory(retreatId);
		return data;
	}

	async function addCustomItemToRetreat(
		retreatId: string,
		payload: {
			customName: string;
			customUnit?: string;
			customCategoryId?: string | null;
			requiredQuantity?: number;
			notes?: string;
			ratioOverride?: number | null;
			requiredQtyOverride?: number | null;
		},
	) {
		const { data } = await api.post(`/inventory/retreat/${retreatId}/custom-item`, payload);
		await fetchRetreatInventoryByCategory(retreatId);
		return data;
	}

	async function syncShirtItems(retreatId: string) {
		const { data } = await api.post(`/inventory/retreat/${retreatId}/sync-shirts`);
		await fetchRetreatInventoryByCategory(retreatId);
		return data as { created: number; updated: number; removed: number; skipped: number };
	}

	async function syncFromCatalog(retreatId: string) {
		const { data } = await api.post(`/inventory/retreat/${retreatId}/sync-catalog`);
		await fetchRetreatInventoryByCategory(retreatId);
		return data as { added: number };
	}

	async function fetchAvailableItemsForRetreat(retreatId: string) {
		const { data } = await api.get(`/inventory/retreat/${retreatId}/available`);
		return data as Array<{
			id: string;
			name: string;
			description: string;
			categoryName: string;
			teamName: string;
			unit: string;
			ratio: number;
		}>;
	}

	async function updateInventoryItem(
		itemId: string,
		patch: {
			name?: string;
			description?: string;
			ratio?: number;
			requiredQuantity?: number | null;
			unit?: string;
			categoryId?: string;
			teamId?: string;
		},
		retreatId?: string,
	) {
		const { data } = await api.put(`/inventory/items/${itemId}`, patch);
		if (retreatId) await fetchRetreatInventoryByCategory(retreatId);
		return data;
	}

	async function bulkUpdateRetreatInventory(
		retreatId: string,
		itemIds: string[],
		patch: {
			boxLabel?: string | null;
			status?: 'pending' | 'packed' | 'onsite' | 'consumed' | 'returned';
			notes?: string;
		},
	) {
		const { data } = await api.patch(`/inventory/retreat/${retreatId}/bulk`, {
			itemIds,
			...patch,
		});
		await fetchRetreatInventoryByCategory(retreatId);
		return data as { updated: number; notFound: number };
	}

	async function fetchInventoryHistory(retreatId: string, params: { itemId?: string; limit?: number } = {}) {
		const { data } = await api.get(`/inventory/retreat/${retreatId}/history`, { params });
		return data as Array<{
			id: string;
			inventoryItemId: string;
			itemName: string;
			field: string;
			oldValue: string | null;
			newValue: string | null;
			userId: string | null;
			createdAt: string;
		}>;
	}

	async function calculateRequiredQuantities(
		retreatId: string,
		calcBase: 'actual' | 'expected' = 'actual',
	) {
		try {
			const { data: updatedInventories } = await api.post(
				`/inventory/retreat/${retreatId}/calculate`,
				{ calcBase },
			);
			retreatInventory.value = updatedInventories;

			// Refresh category view
			await fetchRetreatInventoryByCategory(retreatId);

			const baseLabel = calcBase === 'expected' ? 'caminantes esperados' : 'caminantes inscritos';
			toast({ title: 'Cantidades recalculadas', description: `Base: ${baseLabel}.` });
		} catch (e: any) {
			toast({
				title: 'Error',
				description: apiErrorMessage(e, 'No se pudo recalcular.'),
				variant: 'destructive',
			});
			console.error(e);
		}
	}

	// Alerts
	async function fetchInventoryAlerts(retreatId: string) {
		loading.value = true;
		error.value = null;
		try {
			const response = await api.get(`/inventory/retreat/${retreatId}/alerts`);
			inventoryAlerts.value = response.data;
		} catch (e: any) {
			if (e.response?.status === 403) {
				console.log('Insufficient permissions to fetch inventory alerts');
				inventoryAlerts.value = [];
				return;
			}
			error.value = 'Failed to fetch inventory alerts.';
			toast({ title: 'Error', description: error.value, variant: 'destructive' });
			console.error(e);
		} finally {
			loading.value = false;
		}
	}

	// Import/Export
	async function exportInventory(retreatId: string) {
		try {
			const response = await api.get(`/inventory/retreat/${retreatId}/export`);
			return response.data;
		} catch (e: any) {
			toast({ title: 'Error', description: 'Failed to export inventory.', variant: 'destructive' });
			console.error(e);
			throw e;
		}
	}

	async function importInventory(retreatId: string, data: any[]) {
		try {
			const response = await api.post(`/inventory/retreat/${retreatId}/import`, { data });

			// Refresh inventory data
			await fetchRetreatInventory(retreatId);
			await fetchRetreatInventoryByCategory(retreatId);
			await fetchInventoryAlerts(retreatId);

			toast({
				title: 'Import Complete',
				description: `Successfully imported ${response.data.success.length} items. ${response.data.errors.length} errors occurred.`,
				variant: response.data.errors.length > 0 ? 'destructive' : 'default',
			});

			return response.data;
		} catch (e: any) {
			toast({ title: 'Error', description: 'Failed to import inventory.', variant: 'destructive' });
			console.error(e);
			throw e;
		}
	}

	// Initialize data
	async function initializeInventoryData() {
		await Promise.all([fetchCategories(), fetchTeams(), fetchItems()]);
	}

	function $reset() {
		categories.value = [];
		teams.value = [];
		items.value = [];
		retreatInventory.value = [];
		retreatInventoryByCategory.value = {};
		inventoryAlerts.value = [];
		loading.value = false;
		error.value = null;
	}

	return {
		// State
		categories,
		teams,
		items,
		retreatInventory,
		retreatInventoryByCategory,
		inventoryAlerts,
		loading,
		error,

		// Categories
		fetchCategories,
		createCategory,

		// Teams
		fetchTeams,
		createTeam,

		// Items
		fetchItems,
		createItem,
		updateItem,

		// Retreat Inventory
		fetchRetreatInventory,
		fetchRetreatInventoryByCategory,
		updateRetreatInventory,
		bulkUpdateRetreatInventory,
		fetchInventoryHistory,
		removeItemFromRetreat,
		bulkRemoveItemsFromRetreat,
		addItemToRetreat,
		addCustomItemToRetreat,
		syncShirtItems,
		syncFromCatalog,
		fetchAvailableItemsForRetreat,
		updateInventoryItem,
		calculateRequiredQuantities,

		// Alerts
		fetchInventoryAlerts,

		// Import/Export
		exportInventory,
		importInventory,

		// Initialize
		initializeInventoryData,

		// Reset
		$reset,
	};
});
