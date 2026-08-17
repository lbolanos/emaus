import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockBuild = vi.fn(async () => new Blob(['%PDF-1.3'], { type: 'application/pdf' }));
vi.mock('@/utils/markdownToPdf', () => ({
  buildPreparationPdf: (...args: unknown[]) => mockBuild(...(args as [])),
}));

import { downloadPreparationPdf } from '../usePreparationPdf';

function doc(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc-1',
    preparationId: 'prep-1',
    kind: 'markdown' as const,
    content: 'Cupo de {retreat.maxWalkers}\n\n{preparations.table}',
    renderedContent: 'Cupo de 54\n\n| # | Fecha |',
    fileName: '1ª preparación — Servicio.md',
    mimeType: 'text/markdown',
    sizeBytes: 100,
    url: 'data:text/markdown;base64,',
    sortOrder: 10,
    createdAt: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

describe('downloadPreparationPdf', () => {
  let clicked: HTMLAnchorElement | null;

  beforeEach(() => {
    mockBuild.mockClear();
    clicked = null;
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:fake'),
      revokeObjectURL: vi.fn(),
    });
    // Capturar la descarga sin navegar de verdad.
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked = this;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('genera el PDF con el texto RESUELTO, no con la plantilla', async () => {
    // `content` guarda los {...} crudos: mandarlos al PDF imprimiría las llaves.
    const ok = await downloadPreparationPdf({ doc: doc(), subtitle: 'Buen Despacho' });
    expect(ok).toBe(true);
    const arg = mockBuild.mock.calls[0][0] as unknown as { markdown: string };
    expect(arg.markdown).toBe('Cupo de 54\n\n| # | Fecha |');
    expect(arg.markdown).not.toContain('{retreat.maxWalkers}');
  });

  it('cae a `content` cuando el servidor no mandó el resuelto', async () => {
    await downloadPreparationPdf({ doc: doc({ renderedContent: null }) });
    const arg = mockBuild.mock.calls[0][0] as unknown as { markdown: string };
    expect(arg.markdown).toContain('{retreat.maxWalkers}');
  });

  it('pasa el encabezado: parroquia y fecha de la sesión', async () => {
    await downloadPreparationPdf({
      doc: doc(),
      subtitle: 'Buen Despacho',
      meta: '1ª preparación\nmiércoles, 19 de agosto de 2026',
    });
    expect(mockBuild.mock.calls[0][0]).toMatchObject({
      title: '1ª preparación — Servicio',
      subtitle: 'Buen Despacho',
      meta: '1ª preparación\nmiércoles, 19 de agosto de 2026',
    });
  });

  it('descarga con el nombre del documento y extensión .pdf', async () => {
    await downloadPreparationPdf({ doc: doc() });
    expect(clicked?.download).toBe('1ª preparación — Servicio.pdf');
  });

  it('avisa y devuelve false si la generación falla', async () => {
    mockBuild.mockRejectedValueOnce(new Error('boom'));
    const onError = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const ok = await downloadPreparationPdf({ doc: doc(), onError });
    expect(ok).toBe(false);
    expect(onError).toHaveBeenCalledOnce();
  });
});
