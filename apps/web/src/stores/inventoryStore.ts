import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useToast } from '@repo/ui/components/ui/toast/use-toast';
import { api } from '@/services/api';

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

			toast({ title: 'Success', description: 'Inventory updated successfully.' });
		} catch (e: any) {
			toast({ title: 'Error', description: 'Failed to update inventory.', variant: 'destructive' });
			console.error(e);
		}
	}

	async function calculateRequiredQuantities(retreatId: string) {
		try {
			const { data: updatedInventories } = await api.post(
				`/inventory/retreat/${retreatId}/calculate`,
			);
			retreatInventory.value = updatedInventories;

			// Refresh category view
			await fetchRetreatInventoryByCategory(retreatId);

			toast({ title: 'Success', description: 'Required quantities calculated successfully.' });
		} catch (e: any) {
			toast({
				title: 'Error',
				description: 'Failed to calculate required quantities.',
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
		calculateRequiredQuantities,

		// Alerts
		fetchInventoryAlerts,

		// Import/Export
		exportInventory,
		importInventory,

		// Initialize
		initializeInventoryData,
	};
});
