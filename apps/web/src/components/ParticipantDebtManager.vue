<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Input, useToast } from '@repo/ui';
import { formatCurrency } from '@repo/utils';
import { Trash2, Plus, Pencil } from 'lucide-vue-next';
import {
  getDebtsByParticipant,
  createParticipantDebt,
  updateParticipantDebt,
  deleteParticipantDebt,
} from '@/services/api';

interface Debt {
  id: string;
  amount: number;
  description?: string | null;
}

const props = defineProps<{
  participant: any;
  retreatId: string;
}>();

const emit = defineEmits<{ (e: 'changed'): void }>();

const { t } = useI18n();
const { toast } = useToast();

const debts = ref<Debt[]>([]);
const loading = ref(false);
const newAmount = ref<number | null>(null);
const newDescription = ref('');
const editingId = ref<string | null>(null);
const editAmount = ref<number | null>(null);
const editDescription = ref('');

// Las deudas solo aplican a servidores y angelitos.
const canHaveDebts = computed(
  () => props.participant?.type === 'server' || props.participant?.type === 'partial_server',
);

const breakdown = computed(() => props.participant?.chargeBreakdown ?? null);

const fmt = (n: number) => formatCurrency(n);

const isPazYSalvo = computed(() => (breakdown.value ? breakdown.value.balance <= 0 : false));

const loadDebts = async () => {
  if (!props.participant?.id) return;
  loading.value = true;
  try {
    debts.value = await getDebtsByParticipant(props.participant.id);
  } catch {
    debts.value = [];
  } finally {
    loading.value = false;
  }
};

watch(
  () => props.participant?.id,
  (id) => {
    if (id) loadDebts();
    else debts.value = [];
  },
  { immediate: true },
);

const addDebt = async () => {
  const amount = Number(newAmount.value);
  if (!amount || amount <= 0) {
    toast({ title: 'Error', description: 'El monto debe ser mayor a 0', variant: 'destructive' });
    return;
  }
  if (!newDescription.value.trim()) {
    toast({ title: 'Error', description: t('debts.descriptionRequired'), variant: 'destructive' });
    return;
  }
  loading.value = true;
  try {
    await createParticipantDebt({
      participantId: props.participant.id,
      retreatId: props.retreatId,
      amount,
      description: newDescription.value.trim(),
    });
    newAmount.value = null;
    newDescription.value = '';
    await loadDebts();
    emit('changed');
  } catch (e: any) {
    toast({
      title: 'Error',
      description: e?.response?.data?.message || 'No se pudo agregar la deuda',
      variant: 'destructive',
    });
  } finally {
    loading.value = false;
  }
};

const startEdit = (debt: Debt) => {
  editingId.value = debt.id;
  editAmount.value = Number(debt.amount);
  editDescription.value = debt.description || '';
};

const cancelEdit = () => {
  editingId.value = null;
};

const saveEdit = async (id: string) => {
  const amount = Number(editAmount.value);
  if (!amount || amount <= 0) {
    toast({ title: 'Error', description: 'El monto debe ser mayor a 0', variant: 'destructive' });
    return;
  }
  if (!editDescription.value.trim()) {
    toast({ title: 'Error', description: t('debts.descriptionRequired'), variant: 'destructive' });
    return;
  }
  loading.value = true;
  try {
    await updateParticipantDebt(id, { amount, description: editDescription.value.trim() });
    editingId.value = null;
    await loadDebts();
    emit('changed');
  } catch (e: any) {
    toast({
      title: 'Error',
      description: e?.response?.data?.message || 'No se pudo actualizar la deuda',
      variant: 'destructive',
    });
  } finally {
    loading.value = false;
  }
};

const removeDebt = async (id: string) => {
  loading.value = true;
  try {
    await deleteParticipantDebt(id);
    await loadDebts();
    emit('changed');
  } catch (e: any) {
    toast({
      title: 'Error',
      description: e?.response?.data?.message || 'No se pudo eliminar la deuda',
      variant: 'destructive',
    });
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="rounded-md border bg-gray-50 p-3 space-y-3">
    <!-- Desglose de cargos / paz y salvo -->
    <div v-if="breakdown" class="space-y-1 text-sm">
      <div class="flex justify-between">
        <span class="text-gray-600">{{ $t('debts.retreatFee') }}</span>
        <span>{{ fmt(breakdown.retreatFee) }}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-gray-600">{{ $t('debts.meals') }}</span>
        <span>{{ fmt(breakdown.meals) }}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-gray-600">{{ $t('debts.debts') }}</span>
        <span>{{ fmt(breakdown.debts) }}</span>
      </div>
      <div class="flex justify-between font-medium border-t pt-1">
        <span>{{ $t('debts.expected') }}</span>
        <span>{{ fmt(breakdown.expected) }}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-gray-600">{{ $t('debts.paid') }}</span>
        <span>{{ fmt(breakdown.totalPaid) }}</span>
      </div>
      <div class="flex justify-between font-semibold">
        <span>{{ $t('debts.balance') }}</span>
        <span :class="isPazYSalvo ? 'text-green-600' : 'text-red-600'">{{ fmt(breakdown.balance) }}</span>
      </div>
      <div class="pt-1">
        <span
          class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
          :class="isPazYSalvo ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'"
        >
          {{ isPazYSalvo ? $t('debts.pazYSalvo') : $t('debts.pending') }}
        </span>
      </div>
    </div>

    <!-- Gestión de deudas (solo servidores/angelitos) -->
    <template v-if="canHaveDebts">
      <div class="border-t pt-2">
        <p class="text-sm font-medium mb-1">{{ $t('debts.title') }}</p>
        <ul v-if="debts.length > 0" class="space-y-1">
          <li
            v-for="debt in debts"
            :key="debt.id"
            class="flex items-center gap-2 text-sm"
          >
            <template v-if="editingId === debt.id">
              <Input v-model.number="editAmount" type="number" min="0" step="0.01" class="h-8 w-24" />
              <Input v-model="editDescription" :placeholder="$t('debts.description')" class="h-8 flex-1" />
              <Button size="sm" class="h-8" @click="saveEdit(debt.id)">{{ $t('common.save') }}</Button>
              <Button size="sm" variant="outline" class="h-8" @click="cancelEdit">{{ $t('common.cancel') }}</Button>
            </template>
            <template v-else>
              <span class="w-24 font-medium">{{ fmt(debt.amount) }}</span>
              <span class="flex-1 text-gray-600 truncate">{{ debt.description || '—' }}</span>
              <button type="button" class="text-gray-500 hover:text-gray-800" @click="startEdit(debt)">
                <Pencil class="h-4 w-4" />
              </button>
              <button type="button" class="text-red-500 hover:text-red-700" @click="removeDebt(debt.id)">
                <Trash2 class="h-4 w-4" />
              </button>
            </template>
          </li>
        </ul>
        <p v-else class="text-xs text-gray-500">{{ $t('debts.empty') }}</p>

        <!-- Agregar deuda (inline) -->
        <div class="mt-2 flex items-center gap-2">
          <Input
            v-model.number="newAmount"
            type="number"
            min="0"
            step="0.01"
            :placeholder="$t('debts.amount')"
            class="h-8 w-24"
          />
          <Input
            v-model="newDescription"
            :placeholder="$t('debts.description')"
            class="h-8 flex-1"
          />
          <Button size="sm" class="h-8" :disabled="loading" @click="addDebt">
            <Plus class="h-4 w-4 mr-1" />{{ $t('debts.add') }}
          </Button>
        </div>
      </div>
    </template>
  </div>
</template>
