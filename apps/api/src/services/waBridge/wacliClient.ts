import { spawn } from 'child_process';
import { config } from '../../config';

/**
 * Ejecutor del binario wacli para el puente de lectura (specs/whatsapp-inbox).
 *
 * Disciplina heredada del wrapper auditado de whatsapp-mcp:
 *  - argv-array SIEMPRE, jamás shell (los stores y JIDs van como argumentos).
 *  - Lecturas one-shot con `--read-only --json`: el envelope JSON trae `data`
 *    en stdout y el error en un envelope propio o en stderr.
 *  - Timeout duro con SIGKILL: un store bloqueado no puede colgar al API.
 *  - `send` NO EXISTE en este módulo — read-only estructural (spec D1). El
 *    único comando escritor permitido es `auth logout` (desvinculación).
 */

export class WacliError extends Error {
	constructor(
		message: string,
		public readonly stderrTail?: string,
	) {
		super(message);
		this.name = 'WacliError';
	}
}

/** Chat del store (forma defensiva: wacli puede añadir campos). */
export interface WacliChat {
	jid: string;
	name?: string | null;
	lastMessageTimestamp?: string | null;
	unreadCount?: number | null;
	[key: string]: unknown;
}

/** Mensaje del store (forma defensiva). */
export interface WacliMessage {
	id: string;
	chatJid?: string | null;
	senderJid?: string | null;
	timestamp?: string | null;
	fromMe?: boolean | null;
	body?: string | null;
	messageType?: string | null;
	[key: string]: unknown;
}

/** Resultado de `auth status`. */
export interface WacliAuthStatus {
	authenticated: boolean;
	phone?: string | null;
	linkedJid?: string | null;
	[key: string]: unknown;
}

/**
 * Env del hijo: solo lo esencial. El store del usuario no debe poder leer
 * archivos del proceso API por herencia de descriptores — PATH y HOME basta.
 */
function childEnv(): NodeJS.ProcessEnv {
	return {
		PATH: process.env.PATH,
		HOME: process.env.HOME,
	};
}

interface RunResult {
	stdout: string;
	stderr: string;
	code: number | null;
}

function runWacli(
	args: string[],
	opts: { timeoutSeconds: number; onTimeout?: 'kill' } = { timeoutSeconds: config.waBridge.commandTimeoutSeconds },
): Promise<RunResult> {
	return new Promise((resolve, reject) => {
		let child;
		try {
			child = spawn(config.waBridge.wacliBin, args, {
				env: childEnv(),
				stdio: ['ignore', 'pipe', 'pipe'],
			});
		} catch (err) {
			reject(new WacliError(`cannot spawn wacli: ${(err as Error).message}`));
			return;
		}

		let stdout = '';
		let stderr = '';
		let settled = false;
		const timer = setTimeout(() => {
			if (settled) return;
			settled = true;
			child.kill('SIGKILL');
			reject(new WacliError(`wacli timed out after ${opts.timeoutSeconds}s`));
		}, opts.timeoutSeconds * 1000);

		child.stdout?.on('data', (chunk: Buffer) => {
			stdout += chunk.toString('utf8');
		});
		child.stderr?.on('data', (chunk: Buffer) => {
			stderr += chunk.toString('utf8');
		});
		child.on('error', (err) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			reject(new WacliError(`cannot start wacli: ${err.message}`));
		});
		child.on('close', (code) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve({ stdout, stderr, code });
		});
	});
}

/** Envelope JSON de wacli: `data` en éxito, `error` en fallo. */
interface WacliEnvelope {
	data?: unknown;
	error?: unknown;
	ok?: unknown;
}

/** Extrae `data` del envelope JSON; lanza WacliError si el envelope trae error. */
function parseEnvelope(stdout: string, stderr: string, code: number | null): unknown {
	let envelope: WacliEnvelope | null = null;
	try {
		envelope = JSON.parse(stdout) as WacliEnvelope;
	} catch {
		// Sin JSON parseable: cae al chequeo de exit code abajo.
	}
	if (envelope && envelope.error) {
		const detail = typeof envelope.error === 'string' ? envelope.error : JSON.stringify(envelope.error);
		throw new WacliError(`wacli error: ${detail}`, stderr.slice(-500) || undefined);
	}
	if (envelope && envelope.data !== undefined) {
		return envelope.data;
	}
	if (code !== 0) {
		throw new WacliError(
			`wacli exited with code ${code ?? 'null'}`,
			(stderr || stdout).slice(-500) || undefined,
		);
	}
	// exit 0 sin envelope: wacli respondió vacío (p. ej. lista sin filas).
	return envelope ?? null;
}

/** Lectura one-shot read-only: [bin, --store DIR, --read-only, --json, ...args]. */
export async function wacliRead<T = unknown>(
	storeDir: string,
	args: string[],
	timeoutSeconds = config.waBridge.commandTimeoutSeconds,
): Promise<T> {
	const { stdout, stderr, code } = await runWacli(
		['--store', storeDir, '--read-only', '--json', ...args],
		{ timeoutSeconds },
	);
	return parseEnvelope(stdout, stderr, code) as T;
}

/** `auth logout`: único comando escritor permitido (requiere supervisor parado). */
export async function wacliLogout(storeDir: string): Promise<void> {
	const { stdout, stderr, code } = await runWacli(['--store', storeDir, '--json', 'auth', 'logout'], {
		timeoutSeconds: Math.max(config.waBridge.commandTimeoutSeconds, 30),
	});
	parseEnvelope(stdout, stderr, code);
}

export async function listChats(storeDir: string, limit = 100): Promise<WacliChat[]> {
	const data = await wacliRead<WacliChat[] | { chats?: WacliChat[] }>(storeDir, [
		'chats',
		'list',
		'--limit',
		String(limit),
	]);
	if (Array.isArray(data)) return data;
	if (data && Array.isArray((data as { chats?: WacliChat[] }).chats)) {
		return (data as { chats: WacliChat[] }).chats;
	}
	return [];
}

export async function listMessages(
	storeDir: string,
	chatJid: string,
	opts: { limit?: number; afterIso?: string | null } = {},
): Promise<WacliMessage[]> {
	const args = [
		'messages',
		'list',
		'--chat',
		chatJid,
		// Solo entrantes: el filtro fromMe se aplica en origen, no en insert.
		'--from-them',
		'--asc',
		'--limit',
		String(opts.limit ?? 50),
	];
	if (opts.afterIso) {
		args.push('--after', opts.afterIso);
	}
	const data = await wacliRead<WacliMessage[] | { messages?: WacliMessage[] }>(storeDir, args);
	if (Array.isArray(data)) return data;
	if (data && Array.isArray((data as { messages?: WacliMessage[] }).messages)) {
		return (data as { messages: WacliMessage[] }).messages;
	}
	return [];
}

export async function authStatus(storeDir: string): Promise<WacliAuthStatus> {
	return wacliRead<WacliAuthStatus>(storeDir, ['auth', 'status']);
}
