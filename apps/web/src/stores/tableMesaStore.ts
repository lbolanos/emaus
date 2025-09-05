import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { getTablesByRetreat, updateTable, assignLeaderToTable, rebalanceTables as rebalanceTablesApi, assignWalkerToTable as assignWalkerToTableApi } from '@/services/api';
import type { TableMesa, Participant } from '@repo/types';
import { useRetreatStore } from './retreatStore';

export const useTableMesaStore = defineStore('tableMesa', () => {
  const tables = ref<TableMesa[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  const retreatStore = useRetreatStore();

  const fetchTables = async () => {
    if (!retreatStore.selectedRetreatId) {
      tables.value = [];
      return;
    }
    isLoading.value = true;
    error.value = null;
    try {
      tables.value = await getTablesByRetreat(retreatStore.selectedRetreatId);
    } catch (e: any) {
      error.value = 'Failed to fetch tables.';
      console.error(e);
    } finally {
      isLoading.value = false;
    }
  };

  const assignLeader = async (tableId: string, participantId: string, role: 'lider' | 'colider1' | 'colider2') => {
    try {
      const updatedTable = await assignLeaderToTable(tableId, participantId, role);
      const index = tables.value.findIndex(t => t.id === tableId);
      if (index !== -1) {
        tables.value[index] = updatedTable;
      }
    } catch (e: any) {
      console.error(`Failed to assign ${role}`, e);
      // Optionally set an error state
    }
  };

  const assignWalkerToTable = async (tableId: string, participantId: string) => {
    try {
      await assignWalkerToTableApi(tableId, participantId);
      // For an optimistic update, we would manually move the walker here.
      // For simplicity, we'll just refetch everything.
      await fetchTables();
    } catch (e: any) {
      console.error(`Failed to assign walker`, e);
    }
  };

  const rebalanceTables = async (retreatId: string) => {
    isLoading.value = true;
    try {
      await rebalanceTablesApi(retreatId);
      await fetchTables(); // Refetch tables to see the result of rebalancing
    } catch (e: any) {
      error.value = 'Failed to rebalance tables.';
      console.error(e);
    } finally {
      isLoading.value = false;
    }
  };

  retreatStore.$subscribe((_, state) => {
    fetchTables();
  });

  return { tables, isLoading, error, fetchTables, assignLeader, assignWalkerToTable, rebalanceTables };
});