import axios from 'axios';
import { useToast } from '@repo/ui';
import type {
	TableMesa,
	Community,
	CommunityMember,
	CommunityMeeting,
	CommunityAdmin,
	CommunityAttendance,
	MemberState,
	MessageTemplate,
	Retreat,
} from '@repo/types';
import { setupCsrfInterceptor } from '@/utils/csrf';
import { telemetryService } from './telemetryService';
import { getApiUrl } from '@/config/runtimeConfig';

// Extend axios request config to include metadata
declare module 'axios' {
	interface InternalAxiosRequestConfig {
		metadata?: {
			startTime?: number;
		};
	}
}

// Import type definitions
import type { ImportMetaEnv } from '@/config/vite-env';
declare const import_meta: ImportMeta;

export const api = axios.create({
	baseURL: getApiUrl(),
	withCredentials: true,
	headers: {
		'Content-Type': 'application/json',
	},
});

// Apply CSRF interceptor to this axios instance
setupCsrfInterceptor(api);

// Request interceptor for timing API calls
api.interceptors.request.use(
	(config) => {
		// Add request start time for telemetry
		config.metadata = { startTime: Date.now() };
		return config;
	},
	(error) => {
		return Promise.reject(error);
	},
);

// Response interceptor for telemetry and error handling
api.interceptors.response.use(
	(response) => {
		// Track API call performance
		const startTime = response.config.metadata?.startTime;
		if (startTime && telemetryService.isTelemetryActive()) {
			const duration = Date.now() - startTime;
			telemetryService.trackApiCallTime(response.config.url || 'unknown', duration, true);
		}

		return response;
	},
	(error) => {
		const { toast } = useToast();

		// Track API call performance for failed requests
		const startTime = error.config?.metadata?.startTime;
		if (startTime && telemetryService.isTelemetryActive()) {
			const duration = Date.now() - startTime;
			telemetryService.trackApiCallTime(error.config?.url || 'unknown', duration, false);
		}

		// Track errors for telemetry
		if (telemetryService.isTelemetryActive()) {
			telemetryService.trackError(error, `API call to ${error.config?.url}`);
		}

		if (error.response?.status === 401) {
			// Unauthorized - clear auth state
			//authStore.logout();
			toast({
				title: 'Sesión expirada',
				description: 'Tu sesión ha expirado. Por favor inicia sesión nuevamente.',
				variant: 'destructive',
			});
		} else if (error.response?.status === 403) {
			// Forbidden - permission denied
			toast({
				title: 'Acceso denegado',
				description: 'No tienes permisos para realizar esta acción.',
				variant: 'destructive',
			});
		}

		return Promise.reject(error);
	},
);

export default api;

// TableMesa API functions
export const getTablesByRetreat = async (retreatId: string): Promise<TableMesa[]> => {
	const response = await api.get(`/tables/retreat/${retreatId}`);
	return response.data;
};

export const updateTable = async (
	tableId: string,
	data: Partial<TableMesa>,
): Promise<TableMesa> => {
	const response = await api.put(`/tables/${tableId}`, data);
	return response.data;
};

export const assignLeaderToTable = async (
	tableId: string,
	participantId: string,
	role: 'lider' | 'colider1' | 'colider2',
): Promise<TableMesa> => {
	const response = await api.post(`/tables/${tableId}/leader/${role}`, { participantId });
	return response.data;
};

export const assignWalkerToTable = async (
	tableId: string,
	participantId: string,
): Promise<TableMesa> => {
	const response = await api.post(`/tables/${tableId}/walkers`, { participantId });
	return response.data;
};

export const unassignLeader = async (
	tableId: string,
	role: 'lider' | 'colider1' | 'colider2',
): Promise<TableMesa> => {
	const response = await api.delete(`/tables/${tableId}/leader/${role}`);
	return response.data;
};

export const unassignWalker = async (tableId: string, walkerId: string): Promise<TableMesa> => {
	const response = await api.delete(`/tables/${tableId}/walkers/${walkerId}`);
	return response.data;
};

