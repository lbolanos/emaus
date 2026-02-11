import { AppDataSource } from '../data-source';
import { Community } from '../entities/community.entity';
import { CommunityMember } from '../entities/communityMember.entity';
import { CommunityMeeting } from '../entities/communityMeeting.entity';
import { CommunityAdmin } from '../entities/communityAdmin.entity';
import { CommunityAttendance } from '../entities/communityAttendance.entity';
import { User } from '../entities/user.entity';
import { Participant } from '../entities/participant.entity';
import { MemberState } from '@repo/types';
import { In, MoreThanOrEqual } from 'typeorm';
import { calculateNextOccurrence } from '../utils/recurrenceUtils';

export class CommunityService {
	private communityRepo = AppDataSource.getRepository(Community);
	private memberRepo = AppDataSource.getRepository(CommunityMember);
	private meetingRepo = AppDataSource.getRepository(CommunityMeeting);
	private adminRepo = AppDataSource.getRepository(CommunityAdmin);
	private attendanceRepo = AppDataSource.getRepository(CommunityAttendance);
	private participantRepo = AppDataSource.getRepository(Participant);

	// --- Community CRUD ---

	async createCommunity(data: Partial<Community>, userId: string) {
		const community = this.communityRepo.create({
			...data,
			createdBy: userId,
		});
		const savedCommunity = await this.communityRepo.save(community);

		// Automatically add creator as owner
		const admin = this.adminRepo.create({
			communityId: savedCommunity.id,
			userId,
			role: 'owner',
			status: 'active',
			acceptedAt: new Date(),
		});
		await this.adminRepo.save(admin);

		return savedCommunity;
	}

	async getCommunities(userId: string) {
		// Get communities where the user is an admin or owner
		const adminRecords = await this.adminRepo.find({
			where: { userId, status: 'active' },
			relations: ['community'],
		});

		const communities = adminRecords
			.map((record) => record.community)
			.filter((community) => community && community.id);

		// Add member count to each community
		const communitiesWithCounts = await Promise.all(
			communities.map(async (community) => {
				const memberCount = await this.memberRepo.count({
					where: { communityId: community.id },
				});
				return {
					...community,
					memberCount,
				};
			}),
		);

		return communitiesWithCounts;
	}

	async getCommunityById(id: string) {
		return this.communityRepo.findOne({
			where: { id },
			relations: ['creator'],
		});
	}

	async updateCommunity(id: string, data: Partial<Community>) {
		await this.communityRepo.update(id, data);
		return this.getCommunityById(id);
	}

	async deleteCommunity(id: string) {
		await this.communityRepo.delete(id);
	}

	// --- Member Management ---

