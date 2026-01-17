import { AppDataSource } from '../data-source';
import { User } from '../entities/user.entity';
import { Friend, FriendStatus } from '../entities/friend.entity';
import { Follow } from '../entities/follow.entity';
import { UserActivity } from '../entities/userActivity.entity';

const userRepository = AppDataSource.getRepository(User);
const friendRepository = AppDataSource.getRepository(Friend);
const followRepository = AppDataSource.getRepository(Follow);
const userActivityRepository = AppDataSource.getRepository(UserActivity);

// ==================== FRIEND REQUESTS ====================

export const sendFriendRequest = async (userId: string, friendId: string): Promise<Friend> => {
	if (userId === friendId) {
		throw new Error('Cannot send friend request to yourself');
	}

	// Check if a relationship already exists
	const existingRelationship = await friendRepository.findOne({
		where: [
			{ userId, friendId },
			{ userId: friendId, friendId: userId },
		],
	});

	if (existingRelationship) {
		if (existingRelationship.status === 'accepted') {
			throw new Error('Already friends');
		}
		if (existingRelationship.status === 'pending') {
			throw new Error('Friend request already pending');
		}
		if (existingRelationship.status === 'blocked') {
			throw new Error('Cannot send friend request: blocked');
		}
	}

	const friendRequest = friendRepository.create({
		userId,
		friendId,
		status: 'pending',
	});

	const saved = await friendRepository.save(friendRequest);

	// Create activity
	await createActivity(userId, 'friend_request_sent', `Sent a friend request`, {
		friendId,
	});

	return saved;
};

export const acceptFriendRequest = async (userId: string, requesterId: string): Promise<Friend> => {
	const friendRequest = await friendRepository.findOne({
		where: { userId: requesterId, friendId: userId, status: 'pending' },
	});

	if (!friendRequest) {
		throw new Error('Friend request not found');
	}

	friendRequest.status = 'accepted';
	friendRequest.respondedAt = new Date();

	const saved = await friendRepository.save(friendRequest);

	// Create activities for both users
	await createActivity(userId, 'friend_request_accepted', `Accepted a friend request`, {
		friendId: requesterId,
	});
	await createActivity(requesterId, 'friend_request_accepted', `Friend request accepted`, {
		friendId: userId,
	});

	return saved;
};

export const rejectFriendRequest = async (userId: string, requesterId: string): Promise<void> => {
	const friendRequest = await friendRepository.findOne({
		where: { userId: requesterId, friendId: userId, status: 'pending' },
	});

	if (!friendRequest) {
		throw new Error('Friend request not found');
	}

	await friendRepository.remove(friendRequest);
};

export const removeFriend = async (userId: string, friendId: string): Promise<void> => {
	const friendship = await friendRepository.findOne({
		where: [
			{ userId, friendId, status: 'accepted' },
			{ userId: friendId, friendId: userId, status: 'accepted' },
		],
	});

	if (!friendship) {
		throw new Error('Friendship not found');
	}

	await friendRepository.remove(friendship);
};

export const getFriends = async (
	userId: string,
): Promise<Array<{ user: User; friendship: Friend }>> => {
	const friendships = await friendRepository.find({
		where: [
			{ userId, status: 'accepted' },
			{ friendId: userId, status: 'accepted' },
		],
		relations: ['user', 'friend'],
	});

	const results: Array<{ user: User; friendship: Friend }> = [];

	for (const friendship of friendships) {
		const friendId = friendship.userId === userId ? friendship.friendId : friendship.userId;
		const friend = await userRepository.findOneBy({ id: friendId });
		if (friend) {
			results.push({ user: friend, friendship });
		}
	}

	return results;
};

export const getPendingRequests = async (
	userId: string,
): Promise<Array<{ user: User; request: Friend }>> => {
	const incomingRequests = await friendRepository.find({
		where: { friendId: userId, status: 'pending' },
		relations: ['user'],
	});

	const results: Array<{ user: User; request: Friend }> = [];

	for (const request of incomingRequests) {
		const requester = await userRepository.findOneBy({ id: request.userId });
		if (requester) {
			results.push({ user: requester, request });
		}
	}

	return results;
};

export const getSentRequests = async (
	userId: string,
): Promise<Array<{ user: User; request: Friend }>> => {
	const sentRequests = await friendRepository.find({
		where: { userId, status: 'pending' },
		relations: ['friend'],
	});

	const results: Array<{ user: User; request: Friend }> = [];

	for (const request of sentRequests) {
		const recipient = await userRepository.findOneBy({ id: request.friendId });
		if (recipient) {
			results.push({ user: recipient, request });
		}
	}

	return results;
};

