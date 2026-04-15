import { ref, onUnmounted } from 'vue';

// Extend Window for webkit prefix
interface SpeechRecognitionEvent extends Event {
	results: SpeechRecognitionResultList;
	resultIndex: number;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

interface SpeechRecognitionInstance extends EventTarget {
	lang: string;
	continuous: boolean;
	interimResults: boolean;
	start(): void;
	stop(): void;
	abort(): void;
	onresult: ((ev: SpeechRecognitionEvent) => void) | null;
	onerror: ((ev: Event & { error: string }) => void) | null;
	onend: (() => void) | null;
}

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
	if (typeof window === 'undefined') return null;
	return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

function getMediaRecorderMimeType(): string | null {
	if (typeof MediaRecorder === 'undefined') return null;
	// Prefer webm (Chrome/Edge), fall back to mp4 (iOS Safari)
	if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
	if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
	if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
	if (MediaRecorder.isTypeSupported('audio/ogg')) return 'audio/ogg';
	return null;
}

const MAX_RECORDING_MS = 60_000; // 60 seconds

export function useSpeechRecognition() {
	const isListening = ref(false);
	const transcript = ref('');
	const interimTranscript = ref('');
	const audioBlob = ref<Blob | null>(null);
	const error = ref('');

	const SRCtor = getSpeechRecognitionCtor();
	const recorderMime = getMediaRecorderMimeType();

	// isFallbackMode = no Web Speech API but MediaRecorder available (iOS Safari)
	const isFallbackMode = ref(!SRCtor && !!recorderMime);
	const isSupported = ref(!!SRCtor || !!recorderMime);

	let recognition: SpeechRecognitionInstance | null = null;
	let mediaRecorder: MediaRecorder | null = null;
	let audioChunks: Blob[] = [];
	let recordingTimer: ReturnType<typeof setTimeout> | null = null;

	// --- Web Speech API path ---
	function startSpeechRecognition() {
		if (!SRCtor) return;
		recognition = new SRCtor();
		recognition.lang = 'es-MX';
		recognition.continuous = true;
		recognition.interimResults = true;

		recognition.onresult = (ev: SpeechRecognitionEvent) => {
			let final = '';
			let interim = '';
			for (let i = ev.resultIndex; i < ev.results.length; i++) {
				const result = ev.results[i];
				if (result.isFinal) {
					final += result[0].transcript;
				} else {
					interim += result[0].transcript;
				}
			}
			if (final) transcript.value = (transcript.value + ' ' + final).trim();
			interimTranscript.value = interim;
		};

		recognition.onerror = (ev) => {
			error.value = ev.error;
			isListening.value = false;
		};

		recognition.onend = () => {
			isListening.value = false;
		};

		transcript.value = '';
		interimTranscript.value = '';
		error.value = '';
		recognition.start();
		isListening.value = true;
	}

	function stopSpeechRecognition() {
		recognition?.stop();
		recognition = null;
		isListening.value = false;
	}

	// --- MediaRecorder fallback path (iOS Safari) ---
	async function startMediaRecorder() {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			audioChunks = [];
			audioBlob.value = null;
			error.value = '';

			mediaRecorder = new MediaRecorder(stream, {
				mimeType: recorderMime!,
			});

			mediaRecorder.ondataavailable = (ev) => {
				if (ev.data.size > 0) audioChunks.push(ev.data);
			};

			mediaRecorder.onstop = () => {
				const blob = new Blob(audioChunks, { type: recorderMime! });
				audioBlob.value = blob;
				audioChunks = [];
				// Stop all tracks to release the mic
				stream.getTracks().forEach((t) => t.stop());
				isListening.value = false;
				if (recordingTimer) {
					clearTimeout(recordingTimer);
					recordingTimer = null;
				}
			};

			mediaRecorder.onerror = () => {
				error.value = 'Error al grabar audio';
				isListening.value = false;
				stream.getTracks().forEach((t) => t.stop());
			};

			mediaRecorder.start();
			isListening.value = true;

			// Auto-stop after max duration
			recordingTimer = setTimeout(() => {
				stop();
			}, MAX_RECORDING_MS);
		} catch (e: any) {
			error.value = e.message || 'No se pudo acceder al micrófono';
		}
	}

	function stopMediaRecorder() {
		if (mediaRecorder && mediaRecorder.state !== 'inactive') {
			mediaRecorder.stop();
		}
		mediaRecorder = null;
	}

	// --- Public API ---
	function start() {
		if (isListening.value) return;
		audioBlob.value = null;
		transcript.value = '';
		if (isFallbackMode.value) {
			startMediaRecorder();
		} else {
			startSpeechRecognition();
		}
	}

	function stop() {
		if (isFallbackMode.value) {
			stopMediaRecorder();
		} else {
			stopSpeechRecognition();
		}
	}

	onUnmounted(() => {
		stop();
		if (recordingTimer) clearTimeout(recordingTimer);
	});

	return {
		isListening,
		transcript,
		interimTranscript,
		audioBlob,
		isFallbackMode,
		isSupported,
		error,
		start,
		stop,
	};
}
