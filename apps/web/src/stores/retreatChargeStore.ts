import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../services/api';
import type { RetreatCharge } from '@repo/types';

export const useRetreatChargeStore = defineStore('retreatCharge', () => {
  const charges = ref<RetreatCharge[]>([]);

  const fetchCharges = async (retreatId: string) => {
    const response = await api.get(`/retreat-charges?retreatId=${retreatId}`);
    charges.value = response.data;
    return charges.value;
  };

  const createCharge = async (chargeData: Omit<RetreatCharge, 'id' | 'participants'>) => {
    const response = await api.post('/retreat-charges', chargeData);
    charges.value.push(response.data);
    return response.data;
  };

  const updateCharge = async (id: string, chargeData: Partial<RetreatCharge>) => {
    const response = await api.put(`/retreat-charges/${id}`, chargeData);
    const index = charges.value.findIndex(c => c.id === id);
    if (index !== -1) {
      charges.value[index] = response.data;
    }
    return response.data;
  };

  const deleteCharge = async (id: string) => {
    await api.delete(`/retreat-charges/${id}`);
    charges.value = charges.value.filter(c => c.id !== id);
  };

  const assignCharge = async (chargeId: string, participantId: string) => {
    const response = await api.post(`/retreat-charges/${chargeId}/assign/${participantId}`);
    const index = charges.value.findIndex(c => c.id === chargeId);
    if (index !== -1) {
      charges.value[index] = response.data;
    }
    return response.data;
  };

  const removeAssignment = async (chargeId: string, participantId: string) => {
    const response = await api.delete(`/retreat-charges/${chargeId}/assign/${participantId}`);
    const index = charges.value.findIndex(c => c.id === chargeId);
    if (index !== -1) {
      charges.value[index] = response.data;
    }
    return response.data;
  };

  return {
    charges,
    fetchCharges,
    createCharge,
    updateCharge,
    deleteCharge,
    assignCharge,
    removeAssignment,
  };
});
