import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import HelpVideoButton from '@/components/HelpVideoButton.vue';

vi.mock('@/config/helpVideos', () => ({
  getHelpVideo: (feature: string) =>
    feature === 'con-video'
      ? { url: 'https://youtu.be/abc123', title: 'Ver video: X' }
      : undefined,
}));

describe('HelpVideoButton', () => {
  it('renderiza un enlace a YouTube cuando la feature tiene URL', () => {
    const wrapper = mount(HelpVideoButton, { props: { feature: 'con-video' } });
    const link = wrapper.find('a');
    expect(link.exists()).toBe(true);
    expect(link.attributes('href')).toBe('https://youtu.be/abc123');
    expect(link.attributes('target')).toBe('_blank');
    expect(link.attributes('rel')).toContain('noopener');
  });

  it('no renderiza nada cuando la feature no tiene video', () => {
    const wrapper = mount(HelpVideoButton, { props: { feature: 'sin-video' } });
    expect(wrapper.find('a').exists()).toBe(false);
    expect(wrapper.find('[data-testid="help-video"]').exists()).toBe(false);
  });
});
