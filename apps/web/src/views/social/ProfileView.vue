<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import {
	getUserProfile,
	updateUserProfile,
	updateAvatar,
	removeAvatar,
} from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import { useToast } from '@repo/ui';
import { Button } from '@repo/ui';
import { Switch } from '@repo/ui';
import { Card } from '@repo/ui';
import AvatarUpload from '@/components/social/AvatarUpload.vue';
import UserTagList from '@/components/social/UserTagList.vue';
import TestimonialsVisibilityConfig from '@/components/social/TestimonialsVisibilityConfig.vue';
import {
	User as UserIcon,
	Sparkles,
	Shield,
	MapPin,
	Globe,
	Mail,
	CheckCircle2,
	AlertCircle,
	Loader2,
} from 'lucide-vue-next';

const { t } = useI18n();
const { toast } = useToast();
const authStore = useAuthStore();

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
const userEmail = computed(() => authStore.user?.email || '');
const loading = ref(true);
const saving = ref(false);
const hasChanges = ref(false);
const saveStatus = ref<'unchanged' | 'unsaved' | 'saved'>('unchanged');

// Character limits
const MAX_BIO_LENGTH = 500;
const MAX_LOCATION_LENGTH = 100;
const MAX_WEBSITE_LENGTH = 500;

const bioCount = computed(() =>
	t('social.characterLimits.bio', {
		current: profile.value.bio.length,
		max: MAX_BIO_LENGTH,
	}),
);
const locationCount = computed(() =>
	t('social.characterLimits.location', {
		current: profile.value.location.length,
		max: MAX_LOCATION_LENGTH,
	}),
);
const websiteCount = computed(() =>
	t('social.characterLimits.website', {
		current: profile.value.website.length,
		max: MAX_WEBSITE_LENGTH,
	}),
);

