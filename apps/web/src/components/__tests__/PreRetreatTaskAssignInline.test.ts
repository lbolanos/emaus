import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import PreRetreatTaskAssignInline from '../PreRetreatTaskAssignInline.vue';

const participants = [
  { id: 'p1', firstName: 'Rodrigo', lastName: 'Reyna', nickname: 'Roy' },
  { id: 'p2', firstName: 'Octavio', lastName: 'Natera', nickname: 'N/A' }, // apodo basura
  { id: 'p3', firstName: 'Ana', lastName: 'López', nickname: null },
];

function mountInline(props: Record<string, unknown> = {}) {
  return mount(PreRetreatTaskAssignInline, {
    props: {
      label: '',
      participants,
      canManage: true,
      hasResponsible: false,
      ...props,
    },
  });
}

describe('PreRetreatTaskAssignInline', () => {
  beforeEach(() => {
    // preventScroll usa focus(); jsdom lo soporta, pero por si acaso.
    vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('muestra "Sin asignar" cuando no hay label', () => {
    const w = mountInline({ label: '' });
    expect(w.text()).toContain('Sin asignar');
  });

  it('muestra el label cuando hay responsable', () => {
    const w = mountInline({ label: 'Roy', hasResponsible: true });
    expect(w.text()).toContain('Roy');
    expect(w.text()).not.toContain('Sin asignar');
  });

  it('sin permiso de gestión es solo lectura (no hay botón chip)', () => {
    const w = mountInline({ canManage: false });
    // El chip gestionable es un <button>; en solo lectura es un <span>.
    expect(w.find('button').exists()).toBe(false);
    expect(w.text()).toContain('Sin asignar');
  });

  it('al abrir el picker oculta los apodos "N/A" y muestra los reales', async () => {
    const w = mountInline();
    await w.find('button').trigger('click');
    const text = w.text();
    expect(text).toContain('(Roy)');
    expect(text).toContain('Octavio Natera');
    expect(text).not.toContain('(N/A)'); // apodo basura oculto
    expect(text).not.toContain('(null)');
  });

  it('emite assign con el id del participante elegido', async () => {
    const w = mountInline();
    await w.find('button').trigger('click');
    const options = w.findAll('button').filter((b) => b.text().includes('Octavio'));
    await options[0].trigger('mousedown');
    expect(w.emitted('assign')?.[0]).toEqual(['p2']);
  });

  it('ofrece "Quitar responsable" solo si hay responsable y emite assign(null)', async () => {
    const w = mountInline({ label: 'Roy', hasResponsible: true });
    await w.find('button').trigger('click');
    const quitar = w.findAll('button').find((b) => b.text().includes('Quitar responsable'));
    expect(quitar).toBeTruthy();
    await quitar!.trigger('mousedown');
    expect(w.emitted('assign')?.[0]).toEqual([null]);
  });

  it('sin responsable no muestra "Quitar responsable"', async () => {
    const w = mountInline({ hasResponsible: false });
    await w.find('button').trigger('click');
    expect(w.findAll('button').some((b) => b.text().includes('Quitar responsable'))).toBe(false);
  });

  it('el buscador filtra por nombre/apodo', async () => {
    const w = mountInline();
    await w.find('button').trigger('click');
    await w.find('input[placeholder="Buscar servidor…"]').setValue('ana');
    const text = w.text();
    expect(text).toContain('Ana López');
    expect(text).not.toContain('Octavio Natera');
  });
});