export const exportTablesToDocx = async (retreatId: string): Promise<void> => {
	const response = await api.post(
		`/tables/export/${retreatId}`,
		{},
		{
			responseType: 'blob',
		},
	);

	// Create a download link for the file
	const url = window.URL.createObjectURL(
		new Blob([response.data], {
			type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		}),
	);
	const link = document.createElement('a');
	link.href = url;
	link.setAttribute('download', `mesas-retiro-${retreatId}.docx`);
	document.body.appendChild(link);
	link.click();
	link.remove();
	window.URL.revokeObjectURL(url);
};

export const exportRoomLabelsToDocx = async (retreatId: string): Promise<void> => {
	const response = await api.post(
		`/retreats/${retreatId}/export-room-labels`,
		{},
		{
			responseType: 'blob',
		},
	);

	// Create a download link for the file
	const url = window.URL.createObjectURL(
		new Blob([response.data], {
			type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		}),
	);
	const link = document.createElement('a');
	link.href = url;
	link.setAttribute('download', `etiquetas-habitaciones-${retreatId}.docx`);
	document.body.appendChild(link);
	link.click();
	link.remove();
	window.URL.revokeObjectURL(url);
};

export const exportBadgesToDocx = async (retreatId: string): Promise<void> => {
	const response = await api.post(
		`/retreats/${retreatId}/export-badges`,
		{},
		{
			responseType: 'blob',
		},
	);

	// Create a download link for the file
	const url = window.URL.createObjectURL(
		new Blob([response.data], {
			type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		}),
	);
	const link = document.createElement('a');
	link.href = url;
	link.setAttribute('download', `gafetes-participantes-${retreatId}.docx`);
	document.body.appendChild(link);
	link.click();
	link.remove();
	window.URL.revokeObjectURL(url);
};

// Retreat Role Management API functions
export const getRetreatUsers = async (retreatId: string) => {
	const response = await api.get(`/retreat-roles/retreat/${retreatId}/users`);
	return response.data;
};

export const inviteUserToRetreat = async (
	retreatId: string,
	data: {
		email: string;
		roleName: string;
		expiresAt?: Date;
		message?: string;
	},
) => {
	const response = await api.post(`/retreat-roles/retreat/${retreatId}/invite`, data);
	return response.data;
};

export const removeUserFromRetreat = async (retreatId: string, userId: string) => {
	const response = await api.delete(`/retreat-roles/retreat/${retreatId}/users/${userId}`);
	return response.data;
};

export const updateUserRetreatRole = async (
	retreatId: string,
	userId: string,
	data: {
		roleId: number;
		expiresAt?: Date;
	},
) => {
	const response = await api.put(`/retreat-roles/retreat/${retreatId}/users/${userId}`, data);
	return response.data;
};

// Role Request API functions
export const getRoleRequests = async (retreatId?: string) => {
	const url = retreatId ? `/role-requests/retreat/${retreatId}` : '/role-requests';
	const response = await api.get(url);
	return response.data;
};

export const createRoleRequest = async (data: {
	retreatId: string;
	requestedRole: string;
	message?: string;
}) => {
	const response = await api.post('/role-requests', data);
	return response.data;
};

export const updateRoleRequest = async (
	requestId: string,
	data: {
		status: 'approved' | 'rejected';
		rejectionReason?: string;
	},
) => {
	const response = await api.put(`/role-requests/${requestId}`, data);
	return response.data;
};

export const getUserRoleRequests = async () => {
	const response = await api.get('/role-requests/user');
	return response.data;
};

// Permission Override API functions
export const setPermissionOverrides = async (
	retreatId: string,
	userId: string,
	data: {
		overrides: Array<{
			resource: string;
			operation: string;
			granted: boolean;
			reason?: string;
			expiresAt?: Date;
		}>;
		reason?: string;
	},
) => {
	const response = await api.post(
		`/permission-overrides/retreats/${retreatId}/users/${userId}/overrides`,
		data,
	);
	return response.data;
};

