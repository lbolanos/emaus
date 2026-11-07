/**
 * Tests del supervisor del puente (specs/whatsapp-inbox, M2).
 *
 * Foco en el parseo de eventos NDJSON de wacli (lo que decide las transiciones
 * de estado del vínculo) y en el guard de huérfanos. El ciclo de spawn/restart
 * real se ejercita en el QA manual de M5 contra el binario fijado.
 */
import { parseWacliEventLine, WaBridgeSupervisor } from '@/services/waBridge/waBridgeSupervisor';

describe('parseWacliEventLine', () => {
	it('parsea el evento de QR con su código', () => {
		const line = JSON.stringify({ type: 'qr_code', code: 'waid://ABCDEF/123456' });
		expect(parseWacliEventLine(line)).toEqual({
			type: 'qr',
			qr: 'waid://ABCDEF/123456',
		});
	});

	it('acepta el código anidado en data (forma alternativa)', () => {
		const line = JSON.stringify({ type: 'qr', data: { code: 'waid://XYZ/987' } });
		expect(parseWacliEventLine(line)).toEqual({ type: 'qr', qr: 'waid://XYZ/987' });
	});

	it('parsea connected y logged_out; warning se ignora (ruido, v1.1)', () => {
		expect(parseWacliEventLine(JSON.stringify({ type: 'connected' }))).toEqual({ type: 'connected' });
		expect(parseWacliEventLine(JSON.stringify({ type: 'session_logged_out' }))).toEqual({
			type: 'logged_out',
		});
		// Los warnings de wacli (keepalive, storage uncapped) son ruido: ignorados.
		expect(parseWacliEventLine(JSON.stringify({ type: 'warning', message: 'keepalive retry' }))).toEqual({
			type: 'ignored',
		});
		const err = parseWacliEventLine(JSON.stringify({ type: 'error', message: 'store locked' }));
		expect(err).toEqual({ type: 'error', message: 'store locked' });
	});

	it('devuelve null para líneas que no son eventos: log suelto, NDJSON truncado, vacío', () => {
		expect(parseWacliEventLine('wacli: syncing…')).toBeNull();
		expect(parseWacliEventLine('{"type": "trunc')).toBeNull();
		expect(parseWacliEventLine('')).toBeNull();
		expect(parseWacliEventLine('   ')).toBeNull();
	});

	it('ignora tipos de evento desconocidos (forward-compatible)', () => {
		expect(parseWacliEventLine(JSON.stringify({ type: 'receipt', ack: 2 }))).toBeNull();
		expect(parseWacliEventLine(JSON.stringify({ type: 'chat_presence' }))).toBeNull();
	});
});

describe('WaBridgeSupervisor — guard de huérfanos y parada', () => {
	it('killOrphans es no-op fuera de Linux (macOS dev sin /proc)', () => {
		const supervisor = new WaBridgeSupervisor('l1', '/tmp/store-nonexistent', () => {});
		expect(() => (supervisor as unknown as { killOrphans: () => void }).killOrphans()).not.toThrow();
	});

	it('stop() es idempotente y seguro sin hijo vivo', async () => {
		const supervisor = new WaBridgeSupervisor('l2', '/tmp/store-nonexistent', () => {});
		await expect(supervisor.stop()).resolves.toBeUndefined();
		await expect(supervisor.stop()).resolves.toBeUndefined();
	});

	it('killAll estático no revienta con instancias registradas', () => {
		const unused = new WaBridgeSupervisor('l3', '/tmp/store-nonexistent', () => {});
		expect(() => WaBridgeSupervisor.killAll()).not.toThrow();
		void unused;
	});
});
