import { AppDataSource } from '../data-source';
import { RetreatShirtType } from '../entities/retreatShirtType.entity';

export type ShirtReportShirt = {
	shirtTypeId: string;
	shirtTypeName: string;
	color: string | null;
	sortOrder: number;
	size: string;
};

export type ShirtReportParticipant = {
	participantId: string;
	firstName: string;
	lastName: string;
	idOnRetreat: number | null;
	type: 'server' | 'partial_server';
	shirts: ShirtReportShirt[];
};

export type ShirtReportShirtType = {
	id: string;
	name: string;
	color: string | null;
	sortOrder: number;
};

export type ShirtReportResponse = {
	shirtTypes: ShirtReportShirtType[];
	participants: ShirtReportParticipant[];
};

type Row = {
	participantId: string;
	firstName: string;
	lastName: string;
	idOnRetreat: number | null;
	type: 'server' | 'partial_server';
	shirtTypeId: string;
	shirtTypeName: string;
	color: string | null;
	sortOrder: number;
	size: string;
};

export const getShirtOrdersForRetreat = async (
	retreatId: string,
): Promise<ShirtReportResponse> => {
	const shirtTypeRepo = AppDataSource.getRepository(RetreatShirtType);
	const types = await shirtTypeRepo.find({
		where: { retreatId },
		order: { sortOrder: 'ASC', createdAt: 'ASC' },
	});

	const shirtTypes: ShirtReportShirtType[] = types.map((t) => ({
		id: t.id,
		name: t.name,
		color: t.color ?? null,
		sortOrder: t.sortOrder,
	}));

	// Single query: join participants + retreat_participants + participant_shirt_size + retreat_shirt_type
	// scoping shirt-types to this retreat so cross-retreat sizes are excluded.
	const rows: Row[] = await AppDataSource.query(
		`SELECT
       p.id              AS participantId,
       p.firstName       AS firstName,
       p.lastName        AS lastName,
       rp.idOnRetreat    AS idOnRetreat,
       rp.type           AS type,
       pss.shirtTypeId   AS shirtTypeId,
       rst.name          AS shirtTypeName,
       rst.color         AS color,
       rst.sortOrder     AS sortOrder,
       pss.size          AS size
     FROM participants p
     INNER JOIN retreat_participants rp
       ON rp.participantId = p.id
       AND rp.retreatId = ?
       AND rp.isCancelled = 0
       AND rp.type IN ('server', 'partial_server')
     INNER JOIN participant_shirt_size pss
       ON pss.participantId = p.id
       AND pss.size IS NOT NULL
       AND pss.size != ''
       AND pss.size != 'null'
     INNER JOIN retreat_shirt_type rst
       ON rst.id = pss.shirtTypeId
       AND rst.retreatId = ?
     ORDER BY p.lastName ASC, p.firstName ASC, rst.sortOrder ASC`,
		[retreatId, retreatId],
	);

	const byParticipant = new Map<string, ShirtReportParticipant>();
	for (const r of rows) {
		let entry = byParticipant.get(r.participantId);
		if (!entry) {
			entry = {
				participantId: r.participantId,
				firstName: r.firstName,
				lastName: r.lastName,
				idOnRetreat: r.idOnRetreat,
				type: r.type,
				shirts: [],
			};
			byParticipant.set(r.participantId, entry);
		}
		entry.shirts.push({
			shirtTypeId: r.shirtTypeId,
			shirtTypeName: r.shirtTypeName,
			color: r.color,
			sortOrder: r.sortOrder,
			size: r.size,
		});
	}

	return {
		shirtTypes,
		participants: Array.from(byParticipant.values()),
	};
};
