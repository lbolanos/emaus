import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import {
	getTablesByRetreat,
	assignLeaderToTable,
	assignWalkerToTable as assignWalkerToTableApi,
	unassignLeader as unassignLeaderApi,
	unassignWalker as unassignWalkerApi,
	clearAllTables as clearAllTablesApi,
	deleteEmptyTables as deleteEmptyTablesApi,
	updateTable as updateTableApi,
	uploadTablePhoto as uploadTablePhotoApi,
	deleteTablePhoto as deleteTablePhotoApi,
	api,
} from '@/services/api';
import { apiErrorMessage } from '@/services/apiError';
import { isFromCache } from '@/offline/readCache';
import { createLocaleComparator } from '@/utils/sort';
import type { TableMesa } from '@repo/types';
import { useRetreatStore } from './retreatStore';
import { useToast } from '@repo/ui';
import { useParticipantStore } from './participantStore';

const compareTableNames = createLocaleComparator('es');

export const useTableMesaStore = defineStore('tableMesa', () => {
	const tables = ref<TableMesa[]>([]);
	// Saved on the device without health fields (specs/offline-mode): the printed
	// sheet must not show their absence as "nothing to report".
	const fromCache = ref(false);
	const isLoading = ref(false);
	const error = ref<string | null>(null);
	const { toast } = useToast();

	const retreatStore = useRetreatStore();
	const participantStore = useParticipantStore();

	const fetchTables = async () => {
		if (!retreatStore.selectedRetreatId) {
			tables.value = [];
			fromCache.value = false;
			return;
		}
		isLoading.value = true;
		error.value = null;
		try {
			const data = await getTablesByRetreat(retreatStore.selectedRetreatId);
			tables.value = data;
			fromCache.value = isFromCache(data);
		} catch (e: any) {
			error.value = 'Failed to fetch tables.';
			toast({ title: 'Error', description: error.value, variant: 'destructive' });
			console.error(e);
		} finally {
			isLoading.value = false;
		}
	};

	const assignLeader = async (
		tableId: string,
		participantId: string,
		role: 'lider' | 'colider1' | 'colider2',
		sourceTableId?: string,
		sourceRole?: 'lider' | 'colider1' | 'colider2',
	) => {
		try {
			// If moving within the same table, first unassign from the previous role
			if (sourceTableId === tableId && sourceRole && sourceRole !== role) {
				await unassignLeaderApi(tableId, sourceRole);
			}

			const updatedTable = await assignLeaderToTable(tableId, participantId, role);
			const index = tables.value.findIndex((t) => t.id === tableId);
			if (index !== -1) {
				tables.value[index] = updatedTable;
			}

			// If the participant came from another table, we need to refresh that table's state as well.
			if (sourceTableId && sourceTableId !== tableId) {
				try {
					const sourceTable = await api.get(`/tables/${sourceTableId}`);
					updateTableInState(sourceTable.data);
				} catch (error) {
					console.error(`Failed to refresh source table ${sourceTableId}`, error);
					// Even if the source table refresh fails, the main operation succeeded.
				}
			}
		} catch (e: any) {
			console.error(`Failed to assign ${role}`, e);
			toast({ title: 'Error', description: `Failed to assign ${role}`, variant: 'destructive' });
		}
	};

	const assignWalkerToTable = async (
		tableId: string,
		participantId: string,
		sourceTableId: string | undefined = undefined,
	) => {
		try {
			const updatedTable = await assignWalkerToTableApi(tableId, participantId);
			updateTableInState(updatedTable);

			// Retiros de parejas: el backend avisa (sin bloquear) cuando la asignación
			// manual contradice la configuración juntos/separados del retiro.
			if ((updatedTable as any)?.warning) {
				toast({ title: (updatedTable as any).warning });
			}

			// If the participant came from another table, we need to refresh that table's state as well.
			if (sourceTableId && sourceTableId !== tableId) {
				try {
					const sourceTable = await api.get(`/tables/${sourceTableId}`);
					updateTableInState(sourceTable.data);
				} catch (error) {
					console.error(`Failed to refresh source table ${sourceTableId}`, error);
					// Even if the source table refresh fails, the main operation succeeded.
				}
			}
		} catch (e: any) {
			console.error(`Failed to assign walker`, e);
			const errorMessage = apiErrorMessage(e, 'Failed to assign walker');
			toast({ title: 'Error', description: errorMessage, variant: 'destructive' });
		}
	};

	const unassignLeader = async (tableId: string, role: 'lider' | 'colider1' | 'colider2') => {
		try {
			const updatedTable = await unassignLeaderApi(tableId, role);
			const index = tables.value.findIndex((t) => t.id === tableId);
			if (index !== -1) {
				tables.value[index] = updatedTable;
			}
		} catch (e: any) {
			console.error(`Failed to unassign ${role}`, e);
			toast({ title: 'Error', description: `Failed to unassign ${role}`, variant: 'destructive' });
		}
	};

	const unassignWalkerFromTable = async (tableId: string, walkerId: string) => {
		try {
			// Optimistically update the UI first for a faster user experience
			const tableIndex = tables.value.findIndex((t) => t.id === tableId);
			if (tableIndex !== -1 && tables.value[tableIndex].walkers) {
				const walkerIndex = tables.value[tableIndex].walkers.findIndex((w) => w.id === walkerId);
				if (walkerIndex !== -1) {
					tables.value[tableIndex].walkers.splice(walkerIndex, 1);
				}
			}

			// Then, call the API to persist the change
			await unassignWalkerApi(tableId, walkerId);

			// Manually update the participant in the participantStore to reflect the change
			const participantIndex = participantStore.participants.findIndex((p) => p.id === walkerId);
			if (participantIndex !== -1) {
				participantStore.participants[participantIndex].tableId = null;
			}
		} catch (e: any) {
			console.error(`Failed to unassign walker`, e);
			toast({ title: 'Error', description: 'Failed to unassign walker', variant: 'destructive' });
		}
	};

	const rebalanceTables = async (retreatId: string) => {
		isLoading.value = true;
		try {
			await api.post(`/tables/rebalance/${retreatId}`);
			await fetchTables(); // Refetch tables to see the result of rebalancing
		} catch (e: any) {
			error.value = 'Failed to rebalance tables.';
			toast({ title: 'Error', description: error.value, variant: 'destructive' });
			console.error(e);
		} finally {
			isLoading.value = false;
		}
	};

	const clearAllTables = async (retreatId: string) => {
		isLoading.value = true;
		try {
			await clearAllTablesApi(retreatId);
			await fetchTables();
			await participantStore.fetchParticipants();
		} catch (e: any) {
			error.value = 'Failed to clear all tables.';
			toast({ title: 'Error', description: error.value, variant: 'destructive' });
			console.error(e);
		} finally {
			isLoading.value = false;
		}
	};

	const deleteEmptyTables = async (retreatId: string) => {
		isLoading.value = true;
		try {
			const result = await deleteEmptyTablesApi(retreatId);
			await fetchTables();
			return result;
		} catch (e: any) {
			const errorMessage = apiErrorMessage(e, 'Failed to delete empty tables');
			console.error('Failed to delete empty tables', e);
			toast({ title: 'Error', description: errorMessage, variant: 'destructive' });
			throw e; // Re-throw to be caught in the component
		} finally {
			isLoading.value = false;
		}
	};

	const isCreatingTable = ref(false);

	const createTable = async () => {
		if (!retreatStore.selectedRetreatId || isCreatingTable.value) return;
		isCreatingTable.value = true;
		try {
			// No name: the API numbers the table from the stored ones. Numbering from this list
			// duplicated "Mesa 9" when it was stale or a second click left before the first returned.
			const newTable = await api.post('/tables', { retreatId: retreatStore.selectedRetreatId });
			tables.value.push(newTable.data);
		} catch (e: any) {
			console.error('Failed to create table', e);
			toast({ title: 'Error', description: 'Failed to create table', variant: 'destructive' });
		} finally {
			isCreatingTable.value = false;
		}
	};

	/**
	 * Renames a table and keeps the list in natural order ("Mesa 2" before
	 * "Mesa 10"), the same order the API returns. The PUT response carries no
	 * leaders or walkers, so only the name is merged into the table in state.
	 * Errors are re-thrown: the card shows them and keeps the editor open.
	 */
	const renameTable = async (tableId: string, name: string) => {
		const updated = await updateTableApi(tableId, { name });
		const table = tables.value.find((t) => t.id === tableId);
		if (table) {
			table.name = updated.name;
			tables.value = [...tables.value].sort((a, b) => compareTableNames(a.name, b.name));
		}
		return updated;
	};

	const deleteTable = async (tableId: string) => {
		try {
			await api.delete(`/tables/${tableId}`);
			tables.value = tables.value.filter((t) => t.id !== tableId);
		} catch (e: any) {
			const errorMessage = apiErrorMessage(e, 'Failed to delete table');
			console.error('Failed to delete table', e);
			toast({ title: 'Error', description: errorMessage, variant: 'destructive' });
			throw e; // Re-throw to be caught in the component
		}
	};

	const updateTableInState = (updatedTable: TableMesa) => {
		const index = tables.value.findIndex((t) => t.id === updatedTable.id);
		if (index !== -1) {
			tables.value[index] = updatedTable;
		} else {
			tables.value.push(updatedTable);
		}
	};

	/**
	 * Uploads/replaces the group photo of a table (spec table-memory-photo).
	 * Errors re-throw without toasting here: the dialog shows them with i18n.
	 */
	const setTablePhoto = async (tableId: string, photoData: string) => {
		const updatedTable = await uploadTablePhotoApi(tableId, photoData);
		updateTableInState(updatedTable);
		return updatedTable;
	};

	/** Removes the group photo of a table; errors re-throw for the dialog to show. */
	const removeTablePhoto = async (tableId: string) => {
		const updatedTable = await deleteTablePhotoApi(tableId);
		updateTableInState(updatedTable);
		return updatedTable;
	};

	watch(() => retreatStore.selectedRetreatId, (id) => {
		if (id) fetchTables();
	});

	return {
		tables,
		fromCache,
		isLoading,
		error,
		fetchTables,
		assignLeader,
		assignWalkerToTable,
		rebalanceTables,
		clearAllTables,
		unassignLeader,
		unassignWalkerFromTable,
		createTable,
		renameTable,
		deleteTable,
		deleteEmptyTables,
		setTablePhoto,
		removeTablePhoto,
	};
});