const loadProfile = async () => {
	try {
		loading.value = true;
		const data = await getUserProfile();
		if (data) {
			userDisplayName.value = data.user?.displayName || authStore.user?.displayName || '';
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
			hasChanges.value = false;
			saveStatus.value = 'unchanged';
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
	if (!hasChanges.value || saving.value) return;
	try {
		saving.value = true;
		await updateUserProfile(profile.value);
		saveStatus.value = 'saved';
		hasChanges.value = false;
		toast({
			title: t('social.profileUpdated'),
			description: t('social.profileUpdatedDesc'),
		});
		setTimeout(() => {
			if (saveStatus.value === 'saved') {
				saveStatus.value = 'unchanged';
			}
		}, 2500);
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

const discardChanges = () => {
	if (!hasChanges.value) return;
	if (window.confirm(t('social.confirmDiscardChanges'))) {
		loadProfile();
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

const updateField = () => {
	markAsUnsaved();
};

// Keyboard shortcut: Ctrl/Cmd+S
const handleKeydown = (e: KeyboardEvent) => {
	if ((e.ctrlKey || e.metaKey) && e.key === 's') {
		e.preventDefault();
		if (hasChanges.value) saveProfile();
	}
};

// Warn user before leaving with unsaved changes
const handleBeforeUnload = (e: BeforeUnloadEvent) => {
	if (hasChanges.value) {
		e.preventDefault();
		e.returnValue = '';
	}
};

onMounted(() => {
	loadProfile();
	window.addEventListener('keydown', handleKeydown);
	window.addEventListener('beforeunload', handleBeforeUnload);
});

onBeforeUnmount(() => {
	window.removeEventListener('keydown', handleKeydown);
	window.removeEventListener('beforeunload', handleBeforeUnload);
});
</script>

<template>
	<div class="container mx-auto px-4 py-6 md:py-8 max-w-4xl pb-28">
		<!-- Page Header -->
		<div class="mb-6">
			<h1 class="text-2xl md:text-3xl font-bold tracking-tight">
				{{ t('social.myProfile') }}
			</h1>
			<p class="text-sm text-muted-foreground mt-1">
				{{ t('social.editProfile') }}
			</p>
		</div>

		<!-- Loading State -->
		<div v-if="loading" class="flex flex-col items-center justify-center py-20 gap-3">
			<Loader2 class="h-10 w-10 animate-spin text-primary" />
			<p class="text-sm text-muted-foreground">{{ t('social.loadingProfile') }}</p>
		</div>

		<!-- Profile Form -->
		<div v-else class="space-y-6">
			<!-- Hero Card: Avatar + Identity -->
			<Card class="overflow-hidden">
				<div class="relative">
					<!-- Decorative gradient header -->
					<div
						class="h-24 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/5"
					></div>
					<div class="px-6 pb-6 -mt-12">
						<div
							class="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6"
						>
							<AvatarUpload
								:current-avatar="profile.avatarUrl"
								:display-name="userDisplayName"
								size="xl"
								editable
								:max-size="2048"
								@upload="handleAvatarUpload"
								@remove="handleAvatarRemove"
							/>
							<div class="flex-1 min-w-0 sm:pb-2">
								<h2 class="text-xl md:text-2xl font-semibold truncate">
									{{ userDisplayName || '—' }}
								</h2>
								<div
									class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 mt-1 text-sm text-muted-foreground"
								>
									<span
										v-if="userEmail"
										class="inline-flex items-center gap-1.5 truncate"
									>
										<Mail class="h-4 w-4 shrink-0" />
										<span class="truncate">{{ userEmail }}</span>
									</span>
									<span
										v-if="profile.location"
										class="inline-flex items-center gap-1.5 truncate"
									>
										<MapPin class="h-4 w-4 shrink-0" />
										<span class="truncate">{{ profile.location }}</span>
									</span>
								</div>
							</div>
						</div>
					</div>
				</div>
			</Card>

			<!-- Basic Info Section -->
			<Card class="p-6">
				<div class="flex items-start gap-3 mb-5">
					<div
						class="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0"
					>
						<UserIcon class="h-5 w-5" />
					</div>
					<div>
						<h3 class="font-semibold text-base">{{ t('social.basicInfoTitle') }}</h3>
						<p class="text-xs text-muted-foreground mt-0.5">
							{{ t('social.basicInfoDesc') }}
						</p>
					</div>
				</div>

				<div class="space-y-5">
					<!-- Bio -->
					<div class="space-y-1.5">
						<div class="flex items-center justify-between">
							<label for="bio-field" class="text-sm font-medium">
								{{ t('social.bio') }}
							</label>
							<span class="text-xs text-muted-foreground tabular-nums">
								{{ bioCount }}
							</span>
						</div>
						<textarea
							id="bio-field"
							v-model="profile.bio"
							rows="4"
							class="w-full px-3 py-2 border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-none text-sm"
							:placeholder="t('social.bioPlaceholder')"
							:maxlength="MAX_BIO_LENGTH"
							@input="updateField"
						></textarea>
					</div>

					<!-- Location + Website on same row on desktop -->
					<div class="grid grid-cols-1 md:grid-cols-2 gap-5">
						<div class="space-y-1.5">
							<div class="flex items-center justify-between">
								<label for="location-field" class="text-sm font-medium inline-flex items-center gap-1.5">
									<MapPin class="h-3.5 w-3.5" />
									{{ t('social.location') }}
								</label>
								<span class="text-xs text-muted-foreground tabular-nums">
									{{ locationCount }}
								</span>
							</div>
							<input
								id="location-field"
								v-model="profile.location"
								type="text"
								class="w-full px-3 py-2 border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary text-sm"
								:placeholder="t('social.locationPlaceholder')"
								:maxlength="MAX_LOCATION_LENGTH"
								@input="updateField"
							/>
						</div>

						<div class="space-y-1.5">
							<div class="flex items-center justify-between">
								<label for="website-field" class="text-sm font-medium inline-flex items-center gap-1.5">
									<Globe class="h-3.5 w-3.5" />
									{{ t('social.website') }}
								</label>
								<span class="text-xs text-muted-foreground tabular-nums">
									{{ websiteCount }}
								</span>
							</div>
							<input
								id="website-field"
								v-model="profile.website"
								type="url"
								class="w-full px-3 py-2 border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary text-sm"
								:placeholder="t('social.websitePlaceholder')"
								:maxlength="MAX_WEBSITE_LENGTH"
								@input="updateField"
							/>
						</div>
					</div>
				</div>
			</Card>

			<!-- Interests & Skills Section -->
			<Card class="p-6">
				<div class="flex items-start gap-3 mb-5">
					<div
						class="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0"
					>
						<Sparkles class="h-5 w-5" />
					</div>
					<div>
						<h3 class="font-semibold text-base">{{ t('social.tagsTitle') }}</h3>
						<p class="text-xs text-muted-foreground mt-0.5">
							{{ t('social.tagsDesc') }}
						</p>
					</div>
				</div>

				<div class="space-y-6">
					<UserTagList
						:tags="profile.interests"
						editable
						variant="interests"
						:max-tags="20"
						:add="handleAddInterest"
						:remove="handleRemoveInterest"
					/>
					<div class="border-t border-border"></div>
					<UserTagList
						:tags="profile.skills"
						editable
						variant="skills"
						:max-tags="20"
						:add="handleAddSkill"
						:remove="handleRemoveSkill"
					/>
				</div>
			</Card>

			<!-- Privacy Section -->
			<Card class="p-6">
				<div class="flex items-start gap-3 mb-5">
					<div
						class="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0"
					>
						<Shield class="h-5 w-5" />
					</div>
					<div>
						<h3 class="font-semibold text-base">{{ t('social.privacySettings') }}</h3>
						<p class="text-xs text-muted-foreground mt-0.5">
							{{ t('social.privacyDesc') }}
						</p>
					</div>
				</div>

				<div class="divide-y divide-border">
					<div class="flex items-center justify-between gap-4 py-4 first:pt-0">
						<div class="flex-1 min-w-0">
							<label for="show-email" class="text-sm font-medium block">
								{{ t('social.showEmail') }}
							</label>
							<p class="text-xs text-muted-foreground mt-0.5">
								{{ t('social.showEmailDesc') }}
							</p>
						</div>
						<Switch
							id="show-email"
							:model-value="profile.showEmail"
							@update:model-value="(val: boolean) => { profile.showEmail = val; updateField(); }"
						/>
					</div>

					<div class="flex items-center justify-between gap-4 py-4">
						<div class="flex-1 min-w-0">
							<label for="show-phone" class="text-sm font-medium block">
								{{ t('social.showPhone') }}
							</label>
							<p class="text-xs text-muted-foreground mt-0.5">
								{{ t('social.showPhoneDesc') }}
							</p>
						</div>
						<Switch
							id="show-phone"
							:model-value="profile.showPhone"
							@update:model-value="(val: boolean) => { profile.showPhone = val; updateField(); }"
						/>
					</div>

					<div class="flex items-center justify-between gap-4 py-4 last:pb-0">
						<div class="flex-1 min-w-0">
							<label for="show-retreats" class="text-sm font-medium block">
								{{ t('social.showRetreats') }}
							</label>
							<p class="text-xs text-muted-foreground mt-0.5">
								{{ t('social.showRetreatsDesc') }}
							</p>
						</div>
						<Switch
							id="show-retreats"
							:model-value="profile.showRetreats"
							@update:model-value="(val: boolean) => { profile.showRetreats = val; updateField(); }"
						/>
					</div>
				</div>
			</Card>

			<!-- Testimonials Visibility Settings -->
			<TestimonialsVisibilityConfig />
		</div>

		<!-- Sticky Save Bar -->
		<Transition
			enter-active-class="transition ease-out duration-200"
			enter-from-class="translate-y-full opacity-0"
			enter-to-class="translate-y-0 opacity-100"
			leave-active-class="transition ease-in duration-150"
			leave-from-class="translate-y-0 opacity-100"
			leave-to-class="translate-y-full opacity-0"
		>
			<div
				v-if="hasChanges || saveStatus === 'saved'"
				class="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 shadow-lg"
			>
				<div
					class="container mx-auto max-w-4xl px-4 py-3 flex items-center justify-between gap-3"
				>
					<div class="flex items-center gap-2 text-sm min-w-0">
						<template v-if="saveStatus === 'saved'">
							<CheckCircle2 class="h-4 w-4 text-green-600 shrink-0" />
							<span class="text-green-700 dark:text-green-400 truncate">
								{{ t('social.savedLabel') }}
							</span>
						</template>
						<template v-else>
							<AlertCircle class="h-4 w-4 text-amber-500 shrink-0" />
							<span class="text-muted-foreground truncate">
								{{ t('social.unsavedChangesLabel') }}
							</span>
						</template>
					</div>
					<div class="flex items-center gap-2 shrink-0">
						<Button
							v-if="hasChanges"
							variant="ghost"
							size="sm"
							@click="discardChanges"
							:disabled="saving"
						>
							{{ t('social.discardChanges') }}
						</Button>
						<Button
							v-if="hasChanges"
							size="sm"
							@click="saveProfile"
							:disabled="saving"
						>
							<Loader2 v-if="saving" class="h-4 w-4 animate-spin mr-1.5" />
							{{ saving ? t('social.savingProfile') : t('social.saveProfile') }}
						</Button>
					</div>
				</div>
			</div>
		</Transition>
	</div>
</template>
