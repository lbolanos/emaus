import { describe, it, expect } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import ExportParticipantsModal from '../ExportParticipantsModal.vue';

/**
 * Formato Google Contacts del modal de export (spec
 * specs/export-google-contacts/spec.md, CA6/CA7): columnas fijas → se oculta la
 * selección de columnas, el identificador pasa a obligatorio (botón + guard) y
 * el emit lleva participantes crudos + identificador, no records de columnas.
 */
describe('ExportParticipantsModal — formato Google Contacts', () => {
	const PARTICIPANTS = [
		{ id: 'p1', firstName: 'Juan', lastName: 'Pérez', cellPhone: '5549442834', country: 'México' },
		{ id: 'p2', firstName: 'Ana', lastName: 'López', cellPhone: '', country: 'México' },
	];

	const mountModal = (props: Record<string, unknown> = {}) =>
		mount(ExportParticipantsModal, {
			props: {
				isOpen: true,
				allColumns: [
					{ key: 'firstName', label: 'participants.columns.firstName' },
					{ key: 'lastName', label: 'participants.columns.lastName' },
				],
				visibleColumns: ['firstName'],
				selectedColumns: ['firstName'],
				allParticipants: PARTICIPANTS,
				selectedParticipants: new Set<string>(),
				currentType: 'walker',
				...props,
			},
		});

	const selectGoogleFormat = async (wrapper: VueWrapper<any>) => {
		const radio = wrapper.find('input[type="radio"][value="google-contacts"]');
		(radio.element as HTMLInputElement).checked = true;
		await radio.trigger('change');
	};

	const findExportButton = (wrapper: VueWrapper<any>) =>
		wrapper.findAll('button').find(b => b.text().includes('participants.export.startExport'))!;

	it('oculta la selección de columnas y pide el identificador', async () => {
		const wrapper = mountModal();
		// En xlsx la selección de columnas está visible y el campo no existe.
		expect(wrapper.text()).toContain('participants.export.columns');
		expect(wrapper.find('#googleContactsSuffix').exists()).toBe(false);

		await selectGoogleFormat(wrapper);

		expect(wrapper.text()).not.toContain('participants.export.columns');
		const suffixInput = wrapper.find('#googleContactsSuffix');
		expect(suffixInput.exists()).toBe(true);
	});

	it('sin identificador el botón de exportar queda deshabilitado aunque haya columnas', async () => {
		const wrapper = mountModal();
		await selectGoogleFormat(wrapper);

		expect(findExportButton(wrapper).attributes('disabled')).toBeDefined();

		await wrapper.find('#googleContactsSuffix').setValue('Emaus ValleII');
		expect(findExportButton(wrapper).attributes('disabled')).toBeUndefined();
	});

	it('en xlsx el botón sigue dependiendo de las columnas seleccionadas', async () => {
		const sinColumnas = mountModal({ selectedColumns: [] });
		expect(findExportButton(sinColumnas).attributes('disabled')).toBeDefined();

		const conColumnas = mountModal({ selectedColumns: ['firstName'] });
		expect(findExportButton(conColumnas).attributes('disabled')).toBeUndefined();
	});

	it('exportar emite participantes crudos + identificador y filename default propio', async () => {
		const wrapper = mountModal();
		await selectGoogleFormat(wrapper);
		await wrapper.find('#googleContactsSuffix').setValue('Emaus ValleII');

		await findExportButton(wrapper).trigger('click');

		// El CSV lo arma el padre: del modal salen los participantes tal cual.
		expect(wrapper.emitted('export')).toBeUndefined();
		const emitted = wrapper.emitted('export-google-contacts');
		expect(emitted).toHaveLength(1);
		const payload = emitted![0][0] as { participants: unknown[]; suffix: string; filename: string };
		expect(payload.participants).toEqual(PARTICIPANTS);
		expect(payload.suffix).toBe('Emaus ValleII');
		expect(payload.filename).toMatch(/^google_contacts_walker_\d{4}-\d{2}-\d{2}$/);
	});
});