export const getPermissionOverrides = async (retreatId: string, userId: string) => {
	const response = await api.get(
		`/permission-overrides/retreats/${retreatId}/users/${userId}/overrides`,
	);
	return response.data;
};

export const clearPermissionOverrides = async (retreatId: string, userId: string) => {
	const response = await api.delete(
		`/permission-overrides/retreats/${retreatId}/users/${userId}/overrides`,
	);
	return response.data;
};

export const getRetreatPermissionOverrides = async (retreatId: string) => {
	const response = await api.get(`/permission-overrides/retreats/${retreatId}/overrides`);
	return response.data;
};

export const getUserEffectivePermissions = async (retreatId: string, userId: string) => {
	const response = await api.get(
		`/permission-overrides/retreats/${retreatId}/users/${userId}/effective-permissions`,
	);
	return response.data;
};

// RBAC Management API functions
export const getRetreatUsersWithFilters = async (
	retreatId: string,
	options?: {
		role?: string;
		status?: string;
		limit?: number;
		offset?: number;
	},
) => {
	const params = new URLSearchParams();
	if (options?.role) params.append('role', options.role);
	if (options?.status) params.append('status', options.status);
	if (options?.limit) params.append('limit', options.limit.toString());
	if (options?.offset) params.append('offset', options.offset.toString());

	const response = await api.get(`/retreat-roles/${retreatId}/users?${params.toString()}`);
	return response.data;
};

export const assignRetreatRole = async (data: {
	userId: string;
	retreatId: string;
	roleId: number;
	invitedBy?: string;
	expiresAt?: Date;
}) => {
	const response = await api.post('/retreat-roles', data);
	return response.data;
};

export const revokeRetreatRole = async (retreatId: string, userId: string, roleId: number) => {
	const response = await api.delete(`/retreat-roles/${retreatId}/users/${userId}`, {
		data: { roleId },
	});
	return response.data;
};

export const getUserRetreatPermissions = async (retreatId: string, userId: string) => {
	const response = await api.get(`/retreat-roles/${retreatId}/users/${userId}/permissions`);
	return response.data;
};

export const getAvailableRoles = async () => {
	const response = await api.get('/roles');
	return response.data;
};

export const getAvailablePermissions = async () => {
	const response = await api.get('/permissions');
	return response.data;
};

// Permission Delegation API functions
export const delegatePermissions = async (data: {
	fromUserId: string;
	toUserId: string;
	retreatId: string;
	permissions: string[];
	expiresAt: Date;
}) => {
	const response = await api.post('/permission-delegations', data);
	return response.data;
};

export const getPermissionDelegations = async (retreatId: string) => {
	const response = await api.get(`/permission-delegations/${retreatId}`);
	return response.data;
};

export const revokePermissionDelegation = async (delegationId: string) => {
	const response = await api.delete(`/permission-delegations/${delegationId}`);
	return response.data;
};

// Audit Log API functions
export const getAuditLogs = async (
	retreatId: string,
	options?: {
		actionType?: string;
		resourceType?: string;
		targetUserId?: string;
		limit?: number;
		offset?: number;
		startDate?: string;
		endDate?: string;
	},
) => {
	const params = new URLSearchParams();
	if (options?.actionType) params.append('actionType', options.actionType);
	if (options?.resourceType) params.append('resourceType', options.resourceType);
	if (options?.targetUserId) params.append('targetUserId', options.targetUserId);
	if (options?.limit) params.append('limit', options.limit.toString());
	if (options?.offset) params.append('offset', options.offset.toString());
	if (options?.startDate) params.append('startDate', options.startDate);
	if (options?.endDate) params.append('endDate', options.endDate);

	const response = await api.get(`/audit/retreat/${retreatId}?${params.toString()}`);
	return response.data;
};

