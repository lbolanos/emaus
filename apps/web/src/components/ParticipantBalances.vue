<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ExcelJS from 'exceljs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@repo/ui';
import {
  Printer,
  Columns3,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  GraduationCap,
  Download,
  Plus,
  Wallet,
  MessageCircle,
} from 'lucide-vue-next';
import { formatCurrency, formatDate } from '@repo/utils';
import { useParticipantStore } from '@/stores/participantStore';
import { useRetreatStore } from '@/stores/retreatStore';
import { useAuthPermissions } from '@/composables/useAuthPermissions';
import { getPaymentsByParticipant } from '@/services/api';
import ParticipantDebtManager from '@/components/ParticipantDebtManager.vue';

const participantStore = useParticipantStore();
const retreatStore = useRetreatStore();
const { t } = useI18n();
const { hasPermission } = useAuthPermissions();

// Acciones rápidas: las atiende PaymentsView (cambia a la pestaña Pagos y abre el modal).
const emit = defineEmits<{
  (e: 'register-payment', participantId: string): void;
  (e: 'add-charge', participantId: string): void;
}>();

// El backend valida; esto solo evita mostrar botones que fallarían (p. ej. viewer).
const canEditParticipant = computed(() => hasPermission('participant:update' as any));
const canRegisterPayment = computed(() => hasPermission('payment:create' as any));

const search = ref('');
const typeFilter = ref<'all' | 'walker' | 'server' | 'partial_server' | 'waiting'>('all');
const statusFilter = ref<'all' | 'paz' | 'pending'>('all');

const typeLabel = (type: string): string => {
  const known = ['walker', 'server', 'partial_server', 'waiting'];
  return known.includes(type) ? t(`paymentManagement.balances.types.${type}`) : type;
};

const activeRetreatId = computed(() => retreatStore.selectedRetreatId || '');

const loadParticipants = async () => {
  if (!activeRetreatId.value) return;
  participantStore.filters.retreatId = activeRetreatId.value;
  await participantStore.fetchParticipants();
};

onMounted(loadParticipants);
watch(activeRetreatId, loadParticipants);

const balanceOf = (p: any): number => p?.chargeBreakdown?.balance ?? 0;
const expectedOf = (p: any): number => p?.chargeBreakdown?.expected ?? 0;
const paidOf = (p: any): number => p?.totalPaid ?? 0;
const isPazYSalvo = (p: any): boolean => balanceOf(p) <= 0;

const statusLabel = (p: any): string =>
  p.isScholarship
    ? t('paymentManagement.balances.scholarship')
    : isPazYSalvo(p)
      ? t('paymentManagement.balances.statusPaz')
      : t('paymentManagement.balances.statusPending');

// ---- Columnas configurables (persistidas en localStorage) ----
const COLUMN_KEYS = ['type', 'expected', 'paid', 'balance', 'status'] as const;
type ColumnKey = (typeof COLUMN_KEYS)[number];
const COLUMNS_STORAGE_KEY = 'balances.visibleColumns';

const loadVisibleColumns = (): ColumnKey[] => {
  try {
    const raw = localStorage.getItem(COLUMNS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const valid = parsed.filter((k: string) => COLUMN_KEYS.includes(k as ColumnKey));
        if (valid.length > 0) return valid as ColumnKey[];
      }
    }
  } catch {
    /* selección corrupta → defaults */
  }
  return [...COLUMN_KEYS];
};

const visibleColumns = ref<ColumnKey[]>(loadVisibleColumns());

const isColumnVisible = (key: ColumnKey) => visibleColumns.value.includes(key);

const toggleColumn = (key: ColumnKey, checked: boolean) => {
  if (checked && !visibleColumns.value.includes(key)) {
    // Mantener el orden canónico de COLUMN_KEYS al re-agregar.
    visibleColumns.value = COLUMN_KEYS.filter(
      (k) => k === key || visibleColumns.value.includes(k),
    );
  } else if (!checked) {
    visibleColumns.value = visibleColumns.value.filter((k) => k !== key);
  }
  localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(visibleColumns.value));
};

