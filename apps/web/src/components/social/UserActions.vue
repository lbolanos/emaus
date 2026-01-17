<template>
	<div :class="containerClasses">
		<!-- Friend Request Actions -->
		<template v-if="friendshipStatus === 'pending'">
			<Button
				variant="default"
				size="sm"
				@click="handleAccept"
				:aria-label="$t('social.acceptFriendRequest')"
				class="mr-1"
			>
				<Check class="w-4 h-4" />
				<span v-if="variant !== 'icon-only'">{{ $t('social.acceptFriendRequest') }}</span>
			</Button>
			<Button
				variant="ghost"
				size="sm"
				@click="handleReject"
				:aria-label="$t('social.rejectFriendRequest')"
			>
				<X class="w-4 h-4" />
			</Button>
		</template>

		<!-- Send Friend Request -->
		<Button
			v-else-if="!isFriend && friendshipStatus !== 'sent'"
			variant="outline"
			size="sm"
			@click="handleSendRequest"
			:aria-label="$t('social.sendFriendRequest')"
		>
			<UserPlus class="w-4 h-4" />
			<span v-if="variant !== 'icon-only'">{{ $t('social.sendFriendRequest') }}</span>
		</Button>

		<!-- Sent Request Pending -->
		<Button
			v-else-if="friendshipStatus === 'sent'"
			variant="ghost"
			size="sm"
			disabled
			:aria-label="$t('social.pendingRequests')"
		>
			<Clock class="w-4 h-4" />
			<span v-if="variant !== 'icon-only'">{{ $t('social.pendingRequests') }}</span>
		</Button>

		<!-- Remove Friend (if already friends) -->
		<Button
			v-else-if="isFriend"
			variant="ghost"
			size="sm"
			@click="handleRemoveFriend"
			:aria-label="$t('social.removeFriend')"
		>
			<UserMinus class="w-4 h-4" />
			<span v-if="variant !== 'icon-only'">{{ $t('social.removeFriend') }}</span>
		</Button>

		<!-- Follow/Unfollow -->
		<Button
			v-if="showFollowAction"
			:variant="isFollowing ? 'ghost' : 'outline'"
			size="sm"
			@click="handleToggleFollow"
			:aria-label="isFollowing ? $t('social.unfollow') : $t('social.follow')"
			:class="{ 'ml-1': friendshipStatus === 'pending' }"
		>
			<component :is="isFollowing ? UserMinus : UserPlus" class="w-4 h-4" />
			<span v-if="variant !== 'icon-only'">
				{{ isFollowing ? $t('social.unfollow') : $t('social.follow') }}
			</span>
		</Button>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from '@repo/ui';
import {
	Check,
	X,
	UserPlus,
	UserMinus,
	Clock,
} from 'lucide-vue-next';
import { Button } from '@repo/ui';
import type { FriendshipStatus } from '@/types/social';

interface Props {
	userId: string;
	isFriend?: boolean;
	isFollowing?: boolean;
	friendshipStatus?: FriendshipStatus;
	variant?: 'default' | 'compact' | 'icon-only';
	showFollowAction?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
	isFriend: false,
	isFollowing: false,
	friendshipStatus: 'none',
	variant: 'default',
	showFollowAction: true,
});

const emit = defineEmits<{
	(e: 'action', action: string, data?: unknown): void;
}>();

const { t } = useI18n();
const { toast } = useToast();

const containerClasses = computed(() => {
	return 'flex items-center gap-1';
});

const handleAccept = () => {
	emit('action', 'acceptFriend', { userId: props.userId });
};

const handleReject = () => {
	emit('action', 'rejectFriend', { userId: props.userId });
};

const handleSendRequest = () => {
	emit('action', 'sendFriendRequest', { userId: props.userId });
};

const handleRemoveFriend = () => {
	emit('action', 'removeFriend', { userId: props.userId });
};

const handleToggleFollow = () => {
	emit('action', props.isFollowing ? 'unfollow' : 'follow', { userId: props.userId });
};
</script>
