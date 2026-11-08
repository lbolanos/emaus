import { spawn, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import { config } from '../../config';

/**
 * Supervisor of a link's long-running wacli process (specs/whatsapp-inbox).
 *
 * Node port of the audited wrapper's Python supervisor: one child per store
 * (`auth` until paired, `sync --follow` afterwards), NDJSON events on stderr,
 * restart with exponential backoff, a backoff cap and a clean stop
 * (SIGTERM → SIGKILL). The store lock prevents two writing children; a SIGKILL
 * of the API can leave orphans holding the lock, hence the /proc guard before
 * every spawn (Linux only).
 */

export type WaSupervisorMode = 'auth' | 'sync';

export type WaSupervisorEventType =
	| 'qr'
	| 'connected'
	| 'logged_out'
	| 'warning'
	| 'error'
	| 'ignored'
	| 'auth_exit'
	| 'child_exit';

export interface WaSupervisorEvent {
	type: WaSupervisorEventType;
	/** Rotated QR code (~20 s), only on 'qr'. */
	qr?: string;
	message?: string;
	/** Child exit code, only on '*_exit'. */
	code?: number | null;
	mode?: WaSupervisorMode;
}

const MAX_BACKOFF_MS = 60_000;
const KILL_GRACE_MS = 5_000;

/** Informational wacli events that are neither logged nor raised (sync noise). */
const KNOWN_NOISE_EVENT =
	/"event":"(progress|idle_exit|offline_sync_completed|auth_starting|history_sync_suppressed|warning)"/;

/** Signal to the child's GROUP (shell + grandchildren); falls back to the child. */
function killProcessGroup(child: ChildProcess, signal: NodeJS.Signals, detached: boolean): void {
	if (process.platform !== 'win32' && detached && child.pid) {
		process.kill(-child.pid, signal);
		return;
	}
	child.kill(signal);
}

/** wacli NDJSON events → supervisor events (defensive shapes). */
export function parseWacliEventLine(line: string): WaSupervisorEvent | null {
	const trimmed = line.trim();
	if (!trimmed.startsWith('{')) return null;
	let evt: Record<string, unknown>;
	try {
		evt = JSON.parse(trimmed) as Record<string, unknown>;
	} catch {
		return null;
	}
	const rawType = String(evt.type ?? evt.event ?? '').trim();
	const str = (key: string): string | undefined => {
		const v = evt[key];
		return typeof v === 'string' && v.length > 0 ? v : undefined;
	};
	const nested = (evt.data ?? evt.payload) as Record<string, unknown> | undefined;
	const fromNested = (key: string): string | undefined => {
		const v = nested?.[key];
		return typeof v === 'string' && v.length > 0 ? v : undefined;
	};
	// The real binary nests message/code inside data (v0.21.0 verified:
	// {"event":"error","data":{"message":…}}, {"event":"qr_code","data":{"code":…}}).
	const message = str('message') ?? fromNested('message') ?? str('error');

	switch (rawType) {
		// Sync/import informational events: not raised (QA 2026-11-07).
		case 'progress':
		case 'idle_exit':
		case 'offline_sync_completed':
		case 'auth_starting':
		case 'history_sync_suppressed':
		case 'warning':
			return { type: 'ignored' };
		case 'qr_code':
		case 'qr':
			return { type: 'qr', qr: str('code') ?? fromNested('code') ?? str('qr') };
		case 'connected':
		case 'pair_success':
			return { type: 'connected' };
		case 'session_logged_out':
		case 'logged_out':
			return { type: 'logged_out' };
		case 'error':
			return { type: 'error', message: message ?? str('error') };
		default:
			return null;
	}
}

export class WaBridgeSupervisor {
	private child: ChildProcess | null = null;
	private mode: WaSupervisorMode | null = null;
	private stopped = false;
	private lastStderrLine = '';
	private backoffMs: number = config.waBridge.restartBackoffSeconds * 1000;
	/** The spawn uses its own process group (except Windows) — stop() checks it. */
	private readonly spawnedDetached = process.platform !== 'win32';
	private restartTimer: NodeJS.Timeout | null = null;
	private killTimer: NodeJS.Timeout | null = null;
	private static readonly instances = new Set<WaBridgeSupervisor>();

	constructor(
		readonly linkId: string,
		readonly storeDir: string,
		private readonly onEvent: (event: WaSupervisorEvent) => void,
	) {
		WaBridgeSupervisor.instances.add(this);
	}

	/** Pairing: emits the QR through events and exits on its own after the bootstrap. */
	startAuth(): void {
		this.stopped = false;
		this.spawnMode('auth', [
			'auth',
			'--qr-format',
			'text',
			'--history-days',
			String(config.waBridge.historyDays),
		]);
	}

	/** Long-running sync; quiet presence (no "seen" shown to the walker). */
	startSync(): void {
		this.stopped = false;
		this.spawnMode('sync', [
			'sync',
			'--follow',
			'--presence-mode',
			'quiet',
			'--max-messages',
			String(config.waBridge.syncMaxMessages),
			'--max-db-size',
			`${config.waBridge.syncMaxDbSizeMb}MB`,
			'--max-reconnect',
			'0',
		]);
	}

	/**
	 * A SIGKILL of the API leaves wacli children alive holding the store lock;
	 * the respawn would then die in a lock-contention loop. Defensive sweep
	 * before every spawn (Linux only; macOS dev has no /proc).
	 */
	private killOrphans(): void {
		if (process.platform !== 'linux') return;
		try {
			const pids = fs.readdirSync('/proc').filter((name) => /^\d+$/.test(name));
			for (const pid of pids) {
				try {
					const cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
					if (cmdline.includes(this.storeDir) && cmdline.includes('wacli')) {
						process.kill(Number(pid), 'SIGKILL');
					}
				} catch {
					// The process died between readdir and read: nothing to do.
				}
			}
		} catch {
			// /proc unavailable: it does not block the spawn.
		}
	}

	private spawnMode(mode: WaSupervisorMode, commandArgs: string[]): void {
		if (this.stopped) return;
		this.killOrphans();

		// auth does NOT take --json: it conflicts with --qr-format (both write to
		// stdout — verified against the real v0.21.0 binary in QA).
		const globalFlags = mode === 'sync' ? ['--json'] : [];
		let child: ChildProcess;
		try {
			child = spawn(
				config.waBridge.wacliBin,
				['--store', this.storeDir, ...globalFlags, '--events', ...commandArgs],
				{
					env: { PATH: process.env.PATH, HOME: process.env.HOME },
					stdio: ['ignore', 'pipe', 'pipe'],
					// Own process group: stop kills the shell AND its children (the
					// `sleep` grandchild inherits the pipes and 'close' would not fire).
					detached: process.platform !== 'win32',
				},
			);
		} catch (err) {
			this.onEvent({ type: 'error', message: `cannot start wacli: ${(err as Error).message}` });
			return;
		}

		this.child = child;
		this.mode = mode;
		const buffer = (chunk: Buffer, isStderr: boolean) => {
			for (const line of chunk.toString('utf8').split('\n')) {
				const trimmed = line.trim();
				if (!trimmed) continue;
				if (isStderr) this.lastStderrLine = trimmed.slice(0, 200);
				const evt = parseWacliEventLine(trimmed);
				if (evt) {
					if (evt.type !== 'ignored') this.onEvent(evt);
					continue;
				}
				// QA/ops (stderr only): NDJSON lines the parser does not know yet
				// go to the log — that is how each event's real name is found.
				if (isStderr && trimmed.startsWith('{') && !KNOWN_NOISE_EVENT.test(trimmed)) {
					console.log(
						`[waBridge][${this.linkId}] unrecognized event: ${trimmed.slice(0, 160)}`,
					);
				}
			}
		};
		child.stdout?.on('data', (chunk: Buffer) => buffer(chunk, false));
		child.stderr?.on('data', (chunk: Buffer) => buffer(chunk, true));
		child.on('error', (err) => {
			this.onEvent({ type: 'error', message: `wacli ${mode} spawn error: ${err.message}` });
		});
		child.on('close', (code) => {
			this.child = null;
			if (this.stopped) return;
			if (mode === 'auth') {
				// The bootstrap exits by itself (exit 0) after importing history;
				// the service checks auth status and decides whether to go to sync.
				this.onEvent({ type: 'auth_exit', code, mode });
				return;
			}
			// The last raw stderr line is the child's cause of death.
			this.onEvent({
				type: 'child_exit',
				code,
				mode,
				message: this.lastStderrLine || undefined,
			});
			this.scheduleRestart();
		});
	}

	private scheduleRestart(): void {
		if (this.stopped || this.mode !== 'sync') return;
		if (this.restartTimer) return;
		this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
		this.restartTimer = setTimeout(() => {
			this.restartTimer = null;
			this.startSync();
		}, this.backoffMs);
		this.restartTimer.unref();
	}

	/** Backoff resets on connect (the service's 'connected' event). */
	resetBackoff(): void {
		this.backoffMs = config.waBridge.restartBackoffSeconds * 1000;
	}

	/**
	 * Clean stop: signal the process GROUP (shell + grandchildren) and resolve
	 * on `exit` — NOT on `close`: the grandchild (a shell wrapper's `sleep`)
	 * inherits the stdio pipes and `close` can wait as long as it lives. A hang
	 * here hangs the whole API on the endpoint that calls stop (QA 2026-11-06:
	 * POST /receipt frozen 25 s+).
	 */
	async stop(): Promise<void> {
		this.stopped = true;
		if (this.restartTimer) {
			clearTimeout(this.restartTimer);
			this.restartTimer = null;
		}
		const child = this.child;
		if (!child) return;
		return new Promise((resolve) => {
			let done = false;
			const finish = () => {
				if (done) return;
				done = true;
				clearTimeout(killTimer);
				resolve();
			};
			const killTimer = setTimeout(() => {
				try {
					killProcessGroup(child, 'SIGKILL', this.spawnedDetached);
				} catch {
					// Already dead.
				}
			}, KILL_GRACE_MS);
			child.once('exit', () => {
				// Destroy the pipes in case a grandchild holds them: otherwise Node's
				// internal 'close' does not clean up and the fds stay open.
				child.stdout?.destroy();
				child.stderr?.destroy();
				finish();
			});
			try {
				killProcessGroup(child, 'SIGTERM', this.spawnedDetached);
			} catch {
				clearTimeout(killTimer);
				finish();
			}
		});
	}

	static killAll(): void {
		for (const instance of Array.from(WaBridgeSupervisor.instances)) {
			void instance.stop();
		}
		WaBridgeSupervisor.instances.clear();
	}
}
