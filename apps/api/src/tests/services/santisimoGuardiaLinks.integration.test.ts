/**
 * Integration test (TypeORM real) de la variable `participant.santisimoGuardiaLink`
 * en su camino SERVER-SIDE (specs/santisimo-guardia-links R4-R5):
 *  - santisimoService.getGuardiaLinks: mapa sólo de servidores activos
 *    (sin walkers/angelitos/cancelados/borrados), URL parseable de vuelta a
 *    {retreatId, participantId}.
 *  - messageSequenceService.resolveContent (privado, vía any): la plantilla
 *    con {participant.santisimoGuardiaLink} resuelve a la misma URL que
 *    construiría buildSantisimoInviteUrl, con base FRONTEND_URL.
 *
 * El camino CLIENTE (MessageDialog/WhatsAppSendQueue/BaseMessageTemplateModal
 * fetchean el mapa) se prueba en apps/web (vitest) y en M5 end-to-end.
 */
const mockSendEmail = jest.fn(async () => true);
jest.mock('@/services/emailService', () => ({
	EmailService: jest.fn(() => ({
		sendEmail: mockSendEmail,
	})),
}));

import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { SantisimoService } from '@/services/santisimoService';
import { MessageSequenceService } from '@/services/messageSequenceService';
import { parseSantisimoInviteToken } from '@/utils/santisimoInviteToken';

const getDS = () => (TestDataFactory as any)['testDataSource'];

describe('participant.santisimoGuardiaLink — camino server-side', () => {
	let santisimo: SantisimoService;
	let sequences: MessageSequenceService;
	let retreat: any;

	beforeAll(async () => {
		await setupTestDatabase();
	});
	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		retreat = await TestDataFactory.createTestRetreat({ santisimoEnabled: true } as any);
		santisimo = new SantisimoService();
		sequences = new MessageSequenceService();
	});

	describe('santisimoService.getGuardiaLinks', () => {
		it('arma el mapa sólo con servidores activos y no borrados', async () => {
			const server1 = await TestDataFactory.createTestParticipant(retreat.id, { type: 'server' } as any);
			const server2 = await TestDataFactory.createTestParticipant(retreat.id, { type: 'server' } as any);
			// Fuera del mapa: walker, angelito, server cancelado, server borrado.
			await TestDataFactory.createTestParticipant(retreat.id, { type: 'walker' } as any);
			await TestDataFactory.createTestParticipant(retreat.id, { type: 'partial_server' } as any);
			await TestDataFactory.createTestParticipant(retreat.id, {
				type: 'server',
				isCancelled: true,
			} as any);
			const deleted = await TestDataFactory.createTestParticipant(retreat.id, { type: 'server' } as any);
			await getDS().getRepository('Participant').update(deleted.id, { dataDeletedAt: new Date() } as any);

			const links = await santisimo.getGuardiaLinks(retreat.id);

			expect(Object.keys(links).sort()).toEqual([server1.id, server2.id].sort());
			for (const [participantId, url] of Object.entries(links)) {
				expect(url).toMatch(/\/santisimo\/servidor\/[A-Za-z0-9_-]+$/);
				expect(parseSantisimoInviteToken(url.split('/').pop()!)).toEqual({
					retreatId: retreat.id,
					participantId,
				});
			}
		});

		it('sin servidores devuelve mapa vacío', async () => {
			expect(await santisimo.getGuardiaLinks(retreat.id)).toEqual({});
		});
	});

	describe('messageSequenceService.resolveContent', () => {
		it('resuelve {participant.santisimoGuardiaLink} con base FRONTEND_URL', async () => {
			const hadFrontend = 'FRONTEND_URL' in process.env;
			const prevFrontend = process.env.FRONTEND_URL;
			process.env.FRONTEND_URL = 'https://retiros.example';
			try {
				const server = await TestDataFactory.createTestParticipant(retreat.id, {
					type: 'server',
				} as any);
				const message =
					'Elige tu horario: {participant.santisimoGuardiaLink} — gracias, {participant.firstName}';

				const resolved = await (sequences as any).resolveContent(
					message,
					server,
					retreat,
					undefined,
					retreat.id,
				);

				expect(resolved).toContain('Elige tu horario: https://retiros.example/santisimo/servidor/');
				expect(resolved).not.toContain('{participant.santisimoGuardiaLink}');
				const token = (resolved as string).match(/\/santisimo\/servidor\/([A-Za-z0-9_-]+)/)![1];
				expect(parseSantisimoInviteToken(token)).toEqual({
					retreatId: retreat.id,
					participantId: server.id,
				});
			} finally {
				if (hadFrontend) process.env.FRONTEND_URL = prevFrontend;
				else delete process.env.FRONTEND_URL;
			}
		});

		it('sin la variable en la plantilla no altera el mensaje', async () => {
			const server = await TestDataFactory.createTestParticipant(retreat.id, { type: 'server' } as any);
			const resolved = await (sequences as any).resolveContent(
				'Hola {participant.firstName}',
				server,
				retreat,
				undefined,
				retreat.id,
			);
			expect(resolved).toBe(`Hola ${server.firstName}`);
		});
	});
});