	async getMembers(communityId: string, state?: MemberState) {
		const where: any = { communityId };
		if (state) {
			where.state = state;
		}

		const members = await this.memberRepo.find({
			where,
			relations: ['participant'],
		});

		// Calculate attendance rate for each member
		// Get all past meetings for this community (with startDate for filtering)
		const pastMeetings = await this.meetingRepo.find({
			where: { communityId },
			select: ['id', 'startDate'],
		});

		// Only calculate if there are meetings
		if (pastMeetings.length === 0) {
			return members
				.map((m) => ({
					...m,
					lastMeetingsAttendanceRate: 0,
					lastMeetingsFrequency: 'none' as const,
				}))
				.sort((a, b) => b.joinedAt.getTime() - a.joinedAt.getTime());
		}

		// Get all attendance records for these meetings
		const attendances = await this.attendanceRepo.find({
			where: { meetingId: In(pastMeetings.map((m) => m.id)) },
		});

		// Group attendance by member - store meeting IDs they attended
		const attendanceByMember: Record<string, string[]> = {};
		for (const record of attendances) {
			if (record.attended) {
				if (!attendanceByMember[record.memberId]) {
					attendanceByMember[record.memberId] = [];
				}
				attendanceByMember[record.memberId].push(record.meetingId);
			}
		}

		// Add calculated rate and frequency to each member
		// Only count meetings that occurred AFTER the member joined
		const membersWithRate = members.map((member) => {
			// Filter meetings to only include those on or after member's join date
			const meetingsSinceJoin = pastMeetings.filter((m) => m.startDate >= member.joinedAt);
			const meetingIdsSinceJoin = new Set(meetingsSinceJoin.map((m) => m.id));

			// Count only attendances to valid meetings (since member joined)
			const attendedMeetingIds = attendanceByMember[member.id] || [];
			const attendedCount = attendedMeetingIds.filter((id) => meetingIdsSinceJoin.has(id)).length;

			const totalValidMeetings = meetingsSinceJoin.length;
			const rate = totalValidMeetings > 0 ? (attendedCount / totalValidMeetings) * 100 : 0;

			// Determine frequency based on rate
			let frequency: 'high' | 'medium' | 'low' | 'none' = 'none';
			if (rate >= 75) {
				frequency = 'high';
			} else if (rate >= 25) {
				frequency = 'medium';
			} else if (rate >= 1) {
				frequency = 'low';
			} else {
				frequency = 'none';
			}

			return {
				...member,
				lastMeetingsAttendanceRate: rate,
				lastMeetingsFrequency: frequency,
			};
		});

		// Sort by attendance rate (highest first), then by join date
		return membersWithRate.sort((a, b) => {
			const rateDiff = (b.lastMeetingsAttendanceRate || 0) - (a.lastMeetingsAttendanceRate || 0);
			if (rateDiff !== 0) return rateDiff;
			return b.joinedAt.getTime() - a.joinedAt.getTime();
		});
	}

	async addMember(communityId: string, participantId: string) {
		const existing = await this.memberRepo.findOne({
			where: { communityId, participantId },
		});

		if (existing) return existing;

		const member = this.memberRepo.create({
			communityId,
			participantId,
			state: 'active_member',
		});

		return this.memberRepo.save(member);
	}

	async createCommunityMember(
		communityId: string,
		participantData: {
			firstName: string;
			lastName: string;
			email: string;
			cellPhone: string;
		},
	) {
		// 1. Create participant with retreatId: null and minimal required fields
		const participant = this.participantRepo.create({
			...participantData,
			retreatId: null,
			type: 'walker', // Default type for community members
			id_on_retreat: 0, // Required field, set to 0 for community members
			birthDate: new Date(), // Default date for community members
			maritalStatus: 'O', // Default marital status (Other)
			street: 'N/A',
			houseNumber: 'N/A',
			postalCode: '00000',
			neighborhood: 'N/A',
			city: 'N/A',
			state: 'N/A',
			country: 'N/A',
			occupation: 'N/A',
			snores: false,
			hasMedication: false,
			hasDietaryRestrictions: false,
			sacraments: ['none'],
			emergencyContact1Name: 'N/A',
			emergencyContact1Relation: 'N/A',
			emergencyContact1CellPhone: participantData.cellPhone,
		});

		const savedParticipant = await this.participantRepo.save(participant);

		// 2. Add to community
		const member = this.memberRepo.create({
			communityId,
			participantId: savedParticipant.id,
			state: 'active_member',
		});

		const savedMember = await this.memberRepo.save(member);

		// 3. Return member with participant data
		return this.memberRepo.findOne({
			where: { id: savedMember.id },
			relations: ['participant'],
		});
	}

	async importFromRetreat(communityId: string, retreatId: string, participantIds: string[]) {
		const results = [];
		for (const participantId of participantIds) {
			const member = await this.addMember(communityId, participantId);
			results.push(member);
		}
		return results;
	}

	async getPotentialMembers(communityId: string, retreatId: string) {
		// Get all participant IDs that are already in this community
		const existingMembers = await this.memberRepo.find({
			where: { communityId },
			select: ['participantId'],
		});
		const existingParticipantIds = new Set(existingMembers.map((m) => m.participantId));

		// Get all participants from the retreat
		const retreatParticipants = await this.participantRepo
			.createQueryBuilder('participant')
			.where('participant.retreatId = :retreatId', { retreatId })
			.getMany();

		// Filter out participants who are already in the community and add a flag
		return retreatParticipants.map((p) => ({
			...p,
			alreadyMember: existingParticipantIds.has(p.id),
		}));
	}

