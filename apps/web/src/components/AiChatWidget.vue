<script setup lang="ts">
import { Chat } from '@ai-sdk/vue';
import { DefaultChatTransport } from 'ai';
import { ref, nextTick, watch, onMounted } from 'vue';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { getCsrfToken } from '@/utils/csrf';
import { getApiUrl } from '@/config/runtimeConfig';
import { useRetreatStore } from '@/stores/retreatStore';
import { useTableMesaStore } from '@/stores/tableMesaStore';
import { useCommunityStore } from '@/stores/communityStore';
import { getAiChatStatus, saveChatConversation, getChatConversations, getChatConversation, deleteChatConversation } from '@/services/api';
import { useSpeechRecognition } from '@/composables/useSpeechRecognition';
import { useSpeechSynthesis } from '@/composables/useSpeechSynthesis';

const isOpen = ref(false);
const isMaximized = ref(false);
const isConfigured = ref<boolean | null>(null);
const input = ref('');
const messagesContainer = ref<HTMLElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const cameraInput = ref<HTMLInputElement | null>(null);
const pendingImage = ref<{ dataUrl: string; mediaType: string } | null>(null);
const imageError = ref<string | null>(null);
const isDraggingImage = ref(false);
const MAX_RAW_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB defensive limit before resize
const retreatStore = useRetreatStore();
const tableMesaStore = useTableMesaStore();
const communityStore = useCommunityStore();
const conversationId = ref<string | null>(null);
const conversationList = ref<{ id: string; title: string | null; updatedAt: string }[]>([]);
const showHistory = ref(false);
const showHelp = ref(false);
let saveTimer: ReturnType<typeof setTimeout> | null = null;

const {
	isListening,
	transcript,
	interimTranscript,
	audioBlob,
	isFallbackMode,
	isSupported: sttSupported,
	start: startListening,
	stop: stopListening,
} = useSpeechRecognition();

const {
	isSpeaking,
	isSupported: ttsSupported,
	autoRead,
	useEdgeTts,
	setAutoRead,
	setUseEdgeTts,
	speak,
	stop: stopSpeaking,
} = useSpeechSynthesis();

const csrfFetch: typeof globalThis.fetch = async (url, options = {}) => {
	const token = await getCsrfToken();
	const headers = new Headers(options.headers);
	headers.set('X-CSRF-Token', token);
	return globalThis.fetch(url, { ...options, headers });
};

const STORAGE_KEY = 'jessy-chat-history';

const chat = new Chat({
	transport: new DefaultChatTransport({
		api: `${getApiUrl()}/ai-chat/stream`,
		credentials: 'include',
		fetch: csrfFetch,
		body: {
			get retreatId() {
				return retreatStore.selectedRetreatId;
			},
			get communityId() {
				return communityStore.currentCommunity?.id ?? undefined;
			},
		},
	}),
});

// Restore chat history from localStorage (fallback) or server
try {
	const saved = localStorage.getItem(STORAGE_KEY);
	if (saved) {
		chat.messages = JSON.parse(saved);
	}
} catch {
	// ignore corrupt data
}

// Debounced save to server
function scheduleSave() {
	if (saveTimer) clearTimeout(saveTimer);
	saveTimer = setTimeout(async () => {
		if (chat.messages.length === 0) return;
		try {
			const filtered = filterMessagesForStorage(chat.messages);
			const firstUserMsg = chat.messages.find((m: any) => m.role === 'user');
			const title = firstUserMsg ? getTextContent(firstUserMsg.parts).slice(0, 100) : 'Conversación';
			const result = await saveChatConversation({
				id: conversationId.value ?? undefined,
				messages: filtered,
				retreatId: retreatStore.selectedRetreatId ?? undefined,
				communityId: communityStore.currentCommunity?.id ?? undefined,
				title,
			});
			conversationId.value = result.id;
			localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
			localStorage.setItem(STORAGE_KEY + '-id', result.id);
		} catch {
			// fallback: still save to localStorage
			try {
				localStorage.setItem(STORAGE_KEY, JSON.stringify(filterMessagesForStorage(chat.messages)));
			} catch { /* ignore */ }
		}
	}, 2000);
}

