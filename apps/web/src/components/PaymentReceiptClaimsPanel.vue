<template>
	<div class="space-y-3">
		<!-- Filtros de estado -->
		<div class="flex flex-wrap items-center gap-2">
			<Button
				v-for="filter in statusFilters"
				:key="filter.value"
				variant="ghost"
				size="sm"
				class="border"
				:class="{ 'bg-muted': activeStatus === filter.value }"
				@click="setStatus(filter.value)"
			>
				{{ filter.label }} ({{ counts[filter.value] ?? 0 }})
			</Button>
			<Button variant="ghost" size="sm" class="border" @click="refresh">
				{{ t('paymentClaims.refresh') }}
			</Button>
			<Button variant="outline" size="sm" class="ml-auto" @click="openShare">
				<Share2 class="mr-1 h-4 w-4" />
				{{ t('paymentClaims.share.open') }}
			</Button>
		</div>

		<!-- Difusión de links por participante (patrón LettersShareDialog) -->
		<Dialog :open="shareOpen" @update:open="shareOpen = $event">
			<DialogContent class="max-w-2xl max-h-[80vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>{{ t('paymentClaims.share.title') }}</DialogTitle>
				</DialogHeader>
				<p class="text-sm text-muted-foreground">{{ t('paymentClaims.share.description') }}</p>
				<div class="space-y-2">
					<div
						v-for="entry in shareLinks"
						:key="entry.participantId"
						class="flex items-center justify-between gap-2 rounded border p-2"
					>
						<span class="font-medium text-sm">{{ entry.participantName }}</span>
						<div class="flex items-center gap-1">
							<code class="text-xs bg-muted rounded px-1.5 py-0.5 max-w-[220px] truncate">
								{{ entry.link }}
							</code>
							<Button variant="ghost" size="icon" @click="copyLink(entry)">
								<Copy class="h-4 w-4" />
							</Button>
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>

		<div v-if="loading" class="py-10 text-center text-sm text-muted-foreground">
			{{ t('common.loading') }}
		</div>
		<div
			v-else-if="filteredClaims.length === 0"
			class="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground"
		>
			{{ t('paymentClaims.empty') }}
		</div>

		<div v-else class="space-y-2">
			<div v-for="claim in filteredClaims" :key="claim.id" class="rounded-lg border p-3">
				<div class="flex flex-wrap items-start justify-between gap-3">
					<div class="min-w-0 flex-1">
						<div class="flex flex-wrap items-center gap-2">
							<span class="font-medium">{{ claim.participantName }}</span>
							<Badge :variant="statusVariant(claim.status)">
								{{ t(`paymentClaims.status.${claim.status}`) }}
							</Badge>
						</div>
						<div class="mt-1 text-sm text-muted-foreground">
							<template v-if="claim.amountClaimed != null">
								💰 {{ formatMoney(claim.amountClaimed) }} ·
							</template>
							<template v-if="claim.participantBalance != null">
								Saldo pendiente: {{ formatMoney(claim.participantBalance) }} ·
							</template>
							{{ formatDate(claim.createdAt) }}
							<template v-if="claim.senderContact"> · {{ claim.senderContact }}</template>
						</div>
						<p v-if="claim.reference" class="mt-1 text-sm">
							Ref: {{ claim.reference }}
						</p>
						<p v-if="claim.note" class="mt-1 text-sm text-muted-foreground">
							{{ claim.note }}
						</p>
						<p v-if="claim.status === 'attached' && claim.attachedPaymentId" class="mt-1 text-xs text-muted-foreground">
							{{ t('paymentClaims.attachedTo') }}: {{ claim.attachedPaymentId.slice(0, 8) }}…
						</p>
					</div>
					<img
						:src="claim.photoUrl"
						:alt="t('paymentClaims.receiptAlt')"
						class="h-20 w-28 object-contain border rounded cursor-zoom-in bg-white"
						@click="viewerUrl = claim.photoUrl"
					/>
				</div>

				<!-- Aplicar: mini-form pre-llenado (solo pendientes) -->
				<div v-if="claim.status === 'pending'" class="mt-3 border-t pt-3" :data-testid="`claim-apply-${claim.id}`">
					<div class="flex flex-wrap items-end gap-2">
						<label class="text-xs text-muted-foreground">
							{{ t('paymentClaims.amountLabel') }}
							<input
								v-model="applyForms[claim.id].amount"
								type="number"
								min="1"
								step="0.01"
								class="block w-32 border rounded px-2 py-1 text-sm"
							/>
						</label>
						<label class="text-xs text-muted-foreground">
							{{ t('paymentClaims.methodLabel') }}
							<select
								v-model="applyForms[claim.id].paymentMethod"
								class="block border rounded px-2 py-1.5 text-sm"
							>
								<option value="transfer">{{ t('paymentClaims.method.transfer') }}</option>
								<option value="cash">{{ t('paymentClaims.method.cash') }}</option>
								<option value="check">{{ t('paymentClaims.method.check') }}</option>
								<option value="card">{{ t('paymentClaims.method.card') }}</option>
								<option value="other">{{ t('paymentClaims.method.other') }}</option>
							</select>
						</label>
						<Button size="sm" :disabled="applying === claim.id" @click="askConfirm(claim)">
							<Stamp class="mr-1 h-4 w-4" />
							{{ t('paymentClaims.apply') }}
						</Button>
						<Button size="sm" variant="ghost" :disabled="applying === claim.id" @click="dismiss(claim)">
							{{ t('paymentClaims.dismiss') }}
						</Button>
					</div>
				</div>
			</div>
		</div>

		<!-- Visor de foto -->
		<Dialog :open="!!viewerUrl" @update:open="viewerUrl = $event ? viewerUrl : null">
			<DialogContent class="max-w-3xl">
				<img v-if="viewerUrl" :src="viewerUrl" alt="" class="max-h-[80vh] w-full object-contain" />
			</DialogContent>
		</Dialog>

		<!-- Confirmación con resumen antes de crear el pago (item 13) -->
		<Dialog :open="!!confirmClaim" @update:open="confirmClaim = $event ? confirmClaim : null">
			<DialogContent class="max-w-md">
				<DialogHeader>
					<DialogTitle>{{ t('paymentClaims.confirm.title') }}</DialogTitle>
				</DialogHeader>
				<div v-if="confirmClaim" class="space-y-1 text-sm" data-testid="claim-confirm-summary">
					<p>
						<strong>{{ confirmClaim.participantName }}</strong>
					</p>
					<p>
						{{ t('paymentClaims.confirm.amount') }}:
						<strong>{{ formatMoney(Number(applyForms[confirmClaim.id]?.amount ?? 0)) }}</strong>
					</p>
					<p>
						{{ t('paymentClaims.confirm.method') }}:
						{{ t(`paymentClaims.method.${applyForms[confirmClaim.id]?.paymentMethod ?? 'transfer'}`) }}
					</p>
				</div>
				<DialogFooter>
					<Button variant="outline" @click="confirmClaim = null">
						{{ t('common.cancel') }}
					</Button>
					<Button :disabled="applying !== null" @click="confirmApply">
						{{ t('paymentClaims.confirm.create') }}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useToast } from '@repo/ui';
