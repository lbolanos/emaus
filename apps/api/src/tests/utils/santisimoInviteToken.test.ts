/**
 * Unit tests del token cifrado del enlace personal de guardias del Santísimo
 * (specs/santisimo-guardia-links).
 *
 * El token es la capability del enlace: AES-256-GCM stateless con
 * `iv(12)|tag(16)|ciphertext` en base64url. Aquí se prueba el contrato cripto:
 * roundtrip, integridad (tamper → null), derivación de clave por env y el
 * chequeo de versión del payload. `parseSantisimoInviteToken` jamás lanza.
 */
import crypto from 'crypto';
import {
	buildSantisimoInviteToken,
	buildSantisimoInviteUrl,
	parseSantisimoInviteToken,
} from '../../utils/santisimoInviteToken';

const RETREAT_ID = '11111111-1111-4111-8111-111111111111';
const PARTICIPANT_ID = '22222222-2222-4222-8222-222222222222';

// Derivación de clave espejo de la del util, para forjar payloads (tests de
// versión/estructura) sin depender de los internals del módulo.
const KEY_LABEL = 'santisimo-guardia-invite-v1';
function forgeKey(secret: string): Buffer {
	return crypto.createHmac('sha256', secret).update(KEY_LABEL).digest();
}
function forgeToken(secret: string, payload: unknown): string {
	const iv = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv('aes-256-gcm', forgeKey(secret), iv);
	const ciphertext = Buffer.concat([
		cipher.update(Buffer.from(JSON.stringify(payload), 'utf8')),
		cipher.final(),
	]);
	return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');
}

describe('santisimoInviteToken', () => {
	const hadInviteSecret = 'INVITE_TOKEN_SECRET' in process.env;
	const hadSessionSecret = 'SESSION_SECRET' in process.env;
	const prevInviteSecret = process.env.INVITE_TOKEN_SECRET;
	const prevSessionSecret = process.env.SESSION_SECRET;

	beforeAll(() => {
		process.env.INVITE_TOKEN_SECRET = 'test-invite-secret';
	});
	afterAll(() => {
		if (hadInviteSecret) process.env.INVITE_TOKEN_SECRET = prevInviteSecret;
		else delete process.env.INVITE_TOKEN_SECRET;
		if (hadSessionSecret) process.env.SESSION_SECRET = prevSessionSecret;
		else delete process.env.SESSION_SECRET;
	});

	describe('roundtrip', () => {
		it('build → parse recupera retreatId y participantId', () => {
			const token = buildSantisimoInviteToken(RETREAT_ID, PARTICIPANT_ID);
			expect(token.length).toBeGreaterThan(28);
			expect(parseSantisimoInviteToken(token)).toEqual({
				retreatId: RETREAT_ID,
				participantId: PARTICIPANT_ID,
			});
		});

		it('cada token es distinto (IV aleatorio) pero ambos parsean', () => {
			const a = buildSantisimoInviteToken(RETREAT_ID, PARTICIPANT_ID);
			const b = buildSantisimoInviteToken(RETREAT_ID, PARTICIPANT_ID);
			expect(a).not.toBe(b);
			expect(parseSantisimoInviteToken(a)).toEqual({ retreatId: RETREAT_ID, participantId: PARTICIPANT_ID });
			expect(parseSantisimoInviteToken(b)).toEqual({ retreatId: RETREAT_ID, participantId: PARTICIPANT_ID });
		});

		it('cae a SESSION_SECRET cuando INVITE_TOKEN_SECRET no está definido', () => {
			delete process.env.INVITE_TOKEN_SECRET;
			process.env.SESSION_SECRET = 'test-session-secret';
			const token = buildSantisimoInviteToken(RETREAT_ID, PARTICIPANT_ID);
			expect(parseSantisimoInviteToken(token)).toEqual({
				retreatId: RETREAT_ID,
				participantId: PARTICIPANT_ID,
			});
			process.env.INVITE_TOKEN_SECRET = 'test-invite-secret';
		});
	});

	describe('integridad — tamper y basura devuelven null (nunca lanzan)', () => {
		it('un byte alterado del ciphertext invalida el token', () => {
			const token = buildSantisimoInviteToken(RETREAT_ID, PARTICIPANT_ID);
			// Altera un carácter del cuerpo (mitad final = ciphertext), manteniendo
			// el alfabeto base64url.
			const mid = Math.floor(token.length / 2) + 4;
			const flipped = token.slice(0, mid) + (token[mid] === 'A' ? 'B' : 'A') + token.slice(mid + 1);
			expect(flipped).not.toBe(token);
			expect(parseSantisimoInviteToken(flipped)).toBeNull();
		});

		it('token truncado devuelve null', () => {
			const token = buildSantisimoInviteToken(RETREAT_ID, PARTICIPANT_ID);
			expect(parseSantisimoInviteToken(token.slice(0, 20))).toBeNull();
		});

		it('cadenas arbitrarias no lanzan y devuelven null', () => {
			for (const garbage of ['', 'x', 'a'.repeat(64), '####????', 'não-é-base64!!', 'é‭‬']) {
				expect(parseSantisimoInviteToken(garbage)).toBeNull();
			}
		});

		it('token emitido con otra clave devuelve null (auth tag no coincide)', () => {
			const token = buildSantisimoInviteToken(RETREAT_ID, PARTICIPANT_ID);
			process.env.INVITE_TOKEN_SECRET = 'otra-clave-distinta';
			expect(parseSantisimoInviteToken(token)).toBeNull();
			process.env.INVITE_TOKEN_SECRET = 'test-invite-secret';
		});
	});

	describe('validación del payload descifrado', () => {
		it('rechaza versión futura del payload', () => {
			const forged = forgeToken('test-invite-secret', { v: 2, r: RETREAT_ID, p: PARTICIPANT_ID });
			expect(parseSantisimoInviteToken(forged)).toBeNull();
		});

		it('rechaza payload con campos faltantes o de otro tipo', () => {
			expect(
				parseSantisimoInviteToken(forgeToken('test-invite-secret', { v: 1, r: RETREAT_ID })),
			).toBeNull();
			expect(
				parseSantisimoInviteToken(
					forgeToken('test-invite-secret', { v: 1, r: 42, p: PARTICIPANT_ID }),
				),
			).toBeNull();
		});
	});

	describe('buildSantisimoInviteUrl', () => {
		it('arma la ruta /santisimo/servidor/:token y sanea slashes del base', () => {
			const url = buildSantisimoInviteUrl('https://emaus.cc//', RETREAT_ID, PARTICIPANT_ID);
			expect(url).toMatch(/^https:\/\/emaus\.cc\/santisimo\/servidor\/[A-Za-z0-9_-]+$/);
			const token = url.split('/').pop()!;
			expect(parseSantisimoInviteToken(token)).toEqual({
				retreatId: RETREAT_ID,
				participantId: PARTICIPANT_ID,
			});
		});
	});
});