// Restore conversation ID from localStorage
try {
	const savedId = localStorage.getItem(STORAGE_KEY + '-id');
	if (savedId) conversationId.value = savedId;
} catch { /* ignore */ }

watch(
	() => chat.messages,
	() => {
		nextTick(() => {
			if (messagesContainer.value) {
				messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
			}
		});
	},
	{ deep: true },
);

// Mutation tool names that should trigger store/view refresh
const TABLE_MUTATION_TOOLS = new Set([
	'assignWalkerToTableTool',
	'unassignWalkerFromTableTool',
	'moveWalkerToTable',
	'assignLeaderToTableTool',
	'unassignLeaderFromTableTool',
]);

const BED_MUTATION_TOOLS = new Set([
	'assignParticipantToBed',
	'moveParticipantToBed',
]);

function getToolName(part: any): string | null {
	if (part.type === 'dynamic-tool') return part.toolName;
	if (typeof part.type === 'string' && part.type.startsWith('tool-')) return part.type.slice(5);
	return null;
}

function checkForMutations(messages: any[]) {
	let refreshTables = false;
	let refreshBeds = false;

	// Check the last assistant message for completed tool calls
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (msg.role !== 'assistant') continue;
		for (const part of msg.parts || []) {
			if (part.state !== 'output-available') continue;
			const name = getToolName(part);
			if (!name) continue;
			if (TABLE_MUTATION_TOOLS.has(name)) refreshTables = true;
			if (BED_MUTATION_TOOLS.has(name)) refreshBeds = true;
		}
		break; // Only check the last assistant message
	}

	if (refreshTables) tableMesaStore.fetchTables();
	if (refreshBeds) window.dispatchEvent(new Event('jessy:beds-changed'));
}

// Save when streaming finishes + refresh stores if mutations detected
watch(
	() => chat.status,
	(status) => {
		if (status === 'ready' && chat.messages.length > 0) {
			scheduleSave();
			checkForMutations(chat.messages);
		}
	},
);

const clearChat = () => {
	chat.messages = [];
	conversationId.value = null;
	localStorage.removeItem(STORAGE_KEY);
	localStorage.removeItem(STORAGE_KEY + '-id');
};

const newChat = () => {
	clearChat();
	showHistory.value = false;
};

const loadConversation = async (id: string) => {
	try {
		const data = await getChatConversation(id);
		chat.messages = data.messages;
		conversationId.value = data.id;
		localStorage.setItem(STORAGE_KEY, JSON.stringify(data.messages));
		localStorage.setItem(STORAGE_KEY + '-id', data.id);
		showHistory.value = false;
	} catch {
		// ignore
	}
};

const deleteConversationItem = async (id: string) => {
	try {
		await deleteChatConversation(id);
		conversationList.value = conversationList.value.filter((c) => c.id !== id);
		if (conversationId.value === id) {
			clearChat();
		}
	} catch {
		// ignore
	}
};

const toggleHistory = async () => {
	showHistory.value = !showHistory.value;
	if (showHistory.value) {
		showHelp.value = false;
		try {
			conversationList.value = await getChatConversations();
		} catch {
			conversationList.value = [];
		}
	}
};

const toggleHelp = () => {
	showHelp.value = !showHelp.value;
	if (showHelp.value) showHistory.value = false;
};

onMounted(async () => {
	try {
		const data = await getAiChatStatus();
		isConfigured.value = data.configured;
		// If we have a conversation ID but no local messages, load from server
		if (data.configured && conversationId.value && chat.messages.length === 0) {
			try {
				const conv = await getChatConversation(conversationId.value);
				chat.messages = conv.messages;
			} catch {
				// conversation may have been deleted
				conversationId.value = null;
				localStorage.removeItem(STORAGE_KEY + '-id');
			}
		}
	} catch {
		isConfigured.value = false;
	}
});

marked.setOptions({ breaks: true, gfm: true });

const getTextContent = (parts: any[] | undefined): string => {
	if (!parts) return '';
	return parts
		.filter((p) => p.type === 'text')
		.map((p) => p.text)
		.join('');
};

