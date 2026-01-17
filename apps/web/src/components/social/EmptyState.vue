<template>
	<div class="flex flex-col items-center justify-center py-12 px-4 text-center">
		<!-- Icon/Illustration -->
		<div class="mb-4">
			<component
				:is="iconComponent"
				:class="iconClasses"
				:aria-hidden="true"
			/>
		</div>

		<!-- Title -->
		<h3 v-if="displayTitle" class="text-lg font-semibold mb-2">
			{{ displayTitle }}
		</h3>

		<!-- Description -->
		<p v-if="displayDescription" class="text-sm text-muted-foreground mb-6 max-w-md">
			{{ displayDescription }}
		</p>

		<!-- Action Button -->
		<Button
			v-if="actionLabel && onAction"
			variant="default"
			@click="onAction"
			:aria-label="actionLabel"
		>
			{{ actionLabel }}
		</Button>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import {
	Users,
	Search,
	UserPlus,
	UserCheck,
	Activity,
	UserX,
	Inbox,
} from 'lucide-vue-next';
import { Button } from '@repo/ui';

interface Props {
	type: 'no-friends' | 'no-followers' | 'no-following' | 'no-results' | 'no-activity' | 'no-pending' | 'no-sent';
	title?: string;
	description?: string;
	actionLabel?: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
	(e: 'action'): void;
}>();

const { t } = useI18n();

const iconMap = {
	'no-friends': UserPlus,
	'no-followers': Users,
	'no-following': UserCheck,
	'no-results': Search,
	'no-activity': Activity,
	'no-pending': Inbox,
	'no-sent': UserX,
};

const iconComponent = computed(() => iconMap[props.type]);

const iconClasses = computed(() => {
	return 'w-16 h-16 text-muted-foreground/50 mx-auto';
});

const displayTitle = computed(() => {
	if (props.title) return props.title;
	// Convert kebab-case to camelCase for i18n lookup
	const camelCaseType = props.type.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
	return t(`social.emptyStates.${camelCaseType}.title`);
});

const displayDescription = computed(() => {
	if (props.description) return props.description;
	// Convert kebab-case to camelCase for i18n lookup
	const camelCaseType = props.type.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
	return t(`social.emptyStates.${camelCaseType}.description`);
});

const onAction = () => {
	emit('action');
};
</script>
