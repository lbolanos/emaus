import { AppDataSource } from '../data-source';
import { Participant } from '../entities/participant.entity';
import { CommunityMember } from '../entities/communityMember.entity';
import { CommunityAttendance } from '../entities/communityAttendance.entity';
import { Retreat } from '../entities/retreat.entity';
import { normalizePersonName, phoneFingerprint } from '@repo/utils';

/**
 * Fusión de `Participant` duplicados.
 *
 * La misma persona puede existir dos veces: una registrada en un retiro y otra
 * dada de alta en el padrón de una comunidad. Medido en la base real, 4 de los
 * 11 servidores de un retiro eran duplicados de miembros del padrón, y por eso
 * el badge de asistencia sólo alcanzaba a 2.
 *
 * La fusión reapunta TODAS las referencias al superviviente. La fila absorbida
 * no se borra: queda con `mergedIntoParticipantId` puesto, para que la
 * operación sea auditable y deshacible a mano.
 *
 * Nada se fusiona solo. `previewMerge` devuelve qué se movería, qué se
 * resolvería y qué **bloquea**; `mergeParticipants` se niega si hay bloqueos.
 * Adivinar sobre datos ambiguos aquí significa tirar la mesa asignada o el
 * registro de pago de alguien sin avisar.
 */

export class ParticipantMergeError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ParticipantMergeError';
	}
}

/**
 * Cómo tratar cada referencia al fusionar.
 *  - `repoint`: UPDATE directo, no hay unicidad que romper.
 *  - `dedupe`: hay un índice único; si el superviviente ya tiene fila con esa
 *    clave, la del absorbido se descarta en vez de reventar el UPDATE.
 *  - `merge-member`: `community_member` necesita mover además la asistencia.
 *  - `block-on-overlap`: dos filas de la misma persona para el mismo retiro (o
 *    dos cuentas de usuario) no se pueden resolver sin decidir qué se pierde.
 */
type ReferencePolicy =
	| { kind: 'repoint' }
	| { kind: 'dedupe'; keyColumns: string[] }
	| { kind: 'merge-member' }
	| { kind: 'retreat-overlap' }
	| { kind: 'block-on-overlap'; overlapColumn: string | null; reason: string };

export interface ParticipantReference {
	table: string;
	column: string;
	policy: ReferencePolicy;
}

/**
 * Todo lo que apunta a un `Participant`.
 *
 * Derivada de `PRAGMA foreign_key_list` sobre cada tabla (17 columnas con FK)
 * más las 6 que apuntan sin FK declarada y que un barrido por nombre se salta
 * —`service_teams.leaderId` no acaba en "participantId"—. Si se añade una
 * columna nueva que referencie a un participante y no se registra aquí, la
 * fusión deja datos huérfanos en silencio. El guard
 * `participantMergeReferences.test.ts` compara esta lista contra el esquema y
 * falla si aparece una FK que no esté.
 */
