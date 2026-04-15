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
import { getAiChatStatus, saveChatConversation, getChatConversations, getChatConversation, deleteChatConversation } from '@/services/api';
import { useSpeechRecognition } from '@/composables/useSpeechRecognition';
import { useSpeechSynthesis } from '@/composables/useSpeechSynthesis';

const isOpen = ref(false);
const isMaximized = ref(false);
const isConfigured = ref<boolean | null>(null);
const input = ref('');
const messagesContainer = ref<HTMLElement | null>(null);
const retreatStore = useRetreatStore();
const tableMesaStore = useTableMesaStore();
const conversationId = ref<string | null>(null);
const conversationList = ref<{ id: string; title: string | null; updatedAt: string }[]>([]);
const showHistory = ref(false);
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
		try {
			conversationList.value = await getChatConversations();
		} catch {
			conversationList.value = [];
		}
	}
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
	if (!input.value.trim() || chat.status === 'streaming') return;
	chat.sendMessage({ text: input.value });
	input.value = '';
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

// --- Persist: filter out audio data URLs to avoid bloating localStorage ---
function filterMessagesForStorage(msgs: any[]): any[] {
	return msgs.map((msg) => ({
		...msg,
		parts: msg.parts?.map((p: any) => {
			if (p.type === 'file') return { type: 'text', text: '(mensaje de voz)' };
			return p;
		}),
	}));
}
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

				<!-- Conversation History Panel -->
				<div v-if="showHistory" class="flex-1 overflow-y-auto p-3 space-y-2">
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
				<div v-else ref="messagesContainer" class="flex-1 overflow-y-auto p-3 space-y-3">
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
						</ul>
						<p class="text-gray-400 dark:text-gray-500 text-xs italic mt-2">
							Escribe o usa el micr&oacute;fono para comenzar...
						</p>
					</div>
					<template v-for="message in chat.messages" :key="message.id">
						<div
							v-if="message.role === 'user'"
							class="flex justify-end"
						>
							<div
								class="max-w-[80%] rounded-lg bg-blue-600 px-3 py-2 text-sm text-white"
							>
								{{ getTextContent(message.parts) }}
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
						<input
							v-model="input"
							type="text"
							:placeholder="isListening ? 'Escuchando...' : 'Escribe tu pregunta...'"
							class="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
							:disabled="chat.status === 'streaming' || isListening"
						/>
						<button
							type="submit"
							class="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
							:disabled="!input.trim() || chat.status === 'streaming'"
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