const renderMarkdown = (parts: any[] | undefined): string => {
	const text = getTextContent(parts);
	if (!text) return '';
	return DOMPurify.sanitize(marked.parse(text) as string);
};

const handleSubmit = (e: Event) => {
	e.preventDefault();
	if (chat.status === 'streaming') return;
	const text = input.value.trim();
	const img = pendingImage.value;
	if (!text && !img) return;
	const payload: { text: string; files?: { type: 'file'; mediaType: string; url: string }[] } = {
		text: text || 'Foto de lista de asistencia',
	};
	if (img) {
		payload.files = [{ type: 'file', mediaType: img.mediaType, url: img.dataUrl }];
	}
	chat.sendMessage(payload);
	input.value = '';
	pendingImage.value = null;
	imageError.value = null;
	showHelp.value = false;
	if (fileInput.value) fileInput.value.value = '';
	if (cameraInput.value) cameraInput.value.value = '';
};

// --- Image attach (camera / file / paste / drag&drop) ---
// Resize on the client to keep payload manageable: max 1600px on the long side, JPEG 0.85.
// Uses HTMLCanvasElement (not OffscreenCanvas) for Safari iOS compatibility.
async function loadImage(file: File | Blob): Promise<HTMLImageElement> {
	const dataUrl = await blobToDataUrl(file);
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error('No se pudo leer la imagen'));
		img.src = dataUrl;
	});
}

async function resizeImage(file: File | Blob): Promise<{ dataUrl: string; mediaType: string }> {
	const MAX_SIDE = 1600;
	const img = await loadImage(file);
	const longest = Math.max(img.naturalWidth, img.naturalHeight);
	const scale = longest > MAX_SIDE ? MAX_SIDE / longest : 1;
	const w = Math.round(img.naturalWidth * scale);
	const h = Math.round(img.naturalHeight * scale);
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas no soportado');
	ctx.drawImage(img, 0, 0, w, h);
	const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
	return { dataUrl, mediaType: 'image/jpeg' };
}

async function attachImageFile(file: File | Blob) {
	imageError.value = null;
	if (!file.type.startsWith('image/')) {
		imageError.value = 'El archivo debe ser una imagen.';
		return;
	}
	if (file.size > MAX_RAW_IMAGE_BYTES) {
		imageError.value = 'La imagen es demasiado grande (máx. 15 MB).';
		return;
	}
	try {
		pendingImage.value = await resizeImage(file);
		showHelp.value = false;
	} catch (e: any) {
		imageError.value = e?.message || 'No se pudo procesar la imagen.';
	}
}

const onFileInputChange = async (e: Event) => {
	const target = e.target as HTMLInputElement;
	const file = target.files?.[0];
	if (file) await attachImageFile(file);
};

const onPaste = async (e: ClipboardEvent) => {
	const items = e.clipboardData?.items;
	if (!items) return;
	for (let i = 0; i < items.length; i++) {
		const it = items[i];
		if (it.kind === 'file' && it.type.startsWith('image/')) {
			const file = it.getAsFile();
			if (file) {
				e.preventDefault();
				await attachImageFile(file);
				break;
			}
		}
	}
};

const onDragOver = (e: DragEvent) => {
	if (!e.dataTransfer) return;
	const hasFile = Array.from(e.dataTransfer.items || []).some((it) => it.kind === 'file');
	if (!hasFile) return;
	e.preventDefault();
	isDraggingImage.value = true;
};

const onDragLeave = (e: DragEvent) => {
	if (e.target === e.currentTarget) isDraggingImage.value = false;
};

const onDrop = async (e: DragEvent) => {
	e.preventDefault();
	isDraggingImage.value = false;
	const file = e.dataTransfer?.files?.[0];
	if (file) await attachImageFile(file);
};

const removePendingImage = () => {
	pendingImage.value = null;
	imageError.value = null;
	if (fileInput.value) fileInput.value.value = '';
	if (cameraInput.value) cameraInput.value.value = '';
};

const triggerFilePicker = () => {
	fileInput.value?.click();
};

