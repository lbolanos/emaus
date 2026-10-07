/**
 * Single source of truth for the control each participant field edits with.
 *
 * The bulk edit modal and the individual form used to classify fields with two
 * independent copies of the same heuristics, and they drifted apart: the bulk
 * modal shipped `palancasCoordinator` as free text while the individual form
 * offered a select fed by GET /responsibilities/palanquero-options — free text
 * breaks the exact-match 'Palanquero N' lookups of the palanquero
 * notifications. Both surfaces now classify through this catalog; the parity
 * test in src/components/__tests__/participantFieldControlParity.test.ts fails
 * if either one stops consuming it.
 */

export type ParticipantFieldControl =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'boolean'
  | 'select'
  | 'tags';

/** Where a 'select' control gets its options from. */
export type SelectOptionsSource =
  | 'participantType'
  | 'palanquero'
  | 'pickupLocation';

export interface ParticipantFieldControlSpec {
  control: ParticipantFieldControl;
  /** Only meaningful when control === 'select'. */
  options?: SelectOptionsSource;
}

/**
 * The four values @repo/types allows and every `type` select offers. Labels go
 * through i18n so the individual form's hardcoded Spanish items and the modal's
 * translated ones can no longer diverge either.
 */
export const PARTICIPANT_TYPE_OPTIONS: { value: string; labelKey: string }[] = [
  { value: 'walker', labelKey: 'participants.types.walker' },
  { value: 'server', labelKey: 'participants.types.server' },
  { value: 'waiting', labelKey: 'participants.types.waiting' },
  { value: 'partial_server', labelKey: 'participants.types.partial_server' },
];

/** Fields whose control cannot be derived from the shape of the key. */
const EXACT_FIELD_CONTROLS: Record<string, ParticipantFieldControlSpec> = {
  // Closed selects — free text in any of them stores values the select can
  // never show back, and palancasCoordinator breaks PALANQUERO_NEW_WALKER
  // exact-match lookups downstream.
  type: { control: 'select', options: 'participantType' },
  palancasCoordinator: { control: 'select', options: 'palanquero' },
  pickupLocation: { control: 'select', options: 'pickupLocation' },
  // Numeric counters (letters received, scholarship, meals).
  palancasReceivedCount: { control: 'number' },
  scholarshipAmount: { control: 'number' },
  mealCount: { control: 'number' },
  // Per-retreat free-text size codes (G, L, XL…), not a closed list.
  tshirtSize: { control: 'text' },
  // Relation display fields — never edited as anything but plain text.
  'tableMesa.name': { control: 'text' },
  'retreatBed.roomNumber': { control: 'text' },
  tags: { control: 'tags' },
};

/** Boolean keys that don't start with is/has/requests. */
const EXTRA_BOOLEAN_KEYS = [
  'arrivesOnOwn',
  'snores',
  'palancasRequested',
  'takesFridayMeal',
];

const isBooleanKey = (key: string) =>
  key.startsWith('is') ||
  key.startsWith('has') ||
  key.startsWith('requests') ||
  EXTRA_BOOLEAN_KEYS.includes(key);

/**
 * Classify a participant field key into the control that edits it. Heuristics
 * match the historical behavior of both forms (kept identical on purpose);
 * anything non-obvious belongs in EXACT_FIELD_CONTROLS above.
 */
export const inferFieldControl = (key: string): ParticipantFieldControlSpec => {
  const exact = EXACT_FIELD_CONTROLS[key];
  if (exact) return exact;
  if (isBooleanKey(key)) return { control: 'boolean' };
  const lower = key.toLowerCase();
  if (lower.includes('notes') || lower.includes('details')) {
    return { control: 'textarea' };
  }
  if (lower.includes('date')) return { control: 'date' };
  if (lower.includes('amount')) return { control: 'number' };
  return { control: 'text' };
};
