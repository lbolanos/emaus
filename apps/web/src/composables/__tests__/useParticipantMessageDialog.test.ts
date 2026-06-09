import { describe, it, expect, beforeEach } from 'vitest';
import { useParticipantMessageDialog } from '../useParticipantMessageDialog';
import type { Participant } from '@repo/types';

const makeParticipant = (overrides: Partial<Participant> = {}): Participant =>
  ({
    id: 'p-1',
    firstName: 'Miguel',
    lastName: 'Cavazos',
    type: 'walker',
    cellPhone: '8112122644',
    ...overrides,
  }) as Participant;

describe('useParticipantMessageDialog', () => {
  beforeEach(() => {
    // El singleton vive a nivel de módulo: lo reseteamos entre tests.
    const { isOpen, participant } = useParticipantMessageDialog();
    isOpen.value = false;
    participant.value = null;
  });

  it('arranca cerrado y sin participante', () => {
    const { isOpen, participant } = useParticipantMessageDialog();
    expect(isOpen.value).toBe(false);
    expect(participant.value).toBeNull();
  });

  it('open() fija el participante y abre el diálogo', () => {
    const { isOpen, participant, open } = useParticipantMessageDialog();
    const p = makeParticipant();
    open(p);
    expect(isOpen.value).toBe(true);
    expect(participant.value).toEqual(p);
  });

  it('es un singleton: el estado se comparte entre invocaciones', () => {
    // Crítico: el popover (en TableCard/ServerDropZone) abre el diálogo montado
    // una sola vez en TablesView, sin prop-drilling.
    const a = useParticipantMessageDialog();
    const b = useParticipantMessageDialog();
    const p = makeParticipant({ id: 'shared' });
    a.open(p);
    expect(b.isOpen.value).toBe(true);
    expect(b.participant.value?.id).toBe('shared');
  });

  it('open() con otro participante reemplaza al anterior', () => {
    const { participant, open } = useParticipantMessageDialog();
    open(makeParticipant({ id: 'first' }));
    open(makeParticipant({ id: 'second' }));
    expect(participant.value?.id).toBe('second');
  });

  it('cerrar el diálogo no borra el participante (lo conserva hasta el próximo open)', () => {
    const { isOpen, participant, open } = useParticipantMessageDialog();
    open(makeParticipant({ id: 'keep' }));
    isOpen.value = false; // como hace v-model:open al cerrar
    expect(participant.value?.id).toBe('keep');
  });
});
