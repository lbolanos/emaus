/**
 * WhatsApp inbox view v1.4 (D24): Messages / Settings tabs kept in the URL
 * (?tab=config), the "go to settings" empty state, the draggable divider and
 * "expand conversation" hiding the list. Children and stores are mocked: this
 * suite only covers the layout wiring.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

const h = vi.hoisted(() => ({
  route: null as null | { query: Record<string, string> },
  replace: vi.fn(),
  links: [] as Array<{ id: string }>,
}));

vi.mock('vue-router', async () => {
  const { reactive } = await import('vue');
  h.route = reactive({ query: {} as Record<string, string> });
  h.replace.mockImplementation(({ query }: { query: Record<string, string> }) => {
    h.route!.query = query;
  });
  return { useRoute: () => h.route, useRouter: () => ({ replace: h.replace }) };
});

vi.mock('@/stores/waInboxStore', async () => {
  const { defineStore } = await import('pinia');
  const { ref, computed } = await import('vue');
  return {
    useWaInboxStore: defineStore('waInbox', () => ({
      links: ref(h.links),
      conversations: ref([]),
      realtimeConnected: ref(false),
      loadingConversations: ref(false),
      inboxEnabled: ref(true),
      mediaByMessageId: ref({}),
      rawMediaByMessageId: ref({}),
      totalUnread: ref(0),
      searchResults: ref([]),
      activeChatJid: ref<string | null>(null),
      activeConversation: computed(() => null),
      activeWalkerId: ref<string | null>(null),
      threadMessages: ref([]),
      loadingThread: ref(false),
      subscribeRealtime: vi.fn(),
      fetchLinks: vi.fn().mockResolvedValue(undefined),
      fetchConversations: vi.fn().mockResolvedValue(undefined),
      refreshBadge: vi.fn().mockResolvedValue(undefined),
      openChat: vi.fn().mockResolvedValue(undefined),
      reset: vi.fn(),
    })),
  };
});
vi.mock('@/stores/retreatStore', () => ({
  useRetreatStore: () => ({
    selectedRetreatId: 'r1',
    mostRecentRetreat: null,
    selectedRetreat: { id: 'r1', timezone: 'America/Mexico_City', house: { country: 'México' } },
  }),
}));
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/stores/participantStore', async () => {
  const { defineStore } = await import('pinia');
  const { ref, reactive } = await import('vue');
  return {
    useParticipantStore: defineStore('participant', () => ({
      participants: ref([]),
      filters: reactive({} as Record<string, unknown>),
      fetchParticipants: vi.fn().mockResolvedValue(undefined),
    })),
  };
});
vi.mock('@/composables/useAuthPermissions', async () => {
  const { ref } = await import('vue');
  return {
    useAuthPermissions: () => ({
      isSuperadmin: ref(false),
      can: { create: () => true, update: () => true },
      hasPermission: () => true,
    }),
  };
});

const { stub } = vi.hoisted(() => ({
  stub: (name: string, props: string[] = [], emits: string[] = []) => ({
    default: { name, props, emits, template: `<div data-stub="${name}" />` },
  }),
}));
vi.mock('@/components/PaymentManagement.vue', () => stub('PaymentManagement'));
vi.mock('@/components/MessageDialog.vue', () => stub('MessageDialog', ['open']));
vi.mock('@/components/wa/WaLinkPanel.vue', () => stub('WaLinkPanel', ['links']));
vi.mock('@/components/wa/WaLinkModal.vue', () => stub('WaLinkModal', ['open']));
vi.mock('@/components/wa/WaLetterDialog.vue', () => stub('WaLetterDialog', ['open']));
vi.mock('@/components/wa/WaConversationList.vue', () => stub('WaConversationList', ['conversations']));
vi.mock('@/components/wa/WaChatThread.vue', () =>
  stub('WaChatThread', ['expanded', 'phoneCountry'], ['toggle-expand', 'phones-saved']),
);

import WaInboxView from '../WaInboxView.vue';

async function mountView() {
  const wrapper = mount(WaInboxView);
  await flushPromises();
  return wrapper;
}

describe('WaInboxView layout (v1.4)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    h.route!.query = {};
    h.replace.mockClear();
    h.links.splice(0, h.links.length, { id: 'l1' });
  });

  it('switches to Settings through the URL and back', async () => {
    const wrapper = await mountView();
    // The global Tabs stub declares no props: the value arrives as an attribute.
    const tabs = wrapper.findComponent({ name: 'Tabs' });
    expect(tabs.attributes('model-value')).toBe('messages');

    tabs.vm.$emit('update:model-value', 'config');
    await flushPromises();
    expect(h.replace).toHaveBeenCalledWith({ query: { tab: 'config' } });
    expect(wrapper.findComponent({ name: 'Tabs' }).attributes('model-value')).toBe('config');

    wrapper.findComponent({ name: 'Tabs' }).vm.$emit('update:model-value', 'messages');
    await flushPromises();
    expect(h.route!.query).toEqual({});
  });

  it('without links, Messages points to Settings', async () => {
    h.links.splice(0, h.links.length);
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="wa-split"]').exists()).toBe(false);
    await wrapper.get('[data-testid="wa-go-config"]').trigger('click');
    expect(h.replace).toHaveBeenCalledWith({ query: { tab: 'config' } });
  });

  it('"expand conversation" hides the list and the divider, and is remembered', async () => {
    const wrapper = await mountView();
    expect(wrapper.find('[data-testid="wa-split-handle"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="wa-list-pane"]').classes()).toContain('lg:flex');

    wrapper.findComponent({ name: 'WaChatThread' }).vm.$emit('toggle-expand');
    await flushPromises();
    expect(wrapper.get('[data-testid="wa-list-pane"]').classes()).toContain('lg:hidden');
    expect(wrapper.find('[data-testid="wa-split-handle"]').exists()).toBe(false);
    expect(localStorage.getItem('emaus.waInbox.threadExpanded')).toBe('1');
    expect(wrapper.findComponent({ name: 'WaChatThread' }).props('expanded')).toBe(true);
  });

  it('the divider sets the list width and resizes with the keyboard', async () => {
    const wrapper = await mountView();
    const grid = wrapper.get('[data-testid="wa-split"]');
    expect(grid.attributes('style')).toContain('--wa-list-w: 340px');
    const handle = wrapper.get('[data-testid="wa-split-handle"]');
    expect(handle.attributes('role')).toBe('separator');
    await handle.trigger('keydown', { key: 'ArrowRight' });
    expect(grid.attributes('style')).toContain('--wa-list-w: 360px');
    expect(handle.attributes('aria-valuenow')).toBe('360');
    await handle.trigger('dblclick');
    expect(grid.attributes('style')).toContain('--wa-list-w: 340px');
  });
});