import { Badge } from '@repo/ui';
import { Button } from '@repo/ui';
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@repo/ui';
import { Copy, Share2, Stamp } from 'lucide-vue-next';
import {
	receiptClaimsApi,
	type ReceiptClaim,
} from '@/services/api';
import { useRetreatStore } from '@/stores/retreatStore';

const route = useRoute();
const { t } = useI18n();
const { toast } = useToast();

const retreatStore = useRetreatStore();
const retreatId = () => (route.params.id as string) || retreatStore.selectedRetreatId || '';

const shareOpen = ref(false);
const shareLinks = ref<{ participantId: string; participantName: string; link: string }[]>([]);

const openShare = async () => {
	shareOpen.value = true;
	try {
		shareLinks.value = await receiptClaimsApi.getLinks(retreatId());
	} catch {
		toast({ title: t('paymentClaims.shareError'), variant: 'destructive' });
	}
};

const copyLink = async (entry: { participantName: string; link: string }) => {
	await navigator.clipboard.writeText(
		`${entry.participantName}: ${entry.link}`,
	);
	toast({ title: t('paymentClaims.share.copied') });
};

const claims = ref<ReceiptClaim[]>([]);
const loading = ref(false);
const applying = ref<string | null>(null);
const viewerUrl = ref<string | null>(null);
const activeStatus = ref<'pending' | 'attached' | 'dismissed' | ''>('');

