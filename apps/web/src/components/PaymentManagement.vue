<template>
	<div class="payment-management">
		<!-- Header -->
		<div class="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4 sm:mb-6 no-print">
			<div>
				<h2 class="text-xl sm:text-2xl font-bold">{{ $t('paymentManagement.title') }}</h2>
				<p class="text-sm text-gray-600">{{ $t('paymentManagement.subtitle') }}</p>
			</div>
			<div class="grid grid-cols-2 sm:flex gap-2">
				<Button @click="printReport" variant="outline" class="w-full sm:w-auto">
					<Printer class="w-4 h-4 sm:mr-2" />
					<span>{{ $t('paymentManagement.print') }}</span>
				</Button>
				<Button @click="openAddDebtModal" variant="outline" class="w-full sm:w-auto text-amber-700 border-amber-300 hover:bg-amber-50">
					<Plus class="w-4 h-4 sm:mr-2" />
					<span>{{ $t('paymentManagement.addCharge') }}</span>
				</Button>
				<Button @click="openAddPaymentModal" class="col-span-2 sm:w-auto bg-blue-600 hover:bg-blue-700">
					<Plus class="w-4 h-4 mr-2" />
					{{ $t('paymentManagement.addPayment') }}
				</Button>
			</div>
		</div>

		<!-- Print header (only visible when printing) -->
		<div class="print-only mb-4">
			<h1 class="text-2xl font-bold">{{ $t('paymentManagement.reportTitle') }}</h1>
			<p v-if="selectedRetreatLabel" class="text-sm">{{ selectedRetreatLabel }}</p>
			<p class="text-sm text-gray-600">{{ $t('paymentManagement.generated') }}: {{ formatDate(new Date()) }}</p>
		</div>

		<!-- Filters -->
		<div class="bg-white p-3 sm:p-4 rounded-lg shadow mb-4 sm:mb-6 no-print">
			<div class="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
				<div class="col-span-2 lg:col-span-3">
					<label class="block text-sm font-medium text-gray-700 mb-1">{{ $t('paymentManagement.filters.searchLabel') }}</label>
					<Input
						v-model="filters.search"
						type="text"
						:placeholder="$t('paymentManagement.filters.searchPlaceholder')"
					/>
				</div>
				<div class="col-span-2 lg:col-span-1">
					<label class="block text-sm font-medium text-gray-700 mb-1">{{ $t('paymentManagement.filters.method') }}</label>
						<Select v-model="filters.paymentMethod">
							<SelectTrigger>
								<SelectValue :placeholder="$t('paymentManagement.filters.allMethods')" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="cash">{{ $t('paymentManagement.methods.cash') }}</SelectItem>
								<SelectItem value="transfer">{{ $t('paymentManagement.methods.transfer') }}</SelectItem>
								<SelectItem value="check">{{ $t('paymentManagement.methods.check') }}</SelectItem>
								<SelectItem value="card">{{ $t('paymentManagement.methods.card') }}</SelectItem>
								<SelectItem value="other">{{ $t('paymentManagement.methods.other') }}</SelectItem>
							</SelectContent>
						</Select>
				</div>
				<div>
					<label class="block text-sm font-medium text-gray-700 mb-1">{{ $t('paymentManagement.filters.startDate') }}</label>
					<Input v-model="filters.startDate" type="date" />
				</div>
				<div>
					<label class="block text-sm font-medium text-gray-700 mb-1">{{ $t('paymentManagement.filters.endDate') }}</label>
					<Input v-model="filters.endDate" type="date" />
				</div>
			</div>
			<div class="mt-3 sm:mt-4 grid grid-cols-2 sm:flex gap-2">
				<Button @click="applyFilters" :disabled="paymentStore.loading" class="w-full sm:w-auto">
					<Search class="w-4 h-4 mr-2" />
					{{ $t('paymentManagement.filters.search') }}
				</Button>
				<Button @click="clearFilters" variant="outline" class="w-full sm:w-auto">
					<X class="w-4 h-4 mr-2" />
					{{ $t('paymentManagement.filters.clear') }}
				</Button>
			</div>
		</div>

		<!-- Summary Cards -->
		<div v-if="summary" class="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 mb-4 sm:mb-6">
			<div class="bg-white p-3 sm:p-4 rounded-lg shadow no-print">
				<div class="flex items-center gap-3">
					<div class="shrink-0 rounded-full bg-green-100 p-2">
						<DollarSign class="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
					</div>
					<div class="min-w-0">
						<p class="text-xs sm:text-sm font-medium text-gray-600 truncate">{{ $t('paymentManagement.summary.collected') }}</p>
						<p class="text-lg sm:text-2xl font-bold truncate">{{ formatCurrency(summary.totalPaid) }}</p>
					</div>
				</div>
			</div>
			<div class="bg-white p-3 sm:p-4 rounded-lg shadow no-print">
				<div class="flex items-center gap-3">
					<div class="shrink-0 rounded-full bg-amber-100 p-2">
						<Wallet class="w-5 h-5 sm:w-6 sm:h-6 text-amber-600" />
					</div>
					<div class="min-w-0">
						<p class="text-xs sm:text-sm font-medium text-gray-600 truncate">{{ $t('paymentManagement.summary.toCollect') }}</p>
						<p
							class="text-lg sm:text-2xl font-bold truncate"
							:class="(summary.totalRemaining ?? 0) > 0 ? 'text-amber-600' : 'text-green-600'"
						>
							{{ formatCurrency(summary.totalRemaining ?? 0) }}
						</p>
					</div>
				</div>
			</div>
			<div class="bg-white p-3 sm:p-4 rounded-lg shadow">
				<div class="flex items-center gap-3">
					<div class="shrink-0 rounded-full bg-emerald-100 p-2">
						<UserCheck class="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600" />
					</div>
					<div class="min-w-0">
						<p class="text-xs sm:text-sm font-medium text-gray-600 truncate">{{ $t('paymentManagement.summary.pazYSalvo') }}</p>
						<p class="text-lg sm:text-2xl font-bold truncate">
							{{ summary.pazYSalvoCount ?? 0 }}
							<span class="text-sm font-normal text-gray-400">/ {{ summary.totalParticipants }}</span>
						</p>
					</div>
				</div>
			</div>
			<div class="bg-white p-3 sm:p-4 rounded-lg shadow">
				<div class="flex items-center gap-3">
					<div class="shrink-0 rounded-full bg-blue-100 p-2">
						<Receipt class="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
					</div>
					<div class="min-w-0">
						<p class="text-xs sm:text-sm font-medium text-gray-600 truncate">{{ $t('paymentManagement.summary.totalPayments') }}</p>
						<p class="text-lg sm:text-2xl font-bold truncate">{{ summary.totalPayments }}</p>
					</div>
				</div>
			</div>
		</div>

		<!-- Payments list -->
		<div class="bg-white rounded-lg shadow">
			<div class="p-4 border-b">
				<h3 class="text-lg font-semibold">{{ $t('paymentManagement.table.title') }}</h3>
			</div>

			<!-- Mobile: stacked cards -->
			<div class="md:hidden divide-y divide-gray-200">
				<div
					v-for="payment in filteredPayments"
					:key="payment.id"
					class="p-4"
				>
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0">
							<p class="text-sm font-semibold text-gray-900 truncate">
								{{ payment.participant?.firstName }} {{ payment.participant?.lastName }}
								<span v-if="payment.participant?.nickname" class="font-normal text-gray-500">
									({{ payment.participant?.nickname }})
								</span>
							</p>
							<p class="text-xs text-gray-500 mt-0.5">{{ formatDate(payment.paymentDate) }}</p>
						</div>
						<p class="text-base font-bold text-green-600 whitespace-nowrap">
							{{ formatCurrency(payment.amount) }}
						</p>
					</div>
					<div class="mt-2 flex flex-wrap items-center gap-2">
						<span class="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
							{{ getPaymentMethodLabel(payment.paymentMethod) }}
						</span>
						<span v-if="payment.referenceNumber" class="text-xs text-gray-500">
							{{ $t('paymentManagement.table.ref') }}: {{ payment.referenceNumber }}
						</span>
						<span v-if="payment.recordedByUser?.displayName" class="text-xs text-gray-400">
							· {{ payment.recordedByUser?.displayName }}
						</span>
					</div>
					<div class="mt-3 flex gap-2 no-print">
						<Button @click="editPayment(payment)" variant="outline" size="sm" class="flex-1">
							<Pencil class="w-4 h-4 mr-1" /> {{ $t('paymentManagement.edit') }}
						</Button>
						<Button @click="deletePayment(payment)" variant="outline" size="sm" class="flex-1 text-red-600 hover:text-red-700">
							<Trash2 class="w-4 h-4 mr-1" /> {{ $t('paymentManagement.delete') }}
						</Button>
					</div>
				</div>
				<div v-if="filteredPayments.length === 0" class="p-8 text-center text-gray-500">
					{{ $t('paymentManagement.table.empty') }}
				</div>
			</div>

			<!-- Desktop: table -->
			<div class="hidden md:block overflow-x-auto">
				<table class="w-full">
					<thead class="bg-gray-50">
						<tr>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{{ $t('paymentManagement.table.date') }}</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{{ $t('paymentManagement.table.participant') }}</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{{ $t('paymentManagement.table.amount') }}</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{{ $t('paymentManagement.table.method') }}</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{{ $t('paymentManagement.table.reference') }}</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{{ $t('paymentManagement.table.recordedBy') }}</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider no-print">{{ $t('paymentManagement.table.actions') }}</th>
						</tr>
					</thead>
					<tbody class="bg-white divide-y divide-gray-200">
						<tr v-for="payment in filteredPayments" :key="payment.id">
							<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
								{{ formatDate(payment.paymentDate) }}
							</td>
							<td class="px-6 py-4 whitespace-nowrap">
								<div>
									<div class="text-sm font-medium text-gray-900">
										{{ payment.participant?.firstName }} {{ payment.participant?.lastName }}
									</div>
									<div class="text-sm text-gray-500">
										{{ payment.participant?.nickname }}
									</div>
								</div>
							</td>
							<td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">
								{{ formatCurrency(payment.amount) }}
							</td>
							<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
								{{ getPaymentMethodLabel(payment.paymentMethod) }}
							</td>
							<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
								{{ payment.referenceNumber || '-' }}
							</td>
							<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
								{{ payment.recordedByUser?.displayName }}
							</td>
							<td class="px-6 py-4 whitespace-nowrap text-sm font-medium no-print">
								<div class="flex gap-2">
									<Button @click="editPayment(payment)" variant="outline" size="sm">
										<Pencil class="w-4 h-4" />
									</Button>
									<Button @click="deletePayment(payment)" variant="outline" size="sm" class="text-red-600 hover:text-red-700">
										<Trash2 class="w-4 h-4" />
									</Button>
								</div>
							</td>
						</tr>
						<tr v-if="filteredPayments.length === 0">
							<td colspan="7" class="px-6 py-4 text-center text-gray-500">
								{{ $t('paymentManagement.table.empty') }}
							</td>
						</tr>
					</tbody>
				</table>
			</div>
		</div>

		<!-- Add/Edit Payment Modal -->
		<Dialog v-model:open="showPaymentModal" @update:open="handleModalClose">
			<DialogContent class="max-w-md">
				<DialogHeader>
					<DialogTitle>{{ editingPayment ? $t('paymentManagement.modal.editTitle') : $t('paymentManagement.modal.addTitle') }}</DialogTitle>
					<DialogDescription>
						{{ editingPayment ? $t('paymentManagement.modal.editDesc') : $t('paymentManagement.modal.addDesc') }}
					</DialogDescription>
				</DialogHeader>
				<form @submit.prevent="savePayment">
					<div class="space-y-4">
						<div>
							<label class="block text-sm font-medium text-gray-700 mb-1">{{ $t('paymentManagement.modal.participant') }}</label>
							<ParticipantSelect v-model="paymentForm.participantId" :participants="participants" />
						</div>

						<!-- Desglose de cargos + deudas del participante (paz y salvo v2) -->
						<ParticipantDebtManager
							v-if="selectedParticipantObj && activeRetreatId"
							:participant="selectedParticipantObj"
							:retreat-id="activeRetreatId"
							@changed="onDebtsChanged"
						/>

						<div>
							<label class="block text-sm font-medium text-gray-700 mb-1">{{ $t('paymentManagement.modal.amount') }}</label>
							<Input v-model="paymentForm.amount" type="number" step="0.01" min="0" required />
						</div>
						<div>
							<label class="block text-sm font-medium text-gray-700 mb-1">{{ $t('paymentManagement.modal.paymentDate') }}</label>
							<Input v-model="paymentForm.paymentDate" type="date" required />
						</div>
						<div>
							<label class="block text-sm font-medium text-gray-700 mb-1">{{ $t('paymentManagement.modal.method') }}</label>
							<Select v-model="paymentForm.paymentMethod" required>
								<SelectTrigger>
									<SelectValue :placeholder="$t('paymentManagement.modal.selectMethod')" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="cash">{{ $t('paymentManagement.methods.cash') }}</SelectItem>
									<SelectItem value="transfer">{{ $t('paymentManagement.methods.transfer') }}</SelectItem>
									<SelectItem value="check">{{ $t('paymentManagement.methods.check') }}</SelectItem>
									<SelectItem value="card">{{ $t('paymentManagement.methods.card') }}</SelectItem>
									<SelectItem value="other">{{ $t('paymentManagement.methods.other') }}</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div>
							<label class="block text-sm font-medium text-gray-700 mb-1">{{ $t('paymentManagement.modal.reference') }}</label>
							<Input v-model="paymentForm.referenceNumber" />
						</div>
						<div>
							<label class="block text-sm font-medium text-gray-700 mb-1">{{ $t('paymentManagement.modal.notes') }}</label>
							<Textarea v-model="paymentForm.notes" rows="3" />
						</div>
					</div>
					<div class="mt-6 flex flex-col-reverse sm:flex-row sm:justify-between gap-2">
						<Button
							v-if="!editingPayment"
							type="button"
							variant="outline"
							class="text-blue-700 border-blue-300 hover:bg-blue-50"
							:disabled="!paymentForm.participantId || paymentStore.loading || markingScholarship"
							@click="markAsScholarship"
						>
							🎓 {{ $t('paymentManagement.modal.markScholarship') }}
						</Button>
						<div v-else></div>
						<div class="flex justify-end gap-2">
							<Button type="button" variant="outline" @click="closePaymentModal">
								{{ $t('paymentManagement.modal.cancel') }}
							</Button>
							<Button type="submit" :disabled="paymentStore.loading">
								{{ editingPayment ? $t('paymentManagement.modal.update') : $t('paymentManagement.modal.save') }}
							</Button>
						</div>
					</div>
				</form>
			</DialogContent>
		</Dialog>

		<!-- Add Charge (deuda) Modal -->
		<Dialog v-model:open="showDebtModal">
			<DialogContent class="max-w-md">
				<DialogHeader>
					<DialogTitle>{{ $t('paymentManagement.debtModal.title') }}</DialogTitle>
					<DialogDescription>
						{{ $t('paymentManagement.debtModal.desc') }}
					</DialogDescription>
				</DialogHeader>
				<div class="space-y-4">
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1">{{ $t('paymentManagement.modal.participant') }}</label>
						<ParticipantSelect
							v-model="debtParticipantId"
							:participants="serverAngelitoParticipants"
							:placeholder="$t('paymentManagement.debtModal.searchPlaceholder')"
							:empty-text="$t('paymentManagement.debtModal.empty')"
						/>
					</div>

					<!-- Desglose + alta/edición de cobros del participante seleccionado -->
					<ParticipantDebtManager
						v-if="selectedDebtParticipantObj && activeRetreatId"
						:participant="selectedDebtParticipantObj"
						:retreat-id="activeRetreatId"
						@changed="onDebtsChanged"
					/>
					<p v-else class="text-sm text-gray-500">
						{{ $t('paymentManagement.debtModal.selectPrompt') }}
					</p>
				</div>
				<div class="mt-6 flex justify-end">
					<Button type="button" variant="outline" @click="showDebtModal = false">{{ $t('paymentManagement.debtModal.close') }}</Button>
				</div>
			</DialogContent>
		</Dialog>

		<!-- Delete Confirmation Dialog -->
		<Dialog v-model:open="showDeleteDialog">
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{{ $t('paymentManagement.deleteDialog.title') }}</DialogTitle>
					<DialogDescription>
						{{ $t('paymentManagement.deleteDialog.message') }}
					</DialogDescription>
				</DialogHeader>
				<div class="mt-4 flex justify-end gap-2">
					<Button variant="outline" @click="showDeleteDialog = false">{{ $t('paymentManagement.deleteDialog.cancel') }}</Button>
					<Button variant="destructive" @click="confirmDelete" :disabled="paymentStore.loading">
						{{ $t('paymentManagement.deleteDialog.confirm') }}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	</div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { usePaymentStore } from '@/stores/paymentStore';
