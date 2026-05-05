<template>
	<div class="payment-management">
		<!-- Header -->
		<div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 no-print">
			<div>
				<h2 class="text-2xl font-bold">Gestión de Pagos</h2>
				<p class="text-gray-600">Registro y seguimiento de pagos de participantes</p>
			</div>
			<div class="flex gap-2">
				<Button @click="printReport" variant="outline">
					<Printer class="w-4 h-4 mr-2" />
					Imprimir
				</Button>
				<Button @click="openAddPaymentModal" class="bg-blue-600 hover:bg-blue-700">
					<Plus class="w-4 h-4 mr-2" />
					Agregar Pago
				</Button>
			</div>
		</div>

		<!-- Print header (only visible when printing) -->
		<div class="print-only mb-4">
			<h1 class="text-2xl font-bold">Reporte de Pagos</h1>
			<p v-if="selectedRetreatLabel" class="text-sm">{{ selectedRetreatLabel }}</p>
			<p class="text-sm text-gray-600">Generado: {{ formatDate(new Date()) }}</p>
		</div>

		<!-- Filters -->
		<div class="bg-white p-4 rounded-lg shadow mb-6 no-print">
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
				<div class="sm:col-span-2 lg:col-span-3">
					<label class="block text-sm font-medium text-gray-700 mb-1">Buscar por nombre</label>
					<Input
						v-model="filters.search"
						type="text"
						placeholder="Nombre, apellido o apodo del participante"
					/>
				</div>
				<div>
					<label class="block text-sm font-medium text-gray-700 mb-1">Método de Pago</label>
						<Select v-model="filters.paymentMethod">
							<SelectTrigger>
								<SelectValue placeholder="Todos los métodos" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="cash">Efectivo</SelectItem>
								<SelectItem value="transfer">Transferencia</SelectItem>
								<SelectItem value="check">Cheque</SelectItem>
								<SelectItem value="card">Tarjeta</SelectItem>
								<SelectItem value="other">Otro</SelectItem>
							</SelectContent>
						</Select>
				</div>
				<div>
					<label class="block text-sm font-medium text-gray-700 mb-1">Fecha Inicio</label>
					<Input v-model="filters.startDate" type="date" />
				</div>
				<div>
					<label class="block text-sm font-medium text-gray-700 mb-1">Fecha Fin</label>
					<Input v-model="filters.endDate" type="date" />
				</div>
			</div>
			<div class="mt-4 flex gap-2">
				<Button @click="applyFilters" :disabled="paymentStore.loading">
					<Search class="w-4 h-4 mr-2" />
					Buscar
				</Button>
				<Button @click="clearFilters" variant="outline">
					<X class="w-4 h-4 mr-2" />
					Limpiar
				</Button>
			</div>
		</div>

		<!-- Summary Cards -->
		<div v-if="summary" class="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
			<div class="bg-white p-4 rounded-lg shadow">
				<div class="flex items-center">
					<DollarSign class="w-8 h-8 text-green-600" />
					<div class="ml-3">
						<p class="text-sm font-medium text-gray-600">Total Recaudado</p>
						<p class="text-2xl font-bold">${{ formatCurrency(summary.totalPaid) }}</p>
					</div>
				</div>
			</div>
			<div class="bg-white p-4 rounded-lg shadow">
				<div class="flex items-center">
					<Receipt class="w-8 h-8 text-blue-600" />
					<div class="ml-3">
						<p class="text-sm font-medium text-gray-600">Total Pagos</p>
						<p class="text-2xl font-bold">{{ summary.totalPayments }}</p>
					</div>
				</div>
			</div>
			<div class="bg-white p-4 rounded-lg shadow">
				<div class="flex items-center">
					<Users class="w-8 h-8 text-purple-600" />
					<div class="ml-3">
						<p class="text-sm font-medium text-gray-600">Participantes con Pagos</p>
						<p class="text-2xl font-bold">{{ summary.participantsWithPayments }}</p>
					</div>
				</div>
			</div>
			<div class="bg-white p-4 rounded-lg shadow">
				<div class="flex items-center">
					<UserCheck class="w-8 h-8 text-orange-600" />
					<div class="ml-3">
						<p class="text-sm font-medium text-gray-600">Total Participantes</p>
						<p class="text-2xl font-bold">{{ summary.totalParticipants }}</p>
					</div>
				</div>
			</div>
		</div>

		<!-- Payments Table -->
		<div class="bg-white rounded-lg shadow">
			<div class="p-4 border-b">
				<h3 class="text-lg font-semibold">Pagos Registrados</h3>
			</div>
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead class="bg-gray-50">
						<tr>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Participante</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Monto</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Método</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Referencia</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Registrado por</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider no-print">Acciones</th>
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
								${{ formatCurrency(payment.amount) }}
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
								No se encontraron pagos
							</td>
						</tr>
						<tr v-if="filteredPayments.length > 0" class="print-only font-semibold bg-gray-50">
							<td colspan="2" class="px-6 py-3 text-sm">Total</td>
							<td class="px-6 py-3 text-sm text-green-700">${{ formatCurrency(printTotal) }}</td>
							<td colspan="4"></td>
						</tr>
					</tbody>
				</table>
			</div>
		</div>

		<!-- Add/Edit Payment Modal -->
		<Dialog v-model:open="showPaymentModal" @update:open="handleModalClose">
			<DialogContent class="max-w-md">
				<DialogHeader>
					<DialogTitle>{{ editingPayment ? 'Editar Pago' : 'Agregar Pago' }}</DialogTitle>
					<DialogDescription>
						{{ editingPayment ? 'Modifica los datos del pago' : 'Registra un nuevo pago' }}
					</DialogDescription>
				</DialogHeader>
				<form @submit.prevent="savePayment">
					<div class="space-y-4">
						<div>
							<label class="block text-sm font-medium text-gray-700 mb-1">Participante</label>
							<Select v-model="paymentForm.participantId" required>
								<SelectTrigger>
									<SelectValue placeholder="Seleccionar participante" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem v-for="participant in participants" :key="participant.id" :value="participant.id">
										{{ participant.firstName }} {{ participant.lastName }} ({{ participant.nickname }})
									</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div>
							<label class="block text-sm font-medium text-gray-700 mb-1">Monto</label>
							<Input v-model="paymentForm.amount" type="number" step="0.01" min="0" required />
						</div>
						<div>
							<label class="block text-sm font-medium text-gray-700 mb-1">Fecha de Pago</label>
							<Input v-model="paymentForm.paymentDate" type="date" required />
						</div>
						<div>
							<label class="block text-sm font-medium text-gray-700 mb-1">Método de Pago</label>
							<Select v-model="paymentForm.paymentMethod" required>
								<SelectTrigger>
									<SelectValue placeholder="Seleccionar método" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="cash">Efectivo</SelectItem>
									<SelectItem value="transfer">Transferencia</SelectItem>
									<SelectItem value="check">Cheque</SelectItem>
									<SelectItem value="card">Tarjeta</SelectItem>
									<SelectItem value="other">Otro</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div>
							<label class="block text-sm font-medium text-gray-700 mb-1">Número de Referencia</label>
							<Input v-model="paymentForm.referenceNumber" />
						</div>
						<div>
							<label class="block text-sm font-medium text-gray-700 mb-1">Notas</label>
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
							🎓 Marcar como Becado
						</Button>
						<div v-else></div>
						<div class="flex justify-end gap-2">
							<Button type="button" variant="outline" @click="closePaymentModal">
								Cancelar
							</Button>
							<Button type="submit" :disabled="paymentStore.loading">
								{{ editingPayment ? 'Actualizar' : 'Guardar' }}
							</Button>
						</div>
					</div>
				</form>
			</DialogContent>
		</Dialog>

		<!-- Delete Confirmation Dialog -->
		<Dialog v-model:open="showDeleteDialog">
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Confirmar Eliminación</DialogTitle>
					<DialogDescription>
						¿Estás seguro de que deseas eliminar este pago? Esta acción no se puede deshacer.
					</DialogDescription>
				</DialogHeader>
				<div class="mt-4 flex justify-end gap-2">
					<Button variant="outline" @click="showDeleteDialog = false">Cancelar</Button>
					<Button variant="destructive" @click="confirmDelete" :disabled="paymentStore.loading">
						Eliminar
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	</div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
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
	Users,
	UserCheck,
	Pencil,
	Trash2,
	Printer,
} from 'lucide-vue-next';
import type { Payment, CreatePayment, UpdatePayment } from '@repo/types';
import { formatDate } from '@repo/utils';

const paymentStore = usePaymentStore();
const retreatStore = useRetreatStore();
const participantStore = useParticipantStore();
const authStore = useAuthStore();

// State
const showPaymentModal = ref(false);
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

const printTotal = computed(() =>
	filteredPayments.value.reduce((sum, p) => sum + Number(p.amount || 0), 0),
);

const selectedRetreatLabel = computed(() => {
	const r = retreats.value.find((x: any) => x.id === activeRetreatId.value);
	return r ? `${r.parish} - ${formatDate(r.startDate)}` : '';
});

const printReport = () => {
	window.print();
};

// Methods
const formatCurrency = (amount: number) => {
	return amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const getPaymentMethodLabel = (method: string) => {
	const labels = {
		cash: 'Efectivo',
		transfer: 'Transferencia',
		check: 'Cheque',
		card: 'Tarjeta',
		other: 'Otro',
	};
	return labels[method as keyof typeof labels] || method;
};

const openAddPaymentModal = () => {
	editingPayment.value = null;
	resetPaymentForm();
	showPaymentModal.value = true;
};

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
