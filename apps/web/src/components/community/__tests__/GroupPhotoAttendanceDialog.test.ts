import { describe, it, expect, afterEach } from 'vitest';
import { mount, flushPromises, VueWrapper } from '@vue/test-utils';
import GroupPhotoAttendanceDialog from '../GroupPhotoAttendanceDialog.vue';

const member = (id: string, firstName: string, lastName: string, extra: Record<string, unknown> = {}) => ({
	id,
	photoUrl: null,
	faceRecognitionOptOut: false,
	participant: { firstName, lastName, email: `${firstName.toLowerCase()}@example.com` },
	...extra,
});

const members = [
	member('m-ana', 'Ana', 'López', { photoUrl: 'https://s3.example.com/ana.jpg' }),
	member('m-beto', 'Beto', 'Ruiz'),
	member('m-carla', 'Carla', 'Pérez'),
	member('m-dani', 'Dani', 'Soto', { faceRecognitionOptOut: true }),
	member('m-jose', 'José', 'Mora'),
];

const face = (crop: string, suggestedMemberId: string | null, box: [number, number, number, number]) => ({
	crop,
	suggestedMemberId,
	box,
});

const result = {
	faces: [
		face('data:crop-ana', 'm-ana', [0, 0, 100, 100]),
		face('data:crop-beto', 'm-beto', [0, 100, 100, 200]),
		face('data:crop-x', null, [0, 200, 100, 300]),
		face('data:crop-y', null, [0, 300, 100, 400]),
	],
};

