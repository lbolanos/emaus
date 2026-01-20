<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
	getFriends,
	getPendingRequests,
	getSentRequests,
	acceptFriendRequest,
	rejectFriendRequest,
	removeFriend,
} from '@/services/api';
import { useToast } from '@repo/ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@repo/ui';
import UserCard from '@/components/social/UserCard.vue';
import EmptyState from '@/components/social/EmptyState.vue';
import UserCardSkeleton from '@/components/social/UserCardSkeleton.vue';
import type { FriendshipStatus } from '@/types/social';

const router = useRouter();
const { t } = useI18n();
const { toast } = useToast();

const friends = ref<any[]>([]);
const pendingRequests = ref<any[]>([]);
const sentRequests = ref<any[]>([]);
const loading = ref(true);
const activeTab = ref<'friends' | 'pending' | 'sent'>('friends');

const tabs = [
	{ id: 'friends' as const, label: t('social.friends'), count: computed(() => friends.value.length) },
	{ id: 'pending' as const, label: t('social.pendingRequests'), count: computed(() => pendingRequests.value.length) },
	{ id: 'sent' as const, label: t('social.sentRequests'), count: computed(() => sentRequests.value.length) },
];

onMounted(async () => {
	await loadData();
});

const loadData = async () => {
	try {
		loading.value = true;
		const [friendsData, pendingData, sentData] = await Promise.all([
			getFriends(),
			getPendingRequests(),
			getSentRequests(),
		]);
		friends.value = friendsData;
		pendingRequests.value = pendingData;
		sentRequests.value = sentData;
	} catch (error: any) {
		toast({
			title: t('common.error'),
			description: error.message || 'No se pudo cargar los datos',
			variant: 'destructive',
		});
	} finally {
		loading.value = false;
	}
};

const handleAction = async (action: string, data?: unknown) => {
	const userId = (data as { userId: string })?.userId;
	if (!userId) return;

	try {
		switch (action) {
			case 'acceptFriend':
				await acceptFriendRequest(userId);
				toast({
					title: t('social.friendRequestAccepted'),
					description: t('social.friendRequestAcceptedDesc'),
				});
				break;
			case 'rejectFriend':
				await rejectFriendRequest(userId);
				toast({
					title: t('social.friendRequestRejected'),
				});
				break;
			case 'removeFriend':
				if (!confirm(t('social.confirmRemoveFriend'))) return;
				await removeFriend(userId);
				toast({
					title: t('social.friendRemoved'),
					description: t('social.friendRemovedDesc'),
				});
				break;
			default:
				return;
		}
		await loadData();
	} catch (error: any) {
		toast({
			title: t('common.error'),
			description: error.message || t('common.error'),
			variant: 'destructive',
		});
	}
};

const handleClick = (user: any) => {
	router.push(`/app/profile/${user.id}`);
};

const formatFriendDate = (item: any) => {
	const date = item.friendship?.respondedAt || item.friendship?.createdAt;
	if (!date) return '';
	return new Date(date).toLocaleDateString();
};

const mapFriendshipStatus = (item: any): { status: FriendshipStatus; isFriend: boolean; isPending: boolean; isSentRequest: boolean } => {
	const isFriend = !!item.isFriend;
	const isRequester = item.friendship?.requesterId !== undefined; // Simplified check
	return {
		status: isFriend ? 'accepted' : 'pending',
		isFriend,
		isPending: !isFriend && !isRequester,
		isSentRequest: false,
	};
};
</script>

<template>
	<div class="container mx-auto px-4 py-8 max-w-4xl">
		<!-- Header -->
		<div class="mb-6">
			<h1 class="text-3xl font-bold">{{ t('social.friends') }}</h1>
			<p class="text-muted-foreground mt-1">
				{{ t('social.friendsDesc') }}
			</p>
		</div>

		<!-- Loading State -->
		<div v-if="loading" class="space-y-3">
			<UserCardSkeleton
				v-for="i in 5"
				:key="i"
				:show-actions="true"
			/>
		</div>

		<!-- Tabs Content -->
		<Tabs v-else v-model="activeTab" class="w-full">
			<TabsList class="w-full justify-start">
				<TabsTrigger value="friends">
					{{ t('social.tabs.friends') }}
					<span v-if="friends.length > 0" class="ml-2 px-2 py-0.5 bg-secondary text-xs rounded-full">
						{{ friends.length }}
					</span>
				</TabsTrigger>
				<TabsTrigger value="pending">
					{{ t('social.tabs.pending') }}
					<span v-if="pendingRequests.length > 0" class="ml-2 px-2 py-0.5 bg-primary text-primary-foreground text-xs rounded-full">
						{{ pendingRequests.length }}
					</span>
				</TabsTrigger>
				<TabsTrigger value="sent">
					{{ t('social.tabs.sent') }}
					<span v-if="sentRequests.length > 0" class="ml-2 px-2 py-0.5 bg-secondary text-xs rounded-full">
						{{ sentRequests.length }}
					</span>
				</TabsTrigger>
			</TabsList>

			<!-- Friends Tab -->
			<TabsContent value="friends" class="mt-6">
				<div v-if="friends.length === 0" class="py-8">
					<EmptyState
						type="no-friends"
						:action-label="t('social.searchUsers')"
						@action="() => router.push('/social/search')"
					/>
				</div>
				<div v-else class="space-y-3">
					<UserCard
						v-for="friend in friends"
						:key="friend.user.id"
						:user="friend.user"
						:profile="friend.profile"
						:participant="friend.participant"
						:friendship="{ status: 'accepted', isFriend: true, isPending: false, isSentRequest: false }"
						show-actions
						clickable
						@click="handleClick"
						@action="handleAction"
					>
						<template #subtitle>
							{{ t('social.friendsSince') }} {{ formatFriendDate(friend) }}
						</template>
					</UserCard>
				</div>
			</TabsContent>

			<!-- Pending Requests Tab -->
			<TabsContent value="pending" class="mt-6">
				<div v-if="pendingRequests.length === 0" class="py-8">
					<EmptyState type="no-pending" />
				</div>
				<div v-else class="space-y-3">
					<UserCard
						v-for="request in pendingRequests"
						:key="request.user.id"
						:user="request.user"
						:profile="request.profile"
						:participant="request.participant"
						:friendship="{ status: 'pending', isFriend: false, isPending: true, isSentRequest: false }"
						:is-following="request.isFollowing"
						show-actions
						clickable
						@click="handleClick"
						@action="handleAction"
					>
						<template #subtitle>
							{{ t('social.pendingRequests') }}
						</template>
					</UserCard>
				</div>
			</TabsContent>

			<!-- Sent Requests Tab -->
			<TabsContent value="sent" class="mt-6">
				<div v-if="sentRequests.length === 0" class="py-8">
					<EmptyState type="no-sent" />
				</div>
				<div v-else class="space-y-3">
					<UserCard
						v-for="request in sentRequests"
						:key="request.user.id"
						:user="request.user"
						:profile="request.profile"
						:participant="request.participant"
						:friendship="{ status: 'sent', isFriend: false, isPending: false, isSentRequest: true }"
						:is-following="request.isFollowing"
						show-actions
						clickable
						@click="handleClick"
						@action="handleAction"
					>
						<template #subtitle>
							{{ t('social.sentRequests') }}
						</template>
					</UserCard>
				</div>
			</TabsContent>
		</Tabs>
	</div>
</template>
