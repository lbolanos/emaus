import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useParticipantStore } from '@/stores/participantStore';
import { useRetreatStore } from '@/stores/retreatStore';
import { useAuthPermissions } from '@/composables/useAuthPermissions';

/**
 * Shared logic for the "pays at the retreat house" toggle (specs/pays-at-house).
 * One composable, three surfaces: the balances table, the payment modal and
 * the inline palancas action — they only differ in markup.
 *
 * Gates (all must hold for the button to show):
 *  - `participant:update` permission
 *  - D1: the participant owes something (the flag replaces "Pendiente" while
 *    there is balance; a paz-y-salvo mark would be invisible and could resurface
 *    weeks later when a new debt appears)
 *  - D4: not a scholarship (marking the scholarship clears the flag backend-side)
 *  - a selected retreat, so the write lands on the retreat_participants row the
 *    user is looking at — without it the backend falls back to the primary
 *    retreat row
 *
 * `toggle` is confirm-gated, writes via PUT /participants/:id with
 * `contextRetreatId`, refetches the list, and returns whether the write ran.
 */
export interface PaysAtHouseParticipantLike {
	id: string;
	firstName?: string | null;
	lastName?: string | null;
	paysAtHouse?: boolean | null;
	isScholarship?: boolean | null;
	paymentStatus?: string | null;
	chargeBreakdown?: { balance?: number | null } | null;
}

// Owed statuses: the flag substitutes them visually while there is balance (D1).
const OWING_STATUSES = ['unpaid', 'partial', 'pays_at_house'];

export function usePaysAtHouseToggle() {
	const { t } = useI18n();
	const participantStore = useParticipantStore();
	const retreatStore = useRetreatStore();
	const { hasPermission } = useAuthPermissions();

	// Plain object (not a Set): Sets are not reactive inside refs.
	const savingIds = ref<Record<string, boolean>>({});

	function owesSomething(p: PaysAtHouseParticipantLike | null | undefined): boolean {
		if (!p) return false;
		// paymentStatus is authoritative when present; the balance covers rows
		// that only carry chargeBreakdown (both derive from the same backend
		// computation, so they agree).
		if (p.paymentStatus) return OWING_STATUSES.includes(p.paymentStatus);
		return Number(p.chargeBreakdown?.balance ?? 0) > 0;
	}

	function canToggle(p: PaysAtHouseParticipantLike | null | undefined): boolean {
		return (
			!!p &&
			hasPermission('participant:update') &&
			!p.isScholarship &&
			owesSomething(p) &&
			!!retreatStore.selectedRetreatId
		);
	}

	function isSaving(id: string): boolean {
		return !!savingIds.value[id];
	}

	async function toggle(p: PaysAtHouseParticipantLike): Promise<boolean> {
		if (!canToggle(p) || savingIds.value[p.id]) return false;

		const name = `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim();
		const message = p.paysAtHouse
			? t('paymentManagement.balances.confirmRemovePaysAtHouse', { name })
			: t('paymentManagement.balances.confirmPaysAtHouse', { name });
		if (!window.confirm(message)) return false;

		try {
			savingIds.value = { ...savingIds.value, [p.id]: true };
			await participantStore.updateParticipant(p.id, {
				paysAtHouse: !p.paysAtHouse,
				contextRetreatId: retreatStore.selectedRetreatId,
			} as any);
			await participantStore.fetchParticipants();
			return true;
		} catch (error) {
			console.error('Error toggling pays-at-house:', error);
			return false;
		} finally {
			const next = { ...savingIds.value };
			delete next[p.id];
			savingIds.value = next;
		}
	}

	return { canToggle, owesSomething, isSaving, toggle };
}