describe('GroupPhotoAttendanceDialog', () => {
	let wrapper: VueWrapper<any>;

	afterEach(() => wrapper?.unmount());

	const mountDialog = (props: Record<string, unknown> = {}, slots: Record<string, any> = {}) => {
		wrapper = mount(GroupPhotoAttendanceDialog, {
			props: { open: true, result, members, ...props },
			slots,
		});
		return wrapper;
	};

	const confirmButton = () => wrapper.find('[data-testid="confirm"]');
	const lastConfirm = () => wrapper.emitted('confirm')!.at(-1)![0] as any;

	it('shows the analyzing state and cannot be confirmed yet', () => {
		mountDialog({ analyzing: true, result: null });

		expect(wrapper.text()).toContain('Analizando la foto');
		expect(wrapper.findAll('[data-testid="suggestion"]')).toHaveLength(0);
		expect((confirmButton().element as HTMLButtonElement).disabled).toBe(true);
	});

	it('lists every suggestion preselected, with the crop and no percentage', () => {
		mountDialog();

		const items = wrapper.findAll('[data-testid="suggestion"]');
		expect(items).toHaveLength(2);
		expect(items[0].find('img[src="data:crop-ana"]').exists()).toBe(true);
		expect(items[0].text()).toContain('Ana López');
		expect(wrapper.text()).not.toMatch(/\d\s?%/);
		expect(wrapper.text()).toContain('Confirmar 2 presentes');
		expect(wrapper.findAll('[data-testid="unidentified"]')).toHaveLength(2);
	});

	it('removing a suggestion drops it from the count and moves its face to "sin identificar"', async () => {
		mountDialog();

		await wrapper.find('button[aria-label="Quitar a Beto Ruiz"]').trigger('click');

		expect(wrapper.findAll('[data-testid="suggestion"]')).toHaveLength(1);
		expect(wrapper.findAll('[data-testid="unidentified"]')).toHaveLength(3);
		expect(wrapper.text()).toContain('Confirmar 1 presente');
	});

	it('assigns an unidentified face to a member found by name without accents', async () => {
		mountDialog();
		const picker = wrapper.findAll('[data-testid="unidentified"]')[0];

		await picker.find('input').setValue('jose');
		await picker.find('button[data-member-id="m-jose"]').trigger('click');

		expect(picker.text()).toContain('Es José Mora');
		expect(wrapper.text()).toContain('Confirmar 3 presentes');
	});

	it('does not offer a member already picked, in any section', async () => {
		mountDialog();
		const [first, second] = wrapper.findAll('[data-testid="unidentified"]');

		await first.find('input').setValue('carla');
		await first.find('button[data-member-id="m-carla"]').trigger('click');
		await second.find('input').setValue('carla');

		expect(second.find('button[data-member-id="m-carla"]').exists()).toBe(false);
		// Ana is already suggested for the first face: not offered either.
		await second.find('input').setValue('ana');
		expect(second.find('button[data-member-id="m-ana"]').exists()).toBe(false);
	});

	it('frees a member again when the assignment is undone', async () => {
		mountDialog();
		const [first, second] = wrapper.findAll('[data-testid="unidentified"]');
		await first.find('input').setValue('carla');
		await first.find('button[data-member-id="m-carla"]').trigger('click');

		await first.findAll('button').find((b) => b.text() === 'Deshacer')!.trigger('click');
		await second.find('input').setValue('carla');

		expect(second.find('button[data-member-id="m-carla"]').exists()).toBe(true);
		expect(wrapper.text()).toContain('Confirmar 2 presentes');
	});

	it('"No es de la comunidad" and "Saltar" add nobody', async () => {
		mountDialog();
		const [first, second] = wrapper.findAll('[data-testid="unidentified"]');

		await first.findAll('button').find((b) => b.text() === 'No es de la comunidad')!.trigger('click');
		await second.findAll('button').find((b) => b.text() === 'Saltar')!.trigger('click');

		expect(first.text()).toContain('No es de la comunidad');
		expect(second.text()).toContain('Omitida');
		expect(wrapper.text()).toContain('Confirmar 2 presentes');
	});

	it('degraded mode shows a notice and goes straight to manual marking', async () => {
		mountDialog({ result: { faces: [], degraded: true, reason: 'busy' } });

		expect(wrapper.find('[data-testid="degraded-notice"]').text()).toContain('saturado');
		expect(wrapper.findAll('[data-testid="suggestion"]')).toHaveLength(0);
		expect((confirmButton().element as HTMLButtonElement).disabled).toBe(true);

		const manualPicker = wrapper.find('section[aria-labelledby="gp-manual"]');
		await manualPicker.find('input').setValue('beto');
		await manualPicker.find('button[data-member-id="m-beto"]').trigger('click');

		expect(wrapper.find('[data-testid="manual-list"]').text()).toContain('Beto Ruiz');
		await confirmButton().trigger('click');
		expect(lastConfirm()).toEqual({ present: ['m-beto'], photos: [], tags: [] });
	});

	it('confirms present ids, photos only for members without one, and a tag per face', async () => {
		mountDialog();
		const first = wrapper.findAll('[data-testid="unidentified"]')[0];
		await first.find('input').setValue('carla');
		await first.find('button[data-member-id="m-carla"]').trigger('click');

		await confirmButton().trigger('click');
		await flushPromises();

		expect(lastConfirm()).toEqual({
			present: ['m-ana', 'm-beto', 'm-carla'],
			// Ana already has a profile photo: her crop is not sent.
			photos: [
				{ memberId: 'm-beto', crop: 'data:crop-beto' },
				{ memberId: 'm-carla', crop: 'data:crop-x' },
			],
			tags: [
				{ memberId: 'm-ana', box: [0, 0, 100, 100] },
				{ memberId: 'm-beto', box: [0, 100, 100, 200] },
				{ memberId: 'm-carla', box: [0, 200, 100, 300] },
			],
		});
	});

	it('an excluded member can be marked present but their crop is never sent as a photo', async () => {
		mountDialog();
		const first = wrapper.findAll('[data-testid="unidentified"]')[0];
		await first.find('input').setValue('dani');
		await first.find('button[data-member-id="m-dani"]').trigger('click');

		await confirmButton().trigger('click');

		const payload = lastConfirm();
		expect(payload.present).toContain('m-dani');
		expect(payload.photos.map((p: any) => p.memberId)).not.toContain('m-dani');
	});

	it('exposes a voice slot per unidentified face with the actions and the free members', async () => {
		mountDialog(
			{},
			{
				voice: `<template #voice="{ index, candidates, assign }">
					<button class="voice" :data-index="index" :data-free="candidates.length" @click="assign('m-jose')">voz</button>
				</template>`,
			},
		);

		const voice = wrapper.findAll('button.voice');
		expect(voice).toHaveLength(2);
		// 5 members, Ana and Beto already suggested.
		expect(voice[0].attributes('data-free')).toBe('3');
		expect(voice[0].attributes('data-index')).toBe('2');

		await voice[0].trigger('click');
		expect(wrapper.text()).toContain('Es José Mora');
	});

	it('does not confirm while the confirmation is in flight', () => {
		mountDialog({ confirming: true });
		expect((confirmButton().element as HTMLButtonElement).disabled).toBe(true);
	});

	it('starts a clean review when a new analysis arrives', async () => {
		mountDialog();
		await wrapper.find('button[aria-label="Quitar a Beto Ruiz"]').trigger('click');

		await wrapper.setProps({ result: { ...result, faces: [...result.faces] } });

		expect(wrapper.findAll('[data-testid="suggestion"]')).toHaveLength(2);
	});
});
