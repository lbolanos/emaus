import axios from 'axios';
import { useToast } from '@repo/ui';
import type { TableMesa } from '@repo/types';
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
			telemetryService.trackApiCallTime(
				response.config.url || 'unknown',
				duration,
				true,
			);
		}

		return response;
	},
	(error) => {
		const { toast } = useToast();

		// Track API call performance for failed requests
		const startTime = error.config?.metadata?.startTime;
		if (startTime && telemetryService.isTelemetryActive()) {
			const duration = Date.now() - startTime;
			telemetryService.trackApiCallTime(
				error.config?.url || 'unknown',
				duration,
				false,
			);
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