const triggerCamera = () => {
	cameraInput.value?.click();
};

// --- Voice input ---
const toggleMic = () => {
	if (isListening.value) {
		stopListening();
	} else {
		stopSpeaking();
		startListening();
	}
};

// Web Speech API path: transcript fills up → auto-submit when recognition ends
watch(isListening, (listening) => {
	if (!listening && !isFallbackMode.value && transcript.value.trim()) {
		chat.sendMessage({ text: transcript.value.trim() });
		transcript.value = '';
	}
});

// Show interim transcript in input field while listening (Web Speech API only)
watch([transcript, interimTranscript], ([t, interim]) => {
	if (isListening.value && !isFallbackMode.value) {
		input.value = ((t || '') + ' ' + (interim || '')).trim();
	}
});

// MediaRecorder fallback path: audio blob → send to Gemini as multimodal
function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onloadend = () => resolve(reader.result as string);
		reader.onerror = reject;
		reader.readAsDataURL(blob);
	});
}

watch(audioBlob, async (blob) => {
	if (!blob) return;
	const dataUrl = await blobToDataUrl(blob);
	chat.sendMessage({
		text: '(mensaje de voz)',
		files: [{ type: 'file' as const, mediaType: blob.type, url: dataUrl }],
	});
});

// --- Voice output (TTS) ---
// Auto-read assistant responses when enabled
watch(
	() => chat.status,
	(status) => {
		if (status === 'ready' && autoRead.value && chat.messages.length > 0) {
			const lastMsg = chat.messages[chat.messages.length - 1];
			if (lastMsg?.role === 'assistant') {
				const text = getTextContent(lastMsg.parts);
				if (text) speak(text);
			}
		}
	},
);

const speakMessage = (parts: any[] | undefined) => {
	const text = getTextContent(parts);
	if (text) {
		if (isSpeaking.value) {
			stopSpeaking();
		} else {
			speak(text);
		}
	}
};

// --- Persist: filter out file data URLs (audio + image) to avoid bloating localStorage ---
function filterMessagesForStorage(msgs: any[]): any[] {
	return msgs.map((msg) => ({
		...msg,
		parts: msg.parts?.map((p: any) => {
			if (p.type === 'file') {
				const isImage = typeof p.mediaType === 'string' && p.mediaType.startsWith('image/');
				return { type: 'text', text: isImage ? '(imagen)' : '(mensaje de voz)' };
			}
			return p;
		}),
	}));
}

const getImageParts = (parts: any[] | undefined): { url: string; mediaType: string }[] => {
	if (!parts) return [];
	return parts
		.filter((p) => p.type === 'file' && typeof p.mediaType === 'string' && p.mediaType.startsWith('image/'))
		.map((p) => ({ url: p.url, mediaType: p.mediaType }));
};
</script>