// ---- Ordenamiento (persistido) ----
type SortKey = 'name' | ColumnKey;
const SORT_STORAGE_KEY = 'balances.sort';

const loadSort = (): { key: SortKey; dir: 'asc' | 'desc' } => {
  try {
    const raw = localStorage.getItem(SORT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const validKeys: SortKey[] = ['name', ...COLUMN_KEYS];
      if (validKeys.includes(parsed?.key) && ['asc', 'desc'].includes(parsed?.dir)) {
        return parsed;
      }
    }
  } catch {
    /* defaults */
  }
  return { key: 'name', dir: 'asc' };
};

const initialSort = loadSort();
const sortKey = ref<SortKey>(initialSort.key);
const sortDir = ref<'asc' | 'desc'>(initialSort.dir);

const persistSort = () => {
  localStorage.setItem(
    SORT_STORAGE_KEY,
    JSON.stringify({ key: sortKey.value, dir: sortDir.value }),
  );
};

const setSort = (key: SortKey) => {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = key;
    sortDir.value = 'asc';
  }
  persistSort();
};

const toggleSortDir = () => {
  sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  persistSort();
};

const ariaSort = (key: SortKey): 'ascending' | 'descending' | 'none' =>
  sortKey.value === key ? (sortDir.value === 'asc' ? 'ascending' : 'descending') : 'none';

