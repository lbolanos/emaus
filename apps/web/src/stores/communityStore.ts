import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import * as api from '../services/api';
import {
	Community,
	CommunityMember,
	CommunityMeeting,
	CommunityAdmin,
	CommunityAttendance,
	MemberState,
} from '@repo/types';

// Action history interface for undo functionality
interface Action {
	type: 'update' | 'delete' | 'create';
	entity: 'member' | 'meeting';
	data: any;
	communityId: string;
	timestamp: Date;
}

export const useCommunityStore = defineStore('community', () => {
	// State
	const communities = ref<Community[]>([]);
	const currentCommunity = ref<Community | null>(null);
	const members = ref<CommunityMember[]>([]);
	const meetings = ref<CommunityMeeting[]>([]);
	const attendance = ref<CommunityAttendance[]>([]);
	const admins = ref<CommunityAdmin[]>([]);
	const loading = ref(false);
	const loadingCommunity = ref(false);
	const error = ref<string | null>(null);
	const actionHistory = ref<Action[]>([]);

	// Getters
	const membersByState = computed(() => {
		const groups: Record<string, CommunityMember[]> = {
			active_member: [],
			far_from_location: [],
			no_answer: [],
			another_group: [],
		};

		members.value.forEach((member) => {
			if (groups[member.state]) {
				groups[member.state].push(member);
			}
		});

		return groups;
	});

	// Actions
	const fetchCommunities = async () => {
		loading.value = true;
		error.value = null;
		try {
			const data = await api.getCommunities();
			if (Array.isArray(data)) {
				communities.value = data;
			} else {
				console.error('Invalid community data received:', data);
				communities.value = [];
				error.value = 'Invalid data received from server';
			}
			return communities.value;
		} catch (err: any) {
			error.value = err.message || 'Failed to fetch communities';
		} finally {
			loading.value = false;
		}
	};

	const fetchCommunity = async (id: string) => {
		loadingCommunity.value = true;
		error.value = null;
		try {
			currentCommunity.value = await api.getCommunityById(id);
			return currentCommunity.value;
		} catch (err: any) {
			error.value = err.message || 'Failed to fetch community';
		} finally {
			loadingCommunity.value = false;
		}
	};

	const createCommunity = async (data: any) => {
		loading.value = true;
		error.value = null;
		try {
			const newCommunity = await api.createCommunity(data);
			communities.value.push(newCommunity);
			return newCommunity;
		} catch (err: any) {
			error.value = err.message || 'Failed to create community';
			throw err;
		} finally {
			loading.value = false;
		}
	};

	const updateCommunity = async (id: string, data: any) => {
		loading.value = true;
		error.value = null;
		try {
			const updated = await api.updateCommunity(id, data);
			const index = communities.value.findIndex((c) => c.id === id);
			if (index !== -1) communities.value[index] = updated;
			if (currentCommunity.value?.id === id) currentCommunity.value = updated;
			return updated;
		} catch (err: any) {
			error.value = err.message || 'Failed to update community';
			throw err;
		} finally {
			loading.value = false;
		}
	};

	const deleteCommunity = async (id: string) => {
		loading.value = true;
		error.value = null;
		try {
			await api.deleteCommunity(id);
			communities.value = communities.value.filter((c) => c.id !== id);
			if (currentCommunity.value?.id === id) currentCommunity.value = null;
		} catch (err: any) {
			error.value = err.message || 'Failed to delete community';
			throw err;
		} finally {
			loading.value = false;
		}
	};

	const fetchMembers = async (communityId: string, state?: string) => {
		loading.value = true;
		error.value = null;
		try {
			members.value = await api.getCommunityMembers(communityId, state);
			return members.value;
		} catch (err: any) {
			error.value = err.message || 'Failed to fetch members';
		} finally {
			loading.value = false;
		}
	};

	const importMembers = async (
		communityId: string,
		retreatId: string,
		participantIds: string[],
	) => {
		loading.value = true;
		error.value = null;
		try {
			const newMembers = await api.importMembersFromRetreat(communityId, retreatId, participantIds);
			await fetchMembers(communityId);
			return newMembers;
		} catch (err: any) {
			error.value = err.message || 'Failed to import members';
			throw err;
		} finally {
			loading.value = false;
		}
	};

	const fetchPotentialMembers = async (communityId: string, retreatId: string) => {
		loading.value = true;
		error.value = null;
		try {
			return await api.getPotentialMembersFromRetreat(communityId, retreatId);
		} catch (err: any) {
			error.value = err.message || 'Failed to fetch potential members';
			throw err;
		} finally {
			loading.value = false;
		}
	};

	const updateMemberState = async (communityId: string, memberId: string, state: MemberState) => {
		loading.value = true;
		error.value = null;
		try {
			// Store previous state for undo
			const previousData = members.value.find((m) => m.id === memberId);

			const updated = await api.updateCommunityMemberState(communityId, memberId, state);
			const index = members.value.findIndex((m) => m.id === memberId);
			if (index !== -1) {
				// Preserve existing participant data as API response may not include it
				members.value[index] = {
					...members.value[index],
					...updated,
					participant: updated.participant || members.value[index].participant,
				};
			}

			// Track action for undo (only keep last 10 actions)
			if (previousData) {
				actionHistory.value.push({
					type: 'update',
					entity: 'member',
					data: { memberId, previousState: previousData.state, newState: state },
					communityId,
					timestamp: new Date(),
				});
				if (actionHistory.value.length > 10) {
					actionHistory.value.shift();
				}
			}

			return members.value[index];
		} catch (err: any) {
			error.value = err.message || 'Failed to update member state';
			throw err;
		} finally {
			loading.value = false;
		}
	};

	const removeMember = async (communityId: string, memberId: string) => {
		loading.value = true;
		error.value = null;
		try {
			await api.removeCommunityMember(communityId, memberId);
			members.value = members.value.filter((m) => m.id !== memberId);
		} catch (err: any) {
			error.value = err.message || 'Failed to remove member';
			throw err;
		} finally {
			loading.value = false;
		}
	};

	const fetchMeetings = async (communityId: string) => {
		loading.value = true;
		error.value = null;
		try {
			meetings.value = await api.getCommunityMeetings(communityId);
			return meetings.value;
		} catch (err: any) {
			error.value = err.message || 'Failed to fetch meetings';
		} finally {
			loading.value = false;
		}
	};

	const createMeeting = async (communityId: string, data: any) => {
		loading.value = true;
		error.value = null;
		try {
			const newMeeting = await api.createCommunityMeeting(communityId, data);
			meetings.value.unshift(newMeeting);
			return newMeeting;
		} catch (err: any) {
			error.value = err.message || 'Failed to create meeting';
			throw err;
		} finally {
			loading.value = false;
		}
	};

	const updateMeeting = async (
		meetingId: string,
		data: any,
		scope: 'this' | 'all' | 'all_future' = 'this',
	) => {
		loading.value = true;
		error.value = null;
		try {
			const updated = await api.updateCommunityMeeting(meetingId, data, scope);
			// Handle both single meeting and array return types
			if (Array.isArray(updated)) {
				// Multiple meetings were updated
				meetings.value = meetings.value.map((m) => {
					const replacement = updated.find((u) => u.id === m.id);
					return replacement || m;
				});
			} else {
				// Single meeting was updated
				const index = meetings.value.findIndex((m) => m.id === meetingId);
				if (index !== -1) {
					meetings.value[index] = updated;
				}
			}
			return updated;
		} catch (err: any) {
			error.value = err.message || 'Failed to update meeting';
			throw err;
		} finally {
			loading.value = false;
		}
	};

	const deleteMeeting = async (
		meetingId: string,
		scope: 'this' | 'all' | 'all_future' = 'this',
	) => {
		loading.value = true;
		error.value = null;
		try {
			await api.deleteCommunityMeeting(meetingId, scope);
			meetings.value = meetings.value.filter((m) => m.id !== meetingId);
		} catch (err: any) {
			error.value = err.message || 'Failed to delete meeting';
			throw err;
		} finally {
			loading.value = false;
		}
	};

	const createNextMeetingInstance = async (meetingId: string) => {
		loading.value = true;
		error.value = null;
		try {
			const newMeeting = await api.createNextMeetingInstance(meetingId);
			meetings.value.unshift(newMeeting);
			return newMeeting;
		} catch (err: any) {
			error.value = err.message || 'Failed to create next meeting instance';
			throw err;
		} finally {
			loading.value = false;
		}
	};

	const fetchAttendance = async (communityId: string, meetingId: string) => {
		loading.value = true;
		error.value = null;
		try {
			attendance.value = await api.getCommunityAttendance(communityId, meetingId);
			return attendance.value;
		} catch (err: any) {
			error.value = err.message || 'Failed to fetch attendance';
		} finally {
			loading.value = false;
		}
	};

	const recordAttendance = async (communityId: string, meetingId: string, records: any[]) => {
		loading.value = true;
		error.value = null;
		try {
			const updated = await api.recordCommunityAttendance(communityId, meetingId, records);
			attendance.value = updated;
			return updated;
		} catch (err: any) {
			error.value = err.message || 'Failed to record attendance';
			throw err;
		} finally {
			loading.value = false;
		}
	};

	const recordSingleAttendance = async (
		communityId: string,
		meetingId: string,
		memberId: string,
		attended: boolean,
	) => {
		try {
			return await api.recordSingleCommunityAttendance(communityId, meetingId, memberId, attended);
		} catch (err: any) {
			error.value = err.message || 'Failed to record attendance';
			throw err;
		}
	};

	const stats = ref<any>(null);

	const fetchDashboardStats = async (communityId: string) => {
		loading.value = true;
		error.value = null;
		try {
			stats.value = await api.getCommunityDashboardStats(communityId);
			return stats.value;
		} catch (err: any) {
			error.value = err.message || 'Failed to fetch dashboard stats';
		} finally {
			loading.value = false;
		}
	};

	const fetchAdmins = async (communityId: string) => {
		loading.value = true;
		error.value = null;
		try {
			admins.value = await api.getCommunityAdmins(communityId);
			return admins.value;
		} catch (err: any) {
			error.value = err.message || 'Failed to fetch admins';
		} finally {
			loading.value = false;
		}
	};

	const fetchInvitationStatus = async (token: string) => {
		loading.value = true;
		error.value = null;
		try {
			return await api.getCommunityInvitationStatus(token);
		} catch (err: any) {
			error.value = err.message || 'Failed to fetch invitation status';
			throw err;
		} finally {
			loading.value = false;
		}
	};

	const acceptInvitation = async (token: string) => {
		loading.value = true;
		error.value = null;
		try {
			const result = await api.acceptCommunityInvitation(token);
			return result;
		} catch (err: any) {
			error.value = err.message || 'Failed to accept invitation';
			throw err;
		} finally {
			loading.value = false;
		}
	};

	const inviteAdmin = async (communityId: string, email: string) => {
		loading.value = true;
		error.value = null;
		try {
			const invitation = await api.inviteCommunityAdmin(communityId, email);
			admins.value.push(invitation);
			return invitation;
		} catch (err: any) {
			error.value = err.message || 'Failed to invite admin';
			throw err;
		} finally {
			loading.value = false;
		}
	};

	const revokeAdmin = async (communityId: string, userId: string) => {
		loading.value = true;
		error.value = null;
		try {
			await api.revokeCommunityAdmin(communityId, userId);
			admins.value = admins.value.filter((a) => a.userId !== userId);
		} catch (err: any) {
			error.value = err.message || 'Failed to revoke admin';
			throw err;
		} finally {
			loading.value = false;
		}
	};

	const updateMemberNotes = async (communityId: string, memberId: string, notes: string | null) => {
		loading.value = true;
		error.value = null;
		try {
			const updated = await api.updateMemberNotes(communityId, memberId, notes);
			const index = members.value.findIndex((m) => m.id === memberId);
			if (index !== -1) {
				members.value[index] = {
					...members.value[index],
					...updated,
					participant: updated.participant || members.value[index].participant,
				};
			}
			return members.value[index];
		} catch (err: any) {
			error.value = err.message || 'Failed to update member notes';
			throw err;
		} finally {
			loading.value = false;
		}
	};

	const fetchMemberTimeline = async (communityId: string, memberId: string) => {
		loading.value = true;
		error.value = null;
		try {
			return await api.getMemberTimeline(communityId, memberId);
		} catch (err: any) {
			error.value = err.message || 'Failed to fetch member timeline';
			throw err;
		} finally {
			loading.value = false;
		}
	};

	// Undo the last action
	const undoLastAction = async () => {
		const action = actionHistory.value.pop();
		if (!action) return false;

		try {
			if (action.type === 'update' && action.entity === 'member') {
				await api.updateCommunityMemberState(
					action.communityId,
					action.data.memberId,
					action.data.previousState,
				);
				const index = members.value.findIndex((m) => m.id === action.data.memberId);
				if (index !== -1) {
					members.value[index].state = action.data.previousState;
				}
				return true;
			}
			// Add more undo types here as needed (delete, create, etc.)
			return false;
		} catch (err) {
			console.error('Failed to undo action:', err);
			// Put action back if undo failed
			actionHistory.value.push(action);
			return false;
		}
	};

	const canUndo = computed(() => actionHistory.value.length > 0);

	return {
		communities,
		currentCommunity,
		members,
		meetings,
		attendance,
		stats,
		admins,
		loading,
		loadingCommunity,
		error,
		membersByState,
		actionHistory,
		canUndo,
		fetchCommunities,
		fetchCommunity,
		createCommunity,
		updateCommunity,
		deleteCommunity,
		fetchMembers,
		importMembers,
		fetchPotentialMembers,
		updateMemberState,
		removeMember,
		updateMemberNotes,
		fetchMemberTimeline,
		fetchMeetings,
		createMeeting,
		updateMeeting,
		deleteMeeting,
		createNextMeetingInstance,
		fetchAttendance,
		recordAttendance,
		recordSingleAttendance,
		fetchDashboardStats,
		fetchAdmins,
		fetchInvitationStatus,
		acceptInvitation,
		inviteAdmin,
		revokeAdmin,
		undoLastAction,
	};
});
