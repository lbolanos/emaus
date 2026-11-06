import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

// ---------------------------------------------------------------------------
// Estado mutable compartido entre tests (vi.hoisted para las factories)
// ---------------------------------------------------------------------------
const { scheduleState, participantState, responsabilityState, teamState, mockAssignmentDocuments } =
  vi.hoisted(() => ({
    scheduleState: {
      items: [] as any[],
      connected: false,
    },
    participantState: {
      participants: [] as any[],
      filters: {} as Record<string, any>,
    },
    responsabilityState: {
      responsibilities: [] as any[],
    },
    teamState: {
      teams: [] as any[],
    },
    mockAssignmentDocuments: vi.fn().mockResolvedValue({}),
  }));

const mockLoadForRetreat = vi.fn().mockResolvedValue(undefined);
const mockSubscribeRealtime = vi.fn().mockReturnValue(() => {});
const mockUnsubscribe = vi.fn();
const mockFetchParticipants = vi.fn().mockResolvedValue(undefined);
const mockFetchResponsibilities = vi.fn().mockResolvedValue(undefined);
const mockFetchTeams = vi.fn().mockResolvedValue(undefined);

vi.mock('@/stores/scheduleStore', () => ({
  useScheduleStore: () => ({
    get items() {
      return scheduleState.items;
    },
    get connected() {
      return scheduleState.connected;
    },
    loadForRetreat: mockLoadForRetreat,
    subscribeRealtime: mockSubscribeRealtime,
  }),
}));

vi.mock('@/stores/retreatStore', () => ({
  useRetreatStore: () => ({
    selectedRetreatId: 'retreat-1',
  }),
}));

vi.mock('@/stores/participantStore', () => ({
  useParticipantStore: () => ({
    get participants() {
      return participantState.participants;
    },
    get filters() {
      return participantState.filters;
    },
    fetchParticipants: mockFetchParticipants,
  }),
}));

vi.mock('@/stores/responsabilityStore', () => ({
  useResponsabilityStore: () => ({
    get responsibilities() {
      return responsabilityState.responsibilities;
    },
    fetchResponsibilities: mockFetchResponsibilities,
  }),
}));

vi.mock('@/stores/serviceTeamStore', () => ({
  useServiceTeamStore: () => ({
    get teams() {
      return teamState.teams;
    },
    fetchTeams: mockFetchTeams,
  }),
}));

vi.mock('@/composables/useAuthPermissions', () => ({
  useAuthPermissions: () => ({
    can: { read: () => true, manage: () => false },
    canManage: { schedule: false },
  }),
}));

vi.mock('@/services/api', () => ({
  retreatScheduleApi: {
    assignmentDocuments: mockAssignmentDocuments,
  },
}));

import ServerBriefingView from '../ServerBriefingView.vue';

function makeItem(overrides: Record<string, any> = {}) {
  return {
    id: 'I1',
    name: 'Lectura del Camino',
    type: 'charla',
    day: 1,
    status: 'pending',
    responsabilityId: null,
    startTime: '2026-11-27T10:00:00',
    endTime: '2026-11-27T11:00:00',
    durationMinutes: 60,
    responsables: [],
    attachments: [],
    ...overrides,
  };
}

function makeServer(id: string, firstName: string, lastName = '') {
  return { id, firstName, lastName, nickname: '', type: 'server', isCancelled: false };
}

function seed() {
  scheduleState.items = [
    makeItem({
      id: 'I1',
      status: 'active',
      name: 'Lectura del Camino',
      responsabilityId: 'R1',
      location: 'Salón Asís',
      responsables: [{ participantId: 'P1', role: null }],
    }),
    makeItem({
      id: 'I2',
      name: 'Comida',
      startTime: '2026-11-27T12:00:00',
      responsables: [{ participantId: 'P2', role: 'Apoyo' }],
    }),
  ];
  participantState.participants = [makeServer('P1', 'Ana'), makeServer('P2', 'Bea')];
  responsabilityState.responsibilities = [
    { id: 'R1', name: 'Lectura del Camino', participantId: 'P1', isActive: true },
  ];
  teamState.teams = [];
}