export const getUserAuditLogs = async (
	userId: string,
	options?: {
		retreatId?: string;
		limit?: number;
		offset?: number;
	},
) => {
	const params = new URLSearchParams();
	if (options?.retreatId) params.append('retreatId', options.retreatId);
	if (options?.limit) params.append('limit', options.limit.toString());
	if (options?.offset) params.append('offset', options.offset.toString());

	const response = await api.get(`/audit/user/${userId}?${params.toString()}`);
	return response.data;
};

export const getAuditStats = async (
	retreatId: string,
	options?: {
		startDate?: string;
		endDate?: string;
	},
) => {
	const params = new URLSearchParams();
	if (options?.startDate) params.append('startDate', options.startDate);
	if (options?.endDate) params.append('endDate', options.endDate);

	const response = await api.get(`/audit/retreat/${retreatId}/stats?${params.toString()}`);
	return response.data;
};

// Payment API functions
export const createPayment = async (paymentData: any) => {
	const response = await api.post('/payments', paymentData);
	return response.data;
};

export const getPayments = async (filters?: {
	retreatId?: string;
	participantId?: string;
	startDate?: string;
	endDate?: string;
	paymentMethod?: string;
}) => {
	const params = new URLSearchParams();
	if (filters?.retreatId) params.append('retreatId', filters.retreatId);
	if (filters?.participantId) params.append('participantId', filters.participantId);
	if (filters?.startDate) params.append('startDate', filters.startDate);
	if (filters?.endDate) params.append('endDate', filters.endDate);
	if (filters?.paymentMethod) params.append('paymentMethod', filters.paymentMethod);

	const response = await api.get(`/payments?${params.toString()}`);
	return response.data;
};

export const getPaymentById = async (paymentId: string) => {
	const response = await api.get(`/payments/${paymentId}`);
	return response.data;
};

export const updatePayment = async (paymentId: string, paymentData: any) => {
	const response = await api.put(`/payments/${paymentId}`, paymentData);
	return response.data;
};

export const deletePayment = async (paymentId: string) => {
	const response = await api.delete(`/payments/${paymentId}`);
	return response.data;
};

export const getPaymentsByParticipant = async (participantId: string) => {
	const response = await api.get(`/payments/participant/${participantId}`);
	return response.data;
};

export const getPaymentsByRetreat = async (retreatId: string) => {
	const response = await api.get(`/payments/retreat/${retreatId}`);
	return response.data;
};

export const getPaymentSummaryByRetreat = async (retreatId: string) => {
	const response = await api.get(`/payments/retreat/${retreatId}/summary`);
	return response.data;
};

// Participant API functions
export const getWalkersByRetreat = async (retreatId: string): Promise<any[]> => {
	const response = await api.get('/participants', {
		params: {
			retreatId,
			type: 'walker',
		},
	});
	return response.data;
};

export const getParticipantsByRetreat = async (
	retreatId: string,
	type?: 'walker' | 'server' | 'waiting' | 'partial_server' | undefined,
): Promise<any[]> => {
	const params: Record<string, string> = { retreatId };
	if (type) {
		params.type = type;
	}
	const response = await api.get('/participants', { params });
	return response.data;
};

export const getPotentialMembersFromRetreat = async (
	communityId: string,
	retreatId: string,
): Promise<any[]> => {
	const response = await api.get(`/communities/${communityId}/members/potential`, {
		params: { retreatId },
	});
	return response.data;
};

export const getParticipantById = async (participantId: string) => {
	const response = await api.get(`/participants/${participantId}`);
	return response.data;
};

// Email API functions
export const getSmtpConfig = async () => {
	const response = await api.get('/participant-communications/email/config');
	return response.data;
};

export const sendEmailViaBackend = async (data: {
	to: string;
	subject: string;
	html: string;
	text?: string;
	participantId: string;
	retreatId: string;
	templateId?: string;
	templateName?: string;
}) => {
	const response = await api.post('/participant-communications/email/send', data);
	return response.data;
};

