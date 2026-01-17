<template>
	<div class="user-tag-list">
		<!-- Display Tags -->
		<div class="flex flex-wrap gap-2">
			<span
				v-for="tag in localTags"
				:key="tag"
				:class="tagClasses"
				:aria-label="`${variantLabel}: ${tag}`"
			>
				{{ tag }}
				<button
					v-if="editable"
					type="button"
					@click="removeTag(tag)"
					:aria-label="`Remover ${tag}`"
					class="ml-1 hover:text-destructive transition-colors"
				>
					<X class="w-3 h-3" />
				</button>
			</span>
		</div>

		<!-- Add Tag Input -->
		<div
			v-if="editable && (!maxTags || localTags.length < maxTags)"
			class="mt-2 flex gap-2"
		>
			<Input
				v-model="newTag"
				:placeholder="placeholderText"
				@keydown.enter="addTag"
				@keydown.escape="clearInput"
				:aria-label="`Agregar ${variantLabel}`"
				class="flex-1"
			/>
			<Button
				variant="outline"
				size="sm"
				@click="addTag"
				:disabled="!newTag.trim()"
				:aria-label="`Agregar ${newTag || variantLabel}`"
			>
				<Plus class="w-4 h-4" />
			</Button>
		</div>

		<!-- Tag Limit Warning -->
		<p
			v-if="maxTags && localTags.length >= maxTags"
			class="text-xs text-muted-foreground mt-2"
		>
			{{ $t('social.tags.maxReached', { max: maxTags }) }}
		</p>
	</div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { X, Plus } from 'lucide-vue-next';
import { Input } from '@repo/ui';
import { Button } from '@repo/ui';
import { useToast } from '@repo/ui';

interface Props {
	tags: string[];
	editable?: boolean;
	variant?: 'interests' | 'skills';
	maxTags?: number;
	placeholder?: string;
}

const props = withDefaults(defineProps<Props>(), {
	editable: false,
	variant: 'interests',
	maxTags: undefined,
});

const emit = defineEmits<{
	(e: 'add', tag: string): void;
	(e: 'remove', tag: string): void;
}>();

const { t } = useI18n();
const { toast } = useToast();

const localTags = ref<string[]>([...props.tags]);
const newTag = ref('');

// Sync with props
watch(
	() => props.tags,
	(newTags) => {
		localTags.value = [...newTags];
	},
	{ deep: true }
);

const tagClasses = computed(() => {
	return 'inline-flex items-center px-3 py-1 rounded-full text-sm bg-primary/10 text-primary';
});

const variantLabel = computed(() => {
	return props.variant === 'interests'
		? t('social.interests')
		: t('social.skills');
});

const placeholderText = computed(() => {
	if (props.placeholder) return props.placeholder;
	return props.variant === 'interests'
		? t('social.interestPlaceholder')
		: t('social.skillPlaceholder');
});

const addTag = () => {
	const trimmed = newTag.value.trim();
	if (!trimmed) return;

	// Check for duplicates
	if (localTags.value.some(tag => tag.toLowerCase() === trimmed.toLowerCase())) {
		toast({
			title: t('social.tags.duplicate'),
			description: t('social.tags.duplicateDesc', { tag: trimmed }),
			variant: 'destructive',
		});
		return;
	}

	// Check max limit
	if (props.maxTags && localTags.value.length >= props.maxTags) {
		toast({
			title: t('social.tags.maxReached'),
			description: t('social.tags.maxReachedDesc', { max: props.maxTags }),
			variant: 'destructive',
		});
		return;
	}

	localTags.value.push(trimmed);
	emit('add', trimmed);
	newTag.value = '';
};

const removeTag = (tag: string) => {
	const index = localTags.value.indexOf(tag);
	if (index > -1) {
		localTags.value.splice(index, 1);
		emit('remove', tag);
	}
};

const clearInput = () => {
	newTag.value = '';
};
</script>
