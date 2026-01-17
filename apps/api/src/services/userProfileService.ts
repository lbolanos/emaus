import { AppDataSource } from '../data-source';
import { User } from '../entities/user.entity';
import { UserProfile } from '../entities/userProfile.entity';
import { Participant } from '../entities/participant.entity';
import { In } from 'typeorm';

const userRepository = AppDataSource.getRepository(User);
const userProfileRepository = AppDataSource.getRepository(UserProfile);
const participantRepository = AppDataSource.getRepository(Participant);

export interface UserProfileData {
	bio?: string | null;
	location?: string | null;
	website?: string | null;
	showEmail?: boolean;
	showPhone?: boolean;
	showRetreats?: boolean;
	interests?: string[];
	skills?: string[];
}

export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
	const profile = await userProfileRepository.findOne({
		where: { userId },
	});

	if (!profile) {
		// Create default profile if it doesn't exist
		const newProfile = userProfileRepository.create({ userId });
		return await userProfileRepository.save(newProfile);
	}

	return profile;
};

export const updateUserProfile = async (
	userId: string,
	data: UserProfileData,
): Promise<UserProfile> => {
	const profile = await getUserProfile(userId);

	if (!profile) {
		throw new Error('Profile not found');
	}

	Object.assign(profile, data);
	return await userProfileRepository.save(profile);
};

export const getPublicProfile = async (
	userId: string,
	viewerId?: string,
): Promise<{
	user: User;
	profile: UserProfile;
	participant?: Participant | null;
	isFriend?: boolean;
	isFollowing?: boolean;
} | null> => {
	const user = await userRepository.findOne({
		where: { id: userId },
		relations: ['profile'],
	});

	if (!user) {
		return null;
	}

	let profile = user.profile;
	if (!profile) {
		profile = await getUserProfile(userId);
	}

	// Get participant data if userId is linked
	const participant = await participantRepository.findOne({
		where: { userId },
	});

	// Filter data based on privacy settings
	const filteredProfile: UserProfile = {
		...profile,
	};

	if (!profile.showEmail) {
		delete (filteredProfile as any).email;
	}
	if (!profile.showPhone) {
		delete (filteredProfile as any).phone;
	}

	// Check friendship and follow status
	let isFriend = false;
	let isFollowing = false;

	if (viewerId && viewerId !== userId) {
		const { Friend } = await import('../entities/friend.entity');
		const { Follow } = await import('../entities/follow.entity');
		const friendRepository = AppDataSource.getRepository(Friend);
		const followRepository = AppDataSource.getRepository(Follow);

		const friend = await friendRepository.findOne({
			where: [
				{ userId: viewerId, friendId: userId, status: 'accepted' },
				{ userId: userId, friendId: viewerId, status: 'accepted' },
			],
		});
		isFriend = !!friend;

		const follow = await followRepository.findOne({
			where: { followerId: viewerId, followingId: userId },
		});
		isFollowing = !!follow;
	}

	return {
		user: {
			...user,
			email: profile.showEmail ? user.email : undefined,
		} as User,
		profile: filteredProfile,
		participant,
		isFriend,
		isFollowing,
	};
};

export const searchUsers = async (
	query: string,
	filters: {
		interests?: string[];
		skills?: string[];
		location?: string;
		retreatId?: string;
	} = {},
): Promise<Array<{ user: User; profile: UserProfile; participant?: Participant }>> => {
	const { interests, skills, location, retreatId } = filters;

	// Build query for user search
	const queryBuilder = userRepository
		.createQueryBuilder('user')
		.leftJoinAndSelect('user.profile', 'profile')
		.where('user.displayName LIKE :query OR user.email LIKE :query', { query: `%${query}%` });

	// Apply profile filters
	if (interests && interests.length > 0) {
		queryBuilder.andWhere('profile.interests LIKE :interests', {
			interests: `%${interests[0]}%`,
		});
	}

	if (skills && skills.length > 0) {
		queryBuilder.andWhere('profile.skills LIKE :skills', {
			skills: `%${skills[0]}%`,
		});
	}

	if (location) {
		queryBuilder.andWhere('profile.location LIKE :location', {
			location: `%${location}%`,
		});
	}

	const users = await queryBuilder.getMany();

	// Filter by retreat if specified
	let results: Array<{ user: User; profile: UserProfile; participant?: Participant }> = [];

	for (const user of users) {
		let participant: Participant | undefined;

		if (retreatId) {
			participant = await participantRepository.findOne({
				where: { userId: user.id, retreatId },
			});
			if (!participant) continue;
		} else {
			participant = await participantRepository.findOne({
				where: { userId: user.id },
			});
		}

		results.push({
			user,
			profile: user.profile || (await getUserProfile(user.id)),
			participant,
		});
	}

	return results;
};

export const linkUserToParticipant = async (
	userId: string,
	participantId: string,
): Promise<{ user: User; participant: Participant }> => {
	const user = await userRepository.findOneBy({ id: userId });
	const participant = await participantRepository.findOneBy({ id: participantId });

	if (!user) {
		throw new Error('User not found');
	}

	if (!participant) {
		throw new Error('Participant not found');
	}

	// Update both sides of the relationship
	user.participantId = participantId;
	participant.userId = userId;

	await userRepository.save(user);
	await participantRepository.save(participant);

	return { user, participant };
};

export const unlinkUserFromParticipant = async (userId: string): Promise<void> => {
	const user = await userRepository.findOneBy({ id: userId });

	if (!user || !user.participantId) {
		throw new Error('User not linked to any participant');
	}

	const participant = await participantRepository.findOneBy({
		id: user.participantId,
	});

	if (participant) {
		participant.userId = null;
		await participantRepository.save(participant);
	}

	user.participantId = null;
	await userRepository.save(user);
};