describe('ServerBriefingView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    scheduleState.items = [];
    scheduleState.connected = false;
    participantState.participants = [];
    participantState.filters = {};
    responsabilityState.responsibilities = [];
    teamState.teams = [];
    mockLoadForRetreat.mockClear();
    mockSubscribeRealtime.mockClear();
    mockUnsubscribe.mockClear();
    mockFetchParticipants.mockClear();
    mockFetchResponsibilities.mockClear();
    mockFetchTeams.mockClear();
    mockAssignmentDocuments.mockReset();
    mockAssignmentDocuments.mockResolvedValue({});
    mockSubscribeRealtime.mockReturnValue(mockUnsubscribe);
  });

  it('auto-detecta el item active y arma el grupo "En escena" con su responsable', async () => {
    seed();
    const wrapper = mount(ServerBriefingView);
    await flushPromises();

    expect(wrapper.text()).toContain('En escena');
    expect(wrapper.text()).toContain('Ana');
    expect(wrapper.text()).toContain('Lectura del Camino (titular)');
    expect(wrapper.text()).toContain('Los demás servidores');
    expect(wrapper.text()).toContain('Bea');
    // el walker/caminante no aparece
    expect(wrapper.text()).not.toContain('No hay actividad en curso');
  });

  it('sin item activo muestra el estado vacío y a nadie en escena', async () => {
    seed();
    scheduleState.items = scheduleState.items.map((i) => ({ ...i, status: 'pending' }));
    const wrapper = mount(ServerBriefingView);
    await flushPromises();

    expect(wrapper.text()).toContain('No hay actividad en curso');
    expect(wrapper.findAll('[data-testid="briefing-card"]').length).toBe(0);
  });

  it('el override manual mueve el grupo "En escena" a la actividad elegida', async () => {
    seed();
    const wrapper = mount(ServerBriefingView);
    await flushPromises();

    await wrapper.find('#briefing-activity').setValue('I2');
    await flushPromises();

    expect(wrapper.text()).toContain('Comida');
    // Bea ahora está en escena (era responsable de I2) y Ana pasa a los demás
    const cards = wrapper.findAll('[data-testid="briefing-card"]');
    expect(cards.length).toBe(1);
    expect(cards[0].text()).toContain('Bea');
    const rows = wrapper.findAll('[data-testid="briefing-row"]');
    expect(rows.some((r) => r.text().includes('Ana'))).toBe(true);
  });

  it('la búsqueda filtra ambas secciones sin distinguir acentos', async () => {
    seed();
    participantState.participants = [makeServer('P1', 'Ana'), makeServer('P2', 'Bea Álvarez')];
    const wrapper = mount(ServerBriefingView);
    await flushPromises();

    await wrapper.find('input[type="search"]').setValue('alvarez');
    await flushPromises();

    expect(wrapper.text()).toContain('Bea');
    expect(wrapper.text()).not.toContain('Ana');
  });

  it('click en un servidor abre el detalle con su momento actual', async () => {
    seed();
    const wrapper = mount(ServerBriefingView);
    await flushPromises();

    await wrapper.findAll('[data-testid="briefing-card"]')[0].trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Ahora — Lectura del Camino');
    expect(wrapper.text()).toContain('Su día');
    expect(wrapper.text()).toContain('Asignaciones');
  });

  it('si assignmentDocuments falla muestra el notice sin romper el briefing', async () => {
    seed();
    mockAssignmentDocuments.mockRejectedValue(new Error('boom'));
    const wrapper = mount(ServerBriefingView);
    await flushPromises();

    expect(wrapper.text()).toContain('No se pudieron cargar los documentos');
    expect(wrapper.text()).toContain('Ana');
  });

  it('se suscribe al realtime del retiro y se desuscribe al desmontar', async () => {
    seed();
    const wrapper = mount(ServerBriefingView);
    await flushPromises();

    expect(mockSubscribeRealtime).toHaveBeenCalledWith('retreat-1', expect.any(Object));
    wrapper.unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });

  it('resetea los filters del participantStore antes de cargar (regla frontend.md)', async () => {
    seed();
    participantState.filters = { type: 'server', retreatId: 'old-retreat' };
    const wrapper = mount(ServerBriefingView);
    await flushPromises();

    expect(participantState.filters.retreatId).toBe('retreat-1');
    expect(participantState.filters.type).toBeUndefined();
  });
});
