<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { helpIndex, getHelpSectionByKey } from '@/config/helpIndex';
import type { HelpSection } from '@/stores/helpStore';

const route = useRoute();
const { locale } = useI18n();

const selectedSection = ref<string | null>(null);
const searchQuery = ref('');
const contentHtml = ref<string>('');
const loading = ref(false);
const isSidebarOpen = ref(false);

// Filter sections based on search
const filteredSections = computed(() => {
	if (!searchQuery.value) return helpIndex;

	const query = searchQuery.value.toLowerCase();
	return helpIndex.filter((section) => {
		const title = locale.value === 'es' ? section.titleEs : section.title;
		return title.toLowerCase().includes(query);
	});
});

// Get current section based on route or selection
const currentSection = computed(() => {
	if (selectedSection.value) {
		return getHelpSectionByKey(selectedSection.value);
	}
	if (route.params.section) {
		return getHelpSectionByKey(route.params.section as string);
	}
	return helpIndex[0]; // Default to first section
});

// Get section title based on locale
function getSectionTitle(section: HelpSection): string {
	return locale.value === 'es' ? section.titleEs : section.title;
}

// Load markdown content
async function loadContent(sectionKey: string) {
	loading.value = true;
	try {
		const content = await import(`@/docs/${locale.value}/${sectionKey}.md?raw`);
		contentHtml.value = DOMPurify.sanitize(await marked.parse(content.default));
	} catch (error) {
		console.error(`Failed to load help content: ${sectionKey}`, error);
		contentHtml.value = `<p class="text-destructive">Error loading content</p>`;
	} finally {
		loading.value = false;
	}
}

// Watch for section changes
function selectSection(sectionKey: string) {
	selectedSection.value = sectionKey;
	loadContent(sectionKey);
	isSidebarOpen.value = false;
}

// Initialize on mount
onMounted(() => {
	const initialSection = (route.params.section as string) || helpIndex[0].key;
	selectSection(initialSection);
});

// Reload content when locale changes
watch(locale, () => {
	if (currentSection.value) {
		loadContent(currentSection.value.key);
	}
});
</script>

<template>
	<div class="flex flex-col h-full bg-background">
		<!-- Header -->
		<div class="border-b bg-card">
			<div class="container mx-auto px-4 py-6 flex items-center gap-3">
				<button
					@click="isSidebarOpen = !isSidebarOpen"
					class="lg:hidden p-2 rounded-md hover:bg-accent"
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
				</button>
				<h1 class="text-3xl font-bold">{{ $t('help.title') }}</h1>
			</div>
		</div>

		<!-- Main Content -->
		<div class="flex-1 container mx-auto px-4 py-6 overflow-hidden">
			<div class="flex flex-col lg:flex-row gap-6 h-full">
				<!-- Sidebar Navigation -->
				<aside
					:class="[
						'flex-shrink-0 overflow-y-auto lg:border-r lg:pr-4 lg:w-64',
						isSidebarOpen ? 'block' : 'hidden lg:block'
					]"
				>
					<!-- Search -->
					<div class="mb-4">
						<input
							v-model="searchQuery"
							type="text"
							:placeholder="$t('help.search')"
							class="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
						/>
					</div>

					<!-- Section List -->
					<nav class="space-y-1">
						<button
							v-for="section in filteredSections"
							:key="section.key"
							@click="selectSection(section.key)"
							:class="[
								'w-full text-left px-3 py-2 rounded-md transition-colors flex items-center gap-2',
								selectedSection === section.key ||
								(!selectedSection && route.params.section === section.key)
									? 'bg-primary text-primary-foreground'
									: 'hover:bg-accent'
							]"
						>
							<span :class="section.icon" class="text-lg" />
							<span>{{ getSectionTitle(section) }}</span>
						</button>
					</nav>
				</aside>

				<!-- Content Area -->
				<main class="flex-1 overflow-y-auto">
					<div v-if="loading" class="flex items-center justify-center h-full">
						<div class="animate-pulse text-muted-foreground">Loading...</div>
					</div>

					<div
						v-else
						class="prose prose-sm max-w-none dark:prose-invert"
						v-html="contentHtml"
					/>
				</main>
			</div>
		</div>
	</div>
</template>

<style scoped>
.prose :deep(h1) {
	@apply text-3xl font-bold mt-8 mb-4;
}

.prose :deep(h2) {
	@apply text-2xl font-semibold mt-6 mb-3;
}

.prose :deep(h3) {
	@apply text-xl font-medium mt-4 mb-2;
}

.prose :deep(p) {
	@apply mb-4 leading-relaxed;
}

.prose :deep(ul), .prose :deep(ol) {
	@apply mb-4 ml-6;
}

.prose :deep(li) {
	@apply mb-2;
}

.prose :deep(code) {
	@apply bg-muted px-1.5 py-0.5 rounded text-sm;
}

.prose :deep(pre) {
	@apply bg-muted p-4 rounded-md mb-4 overflow-x-auto;
}

.prose :deep(blockquote) {
	@apply border-l-4 border-primary pl-4 italic my-4;
}

.prose :deep(a) {
	@apply text-primary hover:underline;
}
</style>
