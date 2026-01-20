<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { searchUsers } from '@/services/api';
import { useToast } from '@repo/ui';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Button,
	Input,
} from '@repo/ui';
import { ChevronDown, Filter, X, Search } from 'lucide-vue-next';
import UserCard from '@/components/social/UserCard.vue';
import EmptyState from '@/components/social/EmptyState.vue';
import UserCardSkeleton from '@/components/social/UserCardSkeleton.vue';
import type { SearchFilters, SortOption } from '@/types/social';

const router = useRouter();
const { t } = useI18n();
const { toast } = useToast();

const query = ref('');
const results = ref<any[]>([]);
const loading = ref(false);
const hasSearched = ref(false);

// Filter state
const filtersOpen = ref(false);
const selectedInterests = ref<string[]>([]);
const selectedSkills = ref<string[]>([]);
const selectedLocation = ref('');
const selectedRetreatId = ref('');
const selectedParticipantType = ref<'all' | 'walker' | 'server'>('all');
const sortOption = ref<SortOption>('relevance');

// Available options (in a real app, these would come from an API)
const availableInterests = ref<string[]>([]);
const availableSkills = ref<string[]>([]);
const availableRetreats = ref<Array<{ id: string; name: string }>>([]);

const hasActiveFilters = computed(() => {
	return (
		selectedInterests.value.length > 0 ||
		selectedSkills.value.length > 0 ||
		selectedLocation.value ||
		selectedRetreatId.value ||
		selectedParticipantType.value !== 'all'
	);
});

const clearFilters = () => {
	selectedInterests.value = [];
	selectedSkills.value = [];
	selectedLocation.value = '';
	selectedRetreatId.value = '';
	selectedParticipantType.value = 'all';
};

const removeInterest = (interest: string) => {
	const index = selectedInterests.value.indexOf(interest);
	if (index > -1) {
		selectedInterests.value.splice(index, 1);
	}
};

const removeSkill = (skill: string) => {
	const index = selectedSkills.value.indexOf(skill);
	if (index > -1) {
		selectedSkills.value.splice(index, 1);
	}
};

const buildFilters = (): SearchFilters => ({
	interests: selectedInterests.value.length > 0 ? selectedInterests.value : undefined,
	skills: selectedSkills.value.length > 0 ? selectedSkills.value : undefined,
	location: selectedLocation.value || undefined,
	retreatId: selectedRetreatId.value || undefined,
	participantType: selectedParticipantType.value === 'all' ? undefined : selectedParticipantType.value,
});

const handleSearch = async () => {
	if (!query.value.trim()) {
		toast({
			title: t('common.error'),
			description: 'Por favor ingresa un término de búsqueda',
			variant: 'destructive',
		});
		return;
	}

	try {
		loading.value = true;
		hasSearched.value = true;
		const filters = buildFilters();
		results.value = await searchUsers(query.value, filters);
	} catch (error: any) {
		toast({
			title: t('common.error'),
			description: error.message || 'No se pudo buscar usuarios',
			variant: 'destructive',
		});
	} finally {
		loading.value = false;
	}
};

const handleClick = (user: any) => {
	router.push(`/app/profile/${user.id}`);
};

const handleAction = async (action: string, data?: unknown) => {
	const userId = (data as { userId: string })?.userId;
	if (!userId) return;

	// Handle friend/follow actions through the parent
	if (action === 'sendFriendRequest') {
		// Navigate to user's profile or implement the action
		router.push(`/app/profile/${userId}`);
	}
};
</script>

