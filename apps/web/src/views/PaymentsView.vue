<template>
	<div class="payments-view">
		<Tabs v-model="activeTab" class="w-full">
			<TabsList class="grid w-full sm:w-auto sm:inline-grid grid-cols-2 h-11 mb-3 sm:mb-4 no-print rounded-xl">
				<TabsTrigger value="balances" class="gap-2 px-4 rounded-lg">
					<Scale class="w-4 h-4" />
					{{ $t('paymentManagement.tabs.balances') }}
				</TabsTrigger>
				<TabsTrigger value="payments" class="gap-2 px-4 rounded-lg">
					<Receipt class="w-4 h-4" />
					{{ $t('paymentManagement.tabs.payments') }}
				</TabsTrigger>
			</TabsList>

			<TabsContent value="balances">
				<ParticipantBalances
					@register-payment="onRegisterPayment"
					@add-charge="onAddCharge"
				/>
			</TabsContent>
			<TabsContent value="payments">
				<PaymentManagement ref="paymentManagementRef" />
			</TabsContent>
		</Tabs>
	</div>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@repo/ui';
import { Receipt, Scale } from 'lucide-vue-next';
import PaymentManagement from '@/components/PaymentManagement.vue';
import ParticipantBalances from '@/components/ParticipantBalances.vue';

// Saldos es la pestaña principal: es la vista de trabajo del tesorero.
const activeTab = ref('balances');
const paymentManagementRef = ref<InstanceType<typeof PaymentManagement> | null>(null);

// Acciones rápidas desde Saldos: cambiar a la pestaña Pagos (para montar el
// componente) y abrir el modal con el participante preseleccionado.
const onRegisterPayment = async (participantId: string) => {
	activeTab.value = 'payments';
	await nextTick();
	paymentManagementRef.value?.openPaymentFor(participantId);
};

const onAddCharge = async (participantId: string) => {
	activeTab.value = 'payments';
	await nextTick();
	paymentManagementRef.value?.openChargeFor(participantId);
};
</script>
