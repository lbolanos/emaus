import axios from "axios";
import { useToast } from "@repo/ui";
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
  Participant,
} from "@repo/types";
import { setupCsrfInterceptor } from "@/utils/csrf";
import { getApiUrl } from "@/config/runtimeConfig";

// Extend axios request config to include metadata
declare module "axios" {
  interface InternalAxiosRequestConfig {
    metadata?: {
      startTime?: number;
    };
  }
}

// Import type definitions
import type { ImportMetaEnv } from "@/config/vite-env";
declare const import_meta: ImportMeta;

export const api = axios.create({
  baseURL: getApiUrl(),
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

// Apply CSRF interceptor to this axios instance
setupCsrfInterceptor(api);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    // Handle rotated CSRF token
    const newToken = response.headers["x-csrf-token-new"];
    if (newToken) {
      sessionStorage.setItem("csrfToken", newToken);
    }

    return response;
  },
  (error) => {
    const { toast } = useToast();

    if (error.response?.status === 401) {
      // Unauthorized - clear auth state
      //authStore.logout();
      toast({
        title: "Sesión expirada",
        description:
          "Tu sesión ha expirado. Por favor inicia sesión nuevamente.",
        variant: "destructive",
      });
    }
    // 403 errors are handled individually by stores/components to avoid toast spam

    return Promise.reject(error);
  },
);

export default api;

// TableMesa API functions
export const getTablesByRetreat = async (
  retreatId: string,
): Promise<TableMesa[]> => {
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
  role: "lider" | "colider1" | "colider2",
): Promise<TableMesa> => {
  const response = await api.post(`/tables/${tableId}/leader/${role}`, {
    participantId,
  });
  return response.data;
};

export const assignWalkerToTable = async (
  tableId: string,
  participantId: string,
): Promise<TableMesa> => {
  const response = await api.post(`/tables/${tableId}/walkers`, {
    participantId,
  });
  return response.data;
};

export const unassignLeader = async (
  tableId: string,
  role: "lider" | "colider1" | "colider2",
): Promise<TableMesa> => {
  const response = await api.delete(`/tables/${tableId}/leader/${role}`);
  return response.data;
};

export const unassignWalker = async (
  tableId: string,
  walkerId: string,
): Promise<TableMesa> => {
  const response = await api.delete(`/tables/${tableId}/walkers/${walkerId}`);
  return response.data;
};

export const clearAllTables = async (retreatId: string): Promise<void> => {
  await api.post(`/tables/clear-all/${retreatId}`);
};

