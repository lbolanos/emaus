import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '@/services/api';
import { formatDate as formatDateTime } from '@repo/utils';

export interface ParticipantCommunication {
	id: string;
	participantId: string;
	retreatId: string;
	messageType: 'whatsapp' | 'email';
	recipientContact: string;
	messageContent: string;
	templateId?: string;
	templateName?: string;
	subject?: string;
	sentAt: string;
	sentBy?: string;
	participant?: {
		id: string;
		firstName: string;
		lastName: string;
	};
	retreat?: {
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

export interface CreateCommunicationData {
	participantId: string;
	retreatId: string;
	messageType: 'whatsapp' | 'email';
	recipientContact: string;
	messageContent: string;
	templateId?: string;
	templateName?: string;
	subject?: string;
}

export interface CommunicationStats {
	totalCommunications: number;
	whatsappCount: number;
	emailCount: number;
	uniqueParticipantsCount: number;
	topTemplates: Array<{
		templateName: string;
		usageCount: number;
	}>;
	recentActivity: Array<{
		date: string;
		count: number;
	}>;
}

export const useParticipantCommunicationStore = defineStore('participant-communication', () => {
	const communications = ref<ParticipantCommunication[]>([]);
	const loading = ref(false);
	const error = ref<string | null>(null);
	const total = ref(0);
	const limit = ref(50);
	const offset = ref(0);

	// Computed properties
	const hasCommunications = computed(() => communications.value.length > 0);
	const isLoading = computed(() => loading.value);

	// Get communications for a specific participant
	const fetchParticipantCommunications = async (
		participantId: string,
		options?: {
			retreatId?: string;
			limit?: number;
			offset?: number;
		},
	) => {
		loading.value = true;
		error.value = null;

		try {
			const params = new URLSearchParams();
			if (options?.retreatId) params.append('retreatId', options.retreatId);
			if (options?.limit) params.append('limit', options.limit.toString());
			if (options?.offset) params.append('offset', options.offset.toString());

			const response = await api.get(
				`/participant-communications/participant/${participantId}?${params.toString()}`,
			);

			communications.value = response.data.communications;
			total.value = response.data.total;
			limit.value = response.data.limit;
			offset.value = response.data.offset;
		} catch (e: any) {
			error.value = e.response?.data?.error || e.message || 'Failed to fetch communications';
			console.error('Error fetching participant communications:', e);
		} finally {
			loading.value = false;
		}
	};

	// Get communications for a specific retreat
	const fetchRetreatCommunications = async (
		retreatId: string,
		options?: {
			participantId?: string;
			messageType?: 'whatsapp' | 'email';
			limit?: number;
			offset?: number;
		},
	) => {
		loading.value = true;
		error.value = null;

		try {
			const params = new URLSearchParams();
			if (options?.participantId) params.append('participantId', options.participantId);
			if (options?.messageType) params.append('messageType', options.messageType);
			if (options?.limit) params.append('limit', options.limit.toString());
			if (options?.offset) params.append('offset', options.offset.toString());

			const response = await api.get(
				`/participant-communications/retreat/${retreatId}?${params.toString()}`,
			);

			communications.value = response.data.communications;
			total.value = response.data.total;
			limit.value = response.data.limit;
			offset.value = response.data.offset;
		} catch (e: any) {
			error.value =
				e.response?.data?.error || e.message || 'Failed to fetch retreat communications';
			console.error('Error fetching retreat communications:', e);
		} finally {
			loading.value = false;
		}
	};

	// Get communication statistics for a retreat
	const fetchRetreatCommunicationStats = async (retreatId: string): Promise<CommunicationStats> => {
		try {
			const response = await api.get(`/participant-communications/retreat/${retreatId}/stats`);
			return response.data;
		} catch (e: any) {
			console.error('Error fetching communication stats:', e);
			throw new Error(e.response?.data?.error || 'Failed to fetch communication statistics');
		}
	};

	// Create a new communication record
	const createCommunication = async (
		data: CreateCommunicationData,
	): Promise<ParticipantCommunication> => {
		loading.value = true;
		error.value = null;

		try {
			const response = await api.post('/participant-communications', data);

			// Add to the beginning of the communications array
			communications.value.unshift(response.data);
			total.value += 1;

			return response.data;
		} catch (e: any) {
			error.value = e.response?.data?.error || e.message || 'Failed to create communication';
			console.error('Error creating communication:', e);
			throw new Error(error.value || 'Unknown error');
		} finally {
			loading.value = false;
		}
	};

	// Delete a communication record
	const deleteCommunication = async (id: string) => {
		loading.value = true;
		error.value = null;

		try {
			await api.delete(`/participant-communications/${id}`);

			// Remove from the communications array
			communications.value = communications.value.filter((c) => c.id !== id);
			total.value -= 1;
		} catch (e: any) {
			error.value = e.response?.data?.error || e.message || 'Failed to delete communication';
			console.error('Error deleting communication:', e);
			throw new Error(error.value || 'Unknown error');
		} finally {
			loading.value = false;
		}
	};

	// Clear communications (useful when switching participants/retreats)
	const clearCommunications = () => {
		communications.value = [];
		total.value = 0;
		limit.value = 50;
		offset.value = 0;
		error.value = null;
	};

	// Format message content for display
	const formatMessageContent = (content: string, maxLength: number = 100): string => {
		// Remove HTML tags for plain text display
		const plainText = content
			.replace(/<[^>]*>/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();
		return plainText.length > maxLength ? plainText.substring(0, maxLength) + '...' : plainText;
	};

	// Format date for display (using shared utility)
	const formatDate = (dateString: string): string => {
		return formatDateTime(dateString, { format: 'datetime' });
	};

	// Get message type label
	const getMessageTypeLabel = (messageType: 'whatsapp' | 'email'): string => {
		return messageType === 'whatsapp' ? 'WhatsApp' : 'Email';
	};

	// Get message type icon
	const getMessageTypeIcon = (messageType: 'whatsapp' | 'email'): string => {
		return messageType === 'whatsapp' ? '📱' : '📧';
	};

	// Get message type color
	const getMessageTypeColor = (messageType: 'whatsapp' | 'email'): string => {
		return messageType === 'whatsapp' ? 'text-green-600' : 'text-blue-600';
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
		fetchParticipantCommunications,
		fetchRetreatCommunications,
		fetchRetreatCommunicationStats,
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
