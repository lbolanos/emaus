import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

// ── @repo/ui mock ────────────────────────────────────────────────────────────
vi.mock('@repo/ui', () => ({
  Button: {
    template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
    props: ['disabled', 'variant', 'size'],
    emits: ['click'],
  },
  Dialog: {
    template: '<div v-if="open"><slot /></div>',
    props: ['open'],
    emits: ['update:open'],
  },
  DialogContent: { template: '<div><slot /></div>' },
  DialogHeader: { template: '<div><slot /></div>' },
  DialogTitle: { template: '<h2><slot /></h2>' },
  DialogFooter: { template: '<div><slot /></div>' },
  Label: { template: '<label><slot /></label>' },
  Textarea: {
    template:
      '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"></textarea>',
    props: ['modelValue', 'rows'],
    emits: ['update:modelValue'],
  },
  useToast: () => ({ toast: mockToast }),
}));

const { mockToast, mockScheduleApi, mockPreparationApi, mockPrint, mockPdf } = vi.hoisted(() => ({
  mockToast: vi.fn(),
  mockScheduleApi: { list: vi.fn() },
  mockPreparationApi: { list: vi.fn() },
  mockPrint: vi.fn(() => true),
  mockPdf: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/services/api', () => ({
  retreatScheduleApi: mockScheduleApi,
  retreatPreparationApi: mockPreparationApi,
}));

vi.mock('@/composables/usePrintableDocument', () => ({ printMarkdownDocument: mockPrint }));
vi.mock('@/composables/usePreparationPdf', () => ({ downloadMarkdownPdf: mockPdf }));

const RETREAT = {
  id: 'retreat-1',
  parish: 'Emaús Hombres Polanco',
  startDate: '2026-06-05',
  endDate: '2026-06-07',
  retreat_type: 'men',
  closingChurchName: 'Parroquia de San Agustín',
  timezone: 'America/Mexico_City',
  house: { name: 'Casa de Retiro', timezone: 'America/Mexico_City' },
};

const fetchRetreat = vi.fn();
const OTHER_RETREAT = { ...RETREAT, id: 'retreat-2', parish: 'Otro Retiro', startDate: '2027-01-08' };
vi.mock('@/stores/retreatStore', () => ({
  useRetreatStore: () => ({
    retreats: [RETREAT, OTHER_RETREAT],
    selectedRetreat: OTHER_RETREAT,
    fetchRetreat,
  }),
}));

import PriestLetterDialog from '../PriestLetterDialog.vue';

/** Minute-by-Minute items as the list endpoint returns them, in UTC instants. */
const SCHEDULE = [
  {
    id: 'i1',
    name: 'Misa de servidores',
    type: 'misa',
    day: 1,
    startTime: '2026-06-05T19:00:00.000Z', // 13:00 CDMX
    responsability: { id: 'r1', name: 'Sacerdotes' },
  },
  {
    id: 'i2',
    name: 'Charla: Amando a Dios a través de los Sacramentos',
    type: 'charla',
    day: 2,
    startTime: '2026-06-06T18:05:00.000Z', // 12:05 CDMX
    responsability: { id: 'r2', name: 'Charla: Conociendo a Dios a través de los Sacramentos' },
  },
  {
    id: 'i3',
    name: 'Confesiones',
    type: 'oracion',
    day: 2,
    startTime: '2026-06-07T03:00:00.000Z', // 21:00 CDMX of day 2
    responsability: { id: 'r1', name: 'Sacerdotes' },
  },
  {
    id: 'i4',
    name: 'Misa de Cierre del Retiro',
    type: 'misa',
    day: 3,
    startTime: '2026-06-07T23:40:00.000Z', // 17:40 CDMX
    responsability: { id: 'r1', name: 'Sacerdotes' },
  },
];

const PREPARATIONS = [
  { id: 'pr1', type: 'session', title: '1ª', date: '2026-04-07', time: '19:00', sortOrder: 0 },
  { id: 'pr2', type: 'session', title: '2ª', date: '2026-04-21', time: '19:00', sortOrder: 1 },
  { id: 'pr3', type: 'session', title: '3ª', date: '2026-05-05', time: '19:00', sortOrder: 2 },
];

