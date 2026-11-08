import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import WaLetterDialog from '../WaLetterDialog.vue';

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));

const passthrough = { template: '<div><slot /></div>' };
const stubs = {
  Dialog: passthrough,
  DialogContent: passthrough,
  DialogHeader: passthrough,
  DialogTitle: passthrough,
  DialogDescription: passthrough,
  DialogFooter: passthrough,
  Button: { template: '<button v-bind="$attrs"><slot /></button>' },
};

async function openDialog(props: Record<string, unknown> = {}) {
  const wrapper = mount(WaLetterDialog, {
    props: {
      open: false,
      participants: [
        { id: 'p1', name: 'Ana López' },
        { id: 'p2', name: 'Beto Ruiz' },
      ],
      defaultParticipantId: 'p1',
      initialText: 'Te queremos',
      attachmentDataUrl: 'data:image/jpeg;base64,AA',
      preparingAttachment: false,
      saving: false,
      ...props,
    },
    global: { stubs },
  });
  await wrapper.setProps({ open: true });
  await nextTick();
  return wrapper;
}

describe('WaLetterDialog (v1.3)', () => {
  it('submits the default recipient, the message text and the image', async () => {
    const wrapper = await openDialog();
    await wrapper.find('form').trigger('submit');
    expect(wrapper.emitted('submit')?.[0]).toEqual([
      { participantId: 'p1', bodyText: 'Te queremos', includeAttachment: true },
    ]);
  });

  it('refuses an empty letter text', async () => {
    const wrapper = await openDialog({ initialText: '   ' });
    await wrapper.find('form').trigger('submit');
    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(wrapper.text()).toContain('waInbox.letter.emptyBody');
  });

  it('lets the staff drop the image', async () => {
    const wrapper = await openDialog();
    await wrapper.find('[data-testid="wa-letter-include-attachment"]').setValue(false);
    await wrapper.find('form').trigger('submit');
    expect(wrapper.emitted('submit')?.[0][0]).toMatchObject({ includeAttachment: false });
  });
});
