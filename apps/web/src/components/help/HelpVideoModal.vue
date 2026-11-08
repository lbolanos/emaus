<script setup lang="ts">
import { computed, ref, watch, nextTick, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import { ExternalLink, X } from 'lucide-vue-next';

const props = defineProps<{
	/** YouTube video id to play; null keeps the modal closed. */
	videoId: string | null;
}>();

const emit = defineEmits<{
	(e: 'close'): void;
}>();

const { t: $t } = useI18n();

const contentEl = ref<HTMLElement | null>(null);
let previousActiveElement: HTMLElement | null = null;
let previousBodyOverflow: string | null = null;

const isOpen = computed(() => props.videoId !== null);

// Same embed params as the landing player (LandingVideos.vue).
const embedUrl = computed(() =>
	props.videoId
		? `https://www.youtube-nocookie.com/embed/${props.videoId}?autoplay=1&rel=0&modestbranding=1`
		: '',
);

const watchUrl = computed(() =>
	props.videoId ? `https://www.youtube.com/watch?v=${props.videoId}` : '',
);

function openInNewWindow() {
	if (!props.videoId) return;
	window.open(watchUrl.value, '_blank', 'noopener,noreferrer');
}

function close() {
	emit('close');
}

const onKeyDown = (e: KeyboardEvent) => {
	if (e.key === 'Escape' && isOpen.value) close();
};

// Tab wrapping out of the cross-origin iframe lands focus outside the modal
// without any keydown we can see; pull it back whenever it escapes.
const onDocumentFocusIn = (e: FocusEvent) => {
	if (!isOpen.value || !contentEl.value) return;
	if (contentEl.value.contains(e.target as Node)) return;
	contentEl.value.focus();
};

const FOCUSABLE_SELECTOR =
	'button:not([disabled]), [href], iframe, [tabindex]:not([tabindex="-1"])';

const onTrapKey = (e: KeyboardEvent) => {
	if (e.key !== 'Tab' || !contentEl.value) return;
	const focusables = Array.from(
		contentEl.value.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
	).filter((el) => el.offsetParent !== null);
	if (focusables.length === 0) return;
	const first = focusables[0];
	const last = focusables[focusables.length - 1];
	const active = document.activeElement as HTMLElement;
	if (e.shiftKey && active === first) {
		e.preventDefault();
		last.focus();
	} else if (!e.shiftKey && active === last) {
		e.preventDefault();
		first.focus();
	}
};

watch(
	isOpen,
	async (open) => {
		if (open) {
			previousActiveElement = (document.activeElement as HTMLElement) ?? null;
			previousBodyOverflow = document.body.style.overflow || null;
			document.addEventListener('keydown', onKeyDown);
			document.addEventListener('focusin', onDocumentFocusIn);
			document.body.style.overflow = 'hidden';
			await nextTick();
			contentEl.value?.focus();
		} else {
			document.removeEventListener('keydown', onKeyDown);
			document.removeEventListener('focusin', onDocumentFocusIn);
			document.body.style.overflow = previousBodyOverflow ?? '';
			previousBodyOverflow = null;
			if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
				previousActiveElement.focus();
			}
			previousActiveElement = null;
		}
	},
	{ immediate: true },
);

onBeforeUnmount(() => {
	document.removeEventListener('keydown', onKeyDown);
	document.removeEventListener('focusin', onDocumentFocusIn);
	// Restore the outer overlay's scroll lock instead of assuming it was empty.
	if (previousBodyOverflow !== null) {
		document.body.style.overflow = previousBodyOverflow;
		previousBodyOverflow = null;
	}
	// Same focus restore as the close path, for unmount-while-open.
	if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
		previousActiveElement.focus();
	}
	previousActiveElement = null;
});
</script>

<template>
	<Teleport to="body">
		<Transition name="help-video-player">
			<div
				v-if="isOpen && videoId"
				class="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
				role="dialog"
				aria-modal="true"
				:aria-label="$t('help.video.title')"
				@click.self="close"
			>
				<div
					ref="contentEl"
					class="w-full max-w-3xl focus:outline-none"
					tabindex="-1"
					@keydown="onTrapKey"
				>
					<div class="flex items-center justify-between gap-4 mb-3">
						<h3 class="text-white font-light text-lg leading-snug">{{ $t('help.video.title') }}</h3>
						<div class="flex items-center gap-1 shrink-0">
							<button
								type="button"
								class="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-white/80 hover:text-white hover:bg-white/10 transition-colors"
								@click="openInNewWindow"
							>
								<ExternalLink :size="15" />
								{{ $t('help.video.openInNewWindow') }}
							</button>
							<button
								type="button"
								class="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
								:aria-label="$t('common.close')"
								@click="close"
							>
								<X :size="20" />
							</button>
						</div>
					</div>
					<div class="relative aspect-video w-full rounded-xl overflow-hidden bg-black shadow-2xl">
						<iframe
							:src="embedUrl"
							:title="$t('help.video.title')"
							class="absolute inset-0 w-full h-full"
							frameborder="0"
							allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
							allowfullscreen
						></iframe>
					</div>
				</div>
			</div>
		</Transition>
	</Teleport>
</template>

<style scoped>
.help-video-player-enter-active,
.help-video-player-leave-active {
	transition: opacity 0.2s ease;
}

.help-video-player-enter-from,
.help-video-player-leave-to {
	opacity: 0;
}
</style>