<template>
	<div v-if="isConfigured" class="fixed bottom-4 right-2 md:right-4 z-50">
		<!-- Chat Panel -->
		<Transition name="chat-panel">
			<div
				v-if="isOpen"
				:class="[
					'rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800 flex flex-col',
					isMaximized
						? 'fixed inset-2 md:inset-4 w-auto m-0 z-50'
						: 'mb-3 w-[calc(100vw-1rem)] md:w-96',
				]"
				:style="isMaximized ? undefined : 'height: min(480px, 70vh)'"
			>
				<!-- Header -->
				<div
					class="flex items-center justify-between rounded-t-lg bg-blue-600 px-4 py-3 text-white"
				>
					<span class="font-semibold text-sm">Jessy</span>
					<div class="flex items-center gap-1">
						<!-- New chat button -->
						<button
							class="text-white/80 hover:text-white transition-colors"
							title="Nueva conversación"
							@click="newChat"
						>
							<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
							</svg>
						</button>
						<!-- Help button -->
						<button
							class="text-white/80 hover:text-white transition-colors"
							:class="showHelp ? 'text-white' : ''"
							title="¿Qué puedo hacer?"
							@click="toggleHelp"
						>
							<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093M12 17h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
							</svg>
						</button>
						<!-- History button -->
						<button
							class="text-white/80 hover:text-white transition-colors"
							:class="showHistory ? 'text-white' : ''"
							title="Historial de conversaciones"
							@click="toggleHistory"
						>
							<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
							</svg>
						</button>
						<!-- Auto-read toggle -->
						<button
							v-if="ttsSupported"
							class="transition-colors"
							:class="autoRead ? 'text-white' : 'text-white/50 hover:text-white/80'"
							:title="autoRead ? 'Desactivar lectura automática' : 'Activar lectura automática'"
							@click="setAutoRead(!autoRead)"
						>
							<!-- Speaker icon -->
							<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path v-if="autoRead" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072M17.95 6.05a8 8 0 010 11.9M11 5L6 9H2v6h4l5 4V5z" />
								<path v-else stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6" />
							</svg>
						</button>
						<!-- Edge TTS HD toggle -->
						<button
							v-if="ttsSupported"
							class="text-[10px] font-bold px-1 rounded transition-colors"
							:class="useEdgeTts ? 'bg-white/30 text-white' : 'text-white/40 hover:text-white/70'"
							:title="useEdgeTts ? 'Usando voz HD (Edge TTS) — clic para usar voz del navegador' : 'Usando voz del navegador — clic para voz HD (Edge TTS)'"
							@click="setUseEdgeTts(!useEdgeTts)"
						>
							HD
						</button>
						<button
							v-if="chat.messages.length > 0"
							class="text-white/80 hover:text-white transition-colors"
							title="Borrar conversación"
							@click="clearChat"
						>
							<!-- Trash icon -->
							<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
							</svg>
						</button>
						<button
							class="text-white/80 hover:text-white transition-colors"
							@click="isMaximized = !isMaximized"
							:title="isMaximized ? 'Minimizar' : 'Maximizar'"
						>
							<!-- Maximize icon -->
							<svg v-if="!isMaximized" class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" />
							</svg>
							<!-- Minimize icon -->
							<svg v-else class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 4v4H5M15 4v4h4M9 20v-4H5M15 20v-4h4" />
							</svg>
						</button>
						<button
							class="text-white/80 hover:text-white transition-colors"
							@click="isOpen = false; isMaximized = false"
						>
							<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M6 18L18 6M6 6l12 12"
								/>
							</svg>
						</button>
					</div>
				</div>

				<!-- Help Panel -->
				<div v-if="showHelp" class="flex-1 overflow-y-auto p-3 space-y-3 text-sm">
					<p class="font-semibold text-gray-800 dark:text-gray-100">¿Qué puedo hacer por ti?</p>

					<section>
						<h4 class="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-400 mb-1">Consultas de retiro</h4>
						<ul class="list-disc pl-5 space-y-1 text-gray-700 dark:text-gray-300">
							<li>Buscar participantes por nombre, apellido o <strong>número de retiro</strong> (ej. "busca al 29").</li>
							<li>Listar caminantes, servidores o lista de espera de un retiro.</li>
							<li>Ver detalles completos de una persona (teléfono, dirección, contactos de emergencia, dieta, medicación).</li>
							<li>Resumen de pagos del retiro: total recaudado, quiénes han pagado.</li>
							<li>Estado de palancas: quién las recibió, quién falta, quién las pidió.</li>
							<li>Cumpleaños durante el retiro.</li>
							<li>Inventario y alertas de artículos con déficit.</li>
							<li>Responsabilidades asignadas.</li>
						</ul>
					</section>

					<section>
						<h4 class="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-400 mb-1">Inventario del retiro</h4>
						<ul class="list-disc pl-5 space-y-1 text-gray-700 dark:text-gray-300">
							<li>Ver inventario completo, alertas de déficit y unidades.</li>
							<li>
								<strong>📷 Foto del inventario</strong>: adjunta una foto de la mesa/caja —
								extraigo cada item y su cantidad, los mapeo contra el inventario del retiro y
								registro lo actual (modo <em>set</em>: la foto es snapshot).
							</li>
							<li>
								<strong>🎙 Audio de inventario</strong>: graba un mensaje de voz como
								"llegaron 5 jabones y 3 detergentes" — detecto si es <em>incremento</em> ("llegan",
								"agrega") o <em>snapshot</em> ("hay", "son").
							</li>
							<li>Items que no estaban en la lista se crean como ad-hoc para este retiro (sin tocar el catálogo global).</li>
						</ul>
					</section>

					<section>
						<h4 class="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-400 mb-1">Mesas y camas</h4>
						<ul class="list-disc pl-5 space-y-1 text-gray-700 dark:text-gray-300">
							<li>Ver asignaciones de mesas con líderes y caminantes.</li>
							<li>Asignar, quitar o <strong>mover</strong> un caminante de mesa.</li>
							<li>Asignar líder o co-líder a una mesa.</li>
							<li>Ver camas, conflictos de ronquidos y personas mayores en literas altas.</li>
							<li>Asignar o mover un participante a otra cama / habitación.</li>
						</ul>
					</section>

					<section>
						<h4 class="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-400 mb-1">Comunidades y reuniones</h4>
						<ul class="list-disc pl-5 space-y-1 text-gray-700 dark:text-gray-300">
							<li>Listar las comunidades que administras.</li>
							<li>Buscar un miembro por nombre, email o teléfono.</li>
							<li><strong>Agregar miembros en lote</strong> desde una lista en texto libre.</li>
							<li>Listar reuniones (pasadas y próximas) para elegir a cuál marcar asistencia.</li>
							<li>Registrar asistencia de varios miembros a una reunión.</li>
							<li>
								<strong>📷 Foto de lista de asistencia</strong>: adjunta una foto de la hoja escrita a mano —
								extraigo los nombres, identifico quién ya es miembro, propongo crear los nuevos como
								<em>pendientes de verificación</em>, te muestro un resumen y aplico tras tu confirmación.
							</li>
						</ul>
					</section>

					<section>
						<h4 class="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-400 mb-1">Cómo interactuar</h4>
						<ul class="list-disc pl-5 space-y-1 text-gray-700 dark:text-gray-300">
							<li>Escribe en lenguaje natural. Puedo entender "la reunión de ayer", "los tres últimos pagos", etc.</li>
							<li>Usa el <strong>micrófono</strong> para dictar (incluso números separados como "29, 26 y 30").</li>
							<li>Adjunta una <strong>imagen</strong>: en celular usa el botón de cámara para tomar la foto directo, o el de galería; en escritorio usa el botón de galería, pega (Ctrl/Cmd+V) o arrástrala al chat.</li>
							<li>Antes de cualquier cambio importante (agregar miembros, mover camas), te muestro qué voy a hacer y espero tu "sí".</li>
							<li>Si activas el ícono de altavoz, te leo mis respuestas en voz alta.</li>
						</ul>
					</section>

					<p class="text-xs italic text-gray-500 dark:text-gray-400">
						Tip: si estás navegando dentro de un retiro o una comunidad, ya tengo ese contexto y no necesitas mencionarlo.
					</p>
				</div>

				<!-- Conversation History Panel -->
				<div v-else-if="showHistory" class="flex-1 overflow-y-auto p-3 space-y-2">
					<p class="text-xs text-gray-500 dark:text-gray-400 font-medium mb-2">Conversaciones anteriores</p>
					<div v-if="conversationList.length === 0" class="text-xs text-gray-400 dark:text-gray-500">
						No hay conversaciones guardadas.
					</div>
					<div
						v-for="conv in conversationList"
						:key="conv.id"
						class="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer group"
						:class="conversationId === conv.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''"
						@click="loadConversation(conv.id)"
					>
						<div class="flex-1 min-w-0">
							<p class="text-sm text-gray-700 dark:text-gray-300 truncate">
								{{ conv.title || 'Sin título' }}
							</p>
							<p class="text-xs text-gray-400 dark:text-gray-500">
								{{ new Date(conv.updatedAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }}
							</p>
						</div>
						<button
							class="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
							title="Eliminar"
							@click.stop="deleteConversationItem(conv.id)"
						>
							<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
							</svg>
						</button>
					</div>
				</div>

				<!-- Messages -->
				<div
					v-else
					ref="messagesContainer"
					class="flex-1 overflow-y-auto p-3 space-y-3 relative"
					:class="isDraggingImage ? 'ring-2 ring-blue-400 ring-inset' : ''"
					@dragover="onDragOver"
					@dragleave="onDragLeave"
					@drop="onDrop"
				>
					<div
						v-if="isDraggingImage"
						class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-blue-50/90 dark:bg-blue-900/40"
					>
						<p class="text-sm font-medium text-blue-700 dark:text-blue-300">
							Suelta la imagen para adjuntar
						</p>
					</div>
					<div v-if="chat.messages.length === 0" class="p-2 space-y-2">
						<p class="text-gray-600 dark:text-gray-300 text-sm font-medium">
							Hola, soy Jessy, tu asistente virtual.
						</p>
						<p class="text-gray-500 dark:text-gray-400 text-xs">
							Puedo ayudarte con:
						</p>
						<ul class="text-gray-500 dark:text-gray-400 text-xs space-y-1 list-disc pl-4">
							<li>Participantes (caminantes, servidores, en espera)</li>
							<li>Detalles de retiros</li>
							<li>Pagos y resumen financiero</li>
							<li>Asignaciones de mesas</li>
							<li>Inventario y alertas</li>
							<li>Responsabilidades</li>
							<li>Estado de palancas</li>
							<li>Camas y disponibilidad</li>
							<li>Agregar miembros a una comunidad desde una lista</li>
							<li>Registrar asistencia a reuniones de la comunidad</li>
							<li>Procesar fotos de listas de asistencia (envía la foto y elige la reunión)</li>
							<li>Registrar inventario por foto o voz (extrae items y cantidades)</li>
						</ul>
						<p class="text-gray-400 dark:text-gray-500 text-xs italic mt-2">
							Escribe, usa el micr&oacute;fono o adjunta una foto para comenzar...
						</p>
					</div>
					<template v-for="message in chat.messages" :key="message.id">
						<div
							v-if="message.role === 'user'"
							class="flex justify-end"
						>
							<div
								class="max-w-[80%] rounded-lg bg-blue-600 px-3 py-2 text-sm text-white space-y-2"
							>
								<img
									v-for="(img, idx) in getImageParts(message.parts)"
									:key="idx"
									:src="img.url"
									alt="Adjunto"
									class="block max-h-48 rounded border border-white/30 object-contain"
								/>
								<span v-if="getTextContent(message.parts)">
									{{ getTextContent(message.parts) }}
								</span>
							</div>
						</div>
						<div
							v-else-if="message.role === 'assistant'"
							class="flex justify-start group"
						>
							<div class="max-w-[80%]">
								<div
									class="prose prose-sm dark:prose-invert rounded-lg bg-gray-100 px-3 py-2 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
									v-html="renderMarkdown(message.parts)"
								/>
								<!-- Speak this message button -->
								<button
									v-if="ttsSupported && getTextContent(message.parts)"
									class="mt-1 text-gray-400 hover:text-blue-500 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
									:title="isSpeaking ? 'Detener' : 'Escuchar'"
									@click="speakMessage(message.parts)"
								>
									<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path v-if="!isSpeaking" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072M11 5L6 9H2v6h4l5 4V5z" />
										<path v-else stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
									</svg>
								</button>
							</div>
						</div>
					</template>
					<div v-if="chat.status === 'streaming'" class="flex justify-start">
						<div class="rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-500 dark:bg-gray-700">
							<span class="animate-pulse">...</span>
						</div>
					</div>
				</div>

				<!-- Input -->
				<form class="border-t border-gray-200 p-3 dark:border-gray-700" @submit="handleSubmit">
					<!-- Listening indicator -->
					<div v-if="isListening" class="mb-2 flex items-center gap-2 text-xs">
						<span class="relative flex h-2.5 w-2.5">
							<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
							<span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
						</span>
						<span class="text-red-500">
							{{ isFallbackMode ? 'Grabando audio...' : (interimTranscript || 'Escuchando...') }}
						</span>
					</div>
					<!-- Pending image preview -->
					<div v-if="pendingImage" class="mb-2 flex items-center gap-2">
						<div class="relative inline-block">
							<img :src="pendingImage.dataUrl" alt="Imagen adjunta" class="h-16 w-16 rounded border border-gray-300 object-cover dark:border-gray-600" />
							<button
								type="button"
								class="absolute -top-2 -right-2 rounded-full bg-gray-800 p-0.5 text-white shadow hover:bg-gray-900"
								title="Quitar imagen"
								@click="removePendingImage"
							>
								<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
								</svg>
							</button>
						</div>
						<span class="text-xs text-gray-500 dark:text-gray-400">
							Imagen lista. Escribe contexto o envía sin texto.
						</span>
					</div>
					<p v-if="imageError" class="mb-2 text-xs text-red-500">{{ imageError }}</p>
					<input
						ref="fileInput"
						type="file"
						accept="image/*"
						class="hidden"
						@change="onFileInputChange"
					/>
					<input
						ref="cameraInput"
						type="file"
						accept="image/*"
						capture="environment"
						class="hidden"
						@change="onFileInputChange"
					/>
					<div class="flex gap-2">
						<!-- Mic button -->
						<button
							v-if="sttSupported"
							type="button"
							class="rounded-lg px-3 py-2 text-sm transition-colors"
							:class="isListening
								? 'bg-red-500 text-white hover:bg-red-600'
								: 'bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-300 dark:hover:bg-gray-500'"
							:disabled="chat.status === 'streaming'"
							:title="isListening ? 'Detener grabación' : 'Enviar mensaje de voz'"
							@click="toggleMic"
						>
							<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path v-if="!isListening" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4M12 15a3 3 0 003-3V5a3 3 0 00-6 0v7a3 3 0 003 3z" />
								<path v-else stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
							</svg>
						</button>
						<!-- Camera button (mobile-only: opens the camera directly) -->
						<button
							type="button"
							class="md:hidden rounded-lg px-3 py-2 text-sm bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-300 dark:hover:bg-gray-500 transition-colors"
							:disabled="chat.status === 'streaming'"
							title="Tomar foto con la cámara"
							@click="triggerCamera"
						>
							<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7a2 2 0 012-2h3l2-2h4l2 2h3a2 2 0 012 2v11a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
								<circle cx="12" cy="13" r="3.5" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" />
							</svg>
						</button>
						<!-- File / gallery button -->
						<button
							type="button"
							class="rounded-lg px-3 py-2 text-sm bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-300 dark:hover:bg-gray-500 transition-colors"
							:disabled="chat.status === 'streaming'"
							title="Adjuntar imagen (galería o archivo)"
							@click="triggerFilePicker"
						>
							<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a2 2 0 012-2h12a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V5z" />
								<circle cx="9" cy="9" r="1.5" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" />
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 17l5-5 4 4 3-3 4 4" />
							</svg>
						</button>
						<input
							v-model="input"
							type="text"
							:placeholder="isListening ? 'Escuchando...' : (pendingImage ? 'Describe la foto (opcional)...' : 'Escribe tu pregunta...')"
							class="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
							:disabled="chat.status === 'streaming' || isListening"
							@paste="onPaste"
						/>
						<button
							type="submit"
							class="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
							:disabled="(!input.trim() && !pendingImage) || chat.status === 'streaming'"
						>
							<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
								/>
							</svg>
						</button>
					</div>
				</form>
			</div>
		</Transition>

		<!-- Floating Button -->
		<button
			class="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 transition-colors"
			@click="isOpen = !isOpen"
		>
			<svg
				v-if="!isOpen"
				class="h-6 w-6"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
				/>
			</svg>
			<svg v-else class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M19 9l-7 7-7-7"
				/>
			</svg>
		</button>
	</div>
</template>

<style scoped>
.chat-panel-enter-active,
.chat-panel-leave-active {
	transition: all 0.2s ease;
}
.chat-panel-enter-from,
.chat-panel-leave-to {
	opacity: 0;
	transform: translateY(10px) scale(0.95);
}
</style>
