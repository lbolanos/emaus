import { spawn, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import { config } from '../../config';

/**
 * Supervisor del proceso wacli persistente de un vínculo (specs/whatsapp-inbox).
 *
 * Port en Node del supervisor Python del wrapper auditado: un hijo por store
 * (`auth` mientras no emparejado, `sync --follow` después), eventos NDJSON por
 * stderr, restart con backoff exponencial, tope de backoff y parada limpia
 * (SIGTERM → SIGKILL). El lock del store impide dos hijos escribiendo; un
 * SIGKILL del API puede dejar huérfanos con el lock tomado, y por eso existe
 * el guard de /proc antes de cada spawn (solo Linux).
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
	/** Código QR rotado (~20 s), solo en 'qr'. */
	qr?: string;
	message?: string;
	/** Código de salida del hijo, solo en '*_exit'. */
	code?: number | null;
	mode?: WaSupervisorMode;
}

const MAX_BACKOFF_MS = 60_000;
const KILL_GRACE_MS = 5_000;

/** Eventos informativos de wacli que NO se loguean ni elevan (ruido de sync). */
const KNOWN_NOISE_EVENT =
	/"event":"(progress|idle_exit|offline_sync_completed|auth_starting|history_sync_suppressed|warning)"/;

/** Señal al GRUPO del hijo (shell + nietos); fallback al hijo directo. */
function killProcessGroup(child: ChildProcess, signal: NodeJS.Signals, detached: boolean): void {
	if (process.platform !== 'win32' && detached && child.pid) {
		process.kill(-child.pid, signal);
		return;
	}
	child.kill(signal);
}

/** Events NDJSON de wacli → eventos del supervisor (formas defensivas). */
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
	// El binario real anida message/code dentro de data (v0.21.0 verificado:
	// {"event":"error","data":{"message":…}}, {"event":"qr_code","data":{"code":…}}).
	const message = str('message') ?? fromNested('message') ?? str('error');

	switch (rawType) {
		// Informativos del sync/import: no se elevan (QA 2026-11-07).
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
	private backoffMs: number = config.waBridge.restartBackoffSeconds * 1000;
	/** El spawn usa grupo de procesos propio (excepto Windows) — lo consulta el stop. */
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

	/** Emparejamiento: emite QR por eventos y sale solo tras el bootstrap. */
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

	/** Sync persistente; presencia quiet (sin "visto" ante el caminante). */
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
	 * Un SIGKILL del API deja hijos wacli vivos que sostienen el lock del store;
	 * el respawn moriría en loop por lock contention. Barrido defensivo antes de
	 * cada spawn (solo Linux; en macOS dev no hay /proc).
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
					// El proceso murió entre readdir y read: no pasa nada.
				}
			}
		} catch {
			// /proc no disponible: no bloquea el spawn.
		}
	}

	private spawnMode(mode: WaSupervisorMode, commandArgs: string[]): void {
		if (this.stopped) return;
		this.killOrphans();

		// El auth NO lleva --json: conflicta con --qr-format (ambos escriben a
		// stdout — verificado contra el binario real v0.21.0 en el QA).
		const globalFlags = mode === 'sync' ? ['--json'] : [];
		let child: ChildProcess;
		try {
			child = spawn(
				config.waBridge.wacliBin,
				['--store', this.storeDir, ...globalFlags, '--events', ...commandArgs],
				{
					env: { PATH: process.env.PATH, HOME: process.env.HOME },
					stdio: ['ignore', 'pipe', 'pipe'],
					// Grupo de procesos propio: el stop mata al shell Y a sus hijos
					// (el `sleep` nieto hereda los pipes y 'close' no dispararía).
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
				const evt = parseWacliEventLine(line);
				if (evt) {
					if (evt.type !== 'ignored') this.onEvent(evt);
					continue;
				}
				// QA/ops (solo stderr): los NDJSON que el parser aún no reconoce
				// quedan en el log — así se descubre el nombre real de cada evento.
				const trimmed = line.trim();
				if (isStderr && trimmed.startsWith('{') && !KNOWN_NOISE_EVENT.test(trimmed)) {
					console.log(
						`[waBridge][${this.linkId}] evento no reconocido: ${trimmed.slice(0, 160)}`,
					);
				}
			}
		};
		child.stdout?.on('data', (chunk: Buffer) => buffer(chunk, false));
		child.stderr?.on('data', (chunk: Buffer) => buffer(chunk, true));
		child.on('error', (err) => {
			this.onEvent({ type: 'error', message: `wacli ${mode} spawn error: ${err.message}` });
		});
		// QA/ops: los eventos NDJSON que el parser aún no reconoce quedan en el
		// log — es como se descubre el nombre real de cada evento del binario.
		child.stderr?.on('data', (chunk: Buffer) => {
			for (const line of chunk.toString('utf8').split('\n')) {
				const trimmed = line.trim();
				if (trimmed.startsWith('{') && !parseWacliEventLine(trimmed)) {
					console.log(`[waBridge][${this.linkId}] evento NDJSON no reconocido: ${trimmed.slice(0, 160)}`);
				}
			}
		});
		child.on('close', (code) => {
			this.child = null;
			if (this.stopped) return;
			if (mode === 'auth') {
				// El bootstrap sale solo (exit 0) tras importar el historial; el
				// servicio consulta auth status y decide si pasa a sync.
				this.onEvent({ type: 'auth_exit', code, mode });
				return;
			}
			this.onEvent({ type: 'child_exit', code, mode });
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

	/** El backoff se resetea al conectar (evento 'connected' del servicio). */
	resetBackoff(): void {
		this.backoffMs = config.waBridge.restartBackoffSeconds * 1000;
	}

	/**
	 * Parada limpia: señal al GRUPO de procesos (shell + nietos) y resolución
	 * por `exit` — NO por `close`: el nieto (`sleep` de un wrapper shell)
	 * hereda los pipes de stdio y `close` puede tardar lo que dure el nieto.
	 * Colgado aquí = el API entero se cuelga en el endpoint que llame a stop
	 * (incidencia del QA 2026-11-06: POST /receipt congelado 25 s+).
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
					// Ya murió.
				}
			}, KILL_GRACE_MS);
			child.once('exit', () => {
				// Destruir los pipes por si un nieto los sostiene: sin esto el
				// 'close' interno de Node no limpia y los fd quedan abiertos.
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
