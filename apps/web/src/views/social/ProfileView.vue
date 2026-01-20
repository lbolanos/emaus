<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
	getUserProfile,
	updateUserProfile,
	updateAvatar,
	removeAvatar,
} from '@/services/api';
import { useToast } from '@repo/ui';
import { Button } from '@repo/ui';
import { Switch } from '@repo/ui';
import AvatarUpload from '@/components/social/AvatarUpload.vue';
import UserTagList from '@/components/social/UserTagList.vue';
import TestimonialsVisibilityConfig from '@/components/social/TestimonialsVisibilityConfig.vue';
import { Card } from '@repo/ui';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const { toast } = useToast();

const profile = ref({
	bio: '',
	location: '',
	website: '',
	showEmail: false,
	showPhone: false,
	showRetreats: true,
	interests: [] as string[],
	skills: [] as string[],
	avatarUrl: '' as string | undefined,
});

const userDisplayName = ref('');
const loading = ref(true);
const saving = ref(false);
const hasChanges = ref(false);
const saveStatus = ref<'unchanged' | 'unsaved' | 'saved'>('unchanged');

// Character limits
const MAX_BIO_LENGTH = 500;
const MAX_LOCATION_LENGTH = 100;
const MAX_WEBSITE_LENGTH = 500;

// Character count computed
const bioCount = computed(() => `${profile.value.bio.length} de ${MAX_BIO_LENGTH}`);
const locationCount = computed(() => `${profile.value.location.length} de ${MAX_LOCATION_LENGTH}`);
const websiteCount = computed(() => `${profile.value.website.length} de ${MAX_WEBSITE_LENGTH}`);

// Save status dot color
const saveStatusDot = computed(() => {
	switch (saveStatus.value) {
		case 'unchanged':
			return 'bg-gray-400';
		case 'unsaved':
			return 'bg-yellow-400';
		case 'saved':
			return 'bg-green-500';
	}
});