<template>
	<div class="container mx-auto px-4 py-8 max-w-5xl">
		<!-- Header -->
		<div class="mb-6">
			<h1 class="text-3xl font-bold">{{ t('social.searchUsers') }}</h1>
			<p class="text-muted-foreground mt-1">
				{{ t('social.searchUsersDesc') }}
			</p>
		</div>

		<!-- Search Box -->
		<div class="flex gap-2 mb-4">
			<div class="relative flex-1">
				<Search class="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
				<Input
					v-model="query"
					type="text"
					class="pl-10"
					:placeholder="t('social.searchPlaceholder')"
					@keyup.enter="handleSearch"
				/>
			</div>
			<Button @click="handleSearch" :disabled="loading">
				{{ loading ? t('social.searching') : t('social.search') }}
			</Button>
			<Button
				variant="outline"
				@click="filtersOpen = !filtersOpen"
				class="relative"
			>
				<Filter class="w-4 h-4 mr-2" />
				{{ t('social.filters.title') }}
				<span
					v-if="hasActiveFilters"
					class="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full"
				></span>
			</Button>
		</div>

		<!-- Active Filters -->
		<div v-if="hasActiveFilters" class="flex flex-wrap gap-2 mb-4">
			<span
				v-for="interest in selectedInterests"
				:key="`interest-${interest}`"
				class="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-full text-sm"
			>
				{{ interest }}
				<button @click="removeInterest(interest)" class="hover:text-destructive">
					<X class="w-3 h-3" />
				</button>
			</span>
			<span
				v-for="skill in selectedSkills"
				:key="`skill-${skill}`"
				class="inline-flex items-center gap-1 px-2 py-1 bg-secondary text-secondary-foreground rounded-full text-sm"
			>
				{{ skill }}
				<button @click="removeSkill(skill)" class="hover:text-destructive">
					<X class="w-3 h-3" />
				</button>
			</span>
			<span v-if="selectedLocation" class="inline-flex items-center gap-1 px-2 py-1 bg-secondary text-secondary-foreground rounded-full text-sm">
				{{ selectedLocation }}
				<button @click="selectedLocation = ''" class="hover:text-destructive">
					<X class="w-3 h-3" />
				</button>
			</span>
			<span v-if="selectedParticipantType !== 'all'" class="inline-flex items-center gap-1 px-2 py-1 bg-secondary text-secondary-foreground rounded-full text-sm">
				{{ selectedParticipantType === 'walker' ? t('social.filters.typeWalker') : t('social.filters.typeServer') }}
				<button @click="selectedParticipantType = 'all'" class="hover:text-destructive">
					<X class="w-3 h-3" />
				</button>
			</span>
			<button
				v-if="hasActiveFilters"
				@click="clearFilters"
				class="text-sm text-muted-foreground hover:text-foreground underline"
			>
				{{ t('social.filters.clearFilters') }}
			</button>
		</div>

		<!-- Filters Panel -->
		<div v-if="filtersOpen" class="mb-6 p-4 border border-border rounded-lg bg-card space-y-4">
			<!-- Interests Filter -->
			<div class="space-y-2">
				<label class="text-sm font-medium">{{ t('social.filters.interests') }}</label>
				<Input
					v-model="selectedInterests"
					type="text"
					:placeholder="t('social.filters.selectInterests')"
					@update:model-value="(val: string) => { if (typeof val === 'string') selectedInterests = val.split(',').map((s: string) => s.trim()).filter(Boolean); }"
				/>
				<p class="text-xs text-muted-foreground">
					{{ t('social.filters.separateInterests') }}
				</p>
			</div>

			<!-- Skills Filter -->
			<div class="space-y-2">
				<label class="text-sm font-medium">{{ t('social.filters.skills') }}</label>
				<Input
					v-model="selectedSkills"
					type="text"
					:placeholder="t('social.filters.selectSkills')"
					@update:model-value="(val: string) => { if (typeof val === 'string') selectedSkills = val.split(',').map((s: string) => s.trim()).filter(Boolean); }"
				/>
				<p class="text-xs text-muted-foreground">
					{{ t('social.filters.separateSkills') }}
				</p>
			</div>

			<!-- Location Filter -->
			<div class="space-y-2">
				<label class="text-sm font-medium">{{ t('social.filters.location') }}</label>
				<Input
					v-model="selectedLocation"
					type="text"
					:placeholder="t('social.filters.locationPlaceholder')"
				/>
			</div>

			<!-- Participant Type Filter -->
			<div class="space-y-2">
				<label class="text-sm font-medium">{{ t('social.filters.participantType') }}</label>
				<Select v-model="selectedParticipantType">
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">{{ t('social.filters.allTypes') }}</SelectItem>
						<SelectItem value="walker">{{ t('social.filters.typeWalker') }}</SelectItem>
						<SelectItem value="server">{{ t('social.filters.typeServer') }}</SelectItem>
					</SelectContent>
				</Select>
			</div>

			<!-- Sort Option -->
			<div class="space-y-2">
				<label class="text-sm font-medium">{{ t('social.sort.title') }}</label>
				<Select v-model="sortOption">
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="relevance">{{ t('social.sort.relevance') }}</SelectItem>
						<SelectItem value="nameAsc">{{ t('social.sort.nameAsc') }}</SelectItem>
						<SelectItem value="nameDesc">{{ t('social.sort.nameDesc') }}</SelectItem>
						<SelectItem value="location">{{ t('social.sort.location') }}</SelectItem>
					</SelectContent>
				</Select>
			</div>

			<!-- Apply Filters Button -->
			<Button @click="handleSearch" class="w-full">
				{{ t('social.filters.applyFilters') }}
			</Button>
		</div>

		<!-- Loading State -->
		<div v-if="loading" class="space-y-3">
			<UserCardSkeleton
				v-for="i in 5"
				:key="i"
				:show-actions="true"
			/>
		</div>

		<!-- Results -->
		<div v-else-if="hasSearched" class="space-y-4">
			<div v-if="results.length === 0" class="py-8">
				<EmptyState type="no-results" />
			</div>
			<div v-else class="grid gap-4 md:grid-cols-2">
				<UserCard
					v-for="result in results"
					:key="result.user.id"
					:user="result.user"
					:profile="result.profile"
					:participant="result.participant"
					:friendship="{
						status: result.friendship?.status || 'none',
						isFriend: result.isFriend || false,
						isPending: result.friendship?.status === 'pending',
						isSentRequest: false
					}"
					:is-following="result.isFollowing"
					:mutual-friends="result.mutualFriendsCount"
					variant="detailed"
					show-actions
					clickable
					@click="handleClick"
					@action="handleAction"
				/>
			</div>
		</div>

		<!-- Initial State -->
		<div v-else class="py-12 text-center">
			<Search class="w-16 h-16 text-muted-foreground mx-auto mb-4" />
			<h2 class="text-xl font-semibold mb-2">{{ t('social.searchUsers') }}</h2>
			<p class="text-muted-foreground mb-6">
				{{ t('social.searchInitial') }}
			</p>
		</div>
	</div>
</template>
