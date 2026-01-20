<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { getFollowers, getFollowing, followUser, unfollowUser } from '@/services/api';
import { useToast } from '@repo/ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@repo/ui';
import UserCard from '@/components/social/UserCard.vue';
import EmptyState from '@/components/social/EmptyState.vue';
import UserCardSkeleton from '@/components/social/UserCardSkeleton.vue';
import type { FriendshipStatus } from '@/types/social';

const router = useRouter();
const { t } = useI18n();
const { toast } = useToast();

const followers = ref<any[]>([]);
const following = ref<any[]>([]);
const notFollowingBack = computed(() => {
	return following.value.filter((f) => !followers.value.some((follower) => follower.user.id === f.user.id));
});
const loading = ref(true);
const activeTab = ref<'followers' | 'following' | 'notFollowingBack'>('followers');

onMounted(async () => {
	await loadData();
});

const loadData = async () => {
	try {
		loading.value = true;
		const [followersData, followingData] = await Promise.all([
			getFollowers(),
			getFollowing(),
		]);
		followers.value = followersData;
		following.value = followingData;
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
			case 'follow':
				await followUser(userId);
				toast({
					title: t('social.nowFollowing'),
					description: t('social.nowFollowingDesc'),
				});
				break;
			case 'unfollow':
				if (!confirm(t('social.confirmUnfollow'))) return;
				await unfollowUser(userId);
				toast({
					title: t('social.unfollowed'),
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

const formatFollowDate = (item: any) => {
	const date = item.follow?.createdAt;
	if (!date) return '';
	return new Date(date).toLocaleDateString();
};
</script>

<template>
	<div class="container mx-auto px-4 py-8 max-w-4xl">
		<!-- Header -->
		<div class="mb-6">
			<h1 class="text-3xl font-bold">{{ t('social.followers') }}</h1>
			<p class="text-muted-foreground mt-1">
				{{ t('social.followersDesc') }}
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
				<TabsTrigger value="followers">
					{{ t('social.tabs.followers') }}
					<span v-if="followers.length > 0" class="ml-2 px-2 py-0.5 bg-secondary text-xs rounded-full">
						{{ followers.length }}
					</span>
				</TabsTrigger>
				<TabsTrigger value="following">
					{{ t('social.tabs.following') }}
					<span v-if="following.length > 0" class="ml-2 px-2 py-0.5 bg-secondary text-xs rounded-full">
						{{ following.length }}
					</span>
				</TabsTrigger>
				<TabsTrigger value="notFollowingBack">
					{{ t('social.tabs.notFollowingBack') }}
					<span v-if="notFollowingBack.length > 0" class="ml-2 px-2 py-0.5 bg-primary text-primary-foreground text-xs rounded-full">
						{{ notFollowingBack.length }}
					</span>
				</TabsTrigger>
			</TabsList>

			<!-- Followers Tab -->
			<TabsContent value="followers" class="mt-6">
				<div v-if="followers.length === 0" class="py-8">
					<EmptyState type="no-followers" />
				</div>
				<div v-else class="space-y-3">
					<UserCard
						v-for="follower in followers"
						:key="follower.user.id"
						:user="follower.user"
						:profile="follower.profile"
						:participant="follower.participant"
						:is-following="follower.isFollowing"
						show-actions
						clickable
						@click="handleClick"
						@action="handleAction"
					>
						<template #subtitle>
							{{ t('social.followerSince') }} {{ formatFollowDate(follower) }}
						</template>
					</UserCard>
				</div>
			</TabsContent>

			<!-- Following Tab -->
			<TabsContent value="following" class="mt-6">
				<div v-if="following.length === 0" class="py-8">
					<EmptyState
						type="no-following"
						:action-label="t('social.searchUsers')"
						@action="() => router.push('/social/search')"
					/>
				</div>
				<div v-else class="space-y-3">
					<UserCard
						v-for="follow in following"
						:key="follow.user.id"
						:user="follow.user"
						:profile="follow.profile"
						:participant="follow.participant"
						:is-following="true"
						show-actions
						clickable
						@click="handleClick"
						@action="handleAction"
					>
						<template #subtitle>
							{{ t('social.followingSince') }} {{ formatFollowDate(follow) }}
						</template>
					</UserCard>
				</div>
			</TabsContent>

			<!-- Not Following Back Tab -->
			<TabsContent value="notFollowingBack" class="mt-6">
				<div v-if="notFollowingBack.length === 0" class="py-8">
					<EmptyState type="no-following" />
				</div>
				<div v-else class="space-y-3">
					<p class="text-sm text-muted-foreground mb-4">
						Usuarios que sigues pero que no te siguen de vuelta
					</p>
					<UserCard
						v-for="follow in notFollowingBack"
						:key="follow.user.id"
						:user="follow.user"
						:profile="follow.profile"
						:participant="follow.participant"
						:is-following="true"
						show-actions
						clickable
						@click="handleClick"
						@action="handleAction"
					>
						<template #subtitle>
							{{ t('social.followingSince') }} {{ formatFollowDate(follow) }}
						</template>
					</UserCard>
				</div>
			</TabsContent>
		</Tabs>
	</div>
</template>