	async updateMemberState(memberId: string, state: MemberState) {
		await this.memberRepo.update(memberId, { state });
		return this.memberRepo.findOne({ where: { id: memberId } });
	}

	async removeMember(memberId: string) {
		await this.memberRepo.delete(memberId);
	}

	async updateMemberNotes(memberId: string, notes: string | null) {
		await this.memberRepo.update(memberId, { notes });
		return this.memberRepo.findOne({
			where: { id: memberId },
			relations: ['participant', 'community'],
		});
	}

	async getMemberTimeline(memberId: string) {
		const member = await this.memberRepo.findOne({
			where: { id: memberId },
			relations: ['participant', 'community'],
		});

		if (!member) {
			throw new Error('Member not found');
		}

		// Get all attendance records for this member
		const attendances = await this.attendanceRepo.find({
			where: { memberId },
			relations: ['meeting'],
			order: { recordedAt: 'DESC' },
		});

		// Get all meetings for this community to build timeline
		const meetings = await this.meetingRepo.find({
			where: { communityId: member.communityId },
			order: { startDate: 'DESC' },
		});

		return {
			member,
			attendances,
			meetings,
		};
	}

	// --- Meeting Management ---

	async createMeeting(communityId: string, data: Partial<CommunityMeeting>) {
		const meeting = this.meetingRepo.create({
			...data,
			communityId,
			isRecurrenceTemplate: !!data.recurrenceFrequency, // Mark as template if recurring
		});
		return this.meetingRepo.save(meeting);
	}

	async getMeetings(communityId: string) {
		const meetings = await this.meetingRepo.find({
			where: { communityId },
			order: { startDate: 'DESC' },
		});

		// Get all members for this community (active members only)
		const allMembers = await this.memberRepo.find({
			where: { communityId, state: 'active_member' },
		});

		// Add attendance counts to each meeting
		const meetingsWithCounts = await Promise.all(
			meetings.map(async (meeting) => {
				// Get members who joined before or on the meeting date
				const eligibleMembers = allMembers.filter((m) => m.joinedAt <= meeting.startDate);

				// Get attendance records for this meeting
				const attendances = await this.attendanceRepo.find({
					where: { meetingId: meeting.id },
				});

				const attendeeCount = attendances.filter((a) => a.attended === true).length;
				// Count members with attended:false records + members without any record
				const absentCount =
					attendances.filter((a) => a.attended === false).length +
					(eligibleMembers.length - attendances.length);

				return {
					...meeting,
					attendeeCount,
					absentCount,
				};
			}),
		);

		return meetingsWithCounts;
	}

	async getMeetingById(id: string) {
		return this.meetingRepo.findOne({ where: { id } });
	}

	async updateMeeting(
		id: string,
		data: Partial<CommunityMeeting>,
		scope: 'this' | 'all' | 'all_future' = 'this',
	) {
		const meeting = await this.getMeetingById(id);

		if (!meeting) {
			throw new Error('Meeting not found');
		}

		// Update isRecurrenceTemplate based on recurrenceFrequency
		// If recurrenceFrequency is explicitly being set, update isRecurrenceTemplate accordingly
		if ('recurrenceFrequency' in data) {
			data.isRecurrenceTemplate = !!data.recurrenceFrequency;
		}

		// If not a recurrence template or scope is 'this', do simple update
		if (!meeting.isRecurrenceTemplate || scope === 'this') {
			await this.meetingRepo.update(id, data);
			return this.getMeetingById(id);
		}

		// For recurrence templates with scope 'all' or 'all_future'
		if (scope === 'all') {
			// Update the template - instances are generated on-the-fly
			await this.meetingRepo.update(id, data);
			return this.getMeetingById(id);
		}

		if (scope === 'all_future') {
			// For 'all_future', we update the template which affects all future occurrences
			// Past instances that were already created as exceptions are not affected
			await this.meetingRepo.update(id, data);
			return this.getMeetingById(id);
		}

		return this.getMeetingById(id);
	}

