import { ref, onUnmounted } from 'vue';
import { ttsSpeak } from '@/services/api';

const STORAGE_KEY = 'jessy-auto-read';
const STORAGE_KEY_EDGE = 'jessy-use-edge-tts';

// Common emoji-to-word replacements for TTS readability
const EMOJI_REPLACEMENTS: [RegExp, string][] = [
	[/✅/g, 'sí'],
	[/❌/g, 'no'],
	[/⚠️/g, 'atención'],
	[/🔴/g, ''],
	[/🟢/g, ''],
	[/🟡/g, ''],
	[/📋/g, ''],
	[/📌/g, ''],
	[/👤/g, ''],
	[/👥/g, ''],
	[/🏠/g, ''],
	[/🛏️/g, ''],
	[/🪑/g, ''],
	[/💰/g, ''],
	[/📊/g, ''],
	[/🎂/g, ''],
	[/✉️/g, ''],
	[/🔔/g, ''],
];

// Strip all remaining emojis using Unicode property escape
// eslint-disable-next-line no-misleading-character-class
const EMOJI_REGEX = /\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu;

function stripMarkdown(text: string): string {
	let result = text;

	// Replace known emojis with readable words first
	for (const [emoji, word] of EMOJI_REPLACEMENTS) {
		result = result.replace(emoji, word);
	}

	// Strip all remaining emojis
	result = result.replace(EMOJI_REGEX, '');

	return result
		.replace(/```[\s\S]*?```/g, '') // code blocks
		.replace(/`[^`]+`/g, '') // inline code
		.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links → text
		.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1') // images → alt
		.replace(/#{1,6}\s+/g, '') // headings
		.replace(/\*\*([^*]+)\*\*/g, '$1') // bold
		.replace(/\*([^*]+)\*/g, '$1') // italic
		.replace(/__([^_]+)__/g, '$1') // bold alt
		.replace(/_([^_]+)_/g, '$1') // italic alt
		.replace(/~~([^~]+)~~/g, '$1') // strikethrough
		.replace(/^[-*+]\s+/gm, '') // unordered list markers
		.replace(/^\d+\.\s+/gm, '') // ordered list markers
		.replace(/^>\s+/gm, '') // blockquotes
		.replace(/\|/g, '') // table pipes
		.replace(/---+/g, '') // horizontal rules
		.replace(/\n{2,}/g, '. ') // double newlines → pause
		.replace(/\n/g, ' ') // single newlines → space
		.replace(/\s{2,}/g, ' ') // collapse multiple spaces
		.trim();
}

function findSpanishVoice(): SpeechSynthesisVoice | null {
	const voices = speechSynthesis.getVoices();
	const esMX = voices.find((v) => v.lang === 'es-MX');
	if (esMX) return esMX;
	const esAny = voices.find((v) => v.lang.startsWith('es'));
	if (esAny) return esAny;
	return null;
}

export function useSpeechSynthesis() {
	const isSpeaking = ref(false);
	const isSupported = ref(typeof window !== 'undefined' && 'speechSynthesis' in window);
	const autoRead = ref(false);
	const useEdgeTts = ref(false);

	// Restore persisted preferences
	try {
		autoRead.value = localStorage.getItem(STORAGE_KEY) === 'true';
		useEdgeTts.value = localStorage.getItem(STORAGE_KEY_EDGE) === 'true';
	} catch {
		// ignore
	}

	function setAutoRead(value: boolean) {
		autoRead.value = value;
		try {
			localStorage.setItem(STORAGE_KEY, String(value));
		} catch {
			// ignore
		}
	}

	function setUseEdgeTts(value: boolean) {
		useEdgeTts.value = value;
		try {
			localStorage.setItem(STORAGE_KEY_EDGE, String(value));
		} catch {
			// ignore
		}
	}

	let currentUtterance: SpeechSynthesisUtterance | null = null;
	let currentAudio: HTMLAudioElement | null = null;

	// --- Edge TTS (backend) ---
	async function speakWithEdgeTts(text: string) {
		try {
			isSpeaking.value = true;
			const blob = await ttsSpeak(text);
			const url = URL.createObjectURL(blob);
			const audio = new Audio(url);
			currentAudio = audio;

			audio.onended = () => {
				isSpeaking.value = false;
				currentAudio = null;
				URL.revokeObjectURL(url);
			};
			audio.onerror = () => {
				isSpeaking.value = false;
				currentAudio = null;
				URL.revokeObjectURL(url);
			};

			await audio.play();
		} catch {
			// Edge TTS failed — fall back to browser synthesis
			isSpeaking.value = false;
			currentAudio = null;
			speakWithBrowser(text);
		}
	}

	// --- Browser SpeechSynthesis ---
	function speakWithBrowser(text: string) {
		if (!isSupported.value) return;

		speechSynthesis.cancel();

		const utterance = new SpeechSynthesisUtterance(text);
		utterance.lang = 'es-MX';
		utterance.rate = 1.0;
		utterance.pitch = 1.0;

		const voice = findSpanishVoice();
		if (voice) utterance.voice = voice;

		utterance.onstart = () => {
			isSpeaking.value = true;
		};
		utterance.onend = () => {
			isSpeaking.value = false;
			currentUtterance = null;
		};
		utterance.onerror = () => {
			isSpeaking.value = false;
			currentUtterance = null;
		};

		currentUtterance = utterance;

		if (!voice && speechSynthesis.getVoices().length === 0) {
			speechSynthesis.addEventListener(
				'voiceschanged',
				() => {
					const v = findSpanishVoice();
					if (v) utterance.voice = v;
					speechSynthesis.speak(utterance);
				},
				{ once: true },
			);
		} else {
			speechSynthesis.speak(utterance);
		}
	}

	// --- Public API ---
	function speak(text: string) {
		if (!text) return;
		stop();

		const cleaned = stripMarkdown(text);
		if (!cleaned) return;

		if (useEdgeTts.value) {
			speakWithEdgeTts(cleaned);
		} else {
			speakWithBrowser(cleaned);
		}
	}

	function stop() {
		if (currentAudio) {
			currentAudio.pause();
			currentAudio = null;
		}
		if (isSupported.value) {
			speechSynthesis.cancel();
		}
		isSpeaking.value = false;
		currentUtterance = null;
	}

	onUnmounted(() => {
		stop();
	});

	return {
		isSpeaking,
		isSupported,
		autoRead,
		useEdgeTts,
		setAutoRead,
		setUseEdgeTts,
		speak,
		stop,
	};
}
