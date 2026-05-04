/**
 * Markdown versioning — pure-logic tests for the snapshot-before-edit and
 * restore-version flows.
 *
 * Covers the rules in `responsabilityAttachmentService.updateMarkdown` and
 * `restoreMarkdownVersion`:
 *
 *   1. snapshotToHistory only fires for content/title CHANGES (a no-op
 *      description-only edit shouldn't pollute history).
 *   2. snapshotToHistory captures the OLD state, not the new one.
 *   3. restoreMarkdownVersion ALSO snapshots before restoring (so you can
 *      undo a restore).
 *   4. List ordering is savedAt DESC (most recent first).
 *   5. Files (kind='file') are never snapshotted — only markdown.
 */

interface Attachment {
	id: string;
	kind: 'file' | 'markdown';
	fileName: string;
	content: string | null;
	description: string | null;
	sizeBytes: number;
}
interface HistoryEntry {
	id: string;
	attachmentId: string;
	title: string;
	content: string;
	description: string | null;
	sizeBytes: number;
	savedAt: number; // ms
	savedById: string | null;
}

class MockService {
	attachments: Map<string, Attachment> = new Map();
	history: HistoryEntry[] = [];
	private counter = 1;

	private snapshot(att: Attachment, savedById: string | null = null): void {
		if (att.kind !== 'markdown' || att.content == null) return;
		this.history.push({
			id: `h${this.counter++}`,
			attachmentId: att.id,
			title: (att.fileName ?? 'Documento').replace(/\.md$/i, ''),
			content: att.content,
			description: att.description ?? null,
			sizeBytes: att.sizeBytes,
			savedAt: Date.now(),
			savedById,
		});
	}

	updateMarkdown(
		attachmentId: string,
		patch: { title?: string; content?: string; description?: string | null },
		savedById?: string | null,
	): Attachment {
		const att = this.attachments.get(attachmentId);
		if (!att) throw new Error('not found');
		if (att.kind !== 'markdown') throw new Error('not markdown');

		const willChange =
			(patch.content !== undefined && patch.content !== att.content) ||
			(patch.title !== undefined &&
				`${patch.title.replace(/\.md$/i, '')}.md` !== att.fileName);
		if (willChange) this.snapshot(att, savedById);

		if (patch.title !== undefined) {
			const t = patch.title.slice(0, 200).trim() || 'Documento';
			att.fileName = t.endsWith('.md') ? t : `${t}.md`;
		}
		if (patch.content !== undefined) {
			att.content = patch.content;
			att.sizeBytes = Buffer.byteLength(patch.content, 'utf-8');
		}
		if (patch.description !== undefined) att.description = patch.description;
		return att;
	}

	restoreMarkdownVersion(
		attachmentId: string,
		historyId: string,
		savedById?: string | null,
	): Attachment {
		const att = this.attachments.get(attachmentId);
		if (!att) throw new Error('not found');
		const v = this.history.find((h) => h.id === historyId && h.attachmentId === attachmentId);
		if (!v) throw new Error('history not found');
		this.snapshot(att, savedById);
		att.fileName = v.title.endsWith('.md') ? v.title : `${v.title}.md`;
		att.content = v.content;
		att.sizeBytes = v.sizeBytes;
		att.description = v.description ?? null;
		return att;
	}

	list(attachmentId: string): HistoryEntry[] {
		return this.history
			.filter((h) => h.attachmentId === attachmentId)
			.sort((a, b) => b.savedAt - a.savedAt);
	}
}

function makeMd(id: string, content: string, fileName = 'Guion.md'): Attachment {
	return {
		id,
		kind: 'markdown',
		fileName,
		content,
		description: null,
		sizeBytes: Buffer.byteLength(content, 'utf-8'),
	};
}