	async deleteMeeting(id: string, scope: 'this' | 'all' | 'all_future' = 'this') {
		const meeting = await this.getMeetingById(id);

		if (!meeting) {
			throw new Error('Meeting not found');
		}

		// If not a recurrence template or scope is 'this', do simple delete
		if (!meeting.isRecurrenceTemplate || scope === 'this') {
			await this.attendanceRepo.delete({ meetingId: id });
			await this.meetingRepo.delete(id);
			return;
		}

		// For recurrence templates
		if (scope === 'all') {
			// Delete all instances and the template
			await this.attendanceRepo.delete({ meetingId: id });
			await this.meetingRepo.delete({ parentMeetingId: id });
			await this.meetingRepo.delete(id);
			return;
		}

		if (scope === 'all_future') {
			// Remove recurrence to stop future occurrences
			// Keep the meeting as a one-time event
			await this.meetingRepo.update(id, {
				recurrenceFrequency: null,
				recurrenceInterval: null,
				recurrenceDayOfWeek: null,
				recurrenceDayOfMonth: null,
				isRecurrenceTemplate: false,
			});
			return;
		}
	}

	// --- Recurrence Instance Management ---

	async createNextMeetingInstance(meetingId: string) {
		// 1. Fetch the meeting
		const meeting = await this.getMeetingById(meetingId);

		if (!meeting) {
			throw new Error('Meeting not found');
		}

		// 2. Validate it's a recurrence template
		if (!meeting.isRecurrenceTemplate) {
			throw new Error('Meeting is not a recurrence template');
		}

		// 3. Calculate next occurrence
		const nextStartDate = calculateNextOccurrence(
			meeting.startDate,
			meeting.recurrenceFrequency,
			meeting.recurrenceInterval,
			meeting.recurrenceDayOfWeek,
			meeting.recurrenceDayOfMonth,
		);

		if (!nextStartDate) {
			throw new Error('Failed to calculate next occurrence');
		}

		// 4. Track if next date is in the past (allow but warn)
		const isPastDate = nextStartDate <= new Date();

		// 5. Check if an instance with this date already exists
		const existingInstance = await this.meetingRepo.findOne({
			where: {
				communityId: meeting.communityId,
				parentMeetingId: meetingId,
				startDate: nextStartDate,
			},
		});

		if (existingInstance) {
			throw new Error('A meeting instance for this date already exists');
		}

		// 6. Check for maximum instances (optional safety limit)
		const existingInstances = await this.meetingRepo.count({
			where: {
				communityId: meeting.communityId,
				parentMeetingId: meetingId,
			},
		});

		if (existingInstances >= 52) {
			// Max 52 instances (1 year of weekly)
			throw new Error('Maximum number of instances reached (52)');
		}

		// 7. Create the new instance with recurrence data copied
		const newMeeting = this.meetingRepo.create({
			communityId: meeting.communityId,
			title: meeting.title,
			description: meeting.description,
			startDate: nextStartDate,
			endDate: meeting.endDate
				? new Date(
						nextStartDate.getTime() + (meeting.endDate.getTime() - meeting.startDate.getTime()),
					)
				: undefined,
			durationMinutes: meeting.durationMinutes,
			isAnnouncement: meeting.isAnnouncement,
			// Copy recurrence configuration so this instance can also create further instances
			recurrenceFrequency: meeting.recurrenceFrequency,
			recurrenceInterval: meeting.recurrenceInterval,
			recurrenceDayOfWeek: meeting.recurrenceDayOfWeek,
			recurrenceDayOfMonth: meeting.recurrenceDayOfMonth,
			flyerTemplate: meeting.flyerTemplate,
			isRecurrenceTemplate: true,
			// Link to parent
			parentMeetingId: meetingId,
			instanceDate: nextStartDate,
		});

		const saved = await this.meetingRepo.save(newMeeting);
		return { meeting: saved, isPastDate };
	}

	// --- Attendance Tracking ---