async function mountDialog() {
  const wrapper = mount(PriestLetterDialog, {
    props: { open: true, retreatId: 'retreat-1' },
  });
  await flushPromises();
  return wrapper;
}

const draftOf = (w: ReturnType<typeof mount>) =>
  (w.find('[data-testid="priest-letter-draft"]').element as HTMLTextAreaElement).value;

describe('PriestLetterDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrint.mockReturnValue(true);
    mockPdf.mockResolvedValue(true);
    mockScheduleApi.list.mockResolvedValue(JSON.parse(JSON.stringify(SCHEDULE)));
    mockPreparationApi.list.mockResolvedValue(JSON.parse(JSON.stringify(PREPARATIONS)));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('carga el MaM y las preparaciones al abrirse', async () => {
    await mountDialog();
    expect(mockScheduleApi.list).toHaveBeenCalledWith('retreat-1');
    expect(mockPreparationApi.list).toHaveBeenCalledWith('retreat-1');
  });

  it('siembra el borrador con la carta resuelta, en la hora del retiro', async () => {
    const w = await mountDialog();
    const draft = draftOf(w);
    expect(draft).toContain('Emaús Hombres Polanco');
    expect(draft).toContain('con fechas del 5 al 7 de junio');
    expect(draft).toContain('los martes de cada 15 días');
    expect(draft).toContain('Los avisos arrancarían el domingo 26 de abril');
    // Las horas salen del MaM, convertidas a la zona del retiro.
    expect(draft).toContain('Santa Misa de las 13:00');
    expect(draft).toContain('a las 12:05 hrs');
    expect(draft).toContain('a las 21:00 hrs');
    expect(draft).toContain('a las 17:40 horas');
  });

  it('refleja el borrador en la vista previa', async () => {
    const w = await mountDialog();
    expect(w.find('[data-testid="priest-letter-preview"]').html()).toContain(
      'Emaús Hombres Polanco',
    );
  });

  it('sanea la vista previa del texto editado', async () => {
    const w = await mountDialog();
    await w
      .find('[data-testid="priest-letter-draft"]')
      .setValue('<script>alert(1)</script><img src=x onerror=alert(1)>');
    const preview = w.find('[data-testid="priest-letter-preview"]').html();
    expect(preview).not.toContain('<script>');
    expect(preview).not.toContain('onerror');
  });

  it('imprime el texto EDITADO, no el original', async () => {
    const w = await mountDialog();
    await w
      .find('[data-testid="priest-letter-draft"]')
      .setValue('Estimado Padre Juan, le escribimos…');
    await w.find('[data-testid="priest-letter-print"]').trigger('click');

    expect(mockPrint).toHaveBeenCalledTimes(1);
    const arg = mockPrint.mock.calls[0][0];
    expect(arg.markdown).toBe('Estimado Padre Juan, le escribimos…');
    expect(arg.subtitle).toBe('Emaús Hombres Polanco');
    expect(arg.title).toBe('Solicitud de Apoyo al Párroco');
    expect(arg.logoUrl).toBe('/oficial_mejorado.png');
    expect(arg.meta).toContain('del 5 al 7 de junio');
  });

  it('descarga el PDF con el nombre de archivo del retiro', async () => {
    const w = await mountDialog();
    await w.find('[data-testid="priest-letter-pdf"]').trigger('click');
    await flushPromises();

    expect(mockPdf).toHaveBeenCalledTimes(1);
    const arg = mockPdf.mock.calls[0][0];
    expect(arg.title).toBe('Solicitud de Apoyo al Párroco');
    expect(arg.fileName).toBe('solicitud-parroco-emaus-hombres-polanco');
    expect(arg.markdown).toContain('Emaús Hombres Polanco');
  });

  it('«Restablecer» descarta la edición y vuelve a la carta generada', async () => {
    const w = await mountDialog();
    const original = draftOf(w);
    await w.find('[data-testid="priest-letter-draft"]').setValue('otra cosa');
    expect(draftOf(w)).toBe('otra cosa');

    const reset = w.findAll('button').find((b) => b.text() === 'Restablecer');
    await reset!.trigger('click');
    expect(draftOf(w)).toBe(original);
  });

  it('sigue usable cuando el MaM no se puede leer, avisando y marcando los huecos', async () => {
    mockScheduleApi.list.mockRejectedValue(new Error('403'));
    const w = await mountDialog();

    expect(w.find('[data-testid="priest-letter-warning"]').text()).toContain(
      'No pudimos leer el Minuto a Minuto',
    );
    const draft = draftOf(w);
    expect(draft).toContain('(por confirmar)');
    // La carta sigue pidiendo los cuatro actos aunque no haya agenda.
    expect(draft).toContain('1.- Misa de Arranque');
    expect(draft).toContain('4.- Misa de Salida');
    // Y las reuniones sí se saben, porque vienen de las preparaciones.
    expect(draft).toContain('los martes de cada 15 días');
    expect(w.find('[data-testid="priest-letter-print"]').attributes('disabled')).toBeUndefined();
  });

  it('avisa cuando son las preparaciones las que no se pueden leer', async () => {
    mockPreparationApi.list.mockRejectedValue(new Error('403'));
    const w = await mountDialog();
    expect(w.find('[data-testid="priest-letter-warning"]').text()).toContain(
      'calendario de preparaciones',
    );
    // Los horarios del retiro sí están.
    expect(draftOf(w)).toContain('Santa Misa de las 13:00');
  });

  it('usa el retiro del retreatId, no el seleccionado', async () => {
    // El store tiene OTHER_RETREAT como seleccionado; la carta debe ser la del
    // retiro que le pasaron, o mezclaría el nombre de uno con la agenda de otro.
    const w = await mountDialog();
    expect(draftOf(w)).toContain('Emaús Hombres Polanco');
    expect(draftOf(w)).not.toContain('Otro Retiro');
  });

  it('recarga si cambia el retiro con el diálogo abierto', async () => {
    // Sin vigilar `retreatId` quedaba la agenda del retiro anterior bajo el
    // nombre y las fechas del nuevo: datos cruzados en un documento entregado.
    const w = await mountDialog();
    expect(mockScheduleApi.list).toHaveBeenCalledWith('retreat-1');

    await w.setProps({ retreatId: 'retreat-2' });
    await flushPromises();

    expect(mockScheduleApi.list).toHaveBeenCalledWith('retreat-2');
    expect(draftOf(w)).toContain('Otro Retiro');
  });

  it('el pie lo firma el remitente, no el párroco', async () => {
    // Estaba al revés: un «Enterado y de acuerdo… Nombre y firma del Sr.
    // Párroco», como si la carta fuera un acuse suyo. Corrección del
    // coordinador, 2026-09-08.
    const w = await mountDialog();
    await w.find('[data-testid="priest-letter-print"]').trigger('click');
    const { signature } = mockPrint.mock.calls[0][0];
    expect(signature.label).toBe('Nombre y firma');
    expect(signature.label).not.toContain('Párroco');
    expect(signature.intro).toBeFalsy();
  });

  it('manda el logo también al PDF, no solo a la impresora', async () => {
    const w = await mountDialog();
    await w.find('[data-testid="priest-letter-pdf"]').trigger('click');
    await flushPromises();
    expect(mockPdf.mock.calls[0][0].logoUrl).toBe('/oficial_mejorado.png');
    expect(mockPdf.mock.calls[0][0].signature).toBeTruthy();
  });

  it('no vuelve a pedir los datos al cerrar y reabrir', async () => {
    const w = await mountDialog();
    expect(mockScheduleApi.list).toHaveBeenCalledTimes(1);

    await w.setProps({ open: false });
    await w.setProps({ open: true });
    await flushPromises();

    expect(mockScheduleApi.list).toHaveBeenCalledTimes(1);
  });
});
