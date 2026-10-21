import {
	isOfflineEditableParticipantField,
	normalizeOfflineEditValue,
	type OfflineEditableParticipantField,
} from '@repo/types';
import { AppDataSource } from '../data-source';
import { Participant } from '../entities/participant.entity';

/** Spanish names for the conflict message the team reads in the pending list. */
const FIELD_LABELS: Record<OfflineEditableParticipantField, string> = {
	firstName: 'nombre',
	lastName: 'apellido',
	nickname: 'apodo',
	cellPhone: 'celular',
	homePhone: 'teléfono de casa',
	workPhone: 'teléfono del trabajo',
	parish: 'parroquia',
	occupation: 'ocupación',
	street: 'calle',
	houseNumber: 'número',
	neighborhood: 'colonia',
	postalCode: 'código postal',
	city: 'municipio',
	state: 'estado',
	country: 'país',
	tshirtSize: 'talla de playera',
	snores: 'ronca',
};

export type ExpectedValuesCheck =
	| { kind: 'ok' }
	| { kind: 'invalid'; fields: string[] }
	| { kind: 'not-found' }
	| { kind: 'changed'; fields: OfflineEditableParticipantField[]; message: string };

/**
 * An edit made without signal (specs/offline-mode, D13/FR-16b) carries the value
 * each changed field had on the phone. If the server's value is another one,
 * somebody changed it meanwhile: the edit must not overwrite it.
 */
export async function checkExpectedValues(participantId: string, expected: unknown): Promise<ExpectedValuesCheck> {
	if (!expected || typeof expected !== 'object' || Array.isArray(expected)) {
		return { kind: 'invalid', fields: [] };
	}
	const entries = Object.entries(expected as Record<string, unknown>);
	const invalid = entries.map(([key]) => key).filter((key) => !isOfflineEditableParticipantField(key));
	if (invalid.length > 0) return { kind: 'invalid', fields: invalid };

	const current = await AppDataSource.getRepository(Participant).findOneBy({ id: participantId });
	if (!current) return { kind: 'not-found' };

	const changed = entries
		.filter(([key, value]) => normalizeOfflineEditValue((current as any)[key]) !== normalizeOfflineEditValue(value))
		.map(([key]) => key as OfflineEditableParticipantField);
	if (changed.length === 0) return { kind: 'ok' };

	const labels = changed.map((key) => FIELD_LABELS[key]).join(', ');
	const what = changed.length === 1 ? 'este dato' : 'estos datos';
	return {
		kind: 'changed',
		fields: changed,
		message: `Mientras no había señal alguien más cambió ${what} de la ficha: ${labels}. Revisa la ficha con señal y vuelve a hacer el cambio.`,
	};
}