	async recordAttendance(
		meetingId: string,
		records: { memberId: string; attended: boolean; notes?: string }[],
	) {
		// Clear existing attendance for this meeting to avoid duplicates
		await this.attendanceRepo.delete({ meetingId });

		const attendanceEntries = records.map((record) =>
			this.attendanceRepo.create({
				meetingId,
				memberId: record.memberId,
				attended: record.attended,
				notes: record.notes,
			}),
		);

		return this.attendanceRepo.save(attendanceEntries);
	}

	async getAttendance(meetingId: string) {
		return this.attendanceRepo.find({
			where: { meetingId },
			relations: ['member', 'member.participant'],
		});
	}

	async getPublicCommunities() {
		// Return basic info for all communities for the map
		return this.communityRepo.find({
			select: ['id', 'name', 'city', 'state', 'latitude', 'longitude'],
		});
	}

	async getPublicMeetings() {
		// Return upcoming public meetings (next 30 days)
		const now = new Date();
		const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

		return this.meetingRepo.find({
			where: {
				startDate: MoreThanOrEqual(now),
				isAnnouncement: false,
				// We'd ideally filter by date range but TypeORM simple find is limited.
				// Let's just get future ones and limit.
			},
			relations: ['community'],
			order: { startDate: 'ASC' },
			take: 20,
		});
	}

	async getPublicAttendanceData(communityId: string, meetingId: string) {
		// Verify community and meeting exist
		const community = await this.communityRepo.findOne({ where: { id: communityId } });
		const meeting = await this.meetingRepo.findOne({ where: { id: meetingId, communityId } });

		if (!community || !meeting) {
			return null;
		}

		// Get members with their participants
		const members = await this.memberRepo.find({
			where: { communityId },
			relations: ['participant'],
			order: { joinedAt: 'ASC' },
		});

		// Get existing attendance
		const attendance = await this.attendanceRepo.find({
			where: { meetingId },
		});

		// Return combined data
		return {
			communityId,
			communityName: community.name,
			meetingId,
			meetingTitle: meeting.title,
			meetingStartDate: meeting.startDate,
			members: members.map((member) => ({
				id: member.id,
				participant: {
					firstName: member.participant.firstName,
					lastName: member.participant.lastName,
					cellPhone: member.participant.cellPhone,
					homePhone: member.participant.homePhone,
					workPhone: member.participant.workPhone,
				},
				attended: attendance.find((a) => a.memberId === member.id)?.attended || false,
			})),
		};
	}

	async recordSingleAttendance(
		communityId: string,
		meetingId: string,
		memberId: string,
		attended: boolean,
	) {
		// Verify member belongs to community
		const member = await this.memberRepo.findOne({
			where: { id: memberId, communityId },
		});

		if (!member) {
			throw new Error('Member not found');
		}

		// Upsert attendance record
		const existing = await this.attendanceRepo.findOne({
			where: { meetingId, memberId },
		});

		if (existing) {
			existing.attended = attended;
			existing.recordedAt = new Date();
			return this.attendanceRepo.save(existing);
		} else {
			const attendance = this.attendanceRepo.create({
				meetingId,
				memberId,
				attended,
				recordedAt: new Date(),
			});
			return this.attendanceRepo.save(attendance);
		}
	}

	// --- Dashboard & Analytics ---