export const PARTICIPANT_REFERENCES: ParticipantReference[] = [
	// Padrón: además de reapuntar, hay que mover la asistencia del miembro.
	{ table: 'community_member', column: 'participantId', policy: { kind: 'merge-member' } },
	// Una persona no puede estar dos veces en el mismo retiro. Pero "estar dos
	// veces" casi nunca es un conflicto de verdad: lo normal es que una de las
	// dos inscripciones esté CANCELADA, y una baja de un registro duplicado no
	// es información que valga la pena conservar. Ver `resolveRetreatOverlap`.
	{ table: 'retreat_participants', column: 'participantId', policy: { kind: 'retreat-overlap' } },
	// Dos cuentas de usuario para la misma persona es otro problema, y decidir
	// cuál sobrevive no le toca a esta operación.
	{
		table: 'users',
		column: 'participantId',
		policy: {
			kind: 'block-on-overlap',
			overlapColumn: null,
			reason: 'Las dos fichas tienen una cuenta de usuario vinculada',
		},
	},
	{
		table: 'retreat_participants',
		column: 'spouseParticipantId',
		policy: { kind: 'dedupe', keyColumns: ['retreatId'] },
	},
	{
		table: 'participant_shirt_size',
		column: 'participantId',
		policy: { kind: 'dedupe', keyColumns: ['shirtTypeId'] },
	},
	{
		table: 'participant_followups',
		column: 'participantId',
		policy: { kind: 'dedupe', keyColumns: ['retreatId'] },
	},
	{
		table: 'retreat_bed',
		column: 'participantId',
		policy: { kind: 'dedupe', keyColumns: ['retreatId'] },
	},
	// El resto: reapuntar y listo.
	{ table: 'crm_tasks', column: 'participantId', policy: { kind: 'repoint' } },
	{ table: 'participant_availability', column: 'participantId', policy: { kind: 'repoint' } },
	{ table: 'participant_communications', column: 'participantId', policy: { kind: 'repoint' } },
	// El hilo de notas y los cambios de etapa: reapuntar, no dedupear. Dos
	// fichas duplicadas pueden tener notas distintas y las dos importan.
	{ table: 'participant_notes', column: 'participantId', policy: { kind: 'repoint' } },
	{ table: 'participant_debts', column: 'participantId', policy: { kind: 'repoint' } },
	{ table: 'participant_tags', column: 'participantId', policy: { kind: 'repoint' } },
	{ table: 'payments', column: 'participantId', policy: { kind: 'repoint' } },
	{
		table: 'retreat_pre_retreat_task',
		column: 'responsibleParticipantId',
		policy: { kind: 'repoint' },
	},
	{ table: 'retreat_responsibilities', column: 'participantId', policy: { kind: 'repoint' } },
	{
		table: 'retreat_schedule_item_responsable',
		column: 'participantId',
		policy: { kind: 'repoint' },
	},
	{ table: 'scheduled_messages', column: 'participantId', policy: { kind: 'repoint' } },
	{ table: 'service_team_members', column: 'participantId', policy: { kind: 'repoint' } },
	{ table: 'service_teams', column: 'leaderId', policy: { kind: 'repoint' } },
	{ table: 'santisimo_signup', column: 'participantId', policy: { kind: 'repoint' } },
	{ table: 'tables', column: 'liderId', policy: { kind: 'repoint' } },
	{ table: 'tables', column: 'colider1Id', policy: { kind: 'repoint' } },
	{ table: 'tables', column: 'colider2Id', policy: { kind: 'repoint' } },
];

interface RetreatOverlap {
	retreatId: string;
	retreatLabel: string;
	/** Fila a descartar, si el solape se puede resolver sin perder nada. */
	discardRowId: string | null;
	/** Motivo del bloqueo, si NO se puede resolver. */
	blockedReason: string | null;
}

/**
 * Resuelve los solapes de retiro entre dos fichas.
 *
 * En un retiro compartido **gana la inscripción activa**: una fila con
 * `isCancelled = 1` es una baja de un registro duplicado, y conservarla dejaría
 * a la persona apareciendo a la vez inscrita y dada de baja en el mismo retiro.
 * Se descarta la cancelada, esté del lado que esté.
 *
 * Sólo bloquea cuando **las dos están activas**: ahí sí hay dos participaciones
 * reales con su tipo, mesa, cama y pagos, y elegir cuál se conserva es una
 * decisión con pérdida que no le toca al automatismo.
 */
const resolveRetreatOverlap = async (
	keepId: string,
	mergeId: string,
): Promise<RetreatOverlap[]> => {
	const rows: {
		retreatId: string;
		retreatLabel: string;
		keepRowId: string;
		keepCancelled: number;
		mergeRowId: string;
		mergeCancelled: number;
	}[] = await AppDataSource.query(
		`SELECT k."retreatId"                       AS retreatId,
		        TRIM(COALESCE(r."parish", '') || ' ' || COALESCE(r."retreat_number_version", '')) AS retreatLabel,
		        k.id                                AS keepRowId,
		        k."isCancelled"                     AS keepCancelled,
		        m.id                                AS mergeRowId,
		        m."isCancelled"                     AS mergeCancelled
		   FROM retreat_participants k
		   JOIN retreat_participants m ON m."retreatId" = k."retreatId" AND m."participantId" = ?
		   LEFT JOIN retreat r ON r.id = k."retreatId"
		  WHERE k."participantId" = ?`,
		[mergeId, keepId],
	);

	return rows.map((row) => {
		const keepActive = Number(row.keepCancelled) === 0;
		const mergeActive = Number(row.mergeCancelled) === 0;
		if (keepActive && mergeActive) {
			return {
				retreatId: row.retreatId,
				retreatLabel: row.retreatLabel,
				discardRowId: null,
				blockedReason: `Las dos fichas tienen una inscripción ACTIVA en ${row.retreatLabel || 'el mismo retiro'}: decide cuál se queda antes de fusionar`,
			};
		}
		// Gana la activa. Con las dos canceladas da igual: se descarta la absorbida.
		return {
			retreatId: row.retreatId,
			retreatLabel: row.retreatLabel,
			discardRowId: mergeActive ? row.keepRowId : row.mergeRowId,
			blockedReason: null,
		};
	});
};

