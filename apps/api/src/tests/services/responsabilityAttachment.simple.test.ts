/**
 * Responsability Attachment — pure business logic tests (no DB required).
 *
 * Cubre la lógica que vive en:
 *   - apps/api/src/services/responsabilityAttachmentService.ts
 *   - apps/api/src/data/responsabilityAttachmentSeeder.ts
 *   - apps/api/src/services/retreatScheduleService.ts (populateTemplateAttachments)
 *
 * No toca TypeORM ni DB; replicamos la lógica pura para verificar reglas
 * críticas: validación de mime/tamaño, idempotencia, slug, JOIN por nombre.
 */

// ── Types ─────────────────────────────────────────────────────────────────────
interface Attachment {
	id: string;
	responsabilityName: string;
	kind: 'file' | 'markdown';
	fileName: string;
	mimeType: string;
	sizeBytes: number;
	storageUrl: string;
	storageKey: string | null;
	content: string | null;
	description: string | null;
	sortOrder: number;
}

// ── Pure helpers (mirror service logic) ────────────────────────────────────────

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_INLINE_BYTES = 1 * 1024 * 1024;
const MAX_PER_RESPONSABILITY = 5;
const MAX_MD_BYTES = 200 * 1024;

const ALLOWED_MIMES = new Set([
	'application/pdf',
	'application/msword',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'image/png',
	'image/jpeg',
	'image/jpg',
	'image/webp',
]);

function parseDataUrl(dataUrl: string): { buffer: Buffer; mimeType: string } | null {
	const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
	if (!match) return null;
	return { mimeType: match[1], buffer: Buffer.from(match[2], 'base64') };
}

function slugFileName(name: string): string {
	const parts = name.split('.');
	const ext = parts.length > 1 ? parts.pop()! : '';
	const base = parts.join('.') || 'file';
	const safeBase = base
		.normalize('NFKD')
		.replace(/[^a-zA-Z0-9-_]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 60);
	const safeExt = ext.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
	return safeExt ? `${safeBase || 'file'}.${safeExt}` : safeBase || 'file';
}

function slugResponsability(name: string): string {
	return (
		name
			.normalize('NFKD')
			.replace(/[^a-zA-Z0-9-_]+/g, '-')
			.replace(/-+/g, '-')
			.replace(/^-|-$/g, '')
			.slice(0, 80) || 'responsability'
	);
}

function validateUpload(opts: {
	dataUrl: string;
	mimeType: string;
	existingCount: number;
	hasS3: boolean;
}): { ok: true; bufferSize: number } | { ok: false; reason: string } {
	const parsed = parseDataUrl(opts.dataUrl);
	if (!parsed) return { ok: false, reason: 'Invalid data URL' };
	const mime = (opts.mimeType || parsed.mimeType).toLowerCase();
	if (!ALLOWED_MIMES.has(mime)) return { ok: false, reason: `Tipo de archivo no permitido: ${mime}` };
	if (parsed.buffer.byteLength > MAX_BYTES) return { ok: false, reason: 'El archivo excede 10MB' };
	if (opts.existingCount >= MAX_PER_RESPONSABILITY) {
		return { ok: false, reason: `Máximo ${MAX_PER_RESPONSABILITY} archivos por responsabilidad` };
	}
	if (!opts.hasS3 && parsed.buffer.byteLength > MAX_INLINE_BYTES) {
		return { ok: false, reason: 'Archivo > 1MB requiere S3 configurado.' };
	}
	return { ok: true, bufferSize: parsed.buffer.byteLength };
}

function validateMarkdown(content: string, existingCount: number):
	| { ok: true; sizeBytes: number }
	| { ok: false; reason: string } {
	if (existingCount >= MAX_PER_RESPONSABILITY) {
		return { ok: false, reason: `Máximo ${MAX_PER_RESPONSABILITY} archivos por responsabilidad` };
	}
	const sizeBytes = Buffer.byteLength(content, 'utf-8');
	if (sizeBytes > MAX_MD_BYTES) return { ok: false, reason: 'El texto excede 200KB' };
	return { ok: true, sizeBytes };
}

/** Mirror of retreatScheduleService.populateTemplateAttachments — JOIN por nombre. */
function populateAttachmentsByName<T extends { responsability?: { name?: string } | null }>(
	items: T[],
	attachmentsByName: Map<string, Attachment[]>,
): Array<T & { attachments: Attachment[] }> {
	return items.map((i) => {
		const name = i.responsability?.name?.trim();
		const attachments = name ? attachmentsByName.get(name) ?? [] : [];
		return { ...i, attachments };
	});
}

