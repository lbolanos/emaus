import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import { marked } from 'marked';

export interface HelpSection {
	key: string;
	title: string;
	titleEs: string;
	icon: string;
	routeContext?: string[];
	topics: HelpTopic[];
}

export interface HelpTopic {
	key: string;
	title: string;
	titleEs: string;
	content: string;
}

export const useHelpStore = defineStore('help', () => {
	// State
	const isPanelOpen = ref(false);
	const currentTopic = ref<string | null>(null);
	const searchQuery = ref('');
	const locale = ref('es');

	// Cache for loaded markdown content
	const contentCache = new Map<string, string>();

	// Computed
	const currentTopicContent = computed(() => {
		if (!currentTopic.value) return null;
		return contentCache.get(currentTopic.value);
	});

	// Actions
	async function loadTopicContent(topicKey: string): Promise<string | null> {
		// Check cache first
		if (contentCache.has(topicKey)) {
			return contentCache.get(topicKey)!;
		}

		try {
			// Dynamic import of markdown file
			const content = await import(`@/docs/${locale.value}/${topicKey}.md?raw`);
			const htmlContent = await marked.parse(content.default);
			contentCache.set(topicKey, htmlContent);
			return htmlContent;
		} catch (error) {
			console.error(`Failed to load help topic: ${topicKey}`, error);
			return null;
		}
	}

	function openPanel(topic?: string) {
		if (topic) {
			currentTopic.value = topic;
		}
		isPanelOpen.value = true;
	}

	function closePanel() {
		isPanelOpen.value = false;
	}

	function togglePanel() {
		if (isPanelOpen.value) {
			closePanel();
		} else {
			openPanel();
		}
	}

	function setTopic(topic: string) {
		currentTopic.value = topic;
	}

	async function initialize() {
		// Load default content if needed
	}

	return {
		isPanelOpen,
		currentTopic,
		searchQuery,
		locale,
		currentTopicContent,
		loadTopicContent,
		openPanel,
		closePanel,
		togglePanel,
		setTopic,
		initialize,
	};
});