const loadProfile = async () => {
	try {
		loading.value = true;
		const data = await getUserProfile();
		if (data) {
			userDisplayName.value = data.user?.displayName || '';
			profile.value = {
				bio: data.bio || '',
				location: data.location || '',
				website: data.website || '',
				showEmail: data.showEmail || false,
				showPhone: data.showPhone || false,
				showRetreats: data.showRetreats !== false,
				interests: data.interests || [],
				skills: data.skills || [],
				avatarUrl: data.avatarUrl || undefined,
			};
		}
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

const saveProfile = async () => {
	try {
		saving.value = true;
		await updateUserProfile(profile.value);
		saveStatus.value = 'saved';
		hasChanges.value = false;
		toast({
			title: t('social.profileUpdated'),
			description: t('social.profileUpdatedDesc'),
		});
		// Reset to unchanged after a short delay
		setTimeout(() => {
			if (saveStatus.value === 'saved') {
				saveStatus.value = 'unchanged';
			}
		}, 2000);
	} catch (error: any) {
		toast({
			title: t('social.profileError'),
			description: error.message || t('social.profileErrorDesc'),
			variant: 'destructive',
		});
	} finally {
		saving.value = false;
	}
};

const handleAvatarUpload = async (avatarUrl: string) => {
	try {
		await updateAvatar(avatarUrl);
		profile.value.avatarUrl = avatarUrl;
		toast({
			title: t('social.avatar.upload'),
			description: t('social.profileUpdatedDesc'),
		});
	} catch (error: any) {
		toast({
			title: t('social.avatar.uploadError'),
			description: error.message || t('social.avatar.uploadError'),
			variant: 'destructive',
		});
	}
};

const handleAvatarRemove = async () => {
	try {
		await removeAvatar();
		profile.value.avatarUrl = undefined;
		toast({
			title: t('social.avatar.remove'),
			description: t('social.profileUpdatedDesc'),
		});
	} catch (error: any) {
		toast({
			title: t('social.avatar.uploadError'),
			description: error.message || t('social.avatar.uploadError'),
			variant: 'destructive',
		});
	}
};

const handleAddInterest = (interest: string) => {
	profile.value.interests.push(interest);
	markAsUnsaved();
};

const handleRemoveInterest = (interest: string) => {
	const index = profile.value.interests.indexOf(interest);
	if (index > -1) {
		profile.value.interests.splice(index, 1);
		markAsUnsaved();
	}
};

const handleAddSkill = (skill: string) => {
	profile.value.skills.push(skill);
	markAsUnsaved();
};

const handleRemoveSkill = (skill: string) => {
	const index = profile.value.skills.indexOf(skill);
	if (index > -1) {
		profile.value.skills.splice(index, 1);
		markAsUnsaved();
	}
};

const markAsUnsaved = () => {
	hasChanges.value = true;
	saveStatus.value = 'unsaved';
};

// Watch for changes
const updateField = () => {
	markAsUnsaved();
};

onMounted(() => {
	loadProfile();
});
</script>

<template>
	<div class="container mx-auto px-4 py-8 max-w-4xl">
		<!-- Header with Save Status -->
		<div class="flex items-center justify-between mb-6">
			<div>
				<h1 class="text-3xl font-bold">{{ t('social.myProfile') }}</h1>
				<p class="text-sm text-muted-foreground mt-1">
					{{ t('social.editProfile') }}
				</p>
			</div>
			<div v-if="hasChanges" class="flex items-center gap-2">
				<span :class="`w-2 h-2 rounded-full ${saveStatusDot}`"></span>
				<span class="text-sm text-muted-foreground">
					{{
						saveStatus === 'saved'
							? t('common.confirm')
							: t('common.actions.show')
					}}
				</span>
			</div>
		</div>

		<!-- Loading State -->
		<div v-if="loading" class="flex justify-center py-12">
			<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
		</div>

		<!-- Profile Form -->
		<div v-else class="space-y-6">
			<!-- Avatar Section -->
			<Card class="p-6">
				<div class="flex flex-col items-center">
					<AvatarUpload
						:current-avatar="profile.avatarUrl"
						:display-name="userDisplayName"
						size="xl"
						editable
						:max-size="2048"
						@upload="handleAvatarUpload"
						@remove="handleAvatarRemove"
					/>
				</div>
			</Card>

			<!-- Bio Section -->
			<Card class="p-6">
				<div class="space-y-2">
					<div class="flex items-center justify-between">
						<label class="text-sm font-medium">{{ t('social.bio') }}</label>
						<span class="text-xs text-muted-foreground">{{ bioCount }}</span>
					</div>
					<textarea
						v-model="profile.bio"
						rows="4"
						class="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary resize-none"
						:placeholder="t('social.bioPlaceholder')"
						:maxlength="MAX_BIO_LENGTH"
						@input="updateField"
					></textarea>
				</div>
			</Card>

			<!-- Location Section -->
			<Card class="p-6">
				<div class="space-y-2">
					<div class="flex items-center justify-between">
						<label class="text-sm font-medium">{{ t('social.location') }}</label>
						<span class="text-xs text-muted-foreground">{{ locationCount }}</span>
					</div>
					<input
						v-model="profile.location"
						type="text"
						class="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
						:placeholder="t('social.locationPlaceholder')"
						:maxlength="MAX_LOCATION_LENGTH"
						@input="updateField"
					/>
				</div>
			</Card>

			<!-- Website Section -->
			<Card class="p-6">
				<div class="space-y-2">
					<div class="flex items-center justify-between">
						<label class="text-sm font-medium">{{ t('social.website') }}</label>
						<span class="text-xs text-muted-foreground">{{ websiteCount }}</span>
					</div>
					<input
						v-model="profile.website"
						type="url"
						class="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
						:placeholder="t('social.websitePlaceholder')"
						:maxlength="MAX_WEBSITE_LENGTH"
						@input="updateField"
					/>
				</div>
			</Card>

			<!-- Interests Section -->
			<Card class="p-6">
				<UserTagList
					:tags="profile.interests"
					editable
					variant="interests"
					:max-tags="20"
					:add="handleAddInterest"
					:remove="handleRemoveInterest"
				/>
			</Card>

			<!-- Skills Section -->
			<Card class="p-6">
				<UserTagList
					:tags="profile.skills"
					editable
					variant="skills"
					:max-tags="20"
					:add="handleAddSkill"
					:remove="handleRemoveSkill"
				/>
			</Card>

			<!-- Privacy Settings -->
			<Card class="p-6">
				<h3 class="font-medium mb-4">{{ t('social.privacySettings') }}</h3>

				<div class="space-y-4">
					<div class="flex items-center justify-between">
						<label class="text-sm" for="show-email">{{ t('social.showEmail') }}</label>
						<Switch
							id="show-email"
							:checked="profile.showEmail"
							@update:checked="(val: boolean) => { profile.showEmail = val; updateField(); }"
						/>
					</div>

					<div class="flex items-center justify-between">
						<label class="text-sm" for="show-phone">{{ t('social.showPhone') }}</label>
						<Switch
							id="show-phone"
							:checked="profile.showPhone"
							@update:checked="(val: boolean) => { profile.showPhone = val; updateField(); }"
						/>
					</div>

					<div class="flex items-center justify-between">
						<label class="text-sm" for="show-retreats">{{ t('social.showRetreats') }}</label>
						<Switch
							id="show-retreats"
							:checked="profile.showRetreats"
							@update:checked="(val: boolean) => { profile.showRetreats = val; updateField(); }"
						/>
					</div>
				</div>
			</Card>

			<!-- Testimonials Visibility Settings -->
			<TestimonialsVisibilityConfig />

			<!-- Save Button -->
			<div class="flex justify-end gap-3">
				<Button
					v-if="hasChanges"
					variant="outline"
					@click="loadProfile"
				>
					{{ t('common.actions.cancel') }}
				</Button>
				<Button
					@click="saveProfile"
					:disabled="saving || !hasChanges"
				>
					{{ saving ? t('social.savingProfile') : t('social.saveProfile') }}
				</Button>
			</div>
		</div>
	</div>
</template>
