import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { MessageTemplate } from '@repo/types';

export const useCommunityMessageTemplateStore = defineStore('community-message-template', () => {
	const templates = ref<MessageTemplate[]>([]);
	const loading = ref(false);
	const error = ref<string | null>(null);

	const fetchTemplates = async (communityId: string) => {
		loading.value = true;
		error.value = null;
		try {
			const { api } = await import('../services/api');
			const response = await api.get(`/message-templates/community/${communityId}`);
			templates.value = response.data;
			return response.data;
		} catch (e: any) {
			error.value = e.message || 'Failed to fetch community templates';
			throw e;
		} finally {
			loading.value = false;
		}
	};

	const createTemplate = async (
		communityId: string,
		templateData: Omit<MessageTemplate, 'id' | 'createdAt' | 'updatedAt'>,
	) => {
		loading.value = true;
		error.value = null;
		try {
			const { api } = await import('../services/api');
			const response = await api.post(`/message-templates/community/${communityId}`, templateData);
			templates.value.push(response.data);
			return response.data;
		} catch (e: any) {
			error.value = e.message || 'Failed to create community template';
			throw e;
		} finally {
			loading.value = false;
		}
	};

	const updateTemplate = async (
		communityId: string,
		id: string,
		templateData: Partial<MessageTemplate>,
	) => {
		loading.value = true;
		error.value = null;
		try {
			const { api } = await import('../services/api');
			const response = await api.put(
				`/message-templates/community/${communityId}/${id}`,
				templateData,
			);
			const index = templates.value.findIndex((t) => t.id === id);
			if (index !== -1) {
				templates.value[index] = response.data;
			}
			return response.data;
		} catch (e: any) {
			error.value = e.message || 'Failed to update community template';
			throw e;
		} finally {
			loading.value = false;
		}
	};

	const deleteTemplate = async (communityId: string, id: string) => {
		loading.value = true;
		error.value = null;
		try {
			const { api } = await import('../services/api');
			await api.delete(`/message-templates/community/${communityId}/${id}`);
			templates.value = templates.value.filter((t) => t.id !== id);
			return true;
		} catch (e: any) {
			error.value = e.message || 'Failed to delete community template';
			throw e;
		} finally {
			loading.value = false;
		}
	};

	return {
		templates,
		loading,
		error,
		fetchTemplates,
		createTemplate,
		updateTemplate,
		deleteTemplate,
	};
});