export const exportTablesToDocx = async (retreatId: string): Promise<void> => {
  const response = await api.post(
    `/tables/export/${retreatId}`,
    {},
    {
      responseType: "blob",
    },
  );

  // Create a download link for the file
  const url = window.URL.createObjectURL(
    new Blob([response.data], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `mesas-retiro-${retreatId}.docx`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

// Vision Assignment API functions
export interface AssignmentProposal {
  idOnRetreat: number;
  participantId: string | null;
  participantName: string | null;
  tableName: string;
  tableId: string | null;
  valid: boolean;
  error?: string;
}

export interface AnalysisResult {
  proposals: AssignmentProposal[];
  unreadable: Array<{ description: string; possibleId?: number }>;
  notes: string;
}

export interface ExecutionResult {
  idOnRetreat: number;
  participantName: string;
  tableName: string;
  success: boolean;
  error?: string;
}

export const analyzeLotteryPhoto = async (
  retreatId: string,
  imageBase64: string,
  contentType: string,
): Promise<AnalysisResult> => {
  const response = await api.post("/vision-assignment/analyze", {
    imageBase64,
    contentType,
    retreatId,
  });
  return response.data;
};

export const executeLotteryAssignments = async (
  retreatId: string,
  assignments: Array<{
    participantId: string;
    tableId: string;
    idOnRetreat: number;
    participantName: string;
    tableName: string;
  }>,
): Promise<{ results: ExecutionResult[] }> => {
  const response = await api.post("/vision-assignment/execute", {
    retreatId,
    assignments,
  });
  return response.data;
};

// Service Teams API functions
import type { ServiceTeam } from "@repo/types";

export const getServiceTeamsByRetreat = async (
  retreatId: string,
): Promise<ServiceTeam[]> => {
  const response = await api.get(`/service-teams/retreat/${retreatId}`);
  return response.data;
};

export const createServiceTeam = async (data: any): Promise<ServiceTeam> => {
  const response = await api.post("/service-teams", data);
  return response.data;
};

export const updateServiceTeam = async (
  id: string,
  data: any,
): Promise<ServiceTeam> => {
  const response = await api.put(`/service-teams/${id}`, data);
  return response.data;
};

export const deleteServiceTeam = async (id: string): Promise<void> => {
  await api.delete(`/service-teams/${id}`);
};

export const addServiceTeamMember = async (
  teamId: string,
  participantId: string,
  role?: string,
  sourceTeamId?: string,
): Promise<ServiceTeam> => {
  const response = await api.post(`/service-teams/${teamId}/members`, {
    participantId,
    role,
    sourceTeamId,
  });
  return response.data;
};

export const removeServiceTeamMember = async (
  teamId: string,
  participantId: string,
): Promise<ServiceTeam> => {
  const response = await api.delete(
    `/service-teams/${teamId}/members/${participantId}`,
  );
  return response.data;
};

export const assignServiceTeamLeader = async (
  teamId: string,
  participantId: string,
  sourceTeamId?: string,
): Promise<ServiceTeam> => {
  const response = await api.put(`/service-teams/${teamId}/leader`, {
    participantId,
    sourceTeamId,
  });
  return response.data;
};

export const unassignServiceTeamLeader = async (
  teamId: string,
): Promise<ServiceTeam> => {
  const response = await api.delete(`/service-teams/${teamId}/leader`);
  return response.data;
};

export const initializeDefaultServiceTeams = async (
  retreatId: string,
): Promise<ServiceTeam[]> => {
  const response = await api.post(`/service-teams/initialize/${retreatId}`);
  return response.data;
};

export const exportServiceTeamsToDocx = async (
  retreatId: string,
): Promise<void> => {
  const response = await api.post(
    `/service-teams/export/${retreatId}`,
    {},
    { responseType: "blob" },
  );
  const url = window.URL.createObjectURL(
    new Blob([response.data], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `equipos-servicio-${retreatId}.docx`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

export const exportResponsibilitiesToDocx = async (
  retreatId: string,
): Promise<void> => {
  const response = await api.post(
    `/responsibilities/export/${retreatId}`,
    {},
    { responseType: "blob" },
  );
  const url = window.URL.createObjectURL(
    new Blob([response.data], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `responsabilidades-${retreatId}.docx`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

export const searchSpeakers = async (query: string, retreatId: string) => {
  const response = await api.get("/responsibilities/search-speakers", {
    params: { q: query, retreatId },
  });
  return response.data;
};

export const getPalanqueroOptions = async (
  retreatId: string,
): Promise<{ value: string; label: string }[]> => {
  const response = await api.get("/responsibilities/palanquero-options", {
    params: { retreatId },
  });
  return response.data;
};

export const getResponsibilityDocumentation = async (
  name: string,
): Promise<{ name: string; markdown: string } | null> => {
  try {
    const response = await api.get("/responsibilities/documentation", {
      params: { name },
    });
    return response.data;
  } catch (err: any) {
    if (err?.response?.status === 404) return null;
    throw err;
  }
};

export const listResponsibilityDocumentationKeys = async (): Promise<{
  charlas: string[];
  responsibilities: string[];
}> => {
  const response = await api.get("/responsibilities/documentation/keys");
  return response.data;
};

export const createAndAssignSpeaker = async (
  responsabilityId: string,
  data: {
    firstName: string;
    lastName: string;
    cellPhone?: string;
    email?: string;
    retreatId: string;
  },
) => {
  const response = await api.post(
    `/responsibilities/${responsabilityId}/create-speaker`,
    data,
  );
  return response.data;
};

export const refreshRetreatBedsFromHouse = async (
  retreatId: string,
): Promise<void> => {
  await api.post(`/retreats/${retreatId}/refresh-beds`, {});
};

export const exportRoomLabelsToDocx = async (
  retreatId: string,
): Promise<void> => {
  const response = await api.post(
    `/retreats/${retreatId}/export-room-labels`,
    {},
    {
      responseType: "blob",
    },
  );

  // Create a download link for the file
  const url = window.URL.createObjectURL(
    new Blob([response.data], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `etiquetas-habitaciones-${retreatId}.docx`);
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
      responseType: "blob",
    },
  );

  // Create a download link for the file
  const url = window.URL.createObjectURL(
    new Blob([response.data], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `gafetes-participantes-${retreatId}.docx`);
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
  const response = await api.post(
    `/retreat-roles/retreat/${retreatId}/invite`,
    data,
  );
  return response.data;
};

export const removeUserFromRetreat = async (
  retreatId: string,
  userId: string,
) => {
  const response = await api.delete(
    `/retreat-roles/retreat/${retreatId}/users/${userId}`,
  );
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
  const response = await api.put(
    `/retreat-roles/retreat/${retreatId}/users/${userId}`,
    data,
  );
  return response.data;
};

// Role Request API functions
export const getRoleRequests = async (retreatId?: string) => {
  const url = retreatId
    ? `/role-requests/retreat/${retreatId}`
    : "/role-requests";
  const response = await api.get(url);
  return response.data;
};

export const createRoleRequest = async (data: {
  retreatId: string;
  requestedRole: string;
  message?: string;
}) => {
  const response = await api.post("/role-requests", data);
  return response.data;
};

export const updateRoleRequest = async (
  requestId: string,
  data: {
    status: "approved" | "rejected";
    rejectionReason?: string;
  },
) => {
  const response = await api.put(`/role-requests/${requestId}`, data);
  return response.data;
};

export const getUserRoleRequests = async () => {
  const response = await api.get("/role-requests/user");
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

export const getPermissionOverrides = async (
  retreatId: string,
  userId: string,
) => {
  const response = await api.get(
    `/permission-overrides/retreats/${retreatId}/users/${userId}/overrides`,
  );
  return response.data;
};

export const clearPermissionOverrides = async (
  retreatId: string,
  userId: string,
) => {
  const response = await api.delete(
    `/permission-overrides/retreats/${retreatId}/users/${userId}/overrides`,
  );
  return response.data;
};

export const getRetreatPermissionOverrides = async (retreatId: string) => {
  const response = await api.get(
    `/permission-overrides/retreats/${retreatId}/overrides`,
  );
  return response.data;
};

export const getUserEffectivePermissions = async (
  retreatId: string,
  userId: string,
) => {
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
  if (options?.role) params.append("role", options.role);
  if (options?.status) params.append("status", options.status);
  if (options?.limit) params.append("limit", options.limit.toString());
  if (options?.offset) params.append("offset", options.offset.toString());

  const response = await api.get(
    `/retreat-roles/${retreatId}/users?${params.toString()}`,
  );
  return response.data;
};

export const assignRetreatRole = async (data: {
  userId: string;
  retreatId: string;
  roleId: number;
  invitedBy?: string;
  expiresAt?: Date;
}) => {
  const response = await api.post("/retreat-roles", data);
  return response.data;
};

export const revokeRetreatRole = async (
  retreatId: string,
  userId: string,
  roleId: number,
) => {
  const response = await api.delete(
    `/retreat-roles/${retreatId}/users/${userId}`,
    {
      data: { roleId },
    },
  );
  return response.data;
};

export const getUserRetreatPermissions = async (
  retreatId: string,
  userId: string,
) => {
  const response = await api.get(
    `/retreat-roles/${retreatId}/users/${userId}/permissions`,
  );
  return response.data;
};

export const getAvailableRoles = async () => {
  const response = await api.get("/roles");
  return response.data;
};

export const getAvailablePermissions = async () => {
  const response = await api.get("/permissions");
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
  const response = await api.post("/permission-delegations", data);
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
  if (options?.actionType) params.append("actionType", options.actionType);
  if (options?.resourceType)
    params.append("resourceType", options.resourceType);
  if (options?.targetUserId)
    params.append("targetUserId", options.targetUserId);
  if (options?.limit) params.append("limit", options.limit.toString());
  if (options?.offset) params.append("offset", options.offset.toString());
  if (options?.startDate) params.append("startDate", options.startDate);
  if (options?.endDate) params.append("endDate", options.endDate);

  const response = await api.get(
    `/audit/retreat/${retreatId}?${params.toString()}`,
  );
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
  if (options?.retreatId) params.append("retreatId", options.retreatId);
  if (options?.limit) params.append("limit", options.limit.toString());
  if (options?.offset) params.append("offset", options.offset.toString());

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
  if (options?.startDate) params.append("startDate", options.startDate);
  if (options?.endDate) params.append("endDate", options.endDate);

  const response = await api.get(
    `/audit/retreat/${retreatId}/stats?${params.toString()}`,
  );
  return response.data;
};

// Payment API functions
export const createPayment = async (paymentData: any) => {
  const response = await api.post("/payments", paymentData);
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
  if (filters?.retreatId) params.append("retreatId", filters.retreatId);
  if (filters?.participantId)
    params.append("participantId", filters.participantId);
  if (filters?.startDate) params.append("startDate", filters.startDate);
  if (filters?.endDate) params.append("endDate", filters.endDate);
  if (filters?.paymentMethod)
    params.append("paymentMethod", filters.paymentMethod);

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
export const getWalkersByRetreat = async (
  retreatId: string,
): Promise<any[]> => {
  const response = await api.get("/participants", {
    params: {
      retreatId,
      type: "walker",
    },
  });
  return response.data;
};

export const getParticipantsByRetreat = async (
  retreatId: string,
  type?: "walker" | "server" | "waiting" | "partial_server" | undefined,
): Promise<Participant[]> => {
  const params: Record<string, string> = { retreatId };
  if (type) {
    params.type = type;
  }
  const response = await api.get("/participants", { params });
  return response.data;
};

export const getPotentialMembersFromRetreat = async (
  communityId: string,
  retreatId: string,
): Promise<any[]> => {
  const response = await api.get(
    `/communities/${communityId}/members/potential`,
    {
      params: { retreatId },
    },
  );
  return response.data;
};

export const getParticipantById = async (participantId: string) => {
  const response = await api.get(`/participants/${participantId}`);
  return response.data;
};

export async function updateBagMade(
  retreatId: string,
  participantId: string,
  bagMade: boolean,
): Promise<void> {
  await api.patch(
    `/history/retreat/${retreatId}/participant/${participantId}/bag-made`,
    { bagMade },
  );
}

/**
 * Check if a participant exists by email (for server registration flow)
 * Returns existence status and participant details if found
 */
export const checkParticipantExists = async (
  email: string,
  recaptchaToken?: string,
  retreatId?: string,
): Promise<{
  exists: boolean;
  firstName?: string;
  lastName?: string;
  message?: string;
  registeredInRetreat?: boolean;
  registeredType?: "walker" | "server" | "waiting" | "partial_server";
  registeredGroup?: "walker" | "server";
  alreadyRegisteredMessage?: string;
}> => {
  const params: Record<string, string> = {};
  if (recaptchaToken != null) params.recaptchaToken = recaptchaToken;
  if (retreatId) params.retreatId = retreatId;
  const response = await api.get(
    `/participants/check-email/${encodeURIComponent(email)}`,
    {
      params: Object.keys(params).length > 0 ? params : undefined,
    },
  );
  return response.data;
};

export const confirmExistingRegistration = async (
  email: string,
  retreatId: string,
  type: string,
  recaptchaToken: string,
  shirtSizes?: { shirtTypeId: string; size: string }[],
): Promise<{ success: boolean; firstName: string; lastName: string }> => {
  const response = await api.post("/participants/confirm-registration", {
    email,
    retreatId,
    type,
    recaptchaToken,
    shirtSizes,
  });
  return response.data;
};

// Public self-service data deletion (GDPR/LFPDPPP)
export const getParticipantByDeleteToken = async (
  token: string,
): Promise<{
  firstName: string;
  lastName: string;
  email: string;
  retreatName: string | null;
}> => {
  const response = await api.get(
    `/participants/delete-data/${encodeURIComponent(token)}`,
  );
  return response.data;
};

export const deleteParticipantByDeleteToken = async (
  token: string,
): Promise<{ success: boolean }> => {
  const response = await api.post(
    `/participants/delete-data/${encodeURIComponent(token)}`,
  );
  return response.data;
};

// Email API functions
export const getSmtpConfig = async () => {
  const response = await api.get("/participant-communications/email/config");
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
  const response = await api.post(
    "/participant-communications/email/send",
    data,
  );
  return response.data;
};

export const sendTestEmail = async (to: string) => {
  const response = await api.post("/participant-communications/email/test", {
    to,
  });
  return response.data;
};

export const verifySmtpConnection = async () => {
  const response = await api.post("/participant-communications/email/verify");
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
  const response = await api.post("/community-communications/email/send", data);
  return response.data;
};

// Telemetry API functions
export const getTelemetryHealth = async () => {
  const response = await api.get("/telemetry/health");
  return response.data;
};

export const getAggregatedMetrics = async (
  startDate: string,
  endDate: string,
) => {
  const response = await api.get("/telemetry/metrics/aggregated", {
    params: { startDate, endDate },
  });
  return response.data;
};

export const getBusinessMetrics = async (
  startDate: string,
  endDate: string,
) => {
  const response = await api.get("/telemetry/business", {
    params: { startDate, endDate },
  });
  return response.data;
};

export const getUserBehaviorMetrics = async (
  startDate: string,
  endDate: string,
) => {
  const response = await api.get("/telemetry/user-behavior", {
    params: { startDate, endDate },
  });
  return response.data;
};

export const getSystemHealthMetrics = async (
  startDate: string,
  endDate: string,
) => {
  const response = await api.get("/telemetry/system-health", {
    params: { startDate, endDate },
  });
  return response.data;
};

export const getMetricsTimeSeries = async (
  metricType: string,
  startDate: string,
  endDate: string,
  interval: "hour" | "day" | "week" | "month" = "hour",
) => {
  const response = await api.get("/telemetry/metrics/timeseries", {
    params: { metricType, startDate, endDate, interval },
  });
  return response.data;
};

export const cleanupTelemetryData = async (retentionDays: number = 90) => {
  const response = await api.post("/telemetry/cleanup", { retentionDays });
  return response.data;
};

// Tag API functions
export const getAllTags = async (retreatId?: string) => {
  const params = retreatId ? { retreatId } : {};
  const response = await api.get("/tags", { params });
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
  const response = await api.post("/tags", { ...tagData, retreatId });
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

export const assignTagToParticipant = async (
  participantId: string,
  tagId: string,
) => {
  const response = await api.post(
    `/tags/participant/${participantId}/${tagId}`,
  );
  return response.data;
};

export const removeTagFromParticipant = async (
  participantId: string,
  tagId: string,
) => {
  const response = await api.delete(
    `/tags/participant/${participantId}/${tagId}`,
  );
  return response.data;
};

export const checkTagConflict = async (
  leaderIds: string[],
  walkerIds: string[],
) => {
  const response = await api.post("/tags/check-conflict", {
    leaderIds,
    walkerIds,
  });
  return response.data;
};

// Community API functions

export async function getCommunities(): Promise<Community[]> {
  const response = await api.get("/communities");
  return response.data;
}

export async function getCommunityById(id: string): Promise<Community> {
  const response = await api.get(`/communities/${id}`);
  return response.data;
}

export async function createCommunity(data: any): Promise<Community> {
  const response = await api.post("/communities", data);
  return response.data;
}

export async function updateCommunity(
  id: string,
  data: any,
): Promise<Community> {
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
  const response = await api.post(`/communities/${communityId}/members`, {
    participantId,
  });
  return response.data;
}

export async function createCommunityMember(
  communityId: string,
  participantData: {
    firstName: string;
    lastName: string;
    email: string;
    cellPhone: string;
  },
): Promise<CommunityMember> {
  const response = await api.post(
    `/communities/${communityId}/members/create`,
    participantData,
  );
  return response.data;
}

export async function importMembersFromRetreat(
  communityId: string,
  retreatId: string,
  participantIds: string[],
): Promise<CommunityMember[]> {
  const response = await api.post(
    `/communities/${communityId}/members/import`,
    {
      retreatId,
      participantIds,
    },
  );
  return response.data;
}

export async function updateCommunityMemberState(
  communityId: string,
  memberId: string,
  state: string,
): Promise<CommunityMember> {
  const response = await api.put(
    `/communities/${communityId}/members/${memberId}`,
    { state },
  );
  return response.data;
}

export async function removeCommunityMember(
  communityId: string,
  memberId: string,
): Promise<void> {
  await api.delete(`/communities/${communityId}/members/${memberId}`);
}

export async function getCommunityMeetings(
  communityId: string,
): Promise<CommunityMeeting[]> {
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
  scope: "this" | "all" | "all_future" = "this",
): Promise<CommunityMeeting | CommunityMeeting[]> {
  const response = await api.put(
    `/communities/meetings/${meetingId}?scope=${scope}`,
    data,
  );
  return response.data;
}

export async function deleteCommunityMeeting(
  meetingId: string,
  scope: "this" | "all" | "all_future" = "this",
): Promise<void> {
  await api.delete(`/communities/meetings/${meetingId}?scope=${scope}`);
}

export async function createNextMeetingInstance(
  meetingId: string,
): Promise<CommunityMeeting & { isPastDate?: boolean }> {
  const response = await api.post(
    `/communities/meetings/${meetingId}/next-instance`,
  );
  return response.data;
}

export async function getCommunityAttendance(
  communityId: string,
  meetingId: string,
): Promise<CommunityAttendance[]> {
  const response = await api.get(
    `/communities/${communityId}/meetings/${meetingId}/attendance`,
  );
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

export async function getCommunityDashboardStats(
  communityId: string,
): Promise<any> {
  const response = await api.get(`/communities/${communityId}/dashboard`);
  return response.data;
}

// Public API functions
export async function getPublicRetreats(): Promise<Retreat[]> {
  const response = await api.get("/retreats/public");
  return response.data;
}

export async function getPublicCommunities(): Promise<Community[]> {
  const response = await api.get("/communities/public");
  return response.data;
}

export async function getPublicCommunityMeetings(): Promise<
  CommunityMeeting[]
> {
  const response = await api.get("/communities/public/meetings");
  return response.data;
}

// Public join request (no auth required, uses fetch directly)
export async function publicCommunityJoinRequest(
  communityId: string,
  data: {
    firstName: string;
    lastName: string;
    email: string;
    cellPhone?: string;
    recaptchaToken?: string;
  },
): Promise<CommunityMember> {
  const response = await fetch(`/api/communities/${communityId}/join-public`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    let errorMessage = "Failed to submit join request";
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

export interface PublicRegisterCommunityInput {
  name: string;
  description?: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  latitude: number;
  longitude: number;
  googleMapsUrl?: string;
  parish?: string;
  diocese?: string;
  website?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  defaultMeetingDayOfWeek?: string;
  defaultMeetingInterval?: number;
  defaultMeetingTime?: string;
  defaultMeetingDurationMinutes?: number;
  defaultMeetingDescription?: string;
  recaptchaToken: string;
}

// Public community registration (no auth required, uses fetch directly)
export async function publicRegisterCommunity(
  data: PublicRegisterCommunityInput,
): Promise<{ id: string; status: string; message: string }> {
  const response = await fetch(`/api/communities/public/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    let errorMessage = "Failed to register community";
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

export async function listPendingCommunities(): Promise<Community[]> {
  const response = await api.get(`/communities/pending`);
  return response.data;
}

export async function approveCommunity(id: string): Promise<Community> {
  const response = await api.post(`/communities/${id}/approve`);
  return response.data;
}

export async function rejectCommunity(
  id: string,
  rejectionReason?: string,
): Promise<Community> {
  const response = await api.post(`/communities/${id}/reject`, {
    rejectionReason,
  });
  return response.data;
}

export async function getCommunityAdmins(
  communityId: string,
): Promise<CommunityAdmin[]> {
  const response = await api.get(`/communities/${communityId}/admins`);
  return response.data;
}

export async function inviteCommunityAdmin(
  communityId: string,
  email: string,
): Promise<CommunityAdmin> {
  const response = await api.post(`/communities/${communityId}/admins/invite`, {
    email,
  });
  return response.data;
}

export async function getCommunityInvitationStatus(
  token: string,
): Promise<any> {
  const response = await api.get(`/communities/invitations/status/${token}`);
  return response.data;
}

export async function acceptCommunityInvitation(
  token: string,
  recaptchaToken?: string,
): Promise<CommunityAdmin> {
  const response = await api.post("/communities/invitations/accept", {
    token,
    recaptchaToken,
  });
  return response.data;
}

export async function revokeCommunityAdmin(
  communityId: string,
  userId: string,
): Promise<void> {
  await api.delete(`/communities/${communityId}/admins/${userId}`);
}

export async function updateMemberNotes(
  communityId: string,
  memberId: string,
  notes: string | null,
): Promise<CommunityMember> {
  const response = await api.patch(
    `/communities/${communityId}/members/${memberId}/notes`,
    {
      notes,
    },
  );
  return response.data;
}

export async function getMemberTimeline(
  communityId: string,
  memberId: string,
): Promise<any> {
  const response = await api.get(
    `/communities/${communityId}/members/${memberId}/timeline`,
  );
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
  templateData: Omit<MessageTemplate, "id" | "createdAt" | "updatedAt">,
): Promise<MessageTemplate> {
  const response = await api.post(
    `/message-templates/community/${communityId}`,
    templateData,
  );
  return response.data;
}

export async function updateCommunityMessageTemplate(
  communityId: string,
  id: string,
  templateData: Partial<MessageTemplate>,
): Promise<MessageTemplate> {
  const response = await api.put(
    `/message-templates/community/${communityId}/${id}`,
    templateData,
  );
  return response.data;
}

export async function deleteCommunityMessageTemplate(
  communityId: string,
  id: string,
): Promise<void> {
  await api.delete(`/message-templates/community/${communityId}/${id}`);
}

// Newsletter API functions
export async function subscribeToNewsletter(
  email: string,
  recaptchaToken?: string,
): Promise<{
  id: string;
  email: string;
  isActive: boolean;
  subscribedAt: string;
  alreadySubscribed?: boolean;
}> {
  const response = await api.post("/newsletter/subscribe", {
    email,
    recaptchaToken,
  });
  return response.data;
}

// Password change API function
export async function changePassword(
  currentPassword: string | undefined,
  newPassword: string,
): Promise<{
  message: string;
}> {
  const response = await api.post("/auth/password/change", {
    ...(currentPassword !== undefined && { currentPassword }),
    newPassword,
  });
  return response.data;
}

// Get auth status (includes whether user has password)
export async function getAuthStatus(): Promise<any> {
  const response = await api.get("/auth/status");
  return response.data;
}

// ==================== SOCIAL SYSTEM API FUNCTIONS ====================

// Profile API functions
export async function getUserProfile(): Promise<any> {
  const response = await api.get("/social/profile");
  return response.data;
}

export async function updateUserProfile(data: {
  bio?: string;
  location?: string;
  website?: string;
  showEmail?: boolean;
  showPhone?: boolean;
  showRetreats?: boolean;
  interests?: string[];
  skills?: string[];
  avatarUrl?: string;
}): Promise<any> {
  const response = await api.put("/social/profile", data);
  return response.data;
}

export async function getPublicProfile(userId: string): Promise<any> {
  const response = await api.get(`/social/profile/${userId}`);
  return response.data;
}

export async function searchUsers(
  query: string,
  filters?: {
    interests?: string[];
    skills?: string[];
    location?: string;
    retreatId?: string;
  },
): Promise<any[]> {
  const params = new URLSearchParams();
  params.append("q", query);
  if (filters?.interests?.length) {
    filters.interests.forEach((i) => params.append("interests", i));
  }
  if (filters?.skills?.length) {
    filters.skills.forEach((s) => params.append("skills", s));
  }
  if (filters?.location) {
    params.append("location", filters.location);
  }
  if (filters?.retreatId) {
    params.append("retreatId", filters.retreatId);
  }

  const response = await api.get(`/social/search?${params.toString()}`);
  return response.data;
}

export async function linkUserToParticipant(
  participantId: string,
): Promise<any> {
  const response = await api.post(`/social/link/participant/${participantId}`);
  return response.data;
}

export async function unlinkUserFromParticipant(): Promise<void> {
  const response = await api.delete("/social/link/participant");
  return response.data;
}

export async function updateAvatar(avatarUrl: string): Promise<any> {
  const response = await api.put("/social/profile/avatar", { avatarUrl });
  return response.data;
}

export async function removeAvatar(): Promise<any> {
  const response = await api.delete("/social/profile/avatar");
  return response.data;
}

// Friend API functions
export async function sendFriendRequest(friendId: string): Promise<any> {
  const response = await api.post("/social/friends/request", { friendId });
  return response.data;
}

export async function acceptFriendRequest(requesterId: string): Promise<any> {
  const response = await api.put("/social/friends/accept", { requesterId });
  return response.data;
}

export async function rejectFriendRequest(requesterId: string): Promise<void> {
  const response = await api.delete("/social/friends/request", {
    data: { requesterId },
  });
  return response.data;
}

export async function removeFriend(friendId: string): Promise<void> {
  const response = await api.delete(`/social/friends/${friendId}`);
  return response.data;
}

export async function getFriends(): Promise<any[]> {
  const response = await api.get("/social/friends");
  return response.data;
}

export async function getPendingRequests(): Promise<any[]> {
  const response = await api.get("/social/friends/pending");
  return response.data;
}

export async function getSentRequests(): Promise<any[]> {
  const response = await api.get("/social/friends/sent");
  return response.data;
}

// Follow API functions
export async function followUser(userId: string): Promise<any> {
  const response = await api.post(`/social/follow/${userId}`);
  return response.data;
}

export async function unfollowUser(userId: string): Promise<void> {
  const response = await api.delete(`/social/follow/${userId}`);
  return response.data;
}

export async function getFollowers(): Promise<any[]> {
  const response = await api.get("/social/followers");
  return response.data;
}

export async function getFollowing(): Promise<any[]> {
  const response = await api.get("/social/following");
  return response.data;
}

// Blocking API functions
export async function blockUser(userId: string): Promise<void> {
  const response = await api.post(`/social/block/${userId}`);
  return response.data;
}

export async function unblockUser(userId: string): Promise<void> {
  const response = await api.delete(`/social/block/${userId}`);
  return response.data;
}

export async function getBlockedUsers(): Promise<any[]> {
  const response = await api.get("/social/blocked");
  return response.data;
}

// ==================== TESTIMONIAL API FUNCTIONS ====================

export async function createTestimonial(data: {
  content: string;
  retreatId?: string | null;
  visibility?: "public" | "friends" | "retreat_participants" | "private";
  allowLandingPage?: boolean;
}): Promise<any> {
  const response = await api.post("/testimonials", data);
  return response.data;
}

export async function getTestimonials(): Promise<any[]> {
  const response = await api.get("/testimonials");
  return response.data;
}

export async function getTestimonialsByRetreat(
  retreatId: string,
): Promise<any[]> {
  const response = await api.get(`/testimonials/retreat/${retreatId}`);
  return response.data;
}

export async function getUserTestimonials(userId: string): Promise<any[]> {
  const response = await api.get(`/testimonials/user/${userId}`);
  return response.data;
}

export async function updateTestimonial(
  id: number,
  data: {
    content?: string;
    visibility?: "public" | "friends" | "retreat_participants" | "private";
    allowLandingPage?: boolean;
  },
): Promise<any> {
  const response = await api.put(`/testimonials/${id}`, data);
  return response.data;
}

export async function deleteTestimonial(id: number): Promise<void> {
  await api.delete(`/testimonials/${id}`);
}

export async function approveTestimonialForLanding(id: number): Promise<any> {
  const response = await api.put(`/testimonials/${id}/approve-landing`);
  return response.data;
}

export async function revokeLandingApproval(id: number): Promise<any> {
  const response = await api.put(`/testimonials/${id}/revoke-landing`);
  return response.data;
}

export async function getLandingTestimonials(): Promise<any[]> {
  const response = await api.get("/landing/testimonials");
  return response.data;
}

export async function getTestimonialDefaultVisibility(): Promise<{
  testimonialVisibilityDefault:
    | "public"
    | "friends"
    | "retreat_participants"
    | "private";
}> {
  const response = await api.get("/testimonials/settings/default-visibility");
  return response.data;
}

export async function setTestimonialDefaultVisibility(
  visibility: "public" | "friends" | "retreat_participants" | "private",
): Promise<{ message: string; testimonialVisibilityDefault: string }> {
  const response = await api.put("/testimonials/settings/default-visibility", {
    testimonialVisibilityDefault: visibility,
  });
  return response.data;
}

// Retreat Memory API functions
export async function uploadRetreatMemoryPhoto(
  retreatId: string,
  photoData: string,
): Promise<{ memoryPhotoUrl: string }> {
  const response = await api.post(`/retreats/${retreatId}/memory-photo`, {
    photoData,
  });
  return response.data;
}

export async function updateRetreatMemory(
  retreatId: string,
  data: { musicPlaylistUrl?: string },
): Promise<{ musicPlaylistUrl?: string; memoryPhotoUrl?: string }> {
  const response = await api.put(`/retreats/${retreatId}/memory`, data);
  return response.data;
}

export async function getAttendedRetreats(): Promise<Retreat[]> {
  const response = await api.get("/retreats/attended");
  return response.data;
}

// ==================== RETREAT PARTICIPANT API ====================

export type RoleInRetreat =
  | "walker"
  | "server"
  | "leader"
  | "coordinator"
  | "charlista";

export interface RetreatParticipant {
  id: string;
  userId: string;
  participantId: string | null;
  retreatId: string;
  roleInRetreat: RoleInRetreat;
  isPrimaryRetreat: boolean;
  notes?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  retreat?: {
    id: string;
    parish: string;
    startDate: string;
    endDate: string;
    house?: {
      id: string;
      name: string;
    };
  };
  participant?: {
    id: string;
    firstName: string;
    lastName: string;
    type: string;
  };
  user?: {
    id: string;
    displayName: string;
    email: string;
    profile?: {
      bio?: string;
      avatarUrl?: string;
    };
  };
}

/**
 * Get complete retreat history for the authenticated user
 */
export async function getUserRetreatHistory(): Promise<RetreatParticipant[]> {
  const response = await api.get("/history/my-retreats");
  return response.data;
}

/**
 * Get retreat history for the authenticated user filtered by role
 */
export async function getUserRetreatHistoryByRole(
  role: RoleInRetreat,
): Promise<RetreatParticipant[]> {
  const response = await api.get(`/history/my-retreats/role/${role}`);
  return response.data;
}

/**
 * Get the authenticated user's primary retreat
 */
export async function getPrimaryRetreat(): Promise<RetreatParticipant> {
  const response = await api.get("/history/my-retreats/primary");
  return response.data;
}

/**
 * Get retreat history for a specific user (admin/coordinator only)
 */
export async function getUserRetreatHistoryById(
  userId: string,
): Promise<RetreatParticipant[]> {
  const response = await api.get(`/history/user/${userId}`);
  return response.data;
}

/**
 * Get history for a specific user and retreat
 */
export async function getUserHistoryForRetreat(
  userId: string,
  retreatId: string,
): Promise<RetreatParticipant> {
  const response = await api.get(
    `/history/user/${userId}/retreat/${retreatId}`,
  );
  return response.data;
}

/**
 * Get all participants (history) for a specific retreat
 */
export async function getParticipantsHistoryByRetreat(
  retreatId: string,
): Promise<RetreatParticipant[]> {
  const response = await api.get(`/history/retreat/${retreatId}/participants`);
  return response.data;
}

/**
 * Get all history entries for a specific participant
 */
export async function getHistoryByParticipantId(
  participantId: string,
): Promise<RetreatParticipant[]> {
  const response = await api.get(`/history/participant/${participantId}`);
  return response.data;
}

/**
 * Get participants by role for a specific retreat
 */
export async function getParticipantsByRole(
  retreatId: string,
  role: RoleInRetreat,
): Promise<RetreatParticipant[]> {
  const response = await api.get(`/history/retreat/${retreatId}/role/${role}`);
  return response.data;
}

/**
 * Get charlistas (speakers) for a retreat or globally
 */
export async function getCharlistas(
  retreatId?: string,
): Promise<RetreatParticipant[]> {
  const params = retreatId ? `?retreatId=${retreatId}` : "";
  const response = await api.get(`/history/charlistas${params}`);
  return response.data;
}

// ==================== AI CHAT API ====================

export async function getAiChatStatus(): Promise<{ configured: boolean }> {
  const response = await api.get("/ai-chat/status");
  return response.data;
}

export async function saveChatConversation(data: {
  id?: string;
  messages: any[];
  retreatId?: string;
  title?: string;
}): Promise<{ id: string }> {
  const response = await api.post("/ai-chat/conversations", data);
  return response.data;
}

export async function getChatConversations(): Promise<
  {
    id: string;
    title: string | null;
    retreatId: string | null;
    createdAt: string;
    updatedAt: string;
  }[]
> {
  const response = await api.get("/ai-chat/conversations");
  return response.data;
}

export async function getChatConversation(id: string): Promise<{
  id: string;
  title: string | null;
  retreatId: string | null;
  messages: any[];
  createdAt: string;
  updatedAt: string;
}> {
  const response = await api.get(`/ai-chat/conversations/${id}`);
  return response.data;
}

export async function deleteChatConversation(id: string): Promise<void> {
  await api.delete(`/ai-chat/conversations/${id}`);
}

// ==================== TTS API ====================

export async function ttsSpeak(text: string, voice?: string): Promise<Blob> {
  const response = await api.post(
    "/tts/speak",
    { text, voice },
    { responseType: "blob" },
  );
  return response.data;
}

export async function ttsVoices(): Promise<
  { id: string; name: string; locale: string; gender: string }[]
> {
  const response = await api.get("/tts/voices");
  return response.data;
}

// ==================== PUBLIC ATTENDANCE API ====================

export async function getPublicAttendance(
  communityId: string,
  meetingId: string,
): Promise<{
  members: any[];
  communityName: string;
  meetingTitle: string;
  meetingStartDate: string;
}> {
  const response = await api.get(
    `/communities/public/attendance/${communityId}/${meetingId}`,
  );
  return response.data;
}

export async function togglePublicAttendance(
  communityId: string,
  meetingId: string,
  data: { memberId: string; attended: boolean; recaptchaToken?: string },
): Promise<void> {
  await api.post(
    `/communities/public/attendance/${communityId}/${meetingId}`,
    data,
  );
}

export const analyzeTablePhoto = async (
  retreatId: string,
  tableId: string,
  imageBase64: string,
  contentType: string,
) => {
  const response = await api.post("/vision-assignment/analyze-table", {
    retreatId,
    tableId,
    imageBase64,
    contentType,
  });
  return response.data as {
    proposals: Array<{
      idOnRetreat: number;
      participantId: string | null;
      participantName: string | null;
      tableName: string;
      tableId: string | null;
      valid: boolean;
      error?: string;
    }>;
    unreadable: Array<{ description: string }>;
    notes: string;
  };
};

export const executeTableAssignments = async (
  retreatId: string,
  assignments: Array<{
    participantId: string;
    tableId: string;
    idOnRetreat: number;
    participantName: string;
    tableName: string;
  }>,
) => {
  const response = await api.post("/vision-assignment/execute", {
    retreatId,
    assignments,
  });
  return response.data as {
    results: Array<{
      idOnRetreat: number;
      participantName: string;
      tableName: string;
      success: boolean;
      error?: string;
    }>;
  };
};

// ==================== SANTISIMO API ====================

export interface SantisimoSlotWithSignups {
  id: string;
  retreatId: string;
  startTime: string;
  endTime: string;
  capacity: number;
  isDisabled: boolean;
  intention: string | null;
  notes: string | null;
  mealWindow: boolean;
  signedUpCount: number;
  signups: Array<{
    id: string;
    slotId: string;
    name: string;
    phone: string | null;
    email: string | null;
    userId: string | null;
    createdAt: string;
  }>;
}

export interface PublicSantisimoSlot {
  id: string;
  startTime: string;
  endTime: string;
  capacity: number;
  isDisabled: boolean;
  intention: string | null;
  signedUpCount: number;
  signups: Array<{ firstName: string }>;
}

export interface PublicSantisimoSchedule {
  retreat: {
    id: string;
    parish: string;
    startDate: string;
    endDate: string;
    slug?: string;
  };
  slots: PublicSantisimoSlot[];
}

export const santisimoApi = {
  // Admin
  async listSlots(retreatId: string): Promise<SantisimoSlotWithSignups[]> {
    const r = await api.get(`/santisimo/retreats/${retreatId}/slots`);
    return r.data;
  },
  async createSlot(
    retreatId: string,
    data: {
      startTime: string;
      endTime: string;
      capacity?: number;
      isDisabled?: boolean;
      intention?: string | null;
      notes?: string | null;
    },
  ): Promise<SantisimoSlotWithSignups> {
    const r = await api.post(`/santisimo/retreats/${retreatId}/slots`, data);
    return r.data;
  },
  async generateSlots(
    retreatId: string,
    data: {
      startDateTime: string;
      endDateTime: string;
      slotMinutes?: number;
      capacity?: number;
      clearExisting?: boolean;
    },
  ): Promise<SantisimoSlotWithSignups[]> {
    const r = await api.post(
      `/santisimo/retreats/${retreatId}/slots/generate`,
      data,
    );
    return r.data;
  },
  async updateSlot(
    id: string,
    data: Partial<{
      startTime: string;
      endTime: string;
      capacity: number;
      isDisabled: boolean;
      intention: string | null;
      notes: string | null;
    }>,
  ): Promise<SantisimoSlotWithSignups> {
    const r = await api.patch(`/santisimo/slots/${id}`, data);
    return r.data;
  },
  async deleteSlot(id: string): Promise<void> {
    await api.delete(`/santisimo/slots/${id}`);
  },
  async listSignups(slotId: string) {
    const r = await api.get(`/santisimo/slots/${slotId}/signups`);
    return r.data as SantisimoSlotWithSignups["signups"];
  },
  async adminCreateSignup(
    retreatId: string,
    data: {
      slotId: string;
      name: string;
      phone?: string | null;
      email?: string | null;
      userId?: string | null;
    },
  ) {
    const r = await api.post(`/santisimo/retreats/${retreatId}/signups`, data);
    return r.data;
  },
  async deleteSignup(id: string): Promise<void> {
    await api.delete(`/santisimo/signups/${id}`);
  },

  // Public (no CSRF token required, but endpoint is whitelisted)
  async publicGetSchedule(slug: string): Promise<PublicSantisimoSchedule> {
    const r = await api.get(`/santisimo/public/${slug}`);
    return r.data;
  },
  async publicSignUp(
    slug: string,
    data: {
      slotIds: string[];
      name: string;
      phone?: string;
      email?: string;
      recaptchaToken?: string;
    },
  ): Promise<{
    signups: Array<{ id: string; slotId: string; cancelToken: string | null }>;
  }> {
    const r = await api.post(`/santisimo/public/${slug}/signups`, data);
    return r.data;
  },
  async publicCancel(token: string): Promise<void> {
    await api.delete(`/santisimo/public/signups/${token}`);
  },
};

// ── Recepción ──────────────────────────────────────────────────────────────

export interface ReceptionParticipant {
  retreatParticipantId: string;
  participantId: string | null;
  idOnRetreat: number | null;
  firstName: string;
  lastName: string;
  cellPhone: string;
  checkedIn: boolean;
  checkedInAt: string | null;
}

export interface ReceptionStats {
  total: number;
  arrived: number;
  pending: number;
  pendingList: ReceptionParticipant[];
  arrivedList: ReceptionParticipant[];
}

export async function getReceptionStats(retreatId: string): Promise<ReceptionStats> {
  const r = await api.get(`/participants/reception/${retreatId}`);
  return r.data;
}

export async function checkInParticipant(
  participantId: string,
  retreatId: string,
  checkedIn: boolean,
): Promise<{ checkedIn: boolean; checkedInAt: string | null }> {
  const r = await api.put(`/participants/${participantId}/checkin`, { retreatId, checkedIn });
  return r.data;
}

// ---------- Minuto a Minuto (schedule) ----------

export interface ScheduleTemplateSetDTO {
  id: string;
  name: string;
  description?: string | null;
  sourceTag?: string | null;
  isActive: boolean;
  isDefault: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ResponsabilityAttachmentDTO {
  id: string;
  responsabilityName: string;
  kind: "file" | "markdown";
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageUrl: string;
  content?: string | null;
  description?: string | null;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ScheduleTemplateDTO {
  id: string;
  templateSetId?: string | null;
  name: string;
  description?: string | null;
  type: string;
  defaultDurationMinutes: number;
  defaultOrder: number;
  defaultDay: number;
  defaultStartTime?: string | null;
  requiresResponsable: boolean;
  allowedResponsibilityTypes?: string | null;
  responsabilityName?: string | null;
  musicTrackUrl?: string | null;
  palanquitaNotes?: string | null;
  planBNotes?: string | null;
  blocksSantisimoAttendance: boolean;
  locationHint?: string | null;
  isActive: boolean;
  attachments?: ResponsabilityAttachmentDTO[];
  createdAt?: string;
  updatedAt?: string;
}

export interface RetreatScheduleItemDTO {
  id: string;
  retreatId: string;
  scheduleTemplateId?: string | null;
  name: string;
  type: string;
  day: number;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  orderInDay: number;
  status: "pending" | "active" | "completed" | "delayed" | "skipped";
  responsabilityId?: string | null;
  location?: string | null;
  notes?: string | null;
  musicTrackUrl?: string | null;
  palanquitaNotes?: string | null;
  planBNotes?: string | null;
  blocksSantisimoAttendance: boolean;
  actualStartTime?: string | null;
  actualEndTime?: string | null;
  responsables?: Array<{
    id?: string;
    participantId: string;
    role?: string | null;
    participant?: { id: string; firstName: string; lastName: string; nickname: string };
  }>;
  attachments?: ResponsabilityAttachmentDTO[];
}

export const scheduleTemplateApi = {
  async list(setId?: string): Promise<ScheduleTemplateDTO[]> {
    const r = await api.get("/schedule-templates", {
      params: setId ? { setId } : {},
    });
    return r.data;
  },
  // --- Template sets ---
  async listSets(): Promise<ScheduleTemplateSetDTO[]> {
    const r = await api.get("/schedule-templates/sets");
    return r.data;
  },
  async createSet(data: Partial<ScheduleTemplateSetDTO>): Promise<ScheduleTemplateSetDTO> {
    const r = await api.post("/schedule-templates/sets", data);
    return r.data;
  },
  async updateSet(
    id: string,
    data: Partial<ScheduleTemplateSetDTO>,
  ): Promise<ScheduleTemplateSetDTO> {
    const r = await api.patch(`/schedule-templates/sets/${id}`, data);
    return r.data;
  },
  async removeSet(id: string): Promise<void> {
    await api.delete(`/schedule-templates/sets/${id}`);
  },
  async get(id: string): Promise<ScheduleTemplateDTO> {
    const r = await api.get(`/schedule-templates/${id}`);
    return r.data;
  },
  async create(data: Partial<ScheduleTemplateDTO>): Promise<ScheduleTemplateDTO> {
    const r = await api.post("/schedule-templates", data);
    return r.data;
  },
  async update(
    id: string,
    data: Partial<ScheduleTemplateDTO>,
  ): Promise<ScheduleTemplateDTO> {
    const r = await api.patch(`/schedule-templates/${id}`, data);
    return r.data;
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/schedule-templates/${id}`);
  },
};

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("FileReader error"));
    reader.readAsDataURL(file);
  });
}

// Attachments vinculados a una Responsabilidad por nombre canónico.
// El nombre se URL-encode al consultar.
export const responsabilityAttachmentApi = {
  async list(responsabilityName: string): Promise<ResponsabilityAttachmentDTO[]> {
    const r = await api.get(
      `/responsability-attachments/by-name/${encodeURIComponent(responsabilityName)}/attachments`,
    );
    return r.data;
  },
  async upload(
    responsabilityName: string,
    file: File,
    description?: string | null,
  ): Promise<ResponsabilityAttachmentDTO> {
    if (file.size > 10 * 1024 * 1024) {
      throw new Error("El archivo excede 10MB.");
    }
    const dataUrl = await fileToDataUrl(file);
    const r = await api.post(
      `/responsability-attachments/by-name/${encodeURIComponent(responsabilityName)}/attachments`,
      {
        dataUrl,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        description: description ?? null,
      },
    );
    return r.data;
  },
  async createMarkdown(
    responsabilityName: string,
    payload: { title: string; content: string; description?: string | null },
  ): Promise<ResponsabilityAttachmentDTO> {
    const r = await api.post(
      `/responsability-attachments/by-name/${encodeURIComponent(responsabilityName)}/attachments/markdown`,
      payload,
    );
    return r.data;
  },
  async update(
    attachmentId: string,
    patch: { description?: string | null; sortOrder?: number },
  ): Promise<ResponsabilityAttachmentDTO> {
    const r = await api.patch(
      `/responsability-attachments/attachments/${attachmentId}`,
      patch,
    );
    return r.data;
  },
  async updateMarkdown(
    attachmentId: string,
    patch: { title?: string; content?: string; description?: string | null },
  ): Promise<ResponsabilityAttachmentDTO> {
    const r = await api.patch(
      `/responsability-attachments/attachments/${attachmentId}/markdown`,
      patch,
    );
    return r.data;
  },
  async remove(attachmentId: string): Promise<void> {
    await api.delete(`/responsability-attachments/attachments/${attachmentId}`);
  },
  async counts(): Promise<Record<string, number>> {
    const r = await api.get(`/responsability-attachments/counts`);
    return r.data;
  },
  async listHistory(
    attachmentId: string,
  ): Promise<
    Array<{
      id: string;
      attachmentId: string;
      title: string;
      preview: string;
      sizeBytes: number;
      description: string | null;
      savedAt: string;
      savedById: string | null;
    }>
  > {
    const r = await api.get(
      `/responsability-attachments/attachments/${attachmentId}/history`,
    );
    return r.data;
  },
  async restoreVersion(
    attachmentId: string,
    historyId: string,
  ): Promise<ResponsabilityAttachmentDTO> {
    const r = await api.post(
      `/responsability-attachments/attachments/${attachmentId}/restore/${historyId}`,
    );
    return r.data;
  },
  async getVersion(
    attachmentId: string,
    historyId: string,
  ): Promise<{
    id: string;
    attachmentId: string;
    title: string;
    content: string;
    sizeBytes: number;
    description: string | null;
    savedAt: string;
    savedById: string | null;
  }> {
    const r = await api.get(
      `/responsability-attachments/attachments/${attachmentId}/history/${historyId}`,
    );
    return r.data;
  },
};

export const retreatScheduleApi = {
  async list(retreatId: string): Promise<RetreatScheduleItemDTO[]> {
    const r = await api.get(`/schedule/retreats/${retreatId}/items`);
    return r.data;
  },
  async create(
    retreatId: string,
    data: Partial<RetreatScheduleItemDTO> & { responsableParticipantIds?: string[] },
  ): Promise<RetreatScheduleItemDTO> {
    const r = await api.post(`/schedule/retreats/${retreatId}/items`, data);
    return r.data;
  },
  async update(
    id: string,
    data: Partial<RetreatScheduleItemDTO> & { responsableParticipantIds?: string[] },
  ): Promise<RetreatScheduleItemDTO> {
    const r = await api.patch(`/schedule/items/${id}`, data);
    return r.data;
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/schedule/items/${id}`);
  },
  async start(id: string): Promise<RetreatScheduleItemDTO> {
    const r = await api.post(`/schedule/items/${id}/start`);
    return r.data;
  },
  async complete(id: string): Promise<RetreatScheduleItemDTO> {
    const r = await api.post(`/schedule/items/${id}/complete`);
    return r.data;
  },
  async shift(
    id: string,
    minutesDelta: number,
    propagate = true,
  ): Promise<RetreatScheduleItemDTO[]> {
    const r = await api.post(`/schedule/items/${id}/shift`, { minutesDelta, propagate });
    return r.data;
  },
  async shiftDay(
    retreatId: string,
    day: number,
    minutesDelta: number,
  ): Promise<RetreatScheduleItemDTO[]> {
    const r = await api.post(`/schedule/retreats/${retreatId}/days/${day}/shift`, {
      minutesDelta,
    });
    return r.data;
  },
  async reorderDay(
    retreatId: string,
    day: number,
    itemIds: string[],
  ): Promise<RetreatScheduleItemDTO[]> {
    const r = await api.post(`/schedule/retreats/${retreatId}/days/${day}/reorder`, {
      itemIds,
    });
    return r.data;
  },
  async publicGetMam(slug: string): Promise<{
    retreat: { id: string; parish: string; startDate: string; endDate: string };
    items: Array<{
      id: string;
      day: number;
      startTime: string;
      endTime: string;
      durationMinutes: number;
      name: string;
      type: string;
      status: 'pending' | 'active' | 'completed' | 'delayed' | 'skipped';
      location: string | null;
      responsabilityName: string | null;
    }>;
  }> {
    // Plain axios request without auth interceptors — this is the only
    // public endpoint in retreatScheduleApi. We still go through the shared
    // `api` instance to keep base URL handling consistent.
    const r = await api.get(`/schedule/public/mam/${encodeURIComponent(slug)}`);
    return r.data;
  },
  async materialize(
    retreatId: string,
    baseDate: string,
    templateSetId?: string,
    clearExisting = false,
  ): Promise<RetreatScheduleItemDTO[]> {
    const r = await api.post(`/schedule/retreats/${retreatId}/materialize`, {
      baseDate,
      templateSetId,
      clearExisting,
    });
    return r.data;
  },
  async resolveSantisimo(
    retreatId: string,
  ): Promise<{ mealSlots: number; angelitosAssigned: number; unresolvedSlots: string[] }> {
    const r = await api.post(`/schedule/retreats/${retreatId}/resolve-santisimo`);
    return r.data;
  },
  async ringBell(retreatId: string, message?: string): Promise<void> {
    await api.post(`/schedule/retreats/${retreatId}/bell`, { message });
  },
  async dashboardStats(retreatId: string): Promise<ScheduleDashboardStats> {
    const r = await api.get(`/schedule/retreats/${retreatId}/dashboard`);
    return r.data;
  },
  async suggestResponsables(retreatId: string): Promise<ResponsableSuggestion[]> {
    const r = await api.get(`/schedule/retreats/${retreatId}/suggest-responsables`);
    return r.data;
  },
  async bulkAssignResponsables(
    retreatId: string,
    assignments: BulkAssignment[],
  ): Promise<{ updated: number; skipped: number }> {
    const r = await api.post(
      `/schedule/retreats/${retreatId}/bulk-assign-responsables`,
      { assignments },
    );
    return r.data;
  },
  async relinkResponsibilities(
    retreatId: string,
    force = false,
  ): Promise<{ linked: number; alreadyLinked: number; noTemplate: number; noMatch: number }> {
    const r = await api.post(
      `/schedule/retreats/${retreatId}/relink-responsibilities${force ? '?force=true' : ''}`,
    );
    return r.data;
  },
  async canonicalResponsabilities(): Promise<{ fixed: string[]; charlas: string[] }> {
    const r = await api.get('/schedule/canonical-responsabilities');
    return r.data;
  },
};

export interface ResponsableSuggestion {
  itemId: string;
  responsabilityId: string | null;
  confidence: 'high' | 'medium' | 'low' | 'none';
  reason: string;
}

export interface BulkAssignment {
  itemId: string;
  responsabilityId?: string | null;
  responsableParticipantIds?: string[];
}

export interface ScheduleDashboardStats {
  currentItem: {
    id: string;
    name: string;
    type: string;
    startTime: string;
    endTime: string;
    actualStartTime: string | null;
    durationMinutes: number;
    responsabilityId: string | null;
    responsabilityName: string | null;
  } | null;
  nextItem: {
    id: string;
    name: string;
    type: string;
    startTime: string;
    minutesUntil: number;
    responsabilityName: string | null;
  } | null;
  today: { completed: number; total: number };
  items: {
    total: number;
    completed: number;
    active: number;
    pending: number;
    delayed: number;
    requiresResponsable: number;
    missingResponsable: number;
  };
  delayMinutes: number;
  santisimo: {
    totalSlots: number;
    coveredSlots: number;
    mealWindowSlots: number;
    unresolvedMealSlots: number;
  };
  angelitos: { total: number; available: number; inTable: number };
}

// --- Retreat Shirt Types ---
export type ShirtTypeDTO = {
  id: string;
  retreatId: string;
  name: string;
  color?: string | null;
  requiredForWalkers: boolean;
  optionalForServers: boolean;
  sortOrder: number;
  availableSizes?: string[] | null;
};

export const listShirtTypes = async (retreatId: string): Promise<ShirtTypeDTO[]> => {
  const r = await api.get(`/retreats/${retreatId}/shirt-types`);
  return r.data;
};

export const createShirtType = async (
  retreatId: string,
  data: Partial<ShirtTypeDTO>,
): Promise<ShirtTypeDTO> => {
  const r = await api.post(`/retreats/${retreatId}/shirt-types`, data);
  return r.data;
};

export const updateShirtType = async (
  id: string,
  data: Partial<ShirtTypeDTO>,
): Promise<ShirtTypeDTO> => {
  const r = await api.patch(`/shirt-types/${id}`, data);
  return r.data;
};

export const deleteShirtType = async (id: string): Promise<void> => {
  await api.delete(`/shirt-types/${id}`);
};
