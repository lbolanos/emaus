// "Mesa 9", "09", "Table 3": a name that ends in a number with no other digits occupies that number.
const NUMBERED_NAME = /^\D*(\d+)$/;

export const tableNumberOf = (name: string): number | null => {
	const match = NUMBERED_NAME.exec(name.trim());
	return match ? Number(match[1]) : null;
};

// Lowest free number, so the gap left by a deleted table is reused before growing: with
// "Mesa 1".."Mesa 9" and "Mesa 11", the next one is "Mesa 10".
export const nextTableName = (existingNames: string[]): string => {
	const used = new Set(existingNames.map(tableNumberOf));
	let n = 1;
	while (used.has(n)) n++;
	return `Mesa ${n}`;
};
