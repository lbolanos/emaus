<script setup lang="ts">
import { Chat } from '@ai-sdk/vue';
import { DefaultChatTransport } from 'ai';
import { ref, nextTick, watch, onMounted } from 'vue';
import { marked } from 'marked';
import { getCsrfToken } from '@/utils/csrf';
import { getApiUrl } from '@/config/runtimeConfig';
import { useRetreatStore } from '@/stores/retreatStore';

const isOpen = ref(false);
const isMaximized = ref(false);
const isConfigured = ref<boolean | null>(null);
const input = ref('');
const messagesContainer = ref<HTMLElement | null>(null);
const retreatStore = useRetreatStore();

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

// Restore chat history from localStorage
try {
	const saved = localStorage.getItem(STORAGE_KEY);
	if (saved) {
		chat.messages = JSON.parse(saved);
	}
} catch {
	// ignore corrupt data
}

watch(
	() => chat.messages,
	(msgs) => {
		nextTick(() => {
			if (messagesContainer.value) {
				messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
			}
		});
		// Persist to localStorage (only text messages, skip while streaming)
		if (chat.status !== 'streaming') {
			try {
				localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs));
			} catch {
				// storage full, ignore
			}
		}
	},
	{ deep: true },
);

// Save when streaming finishes
watch(
	() => chat.status,
	(status) => {
		if (status === 'ready' && chat.messages.length > 0) {
			try {
				localStorage.setItem(STORAGE_KEY, JSON.stringify(chat.messages));
			} catch {
				// storage full, ignore
			}
		}
	},
);

const clearChat = () => {
	chat.messages = [];
	localStorage.removeItem(STORAGE_KEY);
};

onMounted(async () => {
	try {
		const res = await globalThis.fetch(`${getApiUrl()}/ai-chat/status`, {
			credentials: 'include',
		});
		const data = await res.json();
		isConfigured.value = data.configured;
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
	return marked.parse(text) as string;
};

const handleSubmit = (e: Event) => {
	e.preventDefault();
	if (!input.value.trim() || chat.status === 'streaming') return;
	chat.sendMessage({ text: input.value });
	input.value = '';
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
						<button
							v-if="chat.messages.length > 0"
							class="text-white/80 hover:text-white transition-colors"
							title="Limpiar chat"
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

				<!-- Messages -->
				<div ref="messagesContainer" class="flex-1 overflow-y-auto p-3 space-y-3">
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
							Escribe tu pregunta para comenzar...
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
							class="flex justify-start"
						>
							<div
								class="prose prose-sm dark:prose-invert max-w-[80%] rounded-lg bg-gray-100 px-3 py-2 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
								v-html="renderMarkdown(message.parts)"
							/>
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
					<div class="flex gap-2">
						<input
							v-model="input"
							type="text"
							placeholder="Escribe tu pregunta..."
							class="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
							:disabled="chat.status === 'streaming'"
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
