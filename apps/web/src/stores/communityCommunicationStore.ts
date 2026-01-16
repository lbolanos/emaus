import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '@/services/api';
import { formatDate as formatDateTime } from '@repo/utils';

export interface CommunityCommunication {
	id: string;
	communityMemberId: string;
	communityId: string;
	messageType: 'whatsapp' | 'email';
	recipientContact: string;
	messageContent: string;
	templateId?: string;
	templateName?: string;
	subject?: string;
	sentAt: string;
	sentBy?: string;
	communityMember?: {
		id: string;
		participant: {
			id: string;
			firstName: string;
			lastName: string;
		};
	};
	community?: {
		id: string;
		name: string;
	};
	template?: {
		id: string;
		name: string;
		type: string;
	};
	sender?: {
		id: string;
		email: string;
	};
}

export interface CreateCommunityCommunicationData {
	communityMemberId: string;
	communityId: string;
	messageType: 'whatsapp' | 'email';
	recipientContact: string;
	messageContent: string;
	templateId?: string;
	templateName?: string;
	subject?: string;
}

export interface CommunityCommunicationStats {
	totalCommunications: number;
	whatsappCount: number;
	emailCount: number;
	uniqueMembersCount: number;
	topTemplates: Array<{
		templateName: string;
		usageCount: number;
	}>;
	recentActivity: Array<{
		date: string;
		count: number;
	}>;
}

export const useCommunityCommunicationStore = defineStore('community-communication', () => {
	const communications = ref<CommunityCommunication[]>([]);
	const loading = ref(false);
	const error = ref<string | null>(null);
	const total = ref(0);
	const limit = ref(50);
	const offset = ref(0);

	// Computed properties
	const hasCommunications = computed(() => communications.value.length > 0);
	const isLoading = computed(() => loading.value);

	// Get communications for a specific community member
	const fetchMemberCommunications = async (
		memberId: string,
		options?: {
			communityId?: string;
			limit?: number;
			offset?: number;
		},
	) => {
		loading.value = true;
		error.value = null;

		try {
			const params: Record<string, string | number> = {
				limit: options?.limit || limit.value,
				offset: options?.offset || offset.value,
			};

			if (options?.communityId) {
				params.communityId = options.communityId;
			}

			const response = await api.get(`/community-communications/member/${memberId}`, { params });
			communications.value = response.data.communications || [];
			total.value = response.data.total || 0;
			return response.data;
		} catch (err: any) {
			error.value = err.response?.data?.message || err.message || 'Failed to fetch communications';
			throw err;
		} finally {
			loading.value = false;
		}
	};

	// Get communications for a community
	const fetchCommunityCommunications = async (
		communityId: string,
		options?: {
			limit?: number;
			offset?: number;
			messageType?: 'whatsapp' | 'email';
		},
	) => {
		loading.value = true;
		error.value = null;

		try {
			const params: Record<string, string | number> = {
				limit: options?.limit || limit.value,
				offset: options?.offset || offset.value,
			};

			if (options?.messageType) {
				params.messageType = options.messageType;
			}

			const response = await api.get(`/community-communications/community/${communityId}`, { params });
			communications.value = response.data.communications || [];
			total.value = response.data.total || 0;
			return response.data;
		} catch (err: any) {
			error.value = err.response?.data?.message || err.message || 'Failed to fetch communications';
			throw err;
		} finally {
			loading.value = false;
		}
	};

	// Create a new communication record
	const createCommunication = async (
		data: CreateCommunityCommunicationData,
	): Promise<CommunityCommunication> => {
		loading.value = true;
		error.value = null;

		try {
			const response = await api.post('/community-communications', data);

			// Add to the beginning of the communications array
			communications.value.unshift(response.data);
			total.value += 1;

			return response.data;
		} catch (err: any) {
			error.value = err.response?.data?.message || err.message || 'Failed to create communication';
			throw err;
		} finally {
			loading.value = false;
		}
	};

	// Delete a communication
	const deleteCommunication = async (id: string) => {
		loading.value = true;
		error.value = null;

		try {
			await api.delete(`/community-communications/${id}`);

			// Remove from local state
			const index = communications.value.findIndex((c) => c.id === id);
			if (index > -1) {
				communications.value.splice(index, 1);
				total.value = Math.max(0, total.value - 1);
			}
		} catch (err: any) {
			error.value = err.response?.data?.message || err.message || 'Failed to delete communication';
			throw err;
		} finally {
			loading.value = false;
		}
	};

	// Clear all communications
	const clearCommunications = () => {
		communications.value = [];
		total.value = 0;
		error.value = null;
	};

	// Format message content for display
	const formatMessageContent = (content: string, maxLength = 100) => {
		if (!content) return '';
		const stripped = content.replace(/<[^>]*>/g, '');
		return stripped.length > maxLength ? stripped.substring(0, maxLength) + '...' : stripped;
	};

	// Format date for display (using shared utility)
	const formatDate = (dateString: string) => {
		return formatDateTime(dateString, { format: 'datetime', locale: undefined });
	};

	// Get message type label
	const getMessageTypeLabel = (type: 'whatsapp' | 'email') => {
		return type === 'whatsapp' ? 'WhatsApp' : 'Email';
	};

	// Get message type icon
	const getMessageTypeIcon = (type: 'whatsapp' | 'email') => {
		return type === 'whatsapp' ? '📱' : '📧';
	};

	// Get message type color
	const getMessageTypeColor = (type: 'whatsapp' | 'email') => {
		return type === 'whatsapp' ? 'text-green-600' : 'text-blue-600';
	};

	return {
		// State
		communications,
		loading,
		error,
		total,
		limit,
		offset,

		// Computed
		hasCommunications,
		isLoading,

		// Actions
		fetchMemberCommunications,
		fetchCommunityCommunications,
		createCommunication,
		deleteCommunication,
		clearCommunications,

		// Utilities
		formatMessageContent,
		formatDate,
		getMessageTypeLabel,
		getMessageTypeIcon,
		getMessageTypeColor,
	};
});
