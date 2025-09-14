<template>
	<div class="payment-management">
		<!-- Header -->
		<div class="flex justify-between items-center mb-6">
			<div>
				<h2 class="text-2xl font-bold">Gestión de Pagos</h2>
				<p class="text-gray-600">Registro y seguimiento de pagos de participantes</p>
			</div>
			<Button @click="openAddPaymentModal" class="bg-blue-600 hover:bg-blue-700">
				<Plus class="w-4 h-4 mr-2" />
				Agregar Pago
			</Button>
		</div>

		<!-- Filters -->
		<div class="bg-white p-4 rounded-lg shadow mb-6">
			<div class="grid grid-cols-1 md:grid-cols-4 gap-4">
				<div>
					<label class="block text-sm font-medium text-gray-700 mb-1">Retiro</label>
					<Select v-model="filters.retreatId">
						<SelectTrigger>
							<SelectValue placeholder="Seleccionar retiro" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem v-for="retreat in retreats" :key="retreat.id" :value="retreat.id">
								{{ retreat.parish }} - {{ formatDate(retreat.startDate) }}
							</SelectItem>
						</SelectContent>
					</Select>
				</div>
				<div>
					<label class="block text-sm font-medium text-gray-700 mb-1">Método de Pago</label>
					<Select v-model="filters.paymentMethod">
						<SelectTrigger>
							<SelectValue placeholder="Todos los métodos" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="">Todos los métodos</SelectItem>
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
		<div v-if="summary" class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
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
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
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
							<td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
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
					<div class="mt-6 flex justify-end gap-2">
						<Button type="button" variant="outline" @click="closePaymentModal">
							Cancelar
						</Button>
						<Button type="submit" :disabled="paymentStore.loading">
							{{ editingPayment ? 'Actualizar' : 'Guardar' }}
						</Button>
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
} from 'lucide-vue-next';
import type { Payment, CreatePayment, UpdatePayment } from '@repo/types';

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

const filters = ref({
	retreatId: '',
	paymentMethod: '',
	startDate: '',
	endDate: '',
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

	if (filters.value.retreatId) {
		payments = payments.filter(p => p.retreatId === filters.value.retreatId);
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

	return payments;
});

// Methods
const formatDate = (date: string | Date) => {
	return new Date(date).toLocaleDateString('es-ES');
};

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
	await paymentStore.fetchPayments(filters.value);
	loadSummary();
};

const clearFilters = () => {
	filters.value = {
		retreatId: '',
		paymentMethod: '',
		startDate: '',
		endDate: '',
	};
	paymentStore.fetchPayments();
};

const loadSummary = async () => {
	if (filters.value.retreatId) {
		try {
			summary.value = await paymentStore.getPaymentSummary(filters.value.retreatId);
		} catch (error) {
			console.error('Error loading summary:', error);
		}
	}
};

// Lifecycle
onMounted(async () => {
	await Promise.all([
		retreatStore.fetchRetreats(),
		participantStore.fetchParticipants(),
		paymentStore.fetchPayments(),
	]);
});

// Watch for retreat filter changes
watch(() => filters.value.retreatId, () => {
	if (filters.value.retreatId) {
		loadSummary();
	}
});
</script>