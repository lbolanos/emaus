import { AppDataSource } from '../data-source';
import { User } from '../entities/user.entity';
import { UserProfile } from '../entities/userProfile.entity';
import { Participant } from '../entities/participant.entity';
import { In } from 'typeorm';
import {
	MENU_ROUTE_NAMES,
	DEFAULT_FAVORITE_MENU_ITEMS,
	FAVORITE_MENU_ITEMS_LIMIT,
} from '@repo/types';

const userRepository = AppDataSource.getRepository(User);
const userProfileRepository = AppDataSource.getRepository(UserProfile);
const participantRepository = AppDataSource.getRepository(Participant);

// favoriteMenuItems is a private sidebar preference and must never leave the
// owner's own GET /social/profile.
const toPublicProfile = (profile: UserProfile | null): UserProfile => {
	if (!profile) return {} as UserProfile;
	const { favoriteMenuItems, ...publicProfile } = profile;
	return publicProfile as UserProfile;
};

export interface UserProfileData {
	bio?: string | null;
	location?: string | null;
	website?: string | null;
	showEmail?: boolean;
	showPhone?: boolean;
	showRetreats?: boolean;
	interests?: string[];
	skills?: string[];
	favoriteMenuItems?: string[] | null;
}

// The menu routes the user visits most according to their own page_view
// telemetry, filtered to routes that actually have a menu item (page names
// like `community-dashboard` have no item and would waste a slot). Carries
// the view count so the suggestions popover can show WHY a route is offered.
const getTopViewedMenuRoutes = async (
	userId: string,
	limit: number,
): Promise<Array<{ route: string; views: number }>> => {
	const knownRoutes = new Set<string>(MENU_ROUTE_NAMES);
	const rows: Array<{ page: string | null; views: number }> = await AppDataSource.query(
		`SELECT json_extract(eventData, '$.page') AS page, COUNT(*) AS views
		 FROM telemetry_events
		 WHERE userId = ? AND eventType = 'page_view'
		 GROUP BY page
		 ORDER BY views DESC
		 LIMIT 50`,
		[userId],
	);
	return rows
		.filter((row) => !!row.page && knownRoutes.has(row.page))
		.map((row) => ({ route: row.page as string, views: Number(row.views) }))
		.slice(0, limit);
};

// First-use seed for sidebar favorites (specs/menu-favorites D5): the 5 menu
// items the user visits most, falling back to the aggregate default for users
// with no useful history.
export const seedFavoriteMenuItems = async (
	userId: string,
	profile: UserProfile,
): Promise<UserProfile> => {
	const seeded = await getTopViewedMenuRoutes(userId, 5);
	profile.favoriteMenuItems =
		seeded.length > 0
			? [...new Set(seeded.map((entry) => entry.route))]
			: [...DEFAULT_FAVORITE_MENU_ITEMS];
	return await userProfileRepository.save(profile);
};

// Suggestions for the favorites popover (specs/menu-favorites D10): the menu
// routes the user visits most that are NOT pinned yet — telemetry first, then
// the aggregate defaults, so the list degrades gracefully for users with no
// history. Computed on every read; never persisted. `views` is 0 for default
// entries with no telemetry of their own (the popover hides the count then).
export const getFavoriteSuggestions = async (
	userId: string,
	currentFavorites: string[],
): Promise<Array<{ route: string; views: number }>> => {
	const pinned = new Set(currentFavorites);
	const topViewed = await getTopViewedMenuRoutes(userId, 12);
	const byRoute = new Map<string, number>(
		topViewed.map((entry) => [entry.route, entry.views]),
	);
	const candidates = [
		...topViewed.map((entry) => entry.route),
		...DEFAULT_FAVORITE_MENU_ITEMS,
	];
	return [...new Set(candidates)]
		.filter((route) => !pinned.has(route))
		.map((route) => ({ route, views: byRoute.get(route) ?? 0 }))
		.slice(0, 5);
};

export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
	const profile = await userProfileRepository.findOne({
		where: { userId },
	});

	if (!profile) {
		// Create default profile if it doesn't exist (and seed its favorites —
		// the column would otherwise stay null until the next load).
		const newProfile = userProfileRepository.create({ userId });
		const saved = await userProfileRepository.save(newProfile);
		return await seedFavoriteMenuItems(userId, saved);
	}

	// null = favorites never initialized (column just added or fresh profile):
	// seed once. `[]` is a deliberate empty list and is left untouched.
	if (profile.favoriteMenuItems === null) {
		return await seedFavoriteMenuItems(userId, profile);
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

	const dataToAssign = { ...data };
	// Private UI preference: dedupe and cap so a buggy client cannot grow it
	// unbounded (the zod schema caps it too — this is defense in depth).
	if (Array.isArray(dataToAssign.favoriteMenuItems)) {
		dataToAssign.favoriteMenuItems = [...new Set(dataToAssign.favoriteMenuItems)].slice(
			0,
			FAVORITE_MENU_ITEMS_LIMIT,
		);
	}

	Object.assign(profile, dataToAssign);
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
	// favoriteMenuItems is a private UI preference, never shown to other users.
	delete (filteredProfile as any).favoriteMenuItems;
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

	const { password, invitationToken, invitationExpiresAt, passwordResetToken, passwordResetTokenExpiresAt, passwordResetTokenUsedAt, ...safeUser } = user as any;
	return {
		user: {
			...safeUser,
			email: profile.showEmail ? user.email : undefined,
		},
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

	// Build query for user search — exclude sensitive fields
	// Escape LIKE wildcard characters to prevent injection
	const escapedQuery = query.replace(/[%_\\]/g, '\\$&');
	const queryBuilder = userRepository
		.createQueryBuilder('user')
		.select([
			'user.id',
			'user.email',
			'user.displayName',
			'user.photo',
			'user.isPending',
			'user.createdAt',
		])
		.leftJoinAndSelect('user.profile', 'profile')
		.where(
			"user.displayName LIKE :query ESCAPE '\\' OR user.email LIKE :query ESCAPE '\\'",
			{ query: `%${escapedQuery}%` },
		);

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
			// Strip the private UI preference from search results too.
			profile: toPublicProfile(user.profile || (await getUserProfile(user.id))),
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