export const sendTestEmail = async (to: string) => {
	const response = await api.post('/participant-communications/email/test', { to });
	return response.data;
};

export const verifySmtpConnection = async () => {
	const response = await api.post('/participant-communications/email/verify');
	return response.data;
};

// Community Communication API functions
export const sendCommunityEmailViaBackend = async (data: {
	to: string;
	subject: string;
	html: string;
	text?: string;
	communityMemberId: string;
	communityId: string;
	templateId?: string;
	templateName?: string;
}) => {
	const response = await api.post('/community-communications/email/send', data);
	return response.data;
};

// Telemetry API functions
export const getTelemetryHealth = async () => {
	const response = await api.get('/telemetry/health');
	return response.data;
};

export const getAggregatedMetrics = async (startDate: string, endDate: string) => {
	const response = await api.get('/telemetry/metrics/aggregated', {
		params: { startDate, endDate },
	});
	return response.data;
};

export const getBusinessMetrics = async (startDate: string, endDate: string) => {
	const response = await api.get('/telemetry/business', {
		params: { startDate, endDate },
	});
	return response.data;
};

export const getUserBehaviorMetrics = async (startDate: string, endDate: string) => {
	const response = await api.get('/telemetry/user-behavior', {
		params: { startDate, endDate },
	});
	return response.data;
};

export const getSystemHealthMetrics = async (startDate: string, endDate: string) => {
	const response = await api.get('/telemetry/system-health', {
		params: { startDate, endDate },
	});
	return response.data;
};

export const getMetricsTimeSeries = async (
	metricType: string,
	startDate: string,
	endDate: string,
	interval: 'hour' | 'day' | 'week' | 'month' = 'hour',
) => {
	const response = await api.get('/telemetry/metrics/timeseries', {
		params: { metricType, startDate, endDate, interval },
	});
	return response.data;
};

export const cleanupTelemetryData = async (retentionDays: number = 90) => {
	const response = await api.post('/telemetry/cleanup', { retentionDays });
	return response.data;
};

// Tag API functions
export const getAllTags = async (retreatId?: string) => {
	const params = retreatId ? { retreatId } : {};
	const response = await api.get('/tags', { params });
	return response.data;
};

export const getTagById = async (tagId: string) => {
	const response = await api.get(`/tags/${tagId}`);
	return response.data;
};

export const createTag = async (
	tagData: { name: string; color?: string; description?: string },
	retreatId: string,
) => {
	const response = await api.post('/tags', { ...tagData, retreatId });
	return response.data;
};

export const updateTag = async (
	tagId: string,
	tagData: { name?: string; color?: string; description?: string },
	retreatId: string,
) => {
	const response = await api.put(`/tags/${tagId}`, { ...tagData, retreatId });
	return response.data;
};

export const deleteTag = async (tagId: string, retreatId: string) => {
	const response = await api.delete(`/tags/${tagId}`, {
		params: { retreatId },
	});
	return response.data;
};

export const getParticipantTags = async (participantId: string) => {
	const response = await api.get(`/tags/participant/${participantId}`);
	return response.data;
};

export const assignTagToParticipant = async (participantId: string, tagId: string) => {
	const response = await api.post(`/tags/participant/${participantId}/${tagId}`);
	return response.data;
};

export const removeTagFromParticipant = async (participantId: string, tagId: string) => {
	const response = await api.delete(`/tags/participant/${participantId}/${tagId}`);
	return response.data;
};

export const checkTagConflict = async (leaderIds: string[], walkerIds: string[]) => {
	const response = await api.post('/tags/check-conflict', { leaderIds, walkerIds });
	return response.data;
};

// Community API functions

export async function getCommunities(): Promise<Community[]> {
	const response = await api.get('/communities');
	return response.data;
}

export async function getCommunityById(id: string): Promise<Community> {
	const response = await api.get(`/communities/${id}`);
	return response.data;
}

export async function createCommunity(data: any): Promise<Community> {
	const response = await api.post('/communities', data);
	return response.data;
}