export interface DuplicateCandidate {
	/** Por qué se proponen como la misma persona. */
	matchedBy: 'name' | 'phone' | 'email';
	participants: {
		id: string;
		firstName: string;
		lastName: string;
		email: string | null;
		cellPhone: string | null;
		/** Referencias totales: orienta sobre cuál conviene conservar. */
		references: number;
		hasUser: boolean;
		isCommunityMember: boolean;
	}[];
}

const countReferences = async (participantId: string): Promise<number> => {
	let total = 0;
	for (const ref of PARTICIPANT_REFERENCES) {
		const [row] = await AppDataSource.query(
			`SELECT COUNT(*) AS c FROM "${ref.table}" WHERE "${ref.column}" = ?`,
			[participantId],
		);
		total += Number(row.c);
	}
	return total;
};

/**
 * Candidatos a duplicado en el ámbito de una comunidad: su padrón más los
 * participantes de los retiros vinculados a ella. Es donde aparece el caso real
 * —alguien inscrito en el retiro y a la vez dado de alta en el padrón— y acota
 * la búsqueda a algo revisable a mano.
 */
export const findDuplicateCandidatesForCommunity = async (
	communityId: string,
): Promise<DuplicateCandidate[]> => {
	const rows: {
		id: string;
		firstName: string;
		lastName: string;
		email: string | null;
		cellPhone: string | null;
	}[] = await AppDataSource.query(
		`SELECT DISTINCT p.id, p.firstName, p.lastName, p.email, p.cellPhone
		   FROM participants p
		  WHERE p.dataDeletedAt IS NULL
		    AND p.mergedIntoParticipantId IS NULL
		    AND (
		      p.id IN (SELECT participantId FROM community_member WHERE communityId = ?)
		      OR p.id IN (
		        SELECT rp.participantId FROM retreat_participants rp
		          JOIN retreat r ON r.id = rp.retreatId
		         WHERE r.communityId = ?
		      )
		    )`,
		[communityId, communityId],
	);

	// Agrupar por las tres huellas. Un mismo par puede coincidir por varias; se
	// reporta la más fuerte (email > teléfono > nombre) y una sola vez.
	const groups = new Map<string, { matchedBy: DuplicateCandidate['matchedBy']; ids: string[] }>();
	const push = (key: string, matchedBy: DuplicateCandidate['matchedBy'], id: string) => {
		const existing = groups.get(key);
		if (existing) existing.ids.push(id);
		else groups.set(key, { matchedBy, ids: [id] });
	};
	for (const row of rows) {
		const name = normalizePersonName(`${row.firstName} ${row.lastName}`);
		if (name) push(`name:${name}`, 'name', row.id);
		const phone = phoneFingerprint(row.cellPhone);
		if (phone) push(`phone:${phone}`, 'phone', row.id);
		const email = (row.email ?? '').trim().toLowerCase();
		if (email) push(`email:${email}`, 'email', row.id);
	}

	const byId = new Map(rows.map((r) => [r.id, r]));
	const seenPairs = new Set<string>();
	const candidates: DuplicateCandidate[] = [];
	const strength = { email: 3, phone: 2, name: 1 } as const;

	for (const group of [...groups.values()].sort(
		(a, b) => strength[b.matchedBy] - strength[a.matchedBy],
	)) {
		const ids = [...new Set(group.ids)];
		if (ids.length < 2) continue;
		const signature = [...ids].sort().join('|');
		if (seenPairs.has(signature)) continue;
		seenPairs.add(signature);

		const participants = [];
		for (const id of ids) {
			const row = byId.get(id)!;
			const [userRow] = await AppDataSource.query(
				`SELECT COUNT(*) AS c FROM "users" WHERE "participantId" = ?`,
				[id],
			);
			const [memberRow] = await AppDataSource.query(
				`SELECT COUNT(*) AS c FROM "community_member" WHERE "participantId" = ? AND "communityId" = ?`,
				[id, communityId],
			);
			participants.push({
				id,
				firstName: row.firstName,
				lastName: row.lastName,
				email: row.email,
				cellPhone: row.cellPhone,
				references: await countReferences(id),
				hasUser: Number(userRow.c) > 0,
				isCommunityMember: Number(memberRow.c) > 0,
			});
		}
		// El de más referencias primero: es el candidato natural a conservar.
		participants.sort((a, b) => b.references - a.references);
		candidates.push({ matchedBy: group.matchedBy, participants });
	}

	return candidates;
};

