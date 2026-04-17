import type { RetreatBed, Participant } from '@repo/types';

export type UnassignedSort = 'idOnRetreat' | 'name' | 'age' | 'snores';

export const calculateAge = (birthDate: string | Date | null | undefined): number | null => {
	if (!birthDate) return null;
	let dob: Date;
	if (typeof birthDate === 'string') {
		const match = birthDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
		dob = match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date(birthDate);
	} else {
		dob = birthDate;
	}
	if (isNaN(dob.getTime())) return null;
	const today = new Date();
	let age = today.getFullYear() - dob.getFullYear();
	const m = today.getMonth() - dob.getMonth();
	if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
	return age;
};

export const sortUnassigned = <T extends Partial<Participant>>(list: T[], sortKey: UnassignedSort): T[] => {
	const arr = [...list];
	switch (sortKey) {
		case 'idOnRetreat':
			return arr.sort(
				(a: any, b: any) => (a.id_on_retreat ?? 9999) - (b.id_on_retreat ?? 9999),
			);
		case 'name':
			return arr.sort((a, b) =>
				`${a.firstName ?? ''} ${a.lastName ?? ''}`.localeCompare(
					`${b.firstName ?? ''} ${b.lastName ?? ''}`,
					'es',
					{ sensitivity: 'base' },
				),
			);
		case 'snores':
			return arr.sort((a: any, b: any) => Number(!!b.snores) - Number(!!a.snores));
		case 'age':
		default:
			return arr.sort(
				(a: any, b: any) =>
					new Date(a.birthDate ?? 0).getTime() - new Date(b.birthDate ?? 0).getTime(),
			);
	}
};

export const filterUnassignedBySearch = <T extends Partial<Participant>>(
	list: T[],
	query: string,
): T[] => {
	const q = query.trim().toLowerCase();
	if (!q) return list;
	return list.filter((p: any) =>
		`${p.firstName ?? ''} ${p.lastName ?? ''}`.toLowerCase().includes(q) ||
		String(p.id_on_retreat ?? '').includes(q),
	);
};

/**
 * Returns the set of empty-bed ids in rooms where existing occupants have
 * opposite snoring status from the tapped participant. Used to dim
 * "incompatible" beds in the UI.
 */
export const computeIncompatibleBedIds = (
	beds: RetreatBed[],
	tappedParticipant: { id: string; snores?: boolean | null } | null,
): Set<string> => {
	const result = new Set<string>();
	if (!tappedParticipant) return result;
	const targetSnores = !!tappedParticipant.snores;
	const byRoom = new Map<string, RetreatBed[]>();
	for (const bed of beds) {
		const key = `${bed.floor || 0}|${bed.roomNumber}`;
		const arr = byRoom.get(key) || [];
		arr.push(bed);
		byRoom.set(key, arr);
	}
	for (const [, roomBeds] of byRoom) {
		const occupants = roomBeds
			.map((b) => b.participant)
			.filter((p): p is NonNullable<typeof p> => !!p && p.id !== tappedParticipant.id);
		if (occupants.length === 0) continue;
		const hasOpposite = occupants.some((o) => !!o.snores !== targetSnores);
		if (hasOpposite) {
			for (const b of roomBeds) {
				if (!b.participant) result.add(b.id);
			}
		}
	}
	return result;
};

export const getProgressColor = (pct: number): string => {
	if (pct >= 100) return 'bg-green-500';
	if (pct >= 75) return 'bg-blue-500';
	if (pct >= 50) return 'bg-yellow-500';
	if (pct > 0) return 'bg-orange-400';
	return 'bg-gray-300';
};
