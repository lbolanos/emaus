import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { mount, flushPromises, VueWrapper } from '@vue/test-utils';

const speech = vi.hoisted(() => ({
	state: null as any,
}));

vi.mock('@/composables/useSpeechRecognition', async () => {
	const { ref } = await import('vue');
	return {
		useSpeechRecognition: () => {
			speech.state = {
				isListening: ref(false),
				transcript: ref(''),
				interimTranscript: ref(''),
				audioBlob: ref(null),
				isFallbackMode: ref(false),
				isSupported: ref(true),
				error: ref(''),
				start: vi.fn(() => {
					speech.state.isListening.value = true;
				}),
				stop: vi.fn(() => {
					speech.state.isListening.value = false;
				}),
			};
			return speech.state;
		},
	};
});

import FaceVoiceIdentifier from '../FaceVoiceIdentifier.vue';

const candidates = [
	{ id: 'm-ana', name: 'Ana López' },
	{ id: 'm-beto', name: 'Beto Ruiz' },
	{ id: 'm-jose', name: 'José Mora', photoUrl: 'data:image/jpeg;base64,am9zZQ==' },
];

describe('FaceVoiceIdentifier', () => {
	let wrapper: VueWrapper<any>;

	beforeEach(() => {
		speech.state = null;
	});
	afterEach(() => wrapper?.unmount());

	const mountIt = (props: Record<string, unknown> = {}) => {
		wrapper = mount(FaceVoiceIdentifier, { props: { candidates, ...props } });
		return wrapper;
	};

	const say = async (text: string) => {
		speech.state.transcript.value = text;
		await flushPromises();
	};

	it('starts listening from the mic button and shows the interim transcript', async () => {
		mountIt();
		await wrapper.find('[data-testid="mic"]').trigger('click');
		speech.state.interimTranscript.value = 'ana lo';
		await flushPromises();

		expect(speech.state.start).toHaveBeenCalled();
		expect(wrapper.find('[data-testid="mic"]').attributes('aria-pressed')).toBe('true');
		expect(wrapper.find('[data-testid="interim"]').text()).toBe('ana lo');
	});

	it('shows the best candidates for a spoken name and one tap assigns', async () => {
		mountIt();
		await say('jose mora');

		const buttons = wrapper.findAll('[data-testid="voice-candidates"] button');
		expect(buttons.length).toBeGreaterThan(0);
		expect(buttons[0].text()).toContain('José Mora');
		// The profile photo sits next to the name, to check the match against the face crop.
		expect(buttons[0].find('img').attributes('src')).toBe(candidates[2].photoUrl);

		await buttons[0].trigger('click');
		expect(wrapper.emitted('assign')![0]).toEqual(['m-jose']);
	});

	it('skips on "saltar" and "Siguiente."', async () => {
		mountIt();
		await say('Saltar');
		expect(wrapper.emitted('skip')).toHaveLength(1);

		speech.state.transcript.value = '';
		await say('Siguiente.');
		expect(wrapper.emitted('skip')).toHaveLength(2);
	});

	it('marks not a member on "no es de la comunidad" and "no es"', async () => {
		mountIt();
		await say('no es de la comunidad');
		expect(wrapper.emitted('not-member')).toHaveLength(1);

		speech.state.transcript.value = '';
		await say('No es');
		expect(wrapper.emitted('not-member')).toHaveLength(2);
		expect(wrapper.emitted('assign')).toBeUndefined();
	});

	it('says nobody matched and keeps the text picker visible', async () => {
		mountIt();
		await say('zacarias quintanilla');

		expect(wrapper.find('[data-testid="no-match"]').text()).toBe('No encontré a nadie con ese nombre');
		expect(wrapper.find('input').exists()).toBe(true);
	});

	it('hides the mic and hints at keyboard dictation when speech is unsupported', async () => {
		wrapper = mount(FaceVoiceIdentifier, { props: { candidates } });
		speech.state.isSupported.value = false;
		await flushPromises();

		expect(wrapper.find('[data-testid="mic"]').exists()).toBe(false);
		expect(wrapper.find('[data-testid="mic-hint"]').text()).toContain('micrófono del teclado');
		expect(wrapper.find('input').exists()).toBe(true);
	});

	it('does not use the recorded audio in fallback mode: mic hidden, text only', async () => {
		wrapper = mount(FaceVoiceIdentifier, { props: { candidates } });
		speech.state.isFallbackMode.value = true;
		await flushPromises();

		expect(wrapper.find('[data-testid="mic"]').exists()).toBe(false);
		expect(wrapper.find('[data-testid="mic-hint"]').exists()).toBe(true);
	});

	it('shows a short Spanish message when the mic permission is denied', async () => {
		mountIt();
		speech.state.error.value = 'not-allowed';
		await flushPromises();

		expect(wrapper.find('[data-testid="voice-error"]').text()).toBe('No hay permiso para usar el micrófono');
	});

	it('can hide its own picker when the host already renders one', () => {
		mountIt({ showPicker: false });
		expect(wrapper.find('input').exists()).toBe(false);
	});
});