	async getDashboardStats(communityId: string) {
		const now = new Date();

		// 1. Members and Basic Counts
		const members = await this.memberRepo.find({ where: { communityId } });
		const activeMembers = members.filter((m) => m.state === 'active_member');

		// 2. Member State Distribution
		const stateDistribution = members.reduce(
			(acc, member) => {
				acc[member.state] = (acc[member.state] || 0) + 1;
				return acc;
			},
			{} as Record<string, number>,
		);

		// 3. Meeting Counts
		const allMeetings = await this.meetingRepo.find({
			where: { communityId, isAnnouncement: false },
			order: { startDate: 'DESC' },
		});

		const pastMeetings = allMeetings.filter((m) => m.startDate <= now);
		const upcomingMeetings = allMeetings.filter((m) => m.startDate > now);

		// 4. Average Attendance and Recent Meetings
		let averageAttendance = 0;
		const recentMeetings = [];
		const frequencyDistribution = {
			high: 0,
			medium: 0,
			low: 0,
			none: 0,
		};

		if (allMeetings.length > 0) {
			// A meeting is "relevant" for attendance if it's in the past OR has at least one attendance record
			const relevantUpcomingWithAttendance = await Promise.all(
				upcomingMeetings.map(async (m) => {
					const count = await this.attendanceRepo.count({ where: { meetingId: m.id } });
					return count > 0 ? m : null;
				}),
			);

			const relevantMeetings = [
				...pastMeetings,
				...relevantUpcomingWithAttendance.filter((m): m is CommunityMeeting => m !== null),
			].sort((a, b) => b.startDate.getTime() - a.startDate.getTime());

			const meetingsForAvg = relevantMeetings.slice(0, 10);
			let totalAttendanceRate = 0;
			let meetingsWithValidRate = 0;

			for (const meeting of relevantMeetings) {
				// Eligible members = joined before or on meeting date
				let eligibleMemberCount = activeMembers.filter(
					(m) => m.joinedAt <= meeting.startDate,
				).length;

				// Fallback: If no members joined yet (historical data), use current active members count
				if (eligibleMemberCount === 0) {
					eligibleMemberCount = activeMembers.length;
				}

				let rate = 0;
				if (eligibleMemberCount > 0) {
					const attendanceCount = await this.attendanceRepo.count({
						where: {
							meetingId: meeting.id,
							attended: true,
						},
					});
					rate = (attendanceCount / eligibleMemberCount) * 100;

					// Add to average if it's one of the last 10
					if (meetingsForAvg.some((m) => m.id === meeting.id)) {
						totalAttendanceRate += rate;
						meetingsWithValidRate++;
					}
				}

				// If it's one of the last 5, add to recent meetings list
				if (recentMeetings.length < 5 && meeting.startDate <= now) {
					recentMeetings.push({
						id: meeting.id,
						title: meeting.title,
						startDate: meeting.startDate,
						attendancePercent: Math.round(rate),
					});
				}
			}

			if (meetingsWithValidRate > 0) {
				averageAttendance = totalAttendanceRate / meetingsWithValidRate;
			}

			// 5. Participation Frequency (Calculated on current members over last 10 relevant meetings)
			const last10MeetingIdsForFreq = meetingsForAvg.map((m) => m.id);

			for (const member of members) {
				// A meeting is "valid" for a member if it occurred after they joined
				// OR if they have an attendance record for it (handles historical data)
				const attendances = await this.attendanceRepo.find({
					where: {
						memberId: member.id,
						meetingId: In(last10MeetingIdsForFreq),
						attended: true,
					},
				});
				const attendedMeetingIds = new Set(attendances.map((a) => a.meetingId));

				const validMeetingsForMember = meetingsForAvg.filter(
					(m) => m.startDate >= member.joinedAt || attendedMeetingIds.has(m.id),
				);

				if (validMeetingsForMember.length === 0) {
					frequencyDistribution.none++;
					continue;
				}

				const rate = attendedMeetingIds.size / validMeetingsForMember.length;
				if (rate >= 0.75) frequencyDistribution.high++;
				else if (rate >= 0.25) frequencyDistribution.medium++;
				else if (rate > 0) frequencyDistribution.low++;
				else frequencyDistribution.none++;
			}
		} else {
			frequencyDistribution.none = members.length;
		}

		return {
			memberCount: members.length,
			meetingCount: pastMeetings.length,
			upcomingMeetingsCount: upcomingMeetings.length,
			averageAttendance,
			recentMeetings,
			memberStateDistribution: Object.entries(stateDistribution).map(([state, count]) => ({
				state,
				count,
			})),
			participationFrequency: Object.entries(frequencyDistribution).map(([frequency, count]) => ({
				frequency,
				count,
			})),
		};
	}

	// --- Admin Management ---

