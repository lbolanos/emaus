<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { marked } from 'marked';
import { X, BookOpen } from 'lucide-vue-next';
import { Button } from '@repo/ui';
import { useHelpStore } from '@/stores/helpStore';
import { getHelpByRoute } from '@/config/helpIndex';

const props = defineProps<{
	open: boolean;
}>();

const emit = defineEmits<{
	(e: 'close'): void;
}>();

const router = useRouter();
const { locale } = useI18n();
const helpStore = useHelpStore();

const searchQuery = ref('');
const contentHtml = ref<string>('');
const loading = ref(false);

// Get contextual help based on current route
const contextualSection = computed(() => {
	const routeName = router.currentRoute.value.name as string;
	return getHelpByRoute(routeName);
});

// Get section title based on locale
function getSectionTitle(section: typeof contextualSection.value): string {
	if (!section) return locale.value === 'es' ? 'Ayuda' : 'Help';
	return locale.value === 'es' ? section.titleEs : section.title;
}

// Load markdown content
async function loadContent(sectionKey: string) {
	loading.value = true;
	try {
		const content = await import(`@/docs/${locale.value}/${sectionKey}.md?raw`);
		contentHtml.value = await marked.parse(content.default);
	} catch (error) {
		console.error(`Failed to load help content: ${sectionKey}`, error);
		contentHtml.value = `<p class="text-destructive">${locale.value === 'es' ? 'Error al cargar el contenido' : 'Error loading content'}</p>`;
	} finally {
		loading.value = false;
	}
}

// Load contextual help when panel opens
watch(() => props.open, (isOpen) => {
	if (isOpen && contextualSection.value) {
		loadContent(contextualSection.value.key);
	}
});

// Reload content when locale changes
watch(locale, () => {
	if (contextualSection.value) {
		loadContent(contextualSection.value.key);
	}
});

// Navigate to full documentation
function goToFullDocs() {
	if (contextualSection.value) {
		router.push({ name: 'help-section', params: { section: contextualSection.value.key } });
	} else {
		router.push({ name: 'help' });
	}
	emit('close');
}

// Close panel
function closePanel() {
	emit('close');
}
</script>

<template>
	<Teleport to="body">
		<Transition
			enter-active-class="transition-transform duration-300 ease-in-out"
			enter-from-class="translate-x-full"
			enter-to-class="translate-x-0"
			leave-active-class="transition-transform duration-300 ease-in-out"
			leave-from-class="translate-x-0"
			leave-to-class="translate-x-full"
		>
			<div
				v-if="open"
				class="fixed inset-y-0 right-0 w-full md:w-[480px] bg-background border-l shadow-2xl z-50 flex flex-col"
			>
				<!-- Header -->
				<div class="flex items-center justify-between px-4 py-4 border-b">
					<div class="flex items-center gap-2">
						<span class="text-xl">📚</span>
						<h2 class="text-lg font-semibold">{{ $t('help.panel.title') }}</h2>
					</div>
					<div class="flex items-center gap-2">
						<Button
							variant="ghost"
							size="icon"
							@click="closePanel"
							class="rounded-full"
						>
							<X class="h-5 w-5" />
						</Button>
					</div>
				</div>

				<!-- Content Area -->
				<div class="flex-1 overflow-y-auto p-6">
					<!-- Section Title -->
					<div v-if="contextualSection" class="mb-4">
						<h3 class="text-xl font-bold mb-2">
							<span :class="contextualSection.icon" class="mr-2" />
							{{ getSectionTitle(contextualSection) }}
						</h3>
						<p class="text-sm text-muted-foreground">
							{{ $t('help.panel.contextualHelp') }}
						</p>
					</div>

					<!-- Loading State -->
					<div v-if="loading" class="flex items-center justify-center py-12">
						<div class="animate-pulse text-muted-foreground">Loading...</div>
					</div>

					<!-- Markdown Content -->
					<div
						v-else
						class="prose prose-sm max-w-none dark:prose-invert"
						v-html="contentHtml"
					/>
				</div>

				<!-- Footer -->
				<div class="px-4 py-4 border-t bg-muted/20">
					<Button
						variant="outline"
						class="w-full"
						@click="goToFullDocs"
					>
						<BookOpen class="w-4 h-4 mr-2" />
						{{ $t('help.panel.viewFullDocs') }}
					</Button>
				</div>
			</div>
		</Transition>

		<!-- Backdrop -->
		<Transition
			enter-active-class="transition-opacity duration-300 ease-in-out"
			enter-from-class="opacity-0"
			enter-to-class="opacity-100"
			leave-active-class="transition-opacity duration-300 ease-in-out"
			leave-from-class="opacity-100"
			leave-to-class="opacity-0"
		>
			<div
				v-if="open"
				class="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
				@click="closePanel"
			/>
		</Transition>
	</Teleport>
</template>

<style scoped>
.prose :deep(h1) {
	@apply text-2xl font-bold mt-6 mb-3;
}

.prose :deep(h2) {
	@apply text-xl font-semibold mt-5 mb-2;
}

.prose :deep(h3) {
	@apply text-lg font-medium mt-4 mb-2;
}

.prose :deep(p) {
	@apply mb-3 leading-relaxed;
}

.prose :deep(ul), .prose :deep(ol) {
	@apply mb-3 ml-5;
}

.prose :deep(li) {
	@apply mb-1;
}

.prose :deep(code) {
	@apply bg-muted px-1 py-0.5 rounded text-sm;
}

.prose :deep(pre) {
	@apply bg-muted p-3 rounded-md mb-3 overflow-x-auto;
}

.prose :deep(blockquote) {
	@apply border-l-4 border-primary pl-4 italic my-3;
}

.prose :deep(a) {
	@apply text-primary hover:underline;
}

@media (max-width: 768px) {
	.prose :deep(h1) {
		@apply text-xl font-bold mt-4 mb-2;
	}

	.prose :deep(h2) {
		@apply text-lg font-semibold mt-3 mb-2;
	}
}
</style>
