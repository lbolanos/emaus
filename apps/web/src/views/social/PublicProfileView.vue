<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
	getPublicProfile,
	sendFriendRequest,
	acceptFriendRequest,
	rejectFriendRequest,
	removeFriend,
	followUser,
	unfollowUser,
} from '@/services/api';
import { useToast } from '@repo/ui';
import { Button } from '@repo/ui';
import UserTagList from '@/components/social/UserTagList.vue';
import { Card } from '@repo/ui';
import UserActions from '@/components/social/UserActions.vue';
import AvatarUpload from '@/components/social/AvatarUpload.vue';
import type { FriendshipStatus } from '@/types/social';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const { toast } = useToast();

const userId = route.params.id as string;

const profile = ref<any>(null);
const loading = ref(true);

const friendshipStatus = computed<FriendshipStatus>(() => {
	if (!profile.value?.friendship) return 'none';
	return profile.value.friendship.status || 'none';
});

const isFriend = computed(() => profile.value?.isFriend || false);
const isFollowing = computed(() => profile.value?.isFollowing || false);
const mutualFriendsCount = computed(() => profile.value?.mutualFriendsCount || 0);

onMounted(async () => {
	await loadProfile();
});

const loadProfile = async () => {
	try {
		loading.value = true;
		profile.value = await getPublicProfile(userId);
	} catch (error: any) {
		toast({
			title: t('social.profileError'),
			description: error.message || t('social.profileErrorDesc'),
			variant: 'destructive',
		});
	} finally {
		loading.value = false;
	}
};

const handleAction = async (action: string, data?: unknown) => {
	try {
		switch (action) {
			case 'sendFriendRequest':
				await sendFriendRequest(userId);
				toast({
					title: t('social.friendRequestSent'),
					description: t('social.friendRequestSentDesc'),
				});
				profile.value.friendship = { status: 'sent' };
				break;
			case 'acceptFriend':
				await acceptFriendRequest(userId);
				toast({
					title: t('social.friendRequestAccepted'),
					description: t('social.friendRequestAcceptedDesc'),
				});
				profile.value.isFriend = true;
				profile.value.friendship = { status: 'accepted' };
				break;
			case 'rejectFriend':
				await rejectFriendRequest(userId);
				toast({
					title: t('social.friendRequestRejected'),
				});
				profile.value.friendship = { status: 'none' };
				break;
			case 'removeFriend':
				await removeFriend(userId);
				toast({
					title: t('social.friendRemoved'),
					description: t('social.friendRemovedDesc'),
				});
				profile.value.isFriend = false;
				profile.value.friendship = { status: 'none' };
				break;
			case 'follow':
				await followUser(userId);
				toast({
					title: t('social.nowFollowing'),
					description: t('social.nowFollowingDesc'),
				});
				profile.value.isFollowing = true;
				break;
			case 'unfollow':
				await unfollowUser(userId);
				toast({
					title: t('social.unfollowed'),
				});
				profile.value.isFollowing = false;
				break;
		}
	} catch (error: any) {
		toast({
			title: t('common.error'),
			description: error.message || t('common.error'),
			variant: 'destructive',
		});
	}
};

const getInitials = (name: string) => {
	const names = name.trim().split(/\s+/);
	if (names.length === 0) return '?';
	if (names.length === 1) {
		return names[0].charAt(0).toUpperCase();
	}
	return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase();
};
</script>

