/**
 * Pickup points offered when registering / editing a participant. Single source
 * of truth shared by the individual edit form and the bulk edit modal so both
 * write the exact same values (the stored string is what reports and messages
 * read back; a free-text variant of the value would never match this list).
 *
 * Labels are Spanish data, not i18n: the `value` is the legacy string persisted
 * in the DB ("Parroquia", "Llego por mi cuenta"…), and the label must render it
 * faithfully in every locale. The one intentional value/label mismatch fixes the
 * grammar of the stored value ("Llego por mi cuenta" → shown as "Llega por su
 * cuenta"); changing the value itself would orphan existing rows.
 */
export interface PickupLocationOption {
	value: string;
	label: string;
}

export const PICKUP_LOCATIONS: PickupLocationOption[] = [
	{ value: 'Parroquia', label: 'Parroquia' },
	{ value: 'Polanco', label: 'Polanco' },
	{ value: 'Bosques de las Lomas', label: 'Bosques de las Lomas' },
	{ value: 'Llego por mi cuenta', label: 'Llega por su cuenta' },
	{ value: 'Lilas', label: 'Lilas' },
	{ value: 'Auditorio', label: 'Auditorio' },
	{ value: 'Basílica', label: 'Basílica' },
	{ value: 'Casa', label: 'Casa' },
];
