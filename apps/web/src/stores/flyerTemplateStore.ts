import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { Community, FlyerTemplate } from '@repo/types';
import {
	createFlyerTemplate,
	deleteFlyerTemplate,
	getCommunities,
	getFlyerTemplates,
	updateFlyerTemplate,
} from '@/services/api';

export const useFlyerTemplateStore = defineStore('flyerTemplate', () => {
	const templates = ref<FlyerTemplate[]>([]);
	/** Communities the user administers — the ones a template can be shared with. */
	const communities = ref<Community[]>([]);
	const loading = ref(false);
	const saving = ref(false);

	const canShareWithCommunity = computed(() => communities.value.length > 0);

	async function load() {
		loading.value = true;
		try {
			// Both lists are needed before the panel can offer the community scope
			const [loaded, myCommunities] = await Promise.all([
				getFlyerTemplates(),
				getCommunities().catch(() => [] as Community[]),
			]);
			templates.value = loaded;
			communities.value = myCommunities;
		} finally {
			loading.value = false;
		}
	}

	async function create(payload: {
		name: string;
		scope: 'personal' | 'community';
		communityId?: string | null;
		layout: Record<string, any>;
	}) {
		saving.value = true;
		try {
			const created = await createFlyerTemplate(payload);
			templates.value = [created, ...templates.value];
			return created;
		} finally {
			saving.value = false;
		}
	}

	async function rename(id: string, name: string) {
		const updated = await updateFlyerTemplate(id, { name });
		templates.value = templates.value.map((t) => (t.id === id ? updated : t));
		return updated;
	}

	/** Overwrites a template's design with the current draft. */
	async function overwrite(id: string, layout: Record<string, any>) {
		saving.value = true;
		try {
			const updated = await updateFlyerTemplate(id, { layout });
			templates.value = templates.value.map((t) => (t.id === id ? updated : t));
			return updated;
		} finally {
			saving.value = false;
		}
	}

	async function remove(id: string) {
		await deleteFlyerTemplate(id);
		templates.value = templates.value.filter((t) => t.id !== id);
	}

	function communityName(communityId?: string | null) {
		if (!communityId) return '';
		return communities.value.find((c) => c.id === communityId)?.name ?? '';
	}

	return {
		templates,
		communities,
		loading,
		saving,
		canShareWithCommunity,
		load,
		create,
		rename,
		overwrite,
		remove,
		communityName,
	};
});
