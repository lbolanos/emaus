import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

// ---------------------------------------------------------------------------
// Estado mutable compartido entre tests (vi.hoisted para usarlo en las factories)
// ---------------------------------------------------------------------------
const { authState, scheduleState, responsabilityState } = vi.hoisted(() => ({
  authState: {
    // `user` es la fuente correcta de participantId (raíz del response /auth/status)
    user: null as any,
    // `userProfile` solo trae { roles, permissions } — NO debe usarse para participantId
    userProfile: null as any,
  },
  scheduleState: {
    items: [] as any[],
    connected: false,
  },
  responsabilityState: {
    responsibilities: [] as any[],
  },
}));

const mockLoadForRetreat = vi.fn().mockResolvedValue(undefined);
const mockSubscribeRealtime = vi.fn().mockReturnValue(() => {});
const mockFetchResponsibilities = vi.fn().mockResolvedValue(undefined);

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

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({
    get user() {
      return authState.user;
    },
    get userProfile() {
      return authState.userProfile;
    },
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

import MyScheduleView from '../MyScheduleView.vue';

// endTime lejano en el futuro → el item cae en "Próximas", no en "Pasadas".
const FUTURE_START = '2099-06-08T19:40:00.000Z';
const FUTURE_END = '2099-06-08T20:40:00.000Z';

function makeItem(overrides: Record<string, any> = {}) {
  return {
    id: 'I1',
    name: 'Comida del equipo',
    type: 'comida',
    status: 'pending',
    responsabilityId: null,
    startTime: FUTURE_START,
    endTime: FUTURE_END,
    durationMinutes: 60,
    responsables: [],
    attachments: [],
    ...overrides,
  };
}

describe('MyScheduleView — resolución de myParticipantId', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    authState.user = null;
    authState.userProfile = null;
    scheduleState.items = [];
    scheduleState.connected = false;
    responsabilityState.responsibilities = [];
    mockLoadForRetreat.mockClear();
    mockSubscribeRealtime.mockClear();
    mockFetchResponsibilities.mockClear();
  });

  it('toma participantId de authStore.user (no de userProfile) y muestra los items asignados vía responsabilidad principal', async () => {
    // user trae el participantId; userProfile NO (solo roles/permissions)
    authState.user = { id: 'U1', participantId: 'P1' };
    authState.userProfile = { roles: [], permissions: [] };
    responsabilityState.responsibilities = [{ id: 'R1', name: 'Comedor', participantId: 'P1' }];
    scheduleState.items = [makeItem({ responsabilityId: 'R1', name: 'Comida del equipo' })];

    const wrapper = mount(MyScheduleView);
    await flushPromises();

    expect(wrapper.text()).not.toContain('no tiene un participante vinculado');
    expect(wrapper.text()).toContain('Comida del equipo');
    // El rol asignado se muestra junto al item
    expect(wrapper.text()).toContain('Comedor');
  });

  it('REGRESIÓN: si el participantId está SOLO en userProfile y no en user, NO se resuelve (userProfile no es la fuente)', async () => {
    // Simula el bug original: participantId colocado en userProfile
    authState.user = { id: 'U1', participantId: null };
    authState.userProfile = { participantId: 'P1', roles: [], permissions: [] };
    responsabilityState.responsibilities = [{ id: 'R1', name: 'Comedor', participantId: 'P1' }];
    scheduleState.items = [makeItem({ responsabilityId: 'R1' })];

    const wrapper = mount(MyScheduleView);
    await flushPromises();

    // Debe mostrar el card de "no vinculado" porque user.participantId es null
    expect(wrapper.text()).toContain('no tiene un participante vinculado');
    expect(wrapper.text()).not.toContain('Comida del equipo');
  });

  it('muestra el card de "no vinculado" cuando user no tiene participantId', async () => {
    authState.user = { id: 'U1', participantId: null };
    authState.userProfile = { roles: [], permissions: [] };
    scheduleState.items = [makeItem({ responsabilityId: 'R1' })];

    const wrapper = mount(MyScheduleView);
    await flushPromises();

    expect(wrapper.text()).toContain('no tiene un participante vinculado');
  });

  it('también resuelve participantId desde user.participant.id (forma anidada)', async () => {
    authState.user = { id: 'U1', participant: { id: 'P1' } };
    authState.userProfile = { roles: [], permissions: [] };
    responsabilityState.responsibilities = [{ id: 'R1', name: 'Comedor', participantId: 'P1' }];
    scheduleState.items = [makeItem({ responsabilityId: 'R1' })];

    const wrapper = mount(MyScheduleView);
    await flushPromises();

    expect(wrapper.text()).not.toContain('no tiene un participante vinculado');
    expect(wrapper.text()).toContain('Comida del equipo');
  });

  it('incluye items donde el participante figura en responsables[] (no solo en la responsabilidad principal)', async () => {
    authState.user = { id: 'U1', participantId: 'P1' };
    authState.userProfile = { roles: [], permissions: [] };
    scheduleState.items = [
      makeItem({
        name: 'Recepción de caminantes',
        responsabilityId: null,
        responsables: [{ participantId: 'P1', role: 'Apoyo' }],
      }),
    ];

    const wrapper = mount(MyScheduleView);
    await flushPromises();

    expect(wrapper.text()).toContain('Recepción de caminantes');
    expect(wrapper.text()).toContain('Apoyo');
  });

  it('no muestra items asignados a OTRO participante', async () => {
    authState.user = { id: 'U1', participantId: 'P1' };
    authState.userProfile = { roles: [], permissions: [] };
    responsabilityState.responsibilities = [{ id: 'R2', name: 'Cocina', participantId: 'P2' }];
    scheduleState.items = [makeItem({ responsabilityId: 'R2', name: 'Otra actividad' })];

    const wrapper = mount(MyScheduleView);
    await flushPromises();

    // Tiene participante vinculado, pero sin actividades propias
    expect(wrapper.text()).not.toContain('no tiene un participante vinculado');
    expect(wrapper.text()).not.toContain('Otra actividad');
    expect(wrapper.text()).toContain('No tienes actividades próximas asignadas');
  });
});
