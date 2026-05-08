// SQLite no soporta orden natural, así que ordenamos en JS para que
// "Mesa 2" preceda a "Mesa 10" y "Cuarto 9" a "Cuarto 11" en lugar del
// lexicográfico "1, 10, 11, 2, 3...".
const naturalCollator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

export const naturalCompare = (a: string, b: string): number =>
	naturalCollator.compare(a, b);

export const sortByName = <T extends { name: string }>(rows: T[]): T[] =>
	[...rows].sort((a, b) => naturalCompare(a.name, b.name));

export interface BedLikeForSort {
	floor?: number | null;
	roomNumber: string;
	bedNumber: string;
}

export const sortRetreatBedsNaturally = <T extends BedLikeForSort>(beds: T[]): T[] =>
	[...beds].sort((a, b) => {
		const fa = a.floor ?? 0;
		const fb = b.floor ?? 0;
		if (fa !== fb) return fa - fb;
		const r = naturalCompare(a.roomNumber, b.roomNumber);
		if (r !== 0) return r;
		return naturalCompare(a.bedNumber, b.bedNumber);
	});
