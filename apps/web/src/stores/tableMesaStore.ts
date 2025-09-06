import { defineStore } from 'pinia';
import { ref } from 'vue';
import {
  getTablesByRetreat,
  assignLeaderToTable,
  rebalanceTables,
  assignWalkerToTable as assignWalkerToTableApi,
  unassignLeader as unassignLeaderApi,
  unassignWalker as unassignWalkerApi,
} from '@/services/api';
import type { TableMesa, Participant } from '@repo/types';
import { useRetreatStore } from './retreatStore';
import { useParticipantStore } from './participantStore';

export const useTableMesaStore = defineStore('tableMesa', () => {
  const tables = ref<TableMesa[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  const retreatStore = useRetreatStore();
  const participantStore = useParticipantStore();

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
      const updatedTable = await assignWalkerToTableApi(tableId, participantId);
      const index = tables.value.findIndex(t => t.id === tableId);
      if (index !== -1) {
        tables.value[index] = updatedTable;
      }
    } catch (e: any) {
      console.error(`Failed to assign walker`, e);
    }
  };

  const unassignLeader = async (tableId: string, role: 'lider' | 'colider1' | 'colider2') => {
    try {
      const updatedTable = await unassignLeaderApi(tableId, role);
      const index = tables.value.findIndex(t => t.id === tableId);
      if (index !== -1) {
        tables.value[index] = updatedTable;
      }
    } catch (e: any) {
      console.error(`Failed to unassign ${role}`, e);
    }
  };

  const unassignWalkerFromTable = async (tableId: string, walkerId: string) => {
    try {
      // Optimistically update the UI first for a faster user experience
      const tableIndex = tables.value.findIndex(t => t.id === tableId);
      if (tableIndex !== -1 && tables.value[tableIndex].walkers) {
        const walkerIndex = tables.value[tableIndex].walkers.findIndex(w => w.id === walkerId);
        if (walkerIndex !== -1) {
          tables.value[tableIndex].walkers.splice(walkerIndex, 1);
        }
      }

      // Then, call the API to persist the change
      await unassignWalkerApi(tableId, walkerId);

      // Manually update the participant in the participantStore to reflect the change
      const participantIndex = participantStore.participants.findIndex(p => p.id === walkerId);
      if (participantIndex !== -1) {
        participantStore.participants[participantIndex].tableId = null;
      }
    } catch (e: any) {
      console.error(`Failed to unassign walker`, e);
    }
  };

  const rebalanceTables = async (retreatId: string) => {
    isLoading.value = true;
    try {
      await rebalanceTables(retreatId);
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

  return {
    tables,
    isLoading,
    error,
    fetchTables,
    assignLeader,
    assignWalkerToTable,
    rebalanceTables,
    unassignLeader,
    unassignWalkerFromTable,
  };
});