	async inviteAdmin(communityId: string, email: string, invitedBy: string) {
		// Find user by email
		const userRepo = AppDataSource.getRepository(User);
		const user = await userRepo.findOne({ where: { email } });

		if (!user) {
			// In a real app, we might create a pending user or send an invitation literal
			// For now, let's assume the user must exist
			throw new Error('User not found');
		}

		const invitationToken = Math.random().toString(36).substring(2, 15);
		const invitationExpiresAt = new Date();
		invitationExpiresAt.setDate(invitationExpiresAt.getDate() + 7);

		const admin = this.adminRepo.create({
			communityId,
			userId: user.id,
			role: 'admin',
			status: 'pending',
			invitedBy,
			invitationToken,
			invitationExpiresAt,
		});

		return this.adminRepo.save(admin);
	}

	async getAdmins(communityId: string) {
		return this.adminRepo.find({
			where: { communityId },
			relations: ['user', 'inviter'],
		});
	}

	async getInvitationStatus(token: string) {
		const invitation = await this.adminRepo.findOne({
			where: { invitationToken: token, status: 'pending' },
			relations: ['community', 'user'],
		});

		if (!invitation) return null;

		if (invitation.invitationExpiresAt && invitation.invitationExpiresAt < new Date()) {
			return { valid: false, message: 'Invitation has expired' };
		}

		return {
			valid: true,
			community: invitation.community,
			user: invitation.user,
			invitationExpiresAt: invitation.invitationExpiresAt,
		};
	}

	async acceptInvitation(token: string, userId: string) {
		const invitation = await this.adminRepo.findOne({
			where: { invitationToken: token, userId, status: 'pending' },
		});

		if (!invitation) {
			throw new Error('Invalid or expired invitation');
		}

		invitation.status = 'active';
		invitation.acceptedAt = new Date();
		invitation.invitationToken = undefined;

		const saved = await this.adminRepo.save(invitation);

		// Invalidate user permission cache
		const { performanceOptimizationService } = await import('./performanceOptimizationService');
		performanceOptimizationService.invalidateUserPermissionCache(userId);
		performanceOptimizationService.invalidateUserRetreatCache(userId);
		performanceOptimizationService.invalidateUserPermissionsResultCache(userId);

		return saved;
	}

	async revokeAdmin(communityId: string, userId: string) {
		const admin = await this.adminRepo.findOne({ where: { communityId, userId } });
		if (admin && admin.role !== 'owner') {
			await this.adminRepo.delete(admin.id);
		} else if (admin && admin.role === 'owner') {
			throw new Error('Cannot revoke owner');
		}
	}

	async findMemberByEmailAndCommunity(email: string, communityId: string) {
		const participant = await this.participantRepo.findOne({
			where: { email },
		});

		if (!participant) return null;

		return await this.memberRepo.findOne({
			where: { communityId, participantId: participant.id },
		});
	}

	async createPublicJoinRequest(
		communityId: string,
		participantData: {
			firstName: string;
			lastName: string;
			email: string;
			cellPhone?: string;
		},
	) {
		// 1. Create participant with retreatId: null and minimal required fields
		const participant = this.participantRepo.create({
			firstName: participantData.firstName,
			lastName: participantData.lastName,
			email: participantData.email,
			cellPhone: participantData.cellPhone || '',
			retreatId: null,
			type: 'walker', // Default type for community members
			id_on_retreat: 0, // Required field, set to 0 for community members
			birthDate: new Date(), // Default date for community members
			maritalStatus: 'O', // Default marital status (Other)
			street: 'N/A',
			houseNumber: 'N/A',
			postalCode: '00000',
			neighborhood: 'N/A',
			city: 'N/A',
			state: 'N/A',
			country: 'N/A',
			occupation: 'N/A',
			snores: false,
			hasMedication: false,
			hasDietaryRestrictions: false,
			sacraments: ['none'],
			emergencyContact1Name: 'N/A',
			emergencyContact1Relation: 'N/A',
			emergencyContact1CellPhone: participantData.cellPhone || 'N/A',
		});

		const savedParticipant = await this.participantRepo.save(participant);

		// 2. Add to community with pending_verification state
		const member = this.memberRepo.create({
			communityId,
			participantId: savedParticipant.id,
			state: 'pending_verification',
		});

		const savedMember = await this.memberRepo.save(member);

		// 3. Return member with participant data
		return this.memberRepo.findOne({
			where: { id: savedMember.id },
			relations: ['participant'],
		});
	}
}
