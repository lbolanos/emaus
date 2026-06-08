import { auditContext } from '@/utils/auditContext';

describe('auditContext (AsyncLocalStorage)', () => {
	it('expone el contexto dentro de run()', () => {
		auditContext.run({ userId: 'u1', ip: '1.2.3.4', userAgent: 'jest' }, () => {
			expect(auditContext.getUserId()).toBe('u1');
			expect(auditContext.getIp()).toBe('1.2.3.4');
			expect(auditContext.getUserAgent()).toBe('jest');
			expect(auditContext.get()).toEqual({ userId: 'u1', ip: '1.2.3.4', userAgent: 'jest' });
		});
	});

	it('propaga el contexto a callbacks async anidados', async () => {
		await auditContext.run({ userId: 'u2', ip: null, userAgent: null }, async () => {
			await Promise.resolve();
			await new Promise((r) => setTimeout(r, 1));
			expect(auditContext.getUserId()).toBe('u2');
		});
	});

	it('aísla contextos de runs concurrentes', async () => {
		const results: Array<string | null> = [];
		await Promise.all([
			auditContext.run({ userId: 'a' }, async () => {
				await new Promise((r) => setTimeout(r, 5));
				results.push(auditContext.getUserId());
			}),
			auditContext.run({ userId: 'b' }, async () => {
				await new Promise((r) => setTimeout(r, 1));
				results.push(auditContext.getUserId());
			}),
		]);
		expect(results.sort()).toEqual(['a', 'b']);
	});

	it('devuelve null/undefined fuera de un run, sin lanzar', () => {
		expect(auditContext.get()).toBeUndefined();
		expect(auditContext.getUserId()).toBeNull();
		expect(auditContext.getIp()).toBeNull();
		expect(auditContext.getUserAgent()).toBeNull();
	});
});