import { useRetreatStore } from '@/stores/retreatStore';
import { useParticipantStore } from '@/stores/participantStore';
import { useAuthStore } from '@/stores/authStore';
import {
	Button,
	Input,
	Textarea,
	Select,
	SelectTrigger,
	SelectValue,
	SelectContent,
	SelectItem,
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from '@repo/ui';
import {
	Plus,
	Search,
	X,
	DollarSign,
	Receipt,
	Wallet,
	UserCheck,
	Pencil,
	Trash2,
	Printer,
} from 'lucide-vue-next';
import type { Payment, CreatePayment, UpdatePayment } from '@repo/types';
import { formatDate, formatCurrency } from '@repo/utils';
import ParticipantDebtManager from '@/components/ParticipantDebtManager.vue';
import ParticipantSelect from '@/components/ParticipantSelect.vue';

const { t } = useI18n();
const paymentStore = usePaymentStore();
const retreatStore = useRetreatStore();
const participantStore = useParticipantStore();
const authStore = useAuthStore();

// State
const showPaymentModal = ref(false);
// Estado del diálogo "Agregar cobro" (deudas)
const showDebtModal = ref(false);
const debtParticipantId = ref('');
const showDeleteDialog = ref(false);
const editingPayment = ref<Payment | null>(null);
const deletingPayment = ref<Payment | null>(null);
const summary = ref<any>(null);
const markingScholarship = ref(false);

const filters = ref({
	paymentMethod: '',
	startDate: '',
	endDate: '',
	search: '',
});

const activeRetreatId = computed(() => retreatStore.selectedRetreatId || '');
const buildFetchFilters = () => ({
	...filters.value,
	retreatId: activeRetreatId.value,
});

const paymentForm = ref({
	participantId: '',
	amount: '',
	paymentDate: new Date().toISOString().split('T')[0],
	paymentMethod: 'cash',
	referenceNumber: '',
	notes: '',
});

// Computed
const retreats = computed(() => retreatStore.retreats);
const participants = computed(() => participantStore.participants);

const selectedParticipantObj = computed(() =>
	participants.value.find((x: any) => x.id === paymentForm.value.participantId) || null,
);

// --- Diálogo "Agregar cobro" (deudas): solo servidores y angelitos ---
const serverAngelitoParticipants = computed(() =>
	participants.value.filter(
		(p: any) => p.type === 'server' || p.type === 'partial_server',
	),
);

const selectedDebtParticipantObj = computed(
	() => participants.value.find((x: any) => x.id === debtParticipantId.value) || null,
);

const openAddDebtModal = () => {
	debtParticipantId.value = '';
	showDebtModal.value = true;
};

const filteredPayments = computed(() => {
	let payments = paymentStore.payments;

	if (activeRetreatId.value) {
		payments = payments.filter(p => p.retreatId === activeRetreatId.value);
	}

	if (filters.value.paymentMethod) {
		payments = payments.filter(p => p.paymentMethod === filters.value.paymentMethod);
	}

	if (filters.value.startDate) {
		payments = payments.filter(p => new Date(p.paymentDate) >= new Date(filters.value.startDate));
	}

	if (filters.value.endDate) {
		payments = payments.filter(p => new Date(p.paymentDate) <= new Date(filters.value.endDate));
	}

	if (filters.value.search) {
		const q = filters.value.search.trim().toLowerCase();
		if (q) {
			payments = payments.filter(p => {
				const first = (p.participant?.firstName || '').toLowerCase();
				const last = (p.participant?.lastName || '').toLowerCase();
				const nick = (p.participant?.nickname || '').toLowerCase();
				return (
					first.includes(q) ||
					last.includes(q) ||
					nick.includes(q) ||
					`${first} ${last}`.includes(q)
				);
			});
		}
	}

	return payments;
});

const selectedRetreatLabel = computed(() => {
	const r = retreats.value.find((x: any) => x.id === activeRetreatId.value);
	return r ? `${r.parish} - ${formatDate(r.startDate)}` : '';
});

const printReport = () => {
	window.print();
};

// Methods
const getPaymentMethodLabel = (method: string) => {
	const known = ['cash', 'transfer', 'check', 'card', 'other'];
	return known.includes(method) ? t(`paymentManagement.methods.${method}`) : method;
};

const openAddPaymentModal = () => {
	editingPayment.value = null;
	resetPaymentForm();
	showPaymentModal.value = true;
};

// Acceso programático desde la pestaña Saldos (PaymentsView): abrir los modales
// con un participante ya preseleccionado.
const openPaymentFor = (participantId: string) => {
	editingPayment.value = null;
	resetPaymentForm();
	paymentForm.value.participantId = participantId;
	showPaymentModal.value = true;
};

const openChargeFor = (participantId: string) => {
	debtParticipantId.value = participantId;
	showDebtModal.value = true;
};

defineExpose({ openPaymentFor, openChargeFor });

const editPayment = (payment: Payment) => {
	editingPayment.value = payment;
	paymentForm.value = {
		participantId: payment.participantId,
		amount: payment.amount.toString(),
		paymentDate: new Date(payment.paymentDate).toISOString().split('T')[0],
		paymentMethod: payment.paymentMethod,
		referenceNumber: payment.referenceNumber || '',
		notes: payment.notes || '',
	};
	showPaymentModal.value = true;
};

const closePaymentModal = () => {
	showPaymentModal.value = false;
	resetPaymentForm();
};

const resetPaymentForm = () => {
	paymentForm.value = {
		participantId: '',
		amount: '',
		paymentDate: new Date().toISOString().split('T')[0],
		paymentMethod: 'cash',
		referenceNumber: '',
		notes: '',
	};
};

const handleModalClose = (open: boolean) => {
	if (!open) {
		closePaymentModal();
	}
};

const savePayment = async () => {
	try {
		const paymentData = {
			...paymentForm.value,
			amount: parseFloat(paymentForm.value.amount),
			paymentDate: new Date(paymentForm.value.paymentDate),
			// Bind payment to the retreat selected in the sidebar, not the
			// participant's primary retreat.
			retreatId: activeRetreatId.value,
		};

		if (editingPayment.value) {
			await paymentStore.updatePaymentById(editingPayment.value.id, paymentData);
		} else {
			await paymentStore.addPayment(paymentData);
		}

		closePaymentModal();
		loadSummary();
	} catch (error) {
		console.error('Error saving payment:', error);
	}
};

// Tras agregar/editar/eliminar una deuda: refrescar participantes (para recomputar
// el desglose chargeBreakdown) y el resumen del retiro.
const onDebtsChanged = async () => {
	await participantStore.fetchParticipants();
	loadSummary();
};

const markAsScholarship = async () => {
	const participantId = paymentForm.value.participantId;
	if (!participantId) return;

	const participant = participants.value.find((p: any) => p.id === participantId);
	const name = participant
		? `${participant.firstName} ${participant.lastName}`.trim()
		: 'este participante';

	if (!window.confirm(`¿Marcar a ${name} como becado? No se registrará un pago parcial.`)) {
		return;
	}

	try {
		markingScholarship.value = true;
		await participantStore.updateParticipant(participantId, {
			isScholarship: true,
			contextRetreatId: activeRetreatId.value,
		} as any);
		closePaymentModal();
		await participantStore.fetchParticipants();
		loadSummary();
	} catch (error) {
		console.error('Error marking participant as scholarship:', error);
	} finally {
		markingScholarship.value = false;
	}
};

const deletePayment = (payment: Payment) => {
	deletingPayment.value = payment;
	showDeleteDialog.value = true;
};

const confirmDelete = async () => {
	if (deletingPayment.value) {
		try {
			await paymentStore.removePayment(deletingPayment.value.id);
			showDeleteDialog.value = false;
			deletingPayment.value = null;
			loadSummary();
		} catch (error) {
			console.error('Error deleting payment:', error);
		}
	}
};

const applyFilters = async () => {
	await paymentStore.fetchPayments(buildFetchFilters());
	loadSummary();
};

const clearFilters = () => {
	filters.value = {
		paymentMethod: '',
		startDate: '',
		endDate: '',
		search: '',
	};
	paymentStore.fetchPayments(buildFetchFilters());
};

const loadSummary = async () => {
	if (activeRetreatId.value) {
		try {
			summary.value = await paymentStore.getPaymentSummary(activeRetreatId.value);
		} catch (error) {
			console.error('Error loading summary:', error);
		}
	} else {
		summary.value = null;
	}
};

// Lifecycle
onMounted(async () => {
	await retreatStore.fetchRetreats();

	if (retreatStore.selectedRetreatId) {
		participantStore.filters.retreatId = retreatStore.selectedRetreatId;
	}

	await participantStore.fetchParticipants();

	if (activeRetreatId.value) {
		await paymentStore.fetchPayments(buildFetchFilters());
		loadSummary();
	} else {
		await paymentStore.fetchPayments();
	}
});

// Watch for sidebar retreat selection changes
watch(() => retreatStore.selectedRetreatId, async (newId) => {
	participantStore.filters.retreatId = newId || '';
	await participantStore.fetchParticipants();
	if (newId) {
		await paymentStore.fetchPayments(buildFetchFilters());
		loadSummary();
	} else {
		summary.value = null;
		await paymentStore.fetchPayments();
	}
});
</script>

<style scoped>
.print-only {
	display: none;
}

@media print {
	.no-print {
		display: none !important;
	}
	.print-only {
		display: block;
	}
	tr.print-only {
		display: table-row;
	}
	.payment-management {
		background: white;
	}
	.shadow,
	.rounded-lg {
		box-shadow: none !important;
		border-radius: 0 !important;
	}
	table {
		font-size: 11px;
	}
	th,
	td {
		padding: 4px 8px !important;
	}
}
</style>
