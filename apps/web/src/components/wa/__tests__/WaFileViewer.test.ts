import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import type { WaRawMediaDto } from '@repo/types';

/**
 * File viewer of the inbox (v1.5, D26): what the browser can show opens big
 * in the app; everything else is a download with its real name. Third-party
 * text renders inert, and a server refusal shows instead of the file.
 */
const renderPdfPages = vi.hoisted(() => vi.fn());
vi.mock('@/utils/pdfToImage', () => ({ renderPdfPages }));
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      ({
        'waInbox.viewer.download': 'Descargar',
        'waInbox.viewer.downloadOpen': 'Descargar y abrir',
        'waInbox.viewer.kind.word': 'Documento de Word',
        'waInbox.viewer.pdfTruncated': `Primeras ${params?.shown} de ${params?.total}`,
      })[key] ?? key,
  }),
}));

import WaFileViewer from '../WaFileViewer.vue';

const b64 = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text)));
const media = (extra: Partial<WaRawMediaDto>): WaRawMediaDto => ({
  dataUrl: 'data:application/octet-stream;base64,AAAA',
  mime: 'application/octet-stream',
  fileName: 'archivo.bin',
  sizeBytes: 2048,
  previewKind: 'download',
  ...extra,
});

const mountViewer = (props: Record<string, unknown>) =>
  mount(WaFileViewer, {
    props: { open: true, loading: false, error: null, media: null, fallbackName: 'Documento', ...props },
  });

describe('WaFileViewer (v1.5)', () => {
  const created: string[] = [];
  beforeEach(() => {
    renderPdfPages.mockReset();
    created.length = 0;
    URL.createObjectURL = vi.fn((blob: Blob) => {
      created.push(blob.type);
      return `blob:test/${created.length}`;
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Word: no preview, a download link with the real name', () => {
    const wrapper = mountViewer({
      media: media({
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        fileName: 'Carta para Juan.docx',
      }),
    });
    expect(wrapper.find('[data-testid="wa-file-download-only"]').exists()).toBe(true);
    const link = wrapper.get('[data-testid="wa-file-download"]');
    expect(link.attributes('download')).toBe('Carta para Juan.docx');
    expect(link.attributes('href')).toBe('blob:test/1');
    expect(link.text()).toBe('Descargar y abrir');
    expect(wrapper.text()).toContain('Documento de Word');
  });

  it('text renders inert (interpolation, never HTML)', () => {
    const payload = '<img src=x onerror="alert(1)">Querido Juan';
    const wrapper = mountViewer({
      media: media({ mime: 'text/plain', previewKind: 'text', dataUrl: `data:text/plain;base64,${b64(payload)}` }),
    });
    const pre = wrapper.get('[data-testid="wa-file-text"]');
    expect(pre.text()).toBe(payload);
    expect(pre.find('img').exists()).toBe(false);
  });

  it('PDF: renders the pages in the app and says when it was cut', async () => {
    renderPdfPages.mockImplementation(async (_url: string, options: any) => {
      options.onPage('data:image/jpeg;base64,P1', 1, 25);
      options.onPage('data:image/jpeg;base64,P2', 2, 25);
      return { pages: [], total: 25 };
    });
    const wrapper = mountViewer({ media: media({ mime: 'application/pdf', previewKind: 'pdf', fileName: 'carta.pdf' }) });
    await flushPromises();
    expect(renderPdfPages).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ maxPages: 20 }));
    expect(wrapper.findAll('[data-testid="wa-file-pdf"] img')).toHaveLength(2);
    expect(wrapper.text()).toContain('Primeras 20 de 25');
    expect(wrapper.get('[data-testid="wa-file-download"]').text()).toBe('Descargar');
  });

  it('image and video show in the app', () => {
    const image = mountViewer({ media: media({ mime: 'image/jpeg', previewKind: 'image', dataUrl: 'data:image/jpeg;base64,AA' }) });
    expect(image.get('[data-testid="wa-file-image"]').attributes('src')).toBe('data:image/jpeg;base64,AA');
    const video = mountViewer({ media: media({ mime: 'video/mp4', previewKind: 'video' }) });
    expect(video.get('[data-testid="wa-file-video"]').attributes('src')).toMatch(/^blob:test\//);
  });

  it('a blob never carries a renderable page type', () => {
    mountViewer({ media: media({ mime: 'text/html', previewKind: 'download', dataUrl: 'data:text/html;base64,PGh0bWw+' }) });
    expect(created).toEqual(['application/octet-stream']);
  });

  it('a refusal shows instead of the file, with no download', () => {
    const wrapper = mountViewer({ error: 'Este documento trae macros…' });
    expect(wrapper.get('[data-testid="wa-file-error"]').text()).toContain('macros');
    expect(wrapper.find('[data-testid="wa-file-download"]').exists()).toBe(false);
  });

  it('releases the object URL when it closes or changes', async () => {
    const wrapper = mountViewer({ media: media({}) });
    await wrapper.setProps({ media: null });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test/1');
  });
});
