import { Request, Response } from 'express';
import { CommunityService } from '../services/communityService';
import {
	createCommunitySchema,
	updateCommunitySchema,
	createCommunityMeetingSchema,
	updateCommunityMeetingSchema,
	importMembersSchema,
	updateMemberStateSchema,
	recordAttendanceSchema,
	inviteCommunityAdminSchema,
} from '@repo/types';

const communityService = new CommunityService();

export class CommunityController {
	// --- Community CRUD ---

	static async createCommunity(req: Request, res: Response) {
		const userId = (req.user as any).id;
		const community = await communityService.createCommunity(req.body, userId);
		res.status(201).json(community);
	}

	static async getCommunities(req: Request, res: Response) {
		const userId = (req.user as any).id;
		const communities = await communityService.getCommunities(userId);
		res.json(communities);
	}

	static async getCommunityById(req: Request, res: Response) {
		const { id } = req.params;
		const community = await communityService.getCommunityById(id);
		if (!community) {
			return res.status(404).json({ message: 'Community not found' });
		}
		res.json(community);
	}

	static async updateCommunity(req: Request, res: Response) {
		const { id } = req.params;
		const community = await communityService.updateCommunity(id, req.body);
		res.json(community);
	}

	static async deleteCommunity(req: Request, res: Response) {
		const { id } = req.params;
		await communityService.deleteCommunity(id);
		res.status(204).send();
	}

	// --- Member Management ---

	static async getMembers(req: Request, res: Response) {
		const { id } = req.params;
		const { state } = req.query;
		const members = await communityService.getMembers(id, state as any);
		res.json(members);
	}

	static async addMember(req: Request, res: Response) {
		const { id } = req.params;
		const { participantId } = req.body;
		const member = await communityService.addMember(id, participantId);
		res.status(201).json(member);
	}

	static async createCommunityMember(req: Request, res: Response) {
		const { id } = req.params;
		const participantData = req.body;
		const member = await communityService.createCommunityMember(id, participantData);
		res.status(201).json(member);
	}

	static async importFromRetreat(req: Request, res: Response) {
		const { id } = req.params;
		const { retreatId, participantIds } = req.body;
		const results = await communityService.importFromRetreat(id, retreatId, participantIds);
		res.status(201).json(results);
	}

	static async getPotentialMembers(req: Request, res: Response) {
		const { id } = req.params;
		const { retreatId } = req.query;
		if (!retreatId || typeof retreatId !== 'string') {
			return res.status(400).json({ message: 'retreatId query parameter is required' });
		}
		const participants = await communityService.getPotentialMembers(id, retreatId);
		res.json(participants);
	}

	static async updateMemberState(req: Request, res: Response) {
		const { memberId } = req.params;
		const { state } = req.body;
		const member = await communityService.updateMemberState(memberId, state);
		res.json(member);
	}

	static async removeMember(req: Request, res: Response) {
		const { memberId } = req.params;
		await communityService.removeMember(memberId);
		res.status(204).send();
	}

	static async updateMemberNotes(req: Request, res: Response) {
		const { memberId } = req.params;
		const { notes } = req.body;
		const member = await communityService.updateMemberNotes(memberId, notes);
		res.json(member);
	}

	static async getMemberTimeline(req: Request, res: Response) {
		const { memberId } = req.params;
		try {
			const timeline = await communityService.getMemberTimeline(memberId);
			res.json(timeline);
		} catch (error: any) {
			if (error.message === 'Member not found') {
				return res.status(404).json({ message: 'Member not found' });
			}
			throw error;
		}
	}

	// --- Meeting Management ---

	static async createMeeting(req: Request, res: Response) {
		const { id } = req.params;
		const meeting = await communityService.createMeeting(id, req.body);
		res.status(201).json(meeting);
	}

	static async getMeetings(req: Request, res: Response) {
		const { id } = req.params;
		const meetings = await communityService.getMeetings(id);
		res.json(meetings);
	}

	static async updateMeeting(req: Request, res: Response) {
		const { id: meetingId } = req.params;
		const scope = (req.query.scope as 'this' | 'all' | 'all_future') || 'this';
		try {
			const meeting = await communityService.updateMeeting(meetingId, req.body, scope);
			res.json(meeting);
		} catch (error: any) {
			if (error.message === 'Meeting not found') {
				return res.status(404).json({ message: 'Meeting not found' });
			}
			throw error;
		}
	}