const applyForms = reactive<Record<string, { amount: string; paymentMethod: string }>>({});

const counts = computed(() => {
	const map: Record<string, number> = { pending: 0, attached: 0, dismissed: 0 };
	for (const claim of claims.value) map[claim.status] = (map[claim.status] ?? 0) + 1;
	return map;
});

const filteredClaims = computed(() =>
	activeStatus.value ? claims.value.filter((c) => c.status === activeStatus.value) : claims.value,
);

const refresh = async () => {
	if (!retreatId()) return;
	loading.value = true;
	try {
		claims.value = await receiptClaimsApi.list(retreatId());
		for (const claim of claims.value) {
			if (!applyForms[claim.id]) {
				// Pre-llenar con el SALDO pendiente (suele ser el monto correcto);
				// si la familia declaró otro monto, queda a la vista para ajustar.
				const suggested =
					claim.participantBalance != null && claim.participantBalance > 0
						? claim.participantBalance
						: claim.amountClaimed;
				applyForms[claim.id] = {
					amount: suggested != null ? String(suggested) : '',
					paymentMethod: 'transfer',
				};
			}
		}
	} finally {
		loading.value = false;
	}
};

onMounted(() => {
	refresh();
});

const setStatus = (value: 'pending' | 'attached' | 'dismissed' | '') => {
	activeStatus.value = activeStatus.value === value ? '' : value;
};

// Confirmación con resumen antes de crear el pago (item 13): participante,
// monto y método en un dialog — crear un pago es dinero.
const confirmClaim = ref<ReceiptClaim | null>(null);

const askConfirm = (claim: ReceiptClaim) => {
	const form = applyForms[claim.id];
	if (!Number(form.amount)) {
		toast({ title: t('paymentClaims.amountRequired'), variant: 'destructive' });
		return;
	}
	confirmClaim.value = claim;
};

const confirmApply = async () => {
	if (!confirmClaim.value) return;
	const claim = confirmClaim.value;
	const form = applyForms[claim.id];
	confirmClaim.value = null;
	applying.value = claim.id;
	try {
		const result = await receiptClaimsApi.apply(claim.id, {
			amount: Number(form.amount),
			paymentMethod: form.paymentMethod,
		});
		toast({
			title: t('paymentClaims.appliedTitle'),
			description: t('paymentClaims.appliedDescription', { paymentId: result.paymentId }),
		});
		await refresh();
	} catch {
		toast({ title: t('paymentClaims.applyError'), variant: 'destructive' });
	} finally {
		applying.value = null;
	}
};

const dismiss = async (claim: ReceiptClaim) => {
	applying.value = claim.id;
	try {
		await receiptClaimsApi.dismiss(claim.id);
		await refresh();
		toast({ title: t('paymentClaims.dismissedTitle') });
	} catch {
		toast({ title: t('paymentClaims.dismissError'), variant: 'destructive' });
	} finally {
		applying.value = null;
	}
};

const statusVariant = (status: ReceiptClaim['status']): 'default' | 'secondary' | 'outline' => {
	if (status === 'attached') return 'default';
	if (status === 'dismissed') return 'outline';
	return 'secondary';
};

const formatMoney = (value: number): string =>
	new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value);

const formatDate = (value: string): string =>
	new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short' }).format(
		new Date(value),
	);

const statusFilters = computed(() => [
	{ value: 'pending' as const, label: t('paymentClaims.status.pending') },
	{ value: 'attached' as const, label: t('paymentClaims.status.attached') },
	{ value: 'dismissed' as const, label: t('paymentClaims.status.dismissed') },
]);
</script>
