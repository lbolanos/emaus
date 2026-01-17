<template>
	<div
		:class="cardClasses"
		role="status"
		:aria-label="$t('common.loading')"
	>
		<!-- Avatar Skeleton -->
		<div :class="avatarSkeletonClasses">
			<div class="animate-pulse bg-muted rounded-full w-full h-full"></div>
		</div>

		<!-- Content Skeleton -->
		<div class="flex-1 min-w-0 space-y-2">
			<!-- Name Skeleton -->
			<div
				:class="nameSkeletonClasses"
				class="animate-pulse bg-muted rounded"
			></div>

			<!-- Email/Location Skeleton -->
			<div
				v-if="variant !== 'compact'"
				class="h-3 w-2/3 animate-pulse bg-muted rounded"
			></div>

			<!-- Tags Skeleton (detailed only) -->
			<div v-if="variant === 'detailed'" class="flex gap-1 mt-2">
				<div
					v-for="i in 3"
					:key="i"
					class="h-5 w-16 animate-pulse bg-muted rounded"
				></div>
			</div>
		</div>

		<!-- Actions Skeleton -->
		<div v-if="showActions" class="flex-shrink-0">
			<div class="h-9 w-24 animate-pulse bg-muted rounded"></div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

interface Props {
	variant?: 'default' | 'compact' | 'detailed';
	showActions?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
	variant: 'default',
	showActions: true,
});

const { t } = useI18n();

const cardClasses = computed(() => {
	return 'flex items-center gap-3 p-3 rounded-lg border border-border bg-card';
});

const avatarSkeletonClasses = computed(() => {
	const sizes = {
		default: 'w-12 h-12',
		compact: 'w-10 h-10',
		detailed: 'w-16 h-16',
	};
	return `${sizes[props.variant]} rounded-full flex-shrink-0`;
});

const nameSkeletonClasses = computed(() => {
	const sizes = {
		default: 'h-4 w-32',
		compact: 'h-3.5 w-24',
		detailed: 'h-5 w-40',
	};
	return sizes[props.variant];
});
</script>
