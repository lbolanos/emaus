import { defineStore } from 'pinia';
import { ref } from 'vue';
import {
  getTablesByRetreat,
  assignLeaderToTable,
  assignWalkerToTable as assignWalkerToTableApi,
  unassignLeader as unassignLeaderApi,
  unassignWalker as unassignWalkerApi,
  api
} from '@/services/api';
import type { TableMesa } from '@repo/types';
import { useRetreatStore } from './retreatStore';
import { useToast } from '@repo/ui/components/ui/toast/use-toast';
import { useParticipantStore } from './participantStore';

export const useTableMesaStore = defineStore('tableMesa', () => {
  const tables = ref<TableMesa[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const { toast } = useToast();

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
      toast({ title: 'Error', description: error.value, variant: 'destructive' });
      console.error(e);
    } finally {
      isLoading.value = false;
    }
  };

  const assignLeader = async (tableId: string, participantId: string, role: 'lider' | 'colider1' | 'colider2', sourceTableId?: string, sourceRole?: 'lider' | 'colider1' | 'colider2') => {
    try {
      // If moving within the same table, first unassign from the previous role
      if (sourceTableId === tableId && sourceRole && sourceRole !== role) {
        await unassignLeaderApi(tableId, sourceRole);
      }

      const updatedTable = await assignLeaderToTable(tableId, participantId, role);
      const index = tables.value.findIndex(t => t.id === tableId);
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
      toast({ title: 'Error', description: 'Failed to assign walker', variant: 'destructive' });
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
      toast({ title: 'Error', description: `Failed to unassign ${role}`, variant: 'destructive' });
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
      toast({ title: 'Error', description: 'Failed to unassign walker', variant: 'destructive' });
    }
  };

  const rebalanceTables = async (retreatId: string) => {
    isLoading.value = true;
    try {
      await api.post(`/tables/rebalance/${retreatId}`)
      await fetchTables(); // Refetch tables to see the result of rebalancing
    } catch (e: any) {
      error.value = 'Failed to rebalance tables.';
      toast({ title: 'Error', description: error.value, variant: 'destructive' });
      console.error(e);
    } finally {
      isLoading.value = false;
    }
  };

  const createTable = async () => {
    if (!retreatStore.selectedRetreatId) return;
    try {
      const newTableData = {
        name: `Table ${tables.value.length + 1}`,
        retreatId: retreatStore.selectedRetreatId,
      };
      const newTable = await api.post('/tables', newTableData);
      tables.value.push(newTable.data);
    } catch (e: any) {
      console.error('Failed to create table', e);
      toast({ title: 'Error', description: 'Failed to create table', variant: 'destructive' });
    }
  };

  const deleteTable = async (tableId: string) => {
    try {
      await api.delete(`/tables/${tableId}`);
      tables.value = tables.value.filter(t => t.id !== tableId);
    } catch (e: any) {
      const errorMessage = e.response?.data?.message || 'Failed to delete table';
      console.error('Failed to delete table', e);
      toast({ title: 'Error', description: errorMessage, variant: 'destructive' });
      throw e; // Re-throw to be caught in the component
    }
  };

  const updateTableInState = (updatedTable: TableMesa) => {
    const index = tables.value.findIndex(t => t.id === updatedTable.id);
    if (index !== -1) {
      tables.value[index] = updatedTable;
    } else {
      tables.value.push(updatedTable);
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
    createTable,
    deleteTable,
  };
});