	static async deleteMeeting(req: Request, res: Response) {
		const { id: meetingId } = req.params;
		const scope = (req.query.scope as 'this' | 'all' | 'all_future') || 'this';
		try {
			await communityService.deleteMeeting(meetingId, scope);
			res.status(204).send();
		} catch (error: any) {
			if (error.message === 'Meeting not found') {
				return res.status(404).json({ message: 'Meeting not found' });
			}
			throw error;
		}
	}

	// --- Recurrence Instance Management ---

	static async createNextMeetingInstance(req: Request, res: Response) {
		const { id: meetingId } = req.params;

		try {
			const newMeeting = await communityService.createNextMeetingInstance(meetingId);
			res.status(201).json(newMeeting);
		} catch (error: any) {
			if (error.message === 'Meeting not found') {
				return res.status(404).json({ message: 'Meeting not found' });
			}
			if (error.message === 'Meeting is not a recurrence template') {
				return res.status(400).json({ message: 'Meeting is not a recurrence template' });
			}
			if (
				error.message.includes('Failed to calculate') ||
				error.message.includes('must be in the future') ||
				error.message.includes('Maximum number') ||
				error.message.includes('already exists')
			) {
				return res.status(400).json({ message: error.message });
			}
			throw error;
		}
	}

	// --- Attendance Tracking ---

	static async recordAttendance(req: Request, res: Response) {
		const { meetingId } = req.params;
		const records = req.body;
		const attendance = await communityService.recordAttendance(meetingId, records);
		res.status(201).json(attendance);
	}

	static async recordSingleAttendance(req: Request, res: Response) {
		const { id: communityId, meetingId } = req.params;
		const { memberId, attended } = req.body;

		try {
			const attendance = await communityService.recordSingleAttendance(
				communityId,
				meetingId,
				memberId,
				attended,
			);
			res.status(201).json(attendance);
		} catch (error: any) {
			if (error.message === 'Member not found') {
				return res.status(404).json({ message: 'Member not found' });
			}
			throw error;
		}
	}

	static async getAttendance(req: Request, res: Response) {
		const { meetingId } = req.params;
		const attendance = await communityService.getAttendance(meetingId);
		res.json(attendance);
	}

	// --- Public Attendance (No Auth Required) ---

	static async getPublicAttendanceData(req: Request, res: Response) {
		const { communityId, meetingId } = req.params;
		const data = await communityService.getPublicAttendanceData(communityId, meetingId);

		if (!data) {
			return res.status(404).json({ message: 'Community or meeting not found' });
		}

		res.json(data);
	}

	static async recordPublicAttendance(req: Request, res: Response) {
		const { communityId, meetingId } = req.params;
		const { memberId, attended } = req.body;

		try {
			await communityService.recordSingleAttendance(communityId, meetingId, memberId, attended);
			res.json({ success: true, memberId, attended });
		} catch (error: any) {
			if (error.message === 'Member not found') {
				return res.status(404).json({ message: 'Member not found' });
			}
			throw error;
		}
	}

	// --- Dashboard & Analytics ---

	static async getDashboardStats(req: Request, res: Response) {
		const { id } = req.params;
		const stats = await communityService.getDashboardStats(id);
		res.json(stats);
	}

	// --- Admin Management ---

	static async inviteAdmin(req: Request, res: Response) {
		const { id } = req.params;
		const { email } = req.body;
		const userId = (req.user as any).id;
		const invitation = await communityService.inviteAdmin(id, email, userId);
		res.status(201).json(invitation);
	}

	static async getAdmins(req: Request, res: Response) {
		const { id } = req.params;
		const admins = await communityService.getAdmins(id);
		res.json(admins);
	}

	static async acceptInvitation(req: Request, res: Response) {
		const { token } = req.body;
		const userId = (req.user as any).id;
		const admin = await communityService.acceptInvitation(token, userId);
		res.json(admin);
	}

	static async getInvitationStatus(req: Request, res: Response) {
		const { token } = req.params;
		const status = await communityService.getInvitationStatus(token);
		if (!status) {
			return res.status(404).json({ message: 'Invitation not found' });
		}
		res.json(status);
	}

	static async revokeAdmin(req: Request, res: Response) {
		const { id, userId } = req.params;
		await communityService.revokeAdmin(id, userId);
		res.status(204).send();
	}
}