export async function updateCommunity(id: string, data: any): Promise<Community> {
	const response = await api.put(`/communities/${id}`, data);
	return response.data;
}

export async function deleteCommunity(id: string): Promise<void> {
	await api.delete(`/communities/${id}`);
}

export async function getCommunityMembers(
	communityId: string,
	state?: string,
): Promise<CommunityMember[]> {
	const response = await api.get(`/communities/${communityId}/members`, {
		params: { state },
	});
	return response.data;
}

export async function addCommunityMember(
	communityId: string,
	participantId: string,
): Promise<CommunityMember> {
	const response = await api.post(`/communities/${communityId}/members`, { participantId });
	return response.data;
}

export async function createCommunityMember(
	communityId: string,
	participantData: { firstName: string; lastName: string; email: string; cellPhone: string },
): Promise<CommunityMember> {
	const response = await api.post(`/communities/${communityId}/members/create`, participantData);
	return response.data;
}

export async function importMembersFromRetreat(
	communityId: string,
	retreatId: string,
	participantIds: string[],
): Promise<CommunityMember[]> {
	const response = await api.post(`/communities/${communityId}/members/import`, {
		retreatId,
		participantIds,
	});
	return response.data;
}

export async function updateCommunityMemberState(
	communityId: string,
	memberId: string,
	state: string,
): Promise<CommunityMember> {
	const response = await api.put(`/communities/${communityId}/members/${memberId}`, { state });
	return response.data;
}

export async function removeCommunityMember(communityId: string, memberId: string): Promise<void> {
	await api.delete(`/communities/${communityId}/members/${memberId}`);
}

export async function getCommunityMeetings(communityId: string): Promise<CommunityMeeting[]> {
	const response = await api.get(`/communities/${communityId}/meetings`);
	return response.data;
}

export async function createCommunityMeeting(
	communityId: string,
	data: any,
): Promise<CommunityMeeting> {
	const response = await api.post(`/communities/${communityId}/meetings`, data);
	return response.data;
}

export async function updateCommunityMeeting(
	meetingId: string,
	data: any,
	scope: 'this' | 'all' | 'all_future' = 'this',
): Promise<CommunityMeeting | CommunityMeeting[]> {
	const response = await api.put(`/communities/meetings/${meetingId}?scope=${scope}`, data);
	return response.data;
}

export async function deleteCommunityMeeting(
	meetingId: string,
	scope: 'this' | 'all' | 'all_future' = 'this',
): Promise<void> {
	await api.delete(`/communities/meetings/${meetingId}?scope=${scope}`);
}

export async function createNextMeetingInstance(meetingId: string): Promise<CommunityMeeting> {
	const response = await api.post(`/communities/meetings/${meetingId}/next-instance`);
	return response.data;
}

export async function getCommunityAttendance(
	communityId: string,
	meetingId: string,
): Promise<CommunityAttendance[]> {
	const response = await api.get(`/communities/${communityId}/meetings/${meetingId}/attendance`);
	return response.data;
}

export async function recordCommunityAttendance(
	communityId: string,
	meetingId: string,
	records: any[],
): Promise<CommunityAttendance[]> {
	const response = await api.post(
		`/communities/${communityId}/meetings/${meetingId}/attendance`,
		records,
	);
	return response.data;
}

export async function recordSingleCommunityAttendance(
	communityId: string,
	meetingId: string,
	memberId: string,
	attended: boolean,
): Promise<CommunityAttendance> {
	const response = await api.post(
		`/communities/${communityId}/meetings/${meetingId}/attendance/single`,
		{ memberId, attended },
	);
	return response.data;
}

export async function getCommunityDashboardStats(communityId: string): Promise<any> {
	const response = await api.get(`/communities/${communityId}/dashboard`);
	return response.data;
}

// Public API functions
export async function getPublicRetreats(): Promise<Retreat[]> {
	const response = await api.get('/retreats/public');
	return response.data;
}

