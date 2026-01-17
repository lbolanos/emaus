<template>
	<div class="avatar-upload flex flex-col items-center gap-4">
		<!-- Avatar Preview -->
		<div class="relative">
			<div
				:class="avatarContainerClasses"
				role="img"
				:aria-label="`${displayName} avatar`"
			>
				<img
					v-if="previewUrl"
					:src="previewUrl"
					:alt="`${displayName} avatar`"
					class="w-full h-full object-cover"
				/>
				<span
					v-else
					class="flex items-center justify-center w-full h-full text-primary font-semibold"
				>
					{{ initials }}
				</span>
			</div>

			<!-- Edit Button -->
			<button
				v-if="editable"
				type="button"
				:class="editButtonClasses"
				@click="triggerFileInput"
				:aria-label="$t('social.avatar.upload')"
			>
				<Camera v-if="!previewUrl" class="w-4 h-4" />
				<Pencil v-else class="w-4 h-4" />
			</button>

			<!-- Remove Button -->
			<button
				v-if="editable && previewUrl"
				type="button"
				class="absolute -top-2 -right-2 w-6 h-6 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center shadow-sm hover:bg-destructive/90 transition-colors"
				@click="handleRemove"
				:aria-label="$t('social.avatar.remove')"
			>
				<X class="w-3 h-3" />
			</button>
		</div>

		<!-- Hidden File Input -->
		<input
			ref="fileInputRef"
			type="file"
			accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
			class="hidden"
			@change="handleFileSelect"
			:aria-label="$t('social.avatar.upload')"
		/>

		<!-- Upload Info -->
		<p v-if="editable" class="text-xs text-muted-foreground text-center">
			{{ $t('social.avatar.uploadInfo', { maxSize: Math.round(props.maxSize / 1024) }) }}
		</p>
	</div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Camera, Pencil, X } from 'lucide-vue-next';
import { useToast } from '@repo/ui';

interface Props {
	currentAvatar?: string;
	displayName: string;
	size?: 'sm' | 'md' | 'lg' | 'xl';
	editable?: boolean;
	maxSize?: number; // in KB
}

const props = withDefaults(defineProps<Props>(), {
	size: 'md',
	editable: true,
	maxSize: 2048, // 2MB default
});

const emit = defineEmits<{
	(e: 'upload', avatarUrl: string): void;
	(e: 'remove'): void;
}>();

const { t } = useI18n();
const { toast } = useToast();

const fileInputRef = ref<HTMLInputElement | null>(null);
const previewUrl = ref<string>(props.currentAvatar || '');

// Sync with currentAvatar prop
watch(
	() => props.currentAvatar,
	(newValue) => {
		previewUrl.value = newValue || '';
	}
);

const sizeClasses = {
	sm: 'w-16 h-16',
	md: 'w-24 h-24',
	lg: 'w-32 h-32',
	xl: 'w-48 h-48',
};

const avatarContainerClasses = computed(() => {
	return `${sizeClasses[props.size]} rounded-full bg-primary/10 overflow-hidden border-4 border-background shadow-md`;
});

const editButtonClasses = computed(() => {
	const positions = {
		sm: 'bottom-0 right-0',
		md: 'bottom-1 right-1',
		lg: 'bottom-2 right-2',
		xl: 'bottom-3 right-3',
	};
	return `absolute ${positions[props.size]} w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-md hover:bg-primary/90 transition-colors cursor-pointer`;
});

const initials = computed(() => {
	const names = props.displayName.trim().split(/\s+/);
	if (names.length === 0) return '?';
	if (names.length === 1) {
		return names[0].charAt(0).toUpperCase();
	}
	return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase();
});

const triggerFileInput = () => {
	fileInputRef.value?.click();
};

const handleFileSelect = (event: Event) => {
	const target = event.target as HTMLInputElement;
	const file = target.files?.[0];

	if (!file) return;

	// Validate file size
	if (file.size > props.maxSize * 1024) {
		toast({
			title: t('social.avatar.uploadError'),
			description: t('social.avatar.fileTooLarge', { maxSize: props.maxSize }),
			variant: 'destructive',
		});
		return;
	}

	// Validate file type
	if (!file.type.startsWith('image/')) {
		toast({
			title: t('social.avatar.uploadError'),
			description: t('social.avatar.invalidFileType'),
			variant: 'destructive',
		});
		return;
	}

	// Create preview
	const reader = new FileReader();
	reader.onload = (e) => {
		const result = e.target?.result as string;
		previewUrl.value = result;
		emit('upload', result);
	};
	reader.onerror = () => {
		toast({
			title: t('social.avatar.uploadError'),
			description: t('social.avatar.readError'),
			variant: 'destructive',
		});
	};
	reader.readAsDataURL(file);

	// Reset input
	if (fileInputRef.value) {
		fileInputRef.value.value = '';
	}
};

const handleRemove = () => {
	previewUrl.value = '';
	emit('remove');
};
</script>