const sortValue = (p: any, key: SortKey): string | number => {
  switch (key) {
    case 'name':
      return `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim().toLowerCase();
    case 'type':
      return typeLabel(p.type).toLowerCase();
    case 'expected':
      return expectedOf(p);
    case 'paid':
      return paidOf(p);
    case 'balance':
      return balanceOf(p);
    case 'status':
      // Becado < paz y salvo < pendiente (orden lógico de cobranza)
      return p.isScholarship ? 0 : isPazYSalvo(p) ? 1 : 2;
  }
};

const SORT_OPTIONS: SortKey[] = ['name', 'type', 'expected', 'paid', 'balance', 'status'];
const sortOptionLabel = (key: SortKey): string =>
  key === 'name'
    ? t('paymentManagement.balances.participant')
    : t(`paymentManagement.balances.${key}`);

const rows = computed(() => {
  const q = search.value.trim().toLowerCase();
  const filtered = participantStore.participants
    .filter((p: any) => !p.isCancelled)
    .filter((p: any) => (typeFilter.value === 'all' ? true : p.type === typeFilter.value))
    .filter((p: any) => {
      if (statusFilter.value === 'all') return true;
      return statusFilter.value === 'paz' ? isPazYSalvo(p) : !isPazYSalvo(p);
    })
    .filter((p: any) => {
      if (!q) return true;
      const first = (p.firstName || '').toLowerCase();
      const last = (p.lastName || '').toLowerCase();
      const nick = (p.nickname || '').toLowerCase();
      return first.includes(q) || last.includes(q) || nick.includes(q) || `${first} ${last}`.includes(q);
    });

  const dir = sortDir.value === 'asc' ? 1 : -1;
  return [...filtered].sort((a: any, b: any) => {
    const va = sortValue(a, sortKey.value);
    const vb = sortValue(b, sortKey.value);
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });
});

const totals = computed(() => {
  const list = rows.value;
  const expected = list.reduce((s: number, p: any) => s + expectedOf(p), 0);
  const paid = list.reduce((s: number, p: any) => s + (paidOf(p)), 0);
  const pending = list.reduce((s: number, p: any) => s + balanceOf(p), 0);
  const pazCount = list.filter(isPazYSalvo).length;
  return { expected, paid, pending, pazCount, total: list.length };
});

// Pendiente agrupado por tipo (solo tipos con deuda > 0).
const pendingByType = computed(() => {
  const acc: Record<string, number> = {};
  for (const p of rows.value) {
    const b = balanceOf(p);
    if (b > 0) acc[p.type] = (acc[p.type] || 0) + b;
  }
  return Object.entries(acc).map(([type, amount]) => ({ type, amount }));
});

// ---- Desglose expandible por fila ----
const expandedId = ref<string | null>(null);
const paymentsByParticipant = ref<Record<string, any[]>>({});
const loadingPayments = ref(false);

const toggleExpand = async (p: any) => {
  if (expandedId.value === p.id) {
    expandedId.value = null;
    return;
  }
  expandedId.value = p.id;
  if (!paymentsByParticipant.value[p.id]) {
    loadingPayments.value = true;
    try {
      const all = await getPaymentsByParticipant(p.id);
      // Solo pagos del retiro activo.
      paymentsByParticipant.value[p.id] = (all || []).filter(
        (pay: any) => pay.retreatId === activeRetreatId.value,
      );
    } catch {
      paymentsByParticipant.value[p.id] = [];
    } finally {
      loadingPayments.value = false;
    }
  }
};

const onDebtsChanged = async () => {
  await participantStore.fetchParticipants();
};

// ---- Acciones ----
const printReport = () => {
  window.print();
};

const selectedRetreatLabel = computed(() => {
  const r: any = retreatStore.retreats.find((x: any) => x.id === activeRetreatId.value);
  return r ? `${r.parish} - ${formatDate(r.startDate)}` : '';
});

const togglingScholarshipId = ref<string | null>(null);

const toggleScholarship = async (p: any) => {
  const name = `${p.firstName} ${p.lastName}`.trim();
  const message = p.isScholarship
    ? t('paymentManagement.balances.confirmRemoveScholarship', { name })
    : t('paymentManagement.balances.confirmScholarship', { name });
  if (!window.confirm(message)) return;

  try {
    togglingScholarshipId.value = p.id;
    await participantStore.updateParticipant(p.id, {
      isScholarship: !p.isScholarship,
      contextRetreatId: activeRetreatId.value,
    } as any);
    await participantStore.fetchParticipants();
  } catch (error) {
    console.error('Error toggling scholarship:', error);
  } finally {
    togglingScholarshipId.value = null;
  }
};

// Recordatorio de pago por WhatsApp con el saldo pendiente.
const canWhatsapp = (p: any): boolean => !isPazYSalvo(p) && !!p.cellPhone;

const sendWhatsappReminder = (p: any) => {
  const phone = String(p.cellPhone || '').replace(/\D/g, '');
  if (!phone) return;
  const message = t('paymentManagement.balances.reminderMessage', {
    name: p.firstName,
    amount: formatCurrency(balanceOf(p)),
    retreat: selectedRetreatLabel.value,
  });
  window.open(
    `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`,
    '_blank',
  );
};

// ---- Export a Excel (columnas visibles + filtros aplicados) ----
const exportToExcel = async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(t('paymentManagement.balances.reportTitle'));

  const headers = [t('paymentManagement.balances.participant')];
  for (const key of visibleColumns.value) {
    headers.push(t(`paymentManagement.balances.${key}`));
  }
  const headerRow = sheet.addRow(headers);
  headerRow.font = { bold: true };

  for (const p of rows.value) {
    const name = `${p.firstName} ${p.lastName}`.trim() + (p.nickname ? ` (${p.nickname})` : '');
    const row: (string | number)[] = [name];
    for (const key of visibleColumns.value) {
      switch (key) {
        case 'type':
          row.push(typeLabel(p.type));
          break;
        case 'expected':
          row.push(expectedOf(p));
          break;
        case 'paid':
          row.push(paidOf(p));
          break;
        case 'balance':
          row.push(balanceOf(p));
          break;
        case 'status':
          row.push(statusLabel(p));
          break;
      }
    }
    sheet.addRow(row);
  }
  sheet.columns.forEach((col) => {
    col.width = 22;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `saldos-${new Date().toISOString().slice(0, 10)}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
};
</script>

<template>
  <div class="space-y-3 sm:space-y-4 participant-balances">
    <!-- Toolbar -->
    <div class="grid grid-cols-3 sm:flex sm:items-center sm:justify-end gap-2 no-print">
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="outline" class="w-full sm:w-auto">
            <Columns3 class="w-4 h-4 sm:mr-2" />
            <span class="hidden sm:inline">{{ $t('paymentManagement.balances.columns') }}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuCheckboxItem
            v-for="key in COLUMN_KEYS"
            :key="key"
            :model-value="isColumnVisible(key)"
            @update:model-value="(v: boolean) => toggleColumn(key, v)"
            @select.prevent
          >
            {{ $t(`paymentManagement.balances.${key}`) }}
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="outline" class="w-full sm:w-auto" :aria-label="$t('paymentManagement.balances.export')" @click="exportToExcel">
        <Download class="w-4 h-4 sm:mr-2" />
        <span class="hidden sm:inline">{{ $t('paymentManagement.balances.export') }}</span>
      </Button>
      <Button variant="outline" class="w-full sm:w-auto" :aria-label="$t('paymentManagement.balances.print')" @click="printReport">
        <Printer class="w-4 h-4 sm:mr-2" />
        <span class="hidden sm:inline">{{ $t('paymentManagement.balances.print') }}</span>
      </Button>
    </div>

    <!-- Print header (solo al imprimir) -->
    <div class="print-only mb-4">
      <h1 class="text-2xl font-bold">{{ $t('paymentManagement.balances.reportTitle') }}</h1>
      <p v-if="selectedRetreatLabel" class="text-sm">{{ selectedRetreatLabel }}</p>
      <p class="text-sm text-gray-600">{{ $t('paymentManagement.generated') }}: {{ formatDate(new Date()) }}</p>
    </div>

    <!-- Resumen rápido -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
      <div class="bg-white p-3 rounded-lg shadow no-print">
        <p class="text-xs text-gray-600">{{ $t('paymentManagement.balances.expected') }}</p>
        <p class="text-lg font-bold truncate">{{ formatCurrency(totals.expected) }}</p>
      </div>
      <div class="bg-white p-3 rounded-lg shadow no-print">
        <p class="text-xs text-gray-600">{{ $t('paymentManagement.balances.paid') }}</p>
        <p class="text-lg font-bold text-green-600 truncate">{{ formatCurrency(totals.paid) }}</p>
      </div>
      <div class="bg-white p-3 rounded-lg shadow no-print">
        <p class="text-xs text-gray-600">{{ $t('paymentManagement.balances.toCollect') }}</p>
        <p class="text-lg font-bold truncate" :class="totals.pending > 0 ? 'text-amber-600' : 'text-green-600'">
          {{ formatCurrency(totals.pending) }}
        </p>
      </div>
      <div class="bg-white p-3 rounded-lg shadow">
        <p class="text-xs text-gray-600">{{ $t('paymentManagement.balances.pazYSalvo') }}</p>
        <p class="text-lg font-bold truncate">
          {{ totals.pazCount }} <span class="text-sm font-normal text-gray-400">/ {{ totals.total }}</span>
        </p>
      </div>
    </div>

    <!-- Pendiente por tipo -->
    <div v-if="pendingByType.length > 0" class="flex flex-wrap items-center gap-2 no-print">
      <span class="text-xs text-gray-500">{{ $t('paymentManagement.balances.pendingByType') }}:</span>
      <span
        v-for="item in pendingByType"
        :key="item.type"
        class="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs text-amber-800"
      >
        {{ typeLabel(item.type) }}: {{ formatCurrency(item.amount) }}
      </span>
    </div>

    <!-- Filtros -->
    <div class="bg-white p-3 sm:p-4 rounded-lg shadow grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 no-print">
      <Input class="col-span-2 sm:col-span-1" v-model="search" :placeholder="$t('paymentManagement.balances.searchPlaceholder')" />
      <Select v-model="typeFilter">
        <SelectTrigger><SelectValue :placeholder="$t('paymentManagement.balances.type')" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{{ $t('paymentManagement.balances.allTypes') }}</SelectItem>
          <SelectItem value="walker">{{ $t('paymentManagement.balances.types.walkers') }}</SelectItem>
          <SelectItem value="server">{{ $t('paymentManagement.balances.types.servers') }}</SelectItem>
          <SelectItem value="partial_server">{{ $t('paymentManagement.balances.types.partialServers') }}</SelectItem>
          <SelectItem value="waiting">{{ $t('paymentManagement.balances.types.waiting') }}</SelectItem>
        </SelectContent>
      </Select>
      <Select v-model="statusFilter">
        <SelectTrigger><SelectValue :placeholder="$t('paymentManagement.balances.status')" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{{ $t('paymentManagement.balances.allStatus') }}</SelectItem>
          <SelectItem value="paz">{{ $t('paymentManagement.balances.statusPaz') }}</SelectItem>
          <SelectItem value="pending">{{ $t('paymentManagement.balances.statusPending') }}</SelectItem>
        </SelectContent>
      </Select>
    </div>

    <!-- Ordenar (solo móvil) -->
    <div class="md:hidden flex items-center gap-2 no-print">
      <span class="text-xs text-gray-500 shrink-0">{{ $t('paymentManagement.balances.sortBy') }}</span>
      <Select :model-value="sortKey" @update:model-value="(v: any) => { sortKey = v; persistSort(); }">
        <SelectTrigger class="flex-1"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem v-for="opt in SORT_OPTIONS" :key="opt" :value="opt">
            {{ sortOptionLabel(opt) }}
          </SelectItem>
        </SelectContent>
      </Select>
      <Button variant="outline" size="sm" @click="toggleSortDir" :aria-label="sortDir === 'asc' ? 'Ascendente' : 'Descendente'">
        <ChevronUp v-if="sortDir === 'asc'" class="w-4 h-4" />
        <ChevronDown v-else class="w-4 h-4" />
      </Button>
    </div>

    <!-- Desktop: tabla -->
    <div class="bg-white rounded-lg shadow overflow-x-auto hidden md:block balances-table">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead class="w-8 no-print"></TableHead>
            <TableHead class="cursor-pointer select-none" :aria-sort="ariaSort('name')" @click="setSort('name')">
              <span class="inline-flex items-center gap-1">
                {{ $t('paymentManagement.balances.participant') }}
                <ChevronUp v-if="sortKey === 'name' && sortDir === 'asc'" class="w-3.5 h-3.5" />
                <ChevronDown v-else-if="sortKey === 'name'" class="w-3.5 h-3.5" />
              </span>
            </TableHead>
            <TableHead v-if="isColumnVisible('type')" class="cursor-pointer select-none" :aria-sort="ariaSort('type')" @click="setSort('type')">
              <span class="inline-flex items-center gap-1">
                {{ $t('paymentManagement.balances.type') }}
                <ChevronUp v-if="sortKey === 'type' && sortDir === 'asc'" class="w-3.5 h-3.5" />
                <ChevronDown v-else-if="sortKey === 'type'" class="w-3.5 h-3.5" />
              </span>
            </TableHead>
            <TableHead v-if="isColumnVisible('expected')" class="text-right cursor-pointer select-none" :aria-sort="ariaSort('expected')" @click="setSort('expected')">
              <span class="inline-flex items-center gap-1">
                {{ $t('paymentManagement.balances.expected') }}
                <ChevronUp v-if="sortKey === 'expected' && sortDir === 'asc'" class="w-3.5 h-3.5" />
                <ChevronDown v-else-if="sortKey === 'expected'" class="w-3.5 h-3.5" />
              </span>
            </TableHead>
            <TableHead v-if="isColumnVisible('paid')" class="text-right cursor-pointer select-none" :aria-sort="ariaSort('paid')" @click="setSort('paid')">
              <span class="inline-flex items-center gap-1">
                {{ $t('paymentManagement.balances.paid') }}
                <ChevronUp v-if="sortKey === 'paid' && sortDir === 'asc'" class="w-3.5 h-3.5" />
                <ChevronDown v-else-if="sortKey === 'paid'" class="w-3.5 h-3.5" />
              </span>
            </TableHead>
            <TableHead v-if="isColumnVisible('balance')" class="text-right cursor-pointer select-none" :aria-sort="ariaSort('balance')" @click="setSort('balance')">
              <span class="inline-flex items-center gap-1">
                {{ $t('paymentManagement.balances.balance') }}
                <ChevronUp v-if="sortKey === 'balance' && sortDir === 'asc'" class="w-3.5 h-3.5" />
                <ChevronDown v-else-if="sortKey === 'balance'" class="w-3.5 h-3.5" />
              </span>
            </TableHead>
            <TableHead v-if="isColumnVisible('status')" class="cursor-pointer select-none" :aria-sort="ariaSort('status')" @click="setSort('status')">
              <span class="inline-flex items-center gap-1">
                {{ $t('paymentManagement.balances.status') }}
                <ChevronUp v-if="sortKey === 'status' && sortDir === 'asc'" class="w-3.5 h-3.5" />
                <ChevronDown v-else-if="sortKey === 'status'" class="w-3.5 h-3.5" />
              </span>
            </TableHead>
            <TableHead class="no-print">{{ $t('paymentManagement.balances.actions') }}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <template v-for="p in rows" :key="p.id">
            <TableRow>
              <TableCell class="no-print">
                <button
                  type="button"
                  class="text-gray-400 hover:text-gray-700"
                  :aria-label="$t('paymentManagement.balances.details')"
                  @click="toggleExpand(p)"
                >
                  <ChevronDown v-if="expandedId === p.id" class="w-4 h-4" />
                  <ChevronRight v-else class="w-4 h-4" />
                </button>
              </TableCell>
              <TableCell class="font-medium">
                {{ p.firstName }} {{ p.lastName }}
                <span v-if="p.nickname" class="text-gray-500">({{ p.nickname }})</span>
              </TableCell>
              <TableCell v-if="isColumnVisible('type')">{{ typeLabel(p.type) }}</TableCell>
              <TableCell v-if="isColumnVisible('expected')" class="text-right">{{ formatCurrency(expectedOf(p)) }}</TableCell>
              <TableCell v-if="isColumnVisible('paid')" class="text-right text-green-600">{{ formatCurrency(paidOf(p)) }}</TableCell>
              <TableCell v-if="isColumnVisible('balance')" class="text-right font-semibold" :class="isPazYSalvo(p) ? 'text-green-600' : 'text-red-600'">
                {{ formatCurrency(balanceOf(p)) }}
              </TableCell>
              <TableCell v-if="isColumnVisible('status')">
                <span
                  v-if="p.isScholarship"
                  class="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800"
                >{{ $t('paymentManagement.balances.scholarship') }}</span>
                <span
                  v-else
                  class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                  :class="isPazYSalvo(p) ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'"
                >{{ isPazYSalvo(p) ? $t('paymentManagement.balances.statusPaz') : $t('paymentManagement.balances.statusPending') }}</span>
              </TableCell>
              <TableCell class="no-print">
                <div class="flex gap-1">
                  <Button
                    v-if="canRegisterPayment"
                    variant="outline"
                    size="sm"
                    class="text-green-700 border-green-300 hover:bg-green-50"
                    :title="$t('paymentManagement.balances.registerPayment')"
                    :aria-label="$t('paymentManagement.balances.registerPayment')"
                    @click="emit('register-payment', p.id)"
                  >
                    <Plus class="w-4 h-4" />
                  </Button>
                  <Button
                    v-if="canRegisterPayment && (p.type === 'server' || p.type === 'partial_server')"
                    variant="outline"
                    size="sm"
                    class="text-amber-700 border-amber-300 hover:bg-amber-50"
                    :title="$t('paymentManagement.balances.addCharge')"
                    :aria-label="$t('paymentManagement.balances.addCharge')"
                    @click="emit('add-charge', p.id)"
                  >
                    <Wallet class="w-4 h-4" />
                  </Button>
                  <Button
                    v-if="canWhatsapp(p)"
                    variant="outline"
                    size="sm"
                    class="text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                    :title="$t('paymentManagement.balances.whatsappReminder')"
                    :aria-label="$t('paymentManagement.balances.whatsappReminder')"
                    @click="sendWhatsappReminder(p)"
                  >
                    <MessageCircle class="w-4 h-4" />
                  </Button>
                  <Button
                    v-if="canEditParticipant"
                    variant="outline"
                    size="sm"
                    :class="p.isScholarship ? 'text-gray-600' : 'text-blue-700 border-blue-300 hover:bg-blue-50'"
                    :disabled="togglingScholarshipId === p.id"
                    :title="p.isScholarship ? $t('paymentManagement.balances.removeScholarship') : $t('paymentManagement.balances.markScholarship')"
                    :aria-label="p.isScholarship ? $t('paymentManagement.balances.removeScholarship') : $t('paymentManagement.balances.markScholarship')"
                    @click="toggleScholarship(p)"
                  >
                    <GraduationCap class="w-4 h-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
            <!-- Fila expandida: desglose + pagos -->
            <TableRow v-if="expandedId === p.id" class="no-print bg-gray-50/50">
              <TableCell :colspan="3 + visibleColumns.length">
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 py-2">
                  <ParticipantDebtManager
                    v-if="activeRetreatId"
                    :participant="p"
                    :retreat-id="activeRetreatId"
                    @changed="onDebtsChanged"
                  />
                  <div class="rounded-md border bg-white p-3">
                    <p class="text-sm font-medium mb-2">{{ $t('paymentManagement.balances.payments') }}</p>
                    <p v-if="loadingPayments && !paymentsByParticipant[p.id]" class="text-xs text-gray-500">…</p>
                    <ul v-else-if="(paymentsByParticipant[p.id] || []).length > 0" class="space-y-1 text-sm">
                      <li
                        v-for="pay in paymentsByParticipant[p.id]"
                        :key="pay.id"
                        class="flex items-center justify-between gap-2"
                      >
                        <span class="text-gray-600">{{ formatDate(pay.paymentDate) }}</span>
                        <span class="text-xs text-gray-400 flex-1 truncate">{{ pay.referenceNumber || '' }}</span>
                        <span class="font-medium text-green-600">{{ formatCurrency(pay.amount) }}</span>
                      </li>
                    </ul>
                    <p v-else class="text-xs text-gray-500">{{ $t('paymentManagement.balances.noPayments') }}</p>
                  </div>
                </div>
              </TableCell>
            </TableRow>
          </template>
          <TableRow v-if="rows.length === 0">
            <TableCell :colspan="3 + visibleColumns.length" class="text-center text-gray-500 py-6">
              {{ $t('paymentManagement.balances.empty') }}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>

    <!-- Móvil: tarjetas -->
    <div class="md:hidden space-y-3 balances-cards">
      <div v-for="p in rows" :key="p.id" class="bg-white rounded-lg shadow p-4">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-sm font-semibold truncate">
              {{ p.firstName }} {{ p.lastName }}
              <span v-if="p.nickname" class="font-normal text-gray-500">({{ p.nickname }})</span>
            </p>
            <p class="text-xs text-gray-500">{{ typeLabel(p.type) }}</p>
          </div>
          <span
            v-if="p.isScholarship"
            class="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800"
          >{{ $t('paymentManagement.balances.scholarship') }}</span>
          <span
            v-else
            class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
            :class="isPazYSalvo(p) ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'"
          >{{ isPazYSalvo(p) ? $t('paymentManagement.balances.statusPaz') : $t('paymentManagement.balances.statusPending') }}</span>
        </div>
        <div class="mt-2 grid grid-cols-3 gap-2 text-sm">
          <div><p class="text-xs text-gray-500">{{ $t('paymentManagement.balances.expected') }}</p>{{ formatCurrency(expectedOf(p)) }}</div>
          <div><p class="text-xs text-gray-500">{{ $t('paymentManagement.balances.paid') }}</p><span class="text-green-600">{{ formatCurrency(paidOf(p)) }}</span></div>
          <div>
            <p class="text-xs text-gray-500">{{ $t('paymentManagement.balances.balance') }}</p>
            <span :class="isPazYSalvo(p) ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'">
              {{ formatCurrency(balanceOf(p)) }}
            </span>
          </div>
        </div>
        <div class="mt-3 flex gap-1.5 no-print">
          <Button
            v-if="canRegisterPayment"
            variant="outline"
            size="sm"
            class="flex-1 text-green-700 border-green-300"
            :aria-label="$t('paymentManagement.balances.registerPayment')"
            @click="emit('register-payment', p.id)"
          >
            <Plus class="w-4 h-4" />
          </Button>
          <Button
            v-if="canRegisterPayment && (p.type === 'server' || p.type === 'partial_server')"
            variant="outline"
            size="sm"
            class="flex-1 text-amber-700 border-amber-300"
            :aria-label="$t('paymentManagement.balances.addCharge')"
            @click="emit('add-charge', p.id)"
          >
            <Wallet class="w-4 h-4" />
          </Button>
          <Button
            v-if="canWhatsapp(p)"
            variant="outline"
            size="sm"
            class="flex-1 text-emerald-700 border-emerald-300"
            :aria-label="$t('paymentManagement.balances.whatsappReminder')"
            @click="sendWhatsappReminder(p)"
          >
            <MessageCircle class="w-4 h-4" />
          </Button>
          <Button
            v-if="canEditParticipant"
            variant="outline"
            size="sm"
            class="flex-1"
            :class="p.isScholarship ? 'text-gray-600' : 'text-blue-700 border-blue-300'"
            :disabled="togglingScholarshipId === p.id"
            :aria-label="p.isScholarship ? $t('paymentManagement.balances.removeScholarship') : $t('paymentManagement.balances.markScholarship')"
            @click="toggleScholarship(p)"
          >
            <GraduationCap class="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            class="flex-1"
            :aria-label="$t('paymentManagement.balances.details')"
            @click="toggleExpand(p)"
          >
            <ChevronDown v-if="expandedId === p.id" class="w-4 h-4" />
            <ChevronRight v-else class="w-4 h-4" />
          </Button>
        </div>
        <div v-if="expandedId === p.id" class="mt-3 space-y-3 no-print">
          <ParticipantDebtManager
            v-if="activeRetreatId"
            :participant="p"
            :retreat-id="activeRetreatId"
            @changed="onDebtsChanged"
          />
          <div class="rounded-md border bg-white p-3">
            <p class="text-sm font-medium mb-2">{{ $t('paymentManagement.balances.payments') }}</p>
            <ul v-if="(paymentsByParticipant[p.id] || []).length > 0" class="space-y-1 text-sm">
              <li
                v-for="pay in paymentsByParticipant[p.id]"
                :key="pay.id"
                class="flex items-center justify-between gap-2"
              >
                <span class="text-gray-600">{{ formatDate(pay.paymentDate) }}</span>
                <span class="font-medium text-green-600">{{ formatCurrency(pay.amount) }}</span>
              </li>
            </ul>
            <p v-else class="text-xs text-gray-500">{{ $t('paymentManagement.balances.noPayments') }}</p>
          </div>
        </div>
      </div>
      <div v-if="rows.length === 0" class="bg-white rounded-lg shadow p-6 text-center text-gray-500">
        {{ $t('paymentManagement.balances.empty') }}
      </div>
    </div>
  </div>
</template>

<style>
.participant-balances .print-only {
  display: none;
}

@media print {
  .participant-balances .no-print {
    display: none !important;
  }
  .participant-balances .print-only {
    display: block !important;
  }
  /* Al imprimir, siempre la tabla (aunque la pantalla sea angosta). */
  .participant-balances .balances-table {
    display: block !important;
    box-shadow: none !important;
  }
  .participant-balances .balances-cards {
    display: none !important;
  }
}
</style>