<template>
	<div class="container mx-auto px-4 py-8 max-w-4xl">
		<!-- Loading State -->
		<div v-if="loading" class="flex justify-center py-12">
			<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
		</div>

		<!-- Profile Content -->
		<div v-else-if="profile" class="space-y-6">
			<!-- Header Section -->
			<Card class="p-6">
				<div class="flex flex-col md:flex-row gap-6 items-start">
					<!-- Avatar -->
					<div class="flex-shrink-0">
						<div class="w-24 h-24 md:w-32 md:h-32 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-4xl md:text-5xl border-4 border-background shadow-lg overflow-hidden">
							<img
								v-if="profile.user.avatarUrl"
								:src="profile.user.avatarUrl"
								:alt="`${profile.user.displayName} avatar`"
								class="w-full h-full object-cover"
							/>
							<span v-else>{{ getInitials(profile.user.displayName) }}</span>
						</div>
						<!-- Online Status Indicator -->
						<span
							v-if="profile.user.isOnline"
							class="inline-block w-3 h-3 bg-green-500 rounded-full mt-2 ml-auto"
							:aria-label="t('social.onlineStatus.online')"
						></span>
					</div>

					<!-- User Info -->
					<div class="flex-1 min-w-0">
						<div class="flex items-start justify-between gap-4">
							<div class="min-w-0">
								<h1 class="text-2xl md:text-3xl font-bold truncate">
									{{ profile.user.displayName }}
								</h1>
								<p v-if="profile.profile.location" class="text-muted-foreground mt-1">
									{{ profile.profile.location }}
								</p>
							</div>

							<!-- Actions -->
							<div class="flex-shrink-0">
								<UserActions
									:user-id="userId"
									:is-friend="isFriend"
									:is-following="isFollowing"
									:friendship-status="friendshipStatus"
									@action="handleAction"
								/>
							</div>
						</div>

						<!-- Stats Bar -->
						<div class="flex gap-6 mt-4 text-sm">
							<div v-if="mutualFriendsCount > 0" class="flex items-center gap-1">
								<span class="font-semibold">{{ mutualFriendsCount }}</span>
								<span class="text-muted-foreground">
									{{ t('social.mutualFriends', mutualFriendsCount) }}
								</span>
							</div>
						</div>

						<!-- Participant Badge -->
						<div v-if="profile.participant" class="mt-3">
							<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
								{{ t('social.serverBadge') }}
							</span>
						</div>
					</div>
				</div>
			</Card>

			<!-- Bio Section -->
			<Card v-if="profile.profile.bio" class="p-6">
				<h2 class="text-lg font-semibold mb-3">{{ t('social.bio') }}</h2>
				<p class="text-muted-foreground whitespace-pre-wrap">{{ profile.profile.bio }}</p>
			</Card>

			<!-- Website Section -->
			<Card v-if="profile.profile.website" class="p-6">
				<h2 class="text-lg font-semibold mb-3">{{ t('social.website') }}</h2>
				<a
					:href="profile.profile.website"
					target="_blank"
					rel="noopener noreferrer"
					class="text-primary hover:underline break-all"
				>
					{{ profile.profile.website }}
				</a>
			</Card>

			<!-- Interests Section -->
			<Card v-if="profile.profile.interests && profile.profile.interests.length > 0" class="p-6">
				<h2 class="text-lg font-semibold mb-3">{{ t('social.interests') }}</h2>
				<UserTagList
					:tags="profile.profile.interests"
					:editable="false"
					variant="interests"
				/>
			</Card>

			<!-- Skills Section -->
			<Card v-if="profile.profile.skills && profile.profile.skills.length > 0" class="p-6">
				<h2 class="text-lg font-semibold mb-3">{{ t('social.skills') }}</h2>
				<UserTagList
					:tags="profile.profile.skills"
					:editable="false"
					variant="skills"
				/>
			</Card>

			<!-- Server Info Section -->
			<Card v-if="profile.participant" class="p-6">
				<h2 class="text-lg font-semibold mb-3">{{ t('social.serverInfo') }}</h2>
				<p class="text-muted-foreground">
					{{ t('social.serverRetreats') }}
				</p>
			</Card>

			<!-- Empty State Message -->
			<Card v-if="!profile.profile.bio && !profile.profile.website && (!profile.profile.interests || profile.profile.interests.length === 0) && (!profile.profile.skills || profile.profile.skills.length === 0)" class="p-12 text-center">
				<p class="text-muted-foreground">{{ t('social.noProfileInfo') }}</p>
			</Card>
		</div>
	</div>
</template>