/** Mirror del seeder: idempotencia por nombre canónico. */
function seederPlan(
	source: Map<string, string>,
	existingNames: Set<string>,
): { toInsert: string[]; skipped: string[] } {
	const toInsert: string[] = [];
	const skipped: string[] = [];
	for (const name of source.keys()) {
		if (existingNames.has(name)) skipped.push(name);
		else toInsert.push(name);
	}
	return { toInsert, skipped };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('responsabilityAttachmentService — validation', () => {
	const tinyPdf = `data:application/pdf;base64,${Buffer.from('%PDF-1.4 test').toString('base64')}`;
	const fakeExe = `data:application/x-msdownload;base64,${Buffer.from('TVo=').toString('base64')}`;

	it('acepta PDF dentro del límite con S3', () => {
		const r = validateUpload({
			dataUrl: tinyPdf,
			mimeType: 'application/pdf',
			existingCount: 0,
			hasS3: true,
		});
		expect(r.ok).toBe(true);
	});

	it('rechaza mime no permitido (.exe)', () => {
		const r = validateUpload({
			dataUrl: fakeExe,
			mimeType: 'application/x-msdownload',
			existingCount: 0,
			hasS3: true,
		});
		expect(r.ok).toBe(false);
		expect((r as any).reason).toContain('no permitido');
	});

	it('rechaza dataUrl mal formado', () => {
		const r = validateUpload({
			dataUrl: 'not-a-data-url',
			mimeType: 'application/pdf',
			existingCount: 0,
			hasS3: true,
		});
		expect(r.ok).toBe(false);
	});

	it('rechaza archivo > 10MB aunque haya S3', () => {
		const big = `data:application/pdf;base64,${'A'.repeat(15 * 1024 * 1024)}`;
		const r = validateUpload({
			dataUrl: big,
			mimeType: 'application/pdf',
			existingCount: 0,
			hasS3: true,
		});
		expect(r.ok).toBe(false);
		expect((r as any).reason).toContain('10MB');
	});

	it('rechaza archivo > 1MB sin S3 (fallback inline)', () => {
		// 1.5MB de contenido base64-encoded
		const big = `data:application/pdf;base64,${'A'.repeat(2 * 1024 * 1024)}`;
		const r = validateUpload({
			dataUrl: big,
			mimeType: 'application/pdf',
			existingCount: 0,
			hasS3: false,
		});
		expect(r.ok).toBe(false);
		expect((r as any).reason).toContain('S3');
	});

	it('acepta archivo ≤ 1MB sin S3', () => {
		const small = `data:application/pdf;base64,${'A'.repeat(500 * 1024)}`;
		const r = validateUpload({
			dataUrl: small,
			mimeType: 'application/pdf',
			existingCount: 0,
			hasS3: false,
		});
		expect(r.ok).toBe(true);
	});

	it('rechaza al alcanzar el máximo de 5 archivos por rol', () => {
		const r = validateUpload({
			dataUrl: tinyPdf,
			mimeType: 'application/pdf',
			existingCount: 5,
			hasS3: true,
		});
		expect(r.ok).toBe(false);
		expect((r as any).reason).toMatch(/Máximo \d+/);
	});

	it('rechaza markdown > 200KB', () => {
		const huge = 'a'.repeat(201 * 1024);
		const r = validateMarkdown(huge, 0);
		expect(r.ok).toBe(false);
		expect((r as any).reason).toContain('200KB');
	});

	it('acepta markdown chico', () => {
		const r = validateMarkdown('# Hola\n\nGuion corto', 0);
		expect(r.ok).toBe(true);
		expect((r as any).sizeBytes).toBeGreaterThan(0);
	});
});

describe('slug helpers', () => {
	it('slugFileName preserva extensión y normaliza acentos', () => {
		// NFKD descompone acentos como combining marks; no los elimina, los pasa
		// por el filtro de caracteres no-ASCII → terminan como '-'. El resultado
		// es estable y único, que es lo que importa para el path en S3.
		expect(slugFileName('Guion-simple.pdf')).toBe('Guion-simple.pdf');
		expect(slugFileName('archivo con espacios y/o caracteres!@#.docx')).toBe(
			'archivo-con-espacios-y-o-caracteres.docx',
		);
		expect(slugFileName('sin-extension')).toBe('sin-extension');
	});

	it('slugFileName trunca nombres muy largos', () => {
		const long = 'a'.repeat(100) + '.pdf';
		const slug = slugFileName(long);
		expect(slug.length).toBeLessThanOrEqual(70);
		expect(slug).toMatch(/\.pdf$/);
	});

	it('slugResponsability normaliza signos y produce slug estable', () => {
		expect(slugResponsability('Charla: Conociendo a Dios')).toBe('Charla-Conociendo-a-Dios');
		expect(slugResponsability('Comedor')).toBe('Comedor');
		// NFKD descompone "Música" en M + u + s + acute combining + i + c + a;
		// el combining queda como char no-ASCII → '-'. Slug estable, único, OK.
		expect(slugResponsability('Música')).toBe('Mu-sica');
	});

	it('slugResponsability fallback cuando todo se filtra', () => {
		expect(slugResponsability('@@@')).toBe('responsability');
	});
});

describe('seeder idempotency', () => {
	it('no duplica nombres ya existentes', () => {
		const source = new Map<string, string>([
			['Charla: De la Rosa', '# guion 1'],
			['Comedor', '# guion 2'],
			['Santísimo', '# guion 3'],
		]);
		const existing = new Set(['Comedor']);
		const plan = seederPlan(source, existing);
		expect(plan.toInsert).toEqual(['Charla: De la Rosa', 'Santísimo']);
		expect(plan.skipped).toEqual(['Comedor']);
	});

	it('skipea todo cuando ya existe el set completo', () => {
		const source = new Map<string, string>([['Comedor', 'x']]);
		const existing = new Set(['Comedor']);
		const plan = seederPlan(source, existing);
		expect(plan.toInsert).toEqual([]);
		expect(plan.skipped).toEqual(['Comedor']);
	});

	it('inserta todo cuando no hay nada existente', () => {
		const source = new Map<string, string>([
			['Comedor', 'x'],
			['Música', 'y'],
		]);
		const plan = seederPlan(source, new Set());
		expect(plan.toInsert).toEqual(['Comedor', 'Música']);
		expect(plan.skipped).toEqual([]);
	});
});

describe('populateAttachmentsByName (live JOIN por nombre canónico)', () => {
	const attComedor: Attachment = {
		id: 'a1',
		responsabilityName: 'Comedor',
		kind: 'markdown',
		fileName: 'Guion Comedor.md',
		mimeType: 'text/markdown',
		sizeBytes: 200,
		storageUrl: 'data:text/markdown;...',
		storageKey: null,
		content: '# Comedor',
		description: null,
		sortOrder: 10,
	};
	const attCharla: Attachment = {
		id: 'a2',
		responsabilityName: 'Charla: De la Rosa',
		kind: 'markdown',
		fileName: 'Guion Charla: De la Rosa.md',
		mimeType: 'text/markdown',
		sizeBytes: 300,
		storageUrl: 'data:text/markdown;...',
		storageKey: null,
		content: '# Rosa',
		description: null,
		sortOrder: 10,
	};

	const byName = new Map<string, Attachment[]>([
		['Comedor', [attComedor]],
		['Charla: De la Rosa', [attCharla]],
	]);

	it('anexa attachments al item según el nombre del rol', () => {
		const items = [
			{ id: 'i1', responsability: { name: 'Comedor' } },
			{ id: 'i2', responsability: { name: 'Charla: De la Rosa' } },
			{ id: 'i3', responsability: { name: 'Cuartos' } }, // sin attachments
		];
		const result = populateAttachmentsByName(items, byName);
		expect(result[0].attachments).toEqual([attComedor]);
		expect(result[1].attachments).toEqual([attCharla]);
		expect(result[2].attachments).toEqual([]);
	});

	it('items sin responsability quedan con attachments vacío', () => {
		const items = [{ id: 'i1' }, { id: 'i2', responsability: null }];
		const result = populateAttachmentsByName(items, byName);
		expect(result[0].attachments).toEqual([]);
		expect(result[1].attachments).toEqual([]);
	});

	it('múltiples items con mismo rol comparten el mismo attachment (single source)', () => {
		const items = [
			{ id: 'i1', responsability: { name: 'Comedor' } },
			{ id: 'i2', responsability: { name: 'Comedor' } },
			{ id: 'i3', responsability: { name: 'Comedor' } },
		];
		const result = populateAttachmentsByName(items, byName);
		// Cada item ve el mismo attachment — confirma que es referencia global, no copia.
		expect(result[0].attachments[0].id).toBe('a1');
		expect(result[1].attachments[0].id).toBe('a1');
		expect(result[2].attachments[0].id).toBe('a1');
	});

	it('matching por nombre es case-sensitive (Comedor ≠ comedor)', () => {
		const items = [{ id: 'i1', responsability: { name: 'comedor' } }];
		const result = populateAttachmentsByName(items, byName);
		expect(result[0].attachments).toEqual([]);
	});

	it('trim espacios al matchear (Comedor === " Comedor ")', () => {
		const items = [{ id: 'i1', responsability: { name: '  Comedor  ' } }];
		const result = populateAttachmentsByName(items, byName);
		expect(result[0].attachments).toEqual([attComedor]);
	});
});

// Mirror del fix en MinuteByMinuteView.relativeTime — solo status==='active' dispara "en curso".
function relativeTimeMirror(item: { status: string; startTime: number; endTime: number }, now: number): string {
	const start = item.startTime;
	const end = item.endTime;
	const diff = start - now;
	const absMin = Math.round(Math.abs(diff) / 60000);
	if (item.status === 'completed') return 'completado';
	if (item.status === 'active') return 'en curso';
	if (now > end) return absMin < 60 ? `hace ${absMin}m` : `hace ${Math.round(absMin / 60)}h`;
	if (absMin === 0) return 'ahora';
	if (now >= start && now <= end) return 'ahora';
	if (absMin < 60) return `en ${absMin}m`;
	if (absMin < 60 * 24) {
		const h = Math.floor(absMin / 60);
		const m = absMin % 60;
		return m ? `en ${h}h ${m}m` : `en ${h}h`;
	}
	return `en ${Math.round(absMin / (60 * 24))}d`;
}

describe('relativeTime — fix "en curso" duplicado', () => {
	const NOW = new Date('2026-04-27T12:00:00Z').getTime();

	it('"en curso" SOLO si status==="active", aunque now coincida con horario pending', () => {
		// Item pending cuyo horario incluye now.
		const item = {
			status: 'pending',
			startTime: NOW - 5 * 60_000, // empezó hace 5min según horario
			endTime: NOW + 10 * 60_000,  // termina en 10min
		};
		// Antes del fix: devolvía 'en curso' (incorrecto, no fue iniciado).
		// Después del fix: devuelve 'ahora' (refleja que está en el slot pero no fue marcado activo).
		expect(relativeTimeMirror(item, NOW)).toBe('ahora');
		expect(relativeTimeMirror(item, NOW)).not.toBe('en curso');
	});

	it('"en curso" sí cuando status==="active" (el coordinador marcó ▶)', () => {
		const item = {
			status: 'active',
			startTime: NOW - 5 * 60_000,
			endTime: NOW + 10 * 60_000,
		};
		expect(relativeTimeMirror(item, NOW)).toBe('en curso');
	});

	it('items traslapados pending NO disparan ambos "en curso"', () => {
		// Dos items con horario actual, ninguno marcado activo aún.
		const items = [
			{ status: 'pending', startTime: NOW - 30 * 60_000, endTime: NOW + 5 * 60_000 },
			{ status: 'pending', startTime: NOW - 10 * 60_000, endTime: NOW + 20 * 60_000 },
		];
		const labels = items.map((i) => relativeTimeMirror(i, NOW));
		// Ningún item debería decir "en curso" — solo "ahora".
		expect(labels.filter((l) => l === 'en curso')).toHaveLength(0);
		expect(labels.every((l) => l === 'ahora')).toBe(true);
	});

	it('item futuro: "en 35m"', () => {
		const item = {
			status: 'pending',
			startTime: NOW + 35 * 60_000,
			endTime: NOW + 50 * 60_000,
		};
		expect(relativeTimeMirror(item, NOW)).toBe('en 35m');
	});

	it('item pasado: "hace 2h"', () => {
		const item = {
			status: 'pending',
			startTime: NOW - 130 * 60_000,
			endTime: NOW - 120 * 60_000,
		};
		expect(relativeTimeMirror(item, NOW)).toBe('hace 2h');
	});

	it('item completed muestra "completado" siempre, incluso si su horario incluye now', () => {
		const item = {
			status: 'completed',
			startTime: NOW - 5 * 60_000,
			endTime: NOW + 10 * 60_000,
		};
		expect(relativeTimeMirror(item, NOW)).toBe('completado');
	});

	it('"en 1h 30m" para items con offset > 60m', () => {
		const item = {
			status: 'pending',
			startTime: NOW + 90 * 60_000,
			endTime: NOW + 105 * 60_000,
		};
		expect(relativeTimeMirror(item, NOW)).toBe('en 1h 30m');
	});

	it('"en 2d" para items con offset > 24h', () => {
		const item = {
			status: 'pending',
			startTime: NOW + 2 * 24 * 60 * 60_000,
			endTime: NOW + 2 * 24 * 60 * 60_000 + 15 * 60_000,
		};
		expect(relativeTimeMirror(item, NOW)).toBe('en 2d');
	});
});

describe('markdown size calculation', () => {
	it('UTF-8 multi-byte cuenta correctamente (acentos, ñ)', () => {
		const text = 'Acción y oración';
		const r = validateMarkdown(text, 0);
		expect(r.ok).toBe(true);
		// "Acción y oración" tiene 16 chars pero más bytes UTF-8 (~18-19).
		expect((r as any).sizeBytes).toBeGreaterThan(text.length);
	});

	it('texto en límite 200KB sí pasa', () => {
		// 200KB exactos
		const exact = 'a'.repeat(200 * 1024);
		const r = validateMarkdown(exact, 0);
		expect(r.ok).toBe(true);
	});
});