export async function getPublicCommunities(): Promise<Community[]> {
	const response = await api.get('/communities/public');
	return response.data;
}

export async function getPublicCommunityMeetings(): Promise<CommunityMeeting[]> {
	const response = await api.get('/communities/public/meetings');
	return response.data;
}

// Public join request (no auth required, uses fetch directly)
export async function publicCommunityJoinRequest(
	communityId: string,
	data: { firstName: string; lastName: string; email: string; cellPhone?: string },
): Promise<CommunityMember> {
	const response = await fetch(`/api/communities/${communityId}/join-public`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		credentials: 'include',
		body: JSON.stringify(data),
	});

	if (!response.ok) {
		let errorMessage = 'Failed to submit join request';
		try {
			const error = await response.json();
			errorMessage = error.message || errorMessage;
		} catch {
			errorMessage = `Server error: ${response.status} ${response.statusText}`;
		}
		throw new Error(errorMessage);
	}

	return response.json();
}

export async function getCommunityAdmins(communityId: string): Promise<CommunityAdmin[]> {
	const response = await api.get(`/communities/${communityId}/admins`);
	return response.data;
}

export async function inviteCommunityAdmin(
	communityId: string,
	email: string,
): Promise<CommunityAdmin> {
	const response = await api.post(`/communities/${communityId}/admins/invite`, { email });
	return response.data;
}

export async function getCommunityInvitationStatus(token: string): Promise<any> {
	const response = await api.get(`/communities/invitations/status/${token}`);
	return response.data;
}

export async function acceptCommunityInvitation(token: string): Promise<CommunityAdmin> {
	const response = await api.post('/communities/invitations/accept', { token });
	return response.data;
}

export async function revokeCommunityAdmin(communityId: string, userId: string): Promise<void> {
	await api.delete(`/communities/${communityId}/admins/${userId}`);
}

export async function updateMemberNotes(
	communityId: string,
	memberId: string,
	notes: string | null,
): Promise<CommunityMember> {
	const response = await api.patch(`/communities/${communityId}/members/${memberId}/notes`, {
		notes,
	});
	return response.data;
}

export async function getMemberTimeline(communityId: string, memberId: string): Promise<any> {
	const response = await api.get(`/communities/${communityId}/members/${memberId}/timeline`);
	return response.data;
}

// Community Message Template API functions
export async function getCommunityMessageTemplates(
	communityId: string,
): Promise<MessageTemplate[]> {
	const response = await api.get(`/message-templates/community/${communityId}`);
	return response.data;
}

export async function createCommunityMessageTemplate(
	communityId: string,
	templateData: Omit<MessageTemplate, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<MessageTemplate> {
	const response = await api.post(`/message-templates/community/${communityId}`, templateData);
	return response.data;
}

export async function updateCommunityMessageTemplate(
	communityId: string,
	id: string,
	templateData: Partial<MessageTemplate>,
): Promise<MessageTemplate> {
	const response = await api.put(`/message-templates/community/${communityId}/${id}`, templateData);
	return response.data;
}

export async function deleteCommunityMessageTemplate(
	communityId: string,
	id: string,
): Promise<void> {
	await api.delete(`/message-templates/community/${communityId}/${id}`);
}

// Newsletter API functions
export async function subscribeToNewsletter(email: string): Promise<{
	id: string;
	email: string;
	isActive: boolean;
	subscribedAt: string;
	alreadySubscribed?: boolean;
}> {
	const response = await api.post('/newsletter/subscribe', { email });
	return response.data;
}

// Password change API function
export async function changePassword(currentPassword: string | undefined, newPassword: string): Promise<{
	message: string;
}> {
	const response = await api.post('/auth/password/change', {
		...(currentPassword !== undefined && { currentPassword }),
		newPassword
	});
	return response.data;
}

// Get auth status (includes whether user has password)
export async function getAuthStatus(): Promise<any> {
	const response = await api.get('/auth/status');
	return response.data;
}