// ==================== FOLLOWS ====================

export const followUser = async (userId: string, targetId: string): Promise<Follow> => {
	if (userId === targetId) {
		throw new Error('Cannot follow yourself');
	}

	// Check if already following
	const existingFollow = await followRepository.findOne({
		where: { followerId: userId, followingId: targetId },
	});

	if (existingFollow) {
		throw new Error('Already following this user');
	}

	const follow = followRepository.create({
		followerId: userId,
		followingId: targetId,
	});

	const saved = await followRepository.save(follow);

	// Create activity
	await createActivity(userId, 'followed_user', `Started following a user`, {
		targetId,
	});

	return saved;
};

export const unfollowUser = async (userId: string, targetId: string): Promise<void> => {
	const follow = await followRepository.findOne({
		where: { followerId: userId, followingId: targetId },
	});

	if (!follow) {
		throw new Error('Not following this user');
	}

	await followRepository.remove(follow);
};

export const getFollowers = async (
	userId: string,
): Promise<Array<{ user: User; follow: Follow }>> => {
	const follows = await followRepository.find({
		where: { followingId: userId },
	});

	const results: Array<{ user: User; follow: Follow }> = [];

	for (const follow of follows) {
		const follower = await userRepository.findOneBy({ id: follow.followerId });
		if (follower) {
			results.push({ user: follower, follow });
		}
	}

	return results;
};

export const getFollowing = async (
	userId: string,
): Promise<Array<{ user: User; follow: Follow }>> => {
	const follows = await followRepository.find({
		where: { followerId: userId },
	});

	const results: Array<{ user: User; follow: Follow }> = [];

	for (const follow of follows) {
		const following = await userRepository.findOneBy({ id: follow.followingId });
		if (following) {
			results.push({ user: following, follow });
		}
	}

	return results;
};

// ==================== BLOCKING ====================

export const blockUser = async (userId: string, targetId: string): Promise<void> => {
	if (userId === targetId) {
		throw new Error('Cannot block yourself');
	}

	// Remove any existing friendship
	const existingFriendship = await friendRepository.findOne({
		where: [
			{ userId, friendId: targetId },
			{ userId: targetId, friendId: userId },
		],
	});

	if (existingFriendship) {
		await friendRepository.remove(existingFriendship);
	}

	// Remove any follow relationships
	const existingFollow = await followRepository.findOne({
		where: [
			{ followerId: userId, followingId: targetId },
			{ followerId: targetId, followingId: userId },
		],
	});

	if (existingFollow) {
		await followRepository.remove(existingFollow);
	}

	// Create block entry
	const block = friendRepository.create({
		userId,
		friendId: targetId,
		status: 'blocked',
	});

	await friendRepository.save(block);
};

export const unblockUser = async (userId: string, targetId: string): Promise<void> => {
	const block = await friendRepository.findOne({
		where: { userId, friendId: targetId, status: 'blocked' },
	});

	if (!block) {
		throw new Error('Block not found');
	}

	await friendRepository.remove(block);
};

export const getBlockedUsers = async (userId: string): Promise<Array<{ user: User }>> => {
	const blocks = await friendRepository.find({
		where: { userId, status: 'blocked' },
	});

	const results: Array<{ user: User }> = [];

	for (const block of blocks) {
		const blocked = await userRepository.findOneBy({ id: block.friendId });
		if (blocked) {
			results.push({ user: blocked });
		}
	}

	return results;
};

// ==================== ACTIVITIES ====================

const createActivity = async (
	userId: string,
	activityType: UserActivity['activityType'],
	description: string,
	metadata?: Record<string, any>,
): Promise<UserActivity> => {
	const activity = userActivityRepository.create({
		userId,
		activityType,
		description,
		metadata,
	});

	return await userActivityRepository.save(activity);
};

export const getActivities = async (
	userId: string,
	limit: number = 20,
): Promise<UserActivity[]> => {
	return await userActivityRepository.find({
		where: { userId },
		order: { createdAt: 'DESC' },
		take: limit,
	});
};

export const getFeed = async (userId: string, limit: number = 20): Promise<UserActivity[]> => {
	// Get friends
	const friendships = await friendRepository.find({
		where: [
			{ userId, status: 'accepted' },
			{ friendId: userId, status: 'accepted' },
		],
	});

	const friendIds = friendships.map((f) => (f.userId === userId ? f.friendId : f.userId));

	// Add own id to see own activities too
	friendIds.push(userId);

	return await userActivityRepository.find({
		where: { userId: In(friendIds) } as any,
		order: { createdAt: 'DESC' },
		take: limit,
	});
};