describe('versioning — snapshot before edit', () => {
	it('content change creates a history entry with the OLD content', () => {
		const svc = new MockService();
		svc.attachments.set('a1', makeMd('a1', 'v1'));
		svc.updateMarkdown('a1', { content: 'v2' });
		expect(svc.history).toHaveLength(1);
		expect(svc.history[0].content).toBe('v1'); // OLD, not new
	});

	it('title change without content change still snapshots', () => {
		const svc = new MockService();
		svc.attachments.set('a1', makeMd('a1', 'same content', 'OldName.md'));
		svc.updateMarkdown('a1', { title: 'NewName' });
		expect(svc.history).toHaveLength(1);
		expect(svc.history[0].title).toBe('OldName');
	});

	it('description-only edit does NOT snapshot (no content drift)', () => {
		const svc = new MockService();
		svc.attachments.set('a1', { ...makeMd('a1', 'unchanged'), description: 'old' });
		svc.updateMarkdown('a1', { description: 'new' });
		expect(svc.history).toHaveLength(0);
	});

	it('no-op content edit (same value) does NOT snapshot', () => {
		const svc = new MockService();
		svc.attachments.set('a1', makeMd('a1', 'same'));
		svc.updateMarkdown('a1', { content: 'same' });
		expect(svc.history).toHaveLength(0);
	});

	it('multiple edits stack history entries', () => {
		const svc = new MockService();
		svc.attachments.set('a1', makeMd('a1', 'v1'));
		svc.updateMarkdown('a1', { content: 'v2' });
		svc.updateMarkdown('a1', { content: 'v3' });
		svc.updateMarkdown('a1', { content: 'v4' });
		expect(svc.history.map((h) => h.content)).toEqual(['v1', 'v2', 'v3']);
	});

	it('captures savedById when provided', () => {
		const svc = new MockService();
		svc.attachments.set('a1', makeMd('a1', 'v1'));
		svc.updateMarkdown('a1', { content: 'v2' }, 'user-xyz');
		expect(svc.history[0].savedById).toBe('user-xyz');
	});
});

describe('versioning — restore', () => {
	it('restoring a version brings back its content as current', () => {
		const svc = new MockService();
		svc.attachments.set('a1', makeMd('a1', 'v1'));
		svc.updateMarkdown('a1', { content: 'v2' }); // snapshot v1
		svc.updateMarkdown('a1', { content: 'v3' }); // snapshot v2
		const v1Entry = svc.history.find((h) => h.content === 'v1')!;
		svc.restoreMarkdownVersion('a1', v1Entry.id);
		expect(svc.attachments.get('a1')!.content).toBe('v1');
	});

	it('restore ALSO snapshots the current state (so you can un-restore)', () => {
		const svc = new MockService();
		svc.attachments.set('a1', makeMd('a1', 'v1'));
		svc.updateMarkdown('a1', { content: 'v2' });
		const v1Entry = svc.history[0];
		svc.restoreMarkdownVersion('a1', v1Entry.id);
		// Now history should have v1 AND v2
		const contents = svc.history.map((h) => h.content);
		expect(contents).toContain('v1');
		expect(contents).toContain('v2');
	});

	it('restoring a version that does not belong to the attachment fails', () => {
		const svc = new MockService();
		svc.attachments.set('a1', makeMd('a1', 'v1'));
		svc.attachments.set('a2', makeMd('a2', 'other'));
		svc.updateMarkdown('a2', { content: 'other2' });
		const otherHistoryId = svc.history[0].id;
		expect(() => svc.restoreMarkdownVersion('a1', otherHistoryId)).toThrow();
	});
});

describe('versioning — list ordering', () => {
	it('returns versions newest first', () => {
		const svc = new MockService();
		svc.attachments.set('a1', makeMd('a1', 'v1'));
		// Force distinct timestamps
		const realNow = Date.now;
		let t = realNow();
		Date.now = () => t;
		svc.updateMarkdown('a1', { content: 'v2' });
		t += 1000;
		svc.updateMarkdown('a1', { content: 'v3' });
		t += 1000;
		svc.updateMarkdown('a1', { content: 'v4' });
		Date.now = realNow;
		const list = svc.list('a1');
		expect(list[0].content).toBe('v3');
		expect(list[1].content).toBe('v2');
		expect(list[2].content).toBe('v1');
	});

	it('returns empty list for an attachment with no edits', () => {
		const svc = new MockService();
		svc.attachments.set('a1', makeMd('a1', 'v1'));
		expect(svc.list('a1')).toEqual([]);
	});

	it('isolates history per attachment (no leak across attachments)', () => {
		const svc = new MockService();
		svc.attachments.set('a1', makeMd('a1', 'v1'));
		svc.attachments.set('a2', makeMd('a2', 'other'));
		svc.updateMarkdown('a1', { content: 'v2' });
		svc.updateMarkdown('a2', { content: 'other2' });
		expect(svc.list('a1')).toHaveLength(1);
		expect(svc.list('a2')).toHaveLength(1);
		expect(svc.list('a1')[0].content).toBe('v1');
		expect(svc.list('a2')[0].content).toBe('other');
	});
});

describe('versioning — only markdown is snapshotted', () => {
	it('files (kind=file) never appear in history', () => {
		const svc = new MockService();
		svc.attachments.set('f1', {
			id: 'f1',
			kind: 'file',
			fileName: 'guion.pdf',
			content: null,
			description: null,
			sizeBytes: 1024,
		});
		// Updating a file doesn't go through updateMarkdown, but if it did:
		expect(() => svc.updateMarkdown('f1', { content: 'x' })).toThrow();
		expect(svc.history).toEqual([]);
	});
});
