/**
 * `audit_logs`, `domain_audit_log` y `community_audit_log` crecían sin
 * límite (a diferencia del sink NDJSON, que ya rotaba a 90 días). Este test
 * cubre que `AuditRetentionService.performCleanup` borra las tres tablas por
 * `createdAt < cutoff`, respeta `retentionDays`, y que un fallo en una tabla
 * no bloquea la limpieza de las otras dos (mismo espíritu fire-and-forget
 * que el resto de los servicios de limpieza programada).
 *
 * Database-independent: mockea AppDataSource.getRepository por entidad.
 */

const mockExecuteAuditLog = jest.fn().mockResolvedValue({ affected: 3 });
const mockExecuteDomain = jest.fn().mockResolvedValue({ affected: 7 });
const mockExecuteCommunity = jest.fn().mockResolvedValue({ affected: 2 });
const mockWhereAuditLog = jest.fn();
const mockWhereDomain = jest.fn();
const mockWhereCommunity = jest.fn();

function makeQueryBuilder(executeMock: jest.Mock, whereMock: jest.Mock) {
	const qb: any = {
		delete: jest.fn().mockReturnThis(),
		where: whereMock.mockReturnThis(),
		execute: executeMock,
	};
	return qb;
}

jest.mock('../../data-source', () => ({
	AppDataSource: {
		getRepository: jest.fn((entity: any) => {
			const name = entity?.name ?? entity;
			if (name === 'AuditLog') {
				return { createQueryBuilder: () => makeQueryBuilder(mockExecuteAuditLog, mockWhereAuditLog) };
			}
			if (name === 'DomainAuditLog') {
				return { createQueryBuilder: () => makeQueryBuilder(mockExecuteDomain, mockWhereDomain) };
			}
			if (name === 'CommunityAuditLog') {
				return { createQueryBuilder: () => makeQueryBuilder(mockExecuteCommunity, mockWhereCommunity) };
			}
			throw new Error(`Unexpected entity in test: ${name}`);
		}),
	},
}));

import { AuditRetentionService } from '../../services/auditRetentionService';

describe('AuditRetentionService.performCleanup', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockExecuteAuditLog.mockResolvedValue({ affected: 3 });
		mockExecuteDomain.mockResolvedValue({ affected: 7 });
		mockExecuteCommunity.mockResolvedValue({ affected: 2 });
	});

	it('borra las tres tablas y devuelve el conteo por tabla', async () => {
		const service = new (AuditRetentionService as any)();
		const result = await service.performCleanup(90);

		expect(result).toEqual({ auditLogs: 3, domainAuditLog: 7, communityAuditLog: 2 });
	});

	it('usa el mismo cutoff (hoy - retentionDays) en las tres tablas', async () => {
		const service = new (AuditRetentionService as any)();
		await service.performCleanup(30);

		for (const whereMock of [mockWhereAuditLog, mockWhereDomain, mockWhereCommunity]) {
			expect(whereMock).toHaveBeenCalledTimes(1);
			expect(whereMock.mock.calls[0][0]).toBe('createdAt < :cutoffDate');
		}
		const expectedCutoff = new Date();
		expectedCutoff.setDate(expectedCutoff.getDate() - 30);
		const cutoffs = [mockWhereAuditLog, mockWhereDomain, mockWhereCommunity].map(
			(m) => m.mock.calls[0][1].cutoffDate as Date,
		);
		// Misma fecha (con 1s de margen por el reloj) en las tres, y coincide
		// con "hoy - retentionDays".
		for (const cutoff of cutoffs) {
			expect(Math.abs(cutoff.getTime() - expectedCutoff.getTime())).toBeLessThan(1000);
		}
		expect(Math.abs(cutoffs[0].getTime() - cutoffs[1].getTime())).toBeLessThan(1000);
		expect(Math.abs(cutoffs[1].getTime() - cutoffs[2].getTime())).toBeLessThan(1000);
	});

	it('un fallo en una tabla no bloquea la limpieza de las otras dos', async () => {
		mockExecuteDomain.mockRejectedValue(new Error('DB down'));
		const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

		const service = new (AuditRetentionService as any)();
		const result = await service.performCleanup(90);

		expect(result).toEqual({ auditLogs: 3, domainAuditLog: 0, communityAuditLog: 2 });
		expect(consoleErrorSpy).toHaveBeenCalled();
		consoleErrorSpy.mockRestore();
	});

	it('nunca lanza (fire-and-forget, igual que el resto de servicios de limpieza)', async () => {
		mockExecuteAuditLog.mockRejectedValue(new Error('boom'));
		mockExecuteDomain.mockRejectedValue(new Error('boom'));
		mockExecuteCommunity.mockRejectedValue(new Error('boom'));
		jest.spyOn(console, 'error').mockImplementation(() => {});

		const service = new (AuditRetentionService as any)();
		await expect(service.performCleanup(90)).resolves.toEqual({
			auditLogs: 0,
			domainAuditLog: 0,
			communityAuditLog: 0,
		});
	});
});
