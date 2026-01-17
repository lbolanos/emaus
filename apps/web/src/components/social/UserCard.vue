<template>
	<div
		:class="cardClasses"
		:role="clickable ? 'button' : undefined"
		:tabindex="clickable ? 0 : undefined"
		@click="handleClick"
		@keydown.enter="handleClick"
	>
		<!-- Avatar Section -->
		<div class="flex items-center gap-3 flex-1 min-w-0">
			<!-- Avatar with Online Status -->
			<div class="relative flex-shrink-0">
				<div
					:class="avatarClasses"
					:aria-label="`${user.displayName} avatar`"
				>
					{{ initials }}
				</div>
				<!-- Online Status Indicator -->
				<span
					v-if="showOnlineStatus"
					:class="onlineIndicatorClasses"
					:aria-label="isOnline ? 'En línea' : 'Desconectado'"
					:title="isOnline ? 'En línea' : 'Desconectado'"
				></span>
			</div>

			<!-- User Info -->
			<div class="flex-1 min-w-0">
				<div class="flex items-center gap-2">
					<h3
						:class="nameClasses"
						:aria-label="`Nombre: ${user.displayName}`"
					>
						{{ user.displayName }}
					</h3>
					<!-- Participant Badge -->
					<span
						v-if="participant && variant === 'detailed'"
						class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary"
						:aria-label="`${$t('social.serverBadge')}`"
					>
						{{ $t('social.serverBadge') }}
					</span>
				</div>

				<!-- Email or Location -->
				<p
					v-if="shouldShowSecondaryInfo"
					class="text-sm text-muted-foreground truncate"
				>
					{{ secondaryInfo }}
				</p>

				<!-- Mutual Friends -->
				<p
					v-if="mutualFriends && mutualFriends > 0 && variant === 'detailed'"
					class="text-xs text-muted-foreground mt-1"
				>
					{{ $t('social.mutualFriends', { count: mutualFriends }) }}
				</p>

				<!-- Detailed View: Interests/Skills Preview -->
				<div
					v-if="variant === 'detailed' && (hasInterests || hasSkills)"
					class="flex flex-wrap gap-1 mt-2"
				>
					<span
						v-for="tag in displayTags"
						:key="tag"
						class="inline-flex items-center px-2 py-0.5 rounded text-xs bg-secondary text-secondary-foreground"
					>
						{{ tag }}
					</span>
				</div>
			</div>
		</div>

		<!-- Actions Section -->
		<div v-if="showActions" class="flex-shrink-0">
			<UserActions
				:user-id="user.id"
				:is-friend="isFriend"
				:is-following="isFollowing"
				:friendship-status="friendshipStatus"
				:variant="actionsVariant"
				@action="handleAction"
			/>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import type {
	SocialUser,
	SocialProfile,
	UserCardProps,
	FriendshipStatus,
} from '@/types/social';
	import { useI18n } from 'vue-i18n';
import UserActions from './UserActions.vue';

interface Props {
	user: SocialUser;
	profile?: SocialProfile;
	participant?: Record<string, unknown> | null;
	friendship?: {
		status: FriendshipStatus;
		isFriend: boolean;
		isPending: boolean;
		isSentRequest: boolean;
	};
	isFollowing?: boolean;
	isOnline?: boolean;
	mutualFriends?: number;
	variant?: 'default' | 'compact' | 'detailed';
	showActions?: boolean;
	clickable?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
	variant: 'default',
	showActions: true,
	clickable: true,
	isFollowing: false,
	isOnline: false,
});

const emit = defineEmits<{
	(e: 'click', user: SocialUser): void;
	(e: 'action', action: string, data?: unknown): void;
}>();

const router = useRouter();
const { t } = useI18n();

// Computed Properties
const cardClasses = computed(() => {
	const base = 'flex items-center gap-3 p-3 rounded-lg border transition-all';
	const variants = {
		default: 'border-border hover:bg-secondary/50 hover:border-border',
		compact: 'border-border hover:bg-secondary/50',
		detailed: 'border-border bg-card hover:shadow-md',
	};
	return `${base} ${variants[props.variant]} ${props.clickable ? 'cursor-pointer' : ''}`;
});

const avatarClasses = computed(() => {
	const sizes = {
		default: 'w-12 h-12 text-base',
		compact: 'w-10 h-10 text-sm',
		detailed: 'w-16 h-16 text-lg',
	};
	return `${sizes[props.variant]} rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold flex-shrink-0 overflow-hidden`;
});

const onlineIndicatorClasses = computed(() => {
	return `absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-background ${
		props.isOnline ? 'bg-green-500' : 'bg-gray-400'
	}`;
});

const nameClasses = computed(() => {
	const sizes = {
		default: 'font-semibold text-sm truncate',
		compact: 'font-medium text-sm truncate',
		detailed: 'font-semibold text-base truncate',
	};
	return sizes[props.variant];
});

const showOnlineStatus = computed(() => {
	return props.variant !== 'compact' && props.isOnline !== undefined;
});

const shouldShowSecondaryInfo = computed(() => {
	return props.variant !== 'compact' && (props.user.email || props.profile?.location);
});

const secondaryInfo = computed(() => {
	// Priority: location > email
	if (props.profile?.location) return props.profile.location;
	if (props.user.email && props.profile?.showEmail) return props.user.email;
	return '';
});

const isFriend = computed(() => props.friendship?.isFriend);
const friendshipStatus = computed(() => props.friendship?.status);

const actionsVariant = computed(() => {
	if (props.variant === 'compact') return 'compact';
	return 'default';
});

const hasInterests = computed(() => props.profile?.interests && props.profile.interests.length > 0);
const hasSkills = computed(() => props.profile?.skills && props.profile.skills.length > 0);

const displayTags = computed(() => {
	const tags: string[] = [];
	const maxTags = 3;

	if (hasInterests.value) {
		tags.push(...(props.profile?.interests?.slice(0, maxTags) || []));
	}
	if (hasSkills.value && tags.length < maxTags) {
		const remaining = maxTags - tags.length;
		tags.push(...(props.profile?.skills?.slice(0, remaining) || []));
	}

	return tags;
});

const initials = computed(() => {
	const names = props.user.displayName.trim().split(/\s+/);
	if (names.length === 0) return '?';
	if (names.length === 1) {
		return names[0].charAt(0).toUpperCase();
	}
	return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase();
});

// Methods
const handleClick = () => {
	if (props.clickable) {
		emit('click', props.user);
	}
};

const handleAction = (action: string, data?: unknown) => {
	emit('action', action, data);
};
</script>
