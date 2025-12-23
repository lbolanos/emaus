<template>
	<div class="space-y-2">
		<label class="text-sm font-medium">{{ $t('tags.selectLabel') }}</label>
		<div class="relative">
			<input
				v-model="searchQuery"
				@focus="showDropdown = true"
				@blur="closeDropdown"
				type="text"
				class="w-full border rounded-md px-3 py-2"
				:placeholder="$t('tags.searchPlaceholder')"
				:disabled="disabled"
			/>
		</div>

		<!-- Dropdown with autocomplete -->
		<div
			v-if="showDropdown && (filteredTags.length > 0 || searchQuery)"
			class="absolute z-10 w-full bg-white dark:bg-gray-800 border rounded-md shadow-lg max-h-60 overflow-auto"
		>
			<div
				v-for="tag in filteredTags"
				:key="tag.id"
				@mousedown="selectTag(tag)"
				class="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center justify-between"
			>
				<span>{{ tag.name }}</span>
				<span v-if="isSelected(tag)" class="text-green-600 dark:text-green-400">
					<Check class="w-4 h-4" />
				</span>
			</div>
			<div
				v-if="searchQuery && !filteredTags.length"
				@mousedown="createNewTag"
				class="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-blue-600 dark:text-blue-400"
			>
				{{ $t('tags.createNew', { name: searchQuery }) }}
			</div>
		</div>

		<!-- Selected tags display -->
		<div class="flex flex-wrap gap-2 mt-2">
			<TagBadge
				v-for="tag in selectedTags"
				:key="tag.id"
				:tag="tag"
				:removable="!disabled"
				@remove="removeTag(tag)"
			/>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Check } from 'lucide-vue-next';
import TagBadge from './TagBadge.vue';
import { getAllTags, createTag } from '@/services/api';
import { useToast } from '@repo/ui';
import { useI18n } from 'vue-i18n';
import type { Tag } from '@repo/types';

const props = defineProps<{
	modelValue: Tag[];
	disabled?: boolean;
	retreatId: string;
}>();

const emit = defineEmits<{
	'update:modelValue': [tags: Tag[]];
}>();

const { toast } = useToast();
const { t } = useI18n();
const allTags = ref<Tag[]>([]);
const searchQuery = ref('');
const showDropdown = ref(false);

const selectedTags = computed({
	get: () => props.modelValue,
	set: (value) => emit('update:modelValue', value),
});

const filteredTags = computed(() => {
	if (!searchQuery.value) return allTags.value;
	const query = searchQuery.value.toLowerCase();
	return allTags.value.filter((tag) => tag.name.toLowerCase().includes(query) && !isSelected(tag));
});

const isSelected = (tag: Tag) => {
	return selectedTags.value.some((t) => t.id === tag.id);
};

const selectTag = (tag: Tag) => {
	if (!isSelected(tag)) {
		selectedTags.value = [...selectedTags.value, tag];
	}
	searchQuery.value = '';
	showDropdown.value = false;
};

const removeTag = (tag: Tag) => {
	selectedTags.value = selectedTags.value.filter((t) => t.id !== tag.id);
};

const createNewTag = async () => {
	try {
		const newTag = await createTag({ name: searchQuery.value }, props.retreatId);
		allTags.value.push(newTag);
		selectTag(newTag);
	} catch (error: any) {
		toast({
			title: t('tags.error.create'),
			description: error.response?.data?.message || error.message,
			variant: 'destructive',
		});
	}
};

const closeDropdown = () => {
	setTimeout(() => {
		showDropdown.value = false;
	}, 200);
};

// Load all tags on mount
getAllTags(props.retreatId)
	.then((tags) => {
		allTags.value = tags;
	})
	.catch((error) => {
		console.error('Error loading tags:', error);
	});
</script>