export interface MergeMove {
	table: string;
	column: string;
	rows: number;
	/** Filas del absorbido que se descartan por chocar con una del superviviente. */
	discarded: number;
}

export interface MergeBlocker {
	table: string;
	column: string;
	reason: string;
}

export interface MergePreview {
	keepId: string;
	mergeId: string;
	keepLabel: string;
	mergeLabel: string;
	moves: MergeMove[];
	blockers: MergeBlocker[];
	/** Registros de asistencia que se reapuntarían del miembro absorbido al que queda. */
	attendanceMoved: number;
	/**
	 * Registros del absorbido para reuniones que el superviviente YA tiene: no se
	 * reapuntan (crearían dos registros de la misma reunión), se pliegan sobre el
	 * del superviviente. Se contaban como "movidos", y no lo son.
	 */
	attendanceMerged: number;
}

const label = (p: Participant) => `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim();

const loadPair = async (keepId: string, mergeId: string) => {
	if (keepId === mergeId) {
		throw new ParticipantMergeError('No se puede fusionar una ficha consigo misma');
	}
	const repo = AppDataSource.getRepository(Participant);
	const keep = await repo.findOne({ where: { id: keepId } });
	const merge = await repo.findOne({ where: { id: mergeId } });
	if (!keep || !merge) throw new ParticipantMergeError('Alguna de las dos fichas no existe');
	if (keep.mergedIntoParticipantId || merge.mergedIntoParticipantId) {
		throw new ParticipantMergeError('Alguna de las dos fichas ya fue fusionada');
	}
	return { keep, merge };
};

/** Qué pasaría al fusionar, sin tocar nada. */
export const previewMerge = async (keepId: string, mergeId: string): Promise<MergePreview> => {
	const { keep, merge } = await loadPair(keepId, mergeId);
	const moves: MergeMove[] = [];
	const blockers: MergeBlocker[] = [];
	let attendanceMoved = 0;
	let attendanceMerged = 0;

	for (const ref of PARTICIPANT_REFERENCES) {
		const [{ c }] = await AppDataSource.query(
			`SELECT COUNT(*) AS c FROM "${ref.table}" WHERE "${ref.column}" = ?`,
			[mergeId],
		);
		const rows = Number(c);
		if (rows === 0) continue;

		if (ref.policy.kind === 'retreat-overlap') {
			const overlaps = await resolveRetreatOverlap(keepId, mergeId);
			for (const overlap of overlaps.filter((o) => o.blockedReason)) {
				blockers.push({
					table: ref.table,
					column: ref.column,
					reason: overlap.blockedReason!,
				});
			}
			// Las canceladas que se van no cuentan como filas movidas.
			const discarded = overlaps.filter((o) => o.discardRowId).length;
			moves.push({
				table: ref.table,
				column: ref.column,
				rows: Math.max(rows - discarded, 0),
				discarded,
			});
			continue;
		}

		if (ref.policy.kind === 'block-on-overlap') {
			const { overlapColumn, reason } = ref.policy;
			const [{ c: overlap }] = overlapColumn
				? await AppDataSource.query(
						`SELECT COUNT(*) AS c FROM "${ref.table}" a
						  WHERE a."${ref.column}" = ?
						    AND EXISTS (
						      SELECT 1 FROM "${ref.table}" b
						       WHERE b."${ref.column}" = ?
						         AND b."${overlapColumn}" = a."${overlapColumn}"
						    )`,
						[mergeId, keepId],
					)
				: await AppDataSource.query(
						`SELECT COUNT(*) AS c FROM "${ref.table}" WHERE "${ref.column}" = ?`,
						[keepId],
					);
			if (Number(overlap) > 0) {
				blockers.push({ table: ref.table, column: ref.column, reason });
				continue;
			}
			moves.push({ table: ref.table, column: ref.column, rows, discarded: 0 });
			continue;
		}

		if (ref.policy.kind === 'dedupe') {
			const conditions = ref.policy.keyColumns
				.map((col) => `b."${col}" = a."${col}"`)
				.join(' AND ');
			const [{ c: dup }] = await AppDataSource.query(
				`SELECT COUNT(*) AS c FROM "${ref.table}" a
				  WHERE a."${ref.column}" = ?
				    AND EXISTS (
				      SELECT 1 FROM "${ref.table}" b
				       WHERE b."${ref.column}" = ? AND ${conditions}
				    )`,
				[mergeId, keepId],
			);
			moves.push({
				table: ref.table,
				column: ref.column,
				rows: rows - Number(dup),
				discarded: Number(dup),
			});
			continue;
		}

		if (ref.policy.kind === 'merge-member') {
			// Si el superviviente ya es miembro de la misma comunidad, el UNIQUE
			// (communityId, participantId) impide reapuntar: se fusionan las filas y
			// la asistencia del absorbido se pasa al miembro que queda.
			const [{ c: collide }] = await AppDataSource.query(
				`SELECT COUNT(*) AS c FROM "community_member" a
				  WHERE a."participantId" = ?
				    AND EXISTS (
				      SELECT 1 FROM "community_member" b
				       WHERE b."participantId" = ? AND b."communityId" = a."communityId"
				    )`,
				[mergeId, keepId],
			);
			const collides = Number(collide);
			if (collides > 0) {
				// Los registros del absorbido se parten en dos grupos: los de reuniones
				// que el superviviente NO tiene (se reapuntan) y los de reuniones que ya
				// tiene (se pliegan sobre el suyo). Contarlos juntos como "movidos" daba
				// un número que la ejecución no cumplía.
				const [{ c: att }] = await AppDataSource.query(
					`SELECT COUNT(*) AS c FROM "community_attendance" ca
					  WHERE ca."memberId" IN (SELECT id FROM community_member WHERE participantId = ?)`,
					[mergeId],
				);
				const [{ c: clash }] = await AppDataSource.query(
					`SELECT COUNT(*) AS c FROM "community_attendance" ca
					  WHERE ca."memberId" IN (SELECT id FROM community_member WHERE participantId = ?)
					    AND EXISTS (
					      SELECT 1 FROM community_attendance existing
					       JOIN community_member k ON k.id = existing."memberId"
					       WHERE k."participantId" = ? AND existing."meetingId" = ca."meetingId"
					    )`,
					[mergeId, keepId],
				);
				attendanceMerged += Number(clash);
				attendanceMoved += Number(att) - Number(clash);
			}
			moves.push({
				table: ref.table,
				column: ref.column,
				rows: rows - collides,
				discarded: collides,
			});
			continue;
		}

		moves.push({ table: ref.table, column: ref.column, rows, discarded: 0 });
	}

	return {
		keepId,
		mergeId,
		keepLabel: label(keep),
		mergeLabel: label(merge),
		moves,
		blockers,
		attendanceMoved,
		attendanceMerged,
	};
};

export interface MergeResult extends MergePreview {
	merged: true;
}

/**
 * Ejecuta la fusión. Se niega si el preview trae bloqueos.
 *
 * Todo va en una transacción: una fusión a medias deja al absorbido con parte de
 * sus datos movidos y parte no, que es peor que no haberla intentado.
 */
export const mergeParticipants = async (
	keepId: string,
	mergeId: string,
): Promise<MergeResult> => {
	const preview = await previewMerge(keepId, mergeId);
	if (preview.blockers.length > 0) {
		throw new ParticipantMergeError(
			`No se puede fusionar todavía: ${preview.blockers.map((b) => b.reason).join('; ')}`,
		);
	}

	await AppDataSource.transaction(async (manager) => {
		for (const ref of PARTICIPANT_REFERENCES) {
			if (ref.policy.kind === 'dedupe') {
				const conditions = ref.policy.keyColumns
					.map((col) => `b."${col}" = a."${col}"`)
					.join(' AND ');
				await manager.query(
					`DELETE FROM "${ref.table}" WHERE rowid IN (
					   SELECT a.rowid FROM "${ref.table}" a
					    WHERE a."${ref.column}" = ?
					      AND EXISTS (
					        SELECT 1 FROM "${ref.table}" b
					         WHERE b."${ref.column}" = ? AND ${conditions}
					      )
					 )`,
					[mergeId, keepId],
				);
			}

			if (ref.policy.kind === 'retreat-overlap') {
				// Descartar la inscripción cancelada del retiro compartido antes de
				// reapuntar, o el retiro quedaría con dos fichas de la misma persona.
				for (const overlap of await resolveRetreatOverlap(keepId, mergeId)) {
					if (!overlap.discardRowId) continue;
					await manager.query(`DELETE FROM "retreat_participants" WHERE id = ?`, [
						overlap.discardRowId,
					]);
				}
			}

			if (ref.policy.kind === 'merge-member') {
				// Mover la asistencia antes de tocar las filas de miembro, y sólo la de
				// las reuniones que el miembro superviviente no tenga ya registradas
				// (la unicidad de `community_attendance` la garantiza el código, no la
				// base: duplicar aquí crearía dos registros para la misma reunión).
				await manager.query(
					`UPDATE "community_attendance"
					    SET "memberId" = (
					      SELECT k.id FROM community_member k
					       WHERE k."participantId" = ?
					         AND k."communityId" = (
					           SELECT m."communityId" FROM community_member m
					            WHERE m.id = "community_attendance"."memberId"
					         )
					    )
					  WHERE "memberId" IN (SELECT id FROM community_member WHERE participantId = ?)
					    AND EXISTS (
					      SELECT 1 FROM community_member k
					       WHERE k."participantId" = ?
					         AND k."communityId" = (
					           SELECT m."communityId" FROM community_member m
					            WHERE m.id = "community_attendance"."memberId"
					         )
					    )
					    AND NOT EXISTS (
					      SELECT 1 FROM community_attendance existing
					       JOIN community_member k ON k.id = existing."memberId"
					       WHERE k."participantId" = ?
					         AND existing."meetingId" = "community_attendance"."meetingId"
					    )`,
					[keepId, mergeId, keepId, keepId],
				);
				// Antes de borrar: si el absorbido tiene marcada la asistencia a una
				// reunión que el superviviente tiene SIN marcar, el registro bueno es el
				// del absorbido. Se promueve el del superviviente, porque el DELETE de
				// abajo cascadea sobre `community_attendance.memberId` (onDelete CASCADE)
				// y se llevaría el "sí asistió" dejando el "no asistió".
				await manager.query(
					`UPDATE "community_attendance"
					    SET "attended" = 1
					  WHERE "attended" = 0
					    AND "memberId" IN (SELECT id FROM community_member WHERE participantId = ?)
					    AND EXISTS (
					      SELECT 1 FROM community_attendance src
					       JOIN community_member m ON m.id = src."memberId"
					       WHERE m."participantId" = ?
					         AND src."meetingId" = "community_attendance"."meetingId"
					         AND src."attended" = 1
					    )`,
					[keepId, mergeId],
				);
				// Y borrar las filas de miembro que chocarían con el superviviente.
				await manager.query(
					`DELETE FROM "community_member" WHERE rowid IN (
					   SELECT a.rowid FROM "community_member" a
					    WHERE a."participantId" = ?
					      AND EXISTS (
					        SELECT 1 FROM community_member b
					         WHERE b."participantId" = ? AND b."communityId" = a."communityId"
					      )
					 )`,
					[mergeId, keepId],
				);
			}

			await manager.query(
				`UPDATE "${ref.table}" SET "${ref.column}" = ? WHERE "${ref.column}" = ?`,
				[keepId, mergeId],
			);
		}

		// Lápida: el absorbido se queda, apuntando a quien lo absorbió, y sale de
		// los listados que filtran por `retreatId` de la propia tabla.
		await manager.query(
			`UPDATE "participants" SET "mergedIntoParticipantId" = ?, "retreatId" = NULL WHERE id = ?`,
			[keepId, mergeId],
		);
	});

	return { ...preview, merged: true };
};
