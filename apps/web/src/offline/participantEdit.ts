import { isOfflineEditableParticipantField, normalizeOfflineEditValue } from '@repo/types';

/**
 * Which part of a record edit can wait for signal (specs/offline-mode, D13).
 *
 * Only the fields the user changed travel, each with the value it had when the
 * record was opened (`expectedValues`): the server refuses with 409 if any of
 * them changed meanwhile, so nobody's change is overwritten in silence.
 */
export interface OfflineEditPlan {
	/** Changed fields that need signal: the whole save waits for it. */
	blocked: string[];
	/** The changed fields of the offline list, as the form sends them. */
	patch: Record<string, unknown>;
	/** The value each of those fields had when the record was opened. */
	expectedValues: Record<string, unknown>;
}

/**
 * `dirtyKeys` comes from the form (what the user touched, before its date and
 * boolean formatting); typing and leaving the field empty again is not a change.
 */
export function planOfflineEdit(
	original: Record<string, any> | null | undefined,
	edited: Record<string, any>,
	dirtyKeys: string[],
): OfflineEditPlan {
	const plan: OfflineEditPlan = { blocked: [], patch: {}, expectedValues: {} };
	for (const key of new Set(dirtyKeys)) {
		const same = normalizeOfflineEditValue(original?.[key]) === normalizeOfflineEditValue(edited?.[key]);
		if (key !== 'tags' && same) continue;
		if (!isOfflineEditableParticipantField(key)) {
			plan.blocked.push(key);
			continue;
		}
		plan.patch[key] = edited[key] ?? null;
		plan.expectedValues[key] = original?.[key] ?? null;
	}
	return plan;
}
