/**
 * Tests of the bridge supervisor (specs/whatsapp-inbox, M2).
 *
 * Focus on parsing wacli's NDJSON events (what drives the link's state
 * transitions) and on the orphan guard. The real spawn/restart cycle is
 * exercised in the manual QA (M5) against the pinned binary.
 */
import { parseWacliEventLine, WaBridgeSupervisor } from '@/services/waBridge/waBridgeSupervisor';

describe('parseWacliEventLine', () => {
	it('parses the QR event with its code', () => {
		const line = JSON.stringify({ type: 'qr_code', code: 'waid://ABCDEF/123456' });
		expect(parseWacliEventLine(line)).toEqual({
			type: 'qr',
			qr: 'waid://ABCDEF/123456',
		});
	});

	it('accepts the code nested in data (alternative shape)', () => {
		const line = JSON.stringify({ type: 'qr', data: { code: 'waid://XYZ/987' } });
		expect(parseWacliEventLine(line)).toEqual({ type: 'qr', qr: 'waid://XYZ/987' });
	});

	it('parses connected and logged_out; warning is ignored (noise, v1.1)', () => {
		expect(parseWacliEventLine(JSON.stringify({ type: 'connected' }))).toEqual({ type: 'connected' });
		expect(parseWacliEventLine(JSON.stringify({ type: 'session_logged_out' }))).toEqual({
			type: 'logged_out',
		});
		// wacli warnings (keepalive, storage uncapped) are noise: ignored.
		expect(parseWacliEventLine(JSON.stringify({ type: 'warning', message: 'keepalive retry' }))).toEqual({
			type: 'ignored',
		});
		const err = parseWacliEventLine(JSON.stringify({ type: 'error', message: 'store locked' }));
		expect(err).toEqual({ type: 'error', message: 'store locked' });
	});

	it('returns null for non-event lines: loose log, truncated NDJSON, empty', () => {
		expect(parseWacliEventLine('wacli: syncing…')).toBeNull();
		expect(parseWacliEventLine('{"type": "trunc')).toBeNull();
		expect(parseWacliEventLine('')).toBeNull();
		expect(parseWacliEventLine('   ')).toBeNull();
	});

	it('ignores unknown event types (forward-compatible)', () => {
		expect(parseWacliEventLine(JSON.stringify({ type: 'receipt', ack: 2 }))).toBeNull();
		expect(parseWacliEventLine(JSON.stringify({ type: 'chat_presence' }))).toBeNull();
	});
});

describe('WaBridgeSupervisor — orphan guard and stop', () => {
	it('killOrphans is a no-op outside Linux (macOS dev has no /proc)', () => {
		const supervisor = new WaBridgeSupervisor('l1', '/tmp/store-nonexistent', () => {});
		expect(() => (supervisor as unknown as { killOrphans: () => void }).killOrphans()).not.toThrow();
	});

	it('stop() is idempotent and safe without a live child', async () => {
		const supervisor = new WaBridgeSupervisor('l2', '/tmp/store-nonexistent', () => {});
		await expect(supervisor.stop()).resolves.toBeUndefined();
		await expect(supervisor.stop()).resolves.toBeUndefined();
	});

	it('static killAll does not blow up with registered instances', () => {
		const unused = new WaBridgeSupervisor('l3', '/tmp/store-nonexistent', () => {});
		expect(() => WaBridgeSupervisor.killAll()).not.toThrow();
		void unused;
	});
});
