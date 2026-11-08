import { spawn } from 'child_process';
import { config } from '../../config';

/**
 * Runner of the wacli binary for the read-only bridge (specs/whatsapp-inbox).
 *
 * Discipline inherited from the audited whatsapp-mcp wrapper:
 *  - ALWAYS an argv array, never a shell (stores and JIDs go as arguments).
 *  - One-shot reads with `--read-only --json`: the JSON envelope carries
 *    `data` on stdout and the error in its own envelope or on stderr.
 *  - Hard timeout with SIGKILL: a locked store cannot hang the API.
 *  - `send` DOES NOT EXIST in this module — structurally read-only (spec D1).
 *    The only writing command allowed is `auth logout` (unlink).
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

/** Store chat (defensive shape: wacli may add fields). */
export interface WacliChat {
	jid: string;
	name?: string | null;
	lastMessageTimestamp?: string | null;
	unreadCount?: number | null;
	[key: string]: unknown;
}

/** Store message (defensive shape). */
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

/** Result of `auth status`. */
export interface WacliAuthStatus {
	authenticated: boolean;
	phone?: string | null;
	linkedJid?: string | null;
	[key: string]: unknown;
}

/**
 * Child env: essentials only. The user's store must not be able to read the
 * API process' files through inherited descriptors — PATH and HOME suffice.
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

/** wacli JSON envelope: `data` on success, `error` on failure. */
interface WacliEnvelope {
	data?: unknown;
	error?: unknown;
	ok?: unknown;
}

/** Extracts `data` from the JSON envelope; throws WacliError on an error envelope. */
function parseEnvelope(stdout: string, stderr: string, code: number | null): unknown {
	let envelope: WacliEnvelope | null = null;
	try {
		envelope = JSON.parse(stdout) as WacliEnvelope;
	} catch {
		// No parseable JSON: falls through to the exit-code check below.
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
	// exit 0 without an envelope: wacli answered empty (e.g. a list with no rows).
	return envelope ?? null;
}

/** Read-only one-shot: [bin, --store DIR, --read-only, --json, ...args]. */
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

/** `auth logout`: the only writing command allowed (needs the supervisor stopped). */
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
	opts: { limit?: number; afterIso?: string | null; newestFirst?: boolean } = {},
): Promise<WacliMessage[]> {
	// Both directions (v1.3): the staff's own replies to walkers are stored so
	// the inbox can show "answered by X". Whitelisting by chat stays upstream.
	// Oldest first by default (incremental paging); `newestFirst` drops
	// `--asc` — wacli's default order is newest first (verified on v0.21.0).
	const args = ['messages', 'list', '--chat', chatJid];
	if (!opts.newestFirst) args.push('--asc');
	args.push('--limit', String(opts.limit ?? 50));
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

/**
 * Downloads a message's media to `outputPath` (FR14 receipts, v1.3 documents
 * and voice notes).
 *
 * `--read-only` with `--output` takes no store lock: it runs next to the live
 * sync (v1.2), with no stop/restart of the supervisor.
 */
export async function mediaDownload(
	storeDir: string,
	chatJid: string,
	waMessageId: string,
	outputPath: string,
	timeoutSeconds = 120,
): Promise<void> {
	const { stdout, stderr, code } = await runWacli(
		[
			'--store',
			storeDir,
			'--json',
			'media',
			'download',
			// read-only takes NO store lock (v1.2): the download runs while the
			// sync is alive — no stop/restart cycle per image.
			'--read-only',
			'--chat',
			chatJid,
			'--id',
			waMessageId,
			'--output',
			outputPath,
		],
		{ timeoutSeconds },
	);
	parseEnvelope(stdout, stderr, code);
}
