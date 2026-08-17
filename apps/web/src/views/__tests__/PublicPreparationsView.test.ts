import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PublicPreparationsView from '../PublicPreparationsView.vue';

const mockGetPublic = vi.fn();

vi.mock('@/services/api', () => ({
  retreatPreparationApi: {
    getPublic: (...args: any[]) => mockGetPublic(...args),
  },
}));

vi.mock('@/composables/useMarkdown', () => ({
  renderMarkdown: (text: string) => `<p>${text}</p>`,
}));

const mockPrint = vi.fn();
vi.mock('@/composables/usePrintableDocument', () => ({
  printMarkdownDocument: (...args: any[]) => mockPrint(...args),
}));

function doc(overrides: Record<string, any> = {}) {
  return {
    id: 'doc-1',
    preparationId: 'prep-2',
    kind: 'file',
    content: null,
    fileName: 'Servicio.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1000,
    url: 'https://bucket.s3.amazonaws.com/public-assets/preparations/r1/servicio.pdf',
    sortOrder: 10,
    createdAt: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

const PAYLOAD = {
  retreat: { id: 'r1', parish: 'San Agustín', startDate: null, endDate: null },
  preparations: [
    {
      id: 'prep-1',
      retreatId: 'r1',
      type: 'session',
      weekNumber: 1,
      title: '1ª preparación',
      date: '2026-07-01', // pasada
      time: '20:00',
      sortOrder: 10,
      documents: [],
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'prep-2',
      retreatId: 'r1',
      type: 'session',
      weekNumber: 2,
      title: '2ª preparación — Conocerte a ti mismo',
      date: '2026-07-14', // próxima
      time: '20:00',
      sortOrder: 20,
      documents: [
        doc(),
        doc({
          id: 'doc-2',
          kind: 'markdown',
          fileName: 'Guía de la semana.md',
          content: 'Leer antes de la reunión',
          url: 'data:text/markdown;base64,',
        }),
      ],
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'brk-1',
      retreatId: 'r1',
      type: 'break',
      weekNumber: null,
      title: 'Festivo — no hay preparación',
      date: '2026-07-21',
      time: null,
      sortOrder: 25,
      documents: [],
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'prep-3',
      retreatId: 'r1',
      type: 'session',
      weekNumber: 3,
      title: '3ª preparación',
      date: '2026-07-28',
      time: '20:00',
      sortOrder: 30,
      documents: [],
      createdAt: '',
      updatedAt: '',
    },
  ],
};

describe('PublicPreparationsView', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 8, 12, 0, 0)); // 2026-07-08 local
    mockGetPublic.mockResolvedValue(JSON.parse(JSON.stringify(PAYLOAD)));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  async function mountView() {
    const wrapper = mount(PublicPreparationsView, {
      props: { slug: 'mi-retiro' },
    });
    await flushPromises();
    return wrapper;
  }

  it('carga el calendario público por slug y muestra todas las entradas', async () => {
    const wrapper = await mountView();
    expect(mockGetPublic).toHaveBeenCalledWith('mi-retiro');
    expect(wrapper.text()).toContain('San Agustín');
    expect(wrapper.text()).toContain('1ª preparación');
    expect(wrapper.text()).toContain('2ª preparación — Conocerte a ti mismo');
    expect(wrapper.text()).toContain('Festivo — no hay preparación');
    expect(wrapper.text()).toContain('3ª preparación');
  });

  it('destaca la próxima preparación con botón de descarga de su documento', async () => {
    const wrapper = await mountView();
    // La próxima sesión (hoy=2026-07-08) es la semana 2 (2026-07-14).
    const hero = wrapper.find('section.border-2');
    expect(hero.exists()).toBe(true);
    expect(hero.text()).toContain('2ª preparación — Conocerte a ti mismo');
    const download = hero.find('a[download]');
    expect(download.exists()).toBe(true);
    expect(download.attributes('href')).toContain('servicio.pdf');
  });

  it('abre el lector de documentos de texto (markdown sanitizado)', async () => {
    const wrapper = await mountView();
    const readButtons = wrapper
      .findAll('button')
      .filter((b) => b.text().includes('Guía de la semana'));
    expect(readButtons.length).toBeGreaterThan(0);
    await readButtons[0].trigger('click');
    expect(wrapper.html()).toContain('<p>Leer antes de la reunión</p>');
  });

  it('el lector muestra el texto resuelto, no la plantilla con los {…}', async () => {
    // El servidor manda ambos: `content` es la plantilla que se edita,
    // `renderedContent` el texto con las fechas de este retiro ya puestas.
    mockGetPublic.mockResolvedValueOnce({
      ...PAYLOAD,
      preparations: PAYLOAD.preparations.map((p) =>
        p.id === 'prep-2'
          ? {
              ...p,
              documents: [
                doc({
                  id: 'doc-2',
                  kind: 'markdown',
                  fileName: 'Guía de la semana.md',
                  content: 'Cupo de {retreat.maxWalkers}\n\n{preparations.table}',
                  renderedContent: 'Cupo de 30\n\n| # | Fecha | Preparación |',
                  url: 'data:text/markdown;base64,',
                }),
              ],
            }
          : p,
      ),
    });
    const wrapper = await mountView();
    const readButtons = wrapper
      .findAll('button')
      .filter((b) => b.text().includes('Guía de la semana'));
    await readButtons[0].trigger('click');

    expect(wrapper.html()).toContain('Cupo de 30');
    expect(wrapper.html()).not.toContain('{retreat.maxWalkers}');
    expect(wrapper.html()).not.toContain('{preparations.table}');
  });

  it('imprime el documento resuelto desde el lector', async () => {
    const wrapper = await mountView();
    const readButtons = wrapper
      .findAll('button')
      .filter((b) => b.text().includes('Guía de la semana'));
    await readButtons[0].trigger('click');

    const printButton = wrapper
      .findAll('button')
      .find((b) => b.text().includes('preparations.printDoc'));
    expect(printButton).toBeDefined();
    await printButton!.trigger('click');

    expect(mockPrint).toHaveBeenCalledOnce();
    expect(mockPrint.mock.calls[0][0]).toMatchObject({
      title: 'Guía de la semana',
      markdown: 'Leer antes de la reunión',
    });
  });

  it('muestra el error de no encontrado cuando el retiro no es público', async () => {
    mockGetPublic.mockRejectedValueOnce(new Error('404'));
    const wrapper = await mountView();
    expect(wrapper.find('.bg-red-50').exists()).toBe(true);
  });
});
