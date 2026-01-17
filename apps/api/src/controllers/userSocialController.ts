import { Request, Response } from 'express';
import {
	sendFriendRequest,
	acceptFriendRequest,
	rejectFriendRequest,
	removeFriend,
	getFriends,
	getPendingRequests,
	getSentRequests,
	followUser,
	unfollowUser,
	getFollowers,
	getFollowing,
	blockUser,
	unblockUser,
	getBlockedUsers,
} from '../services/userSocialService';
import { getUserFromRequest } from '../utils/auth';

// ==================== FRIEND REQUESTS ====================

export const sendFriendRequestController = async (req: Request, res: Response): Promise<void> => {
	try {
		const user = getUserFromRequest(req);
		if (!user) {
			res.status(401).json({ message: 'Usuario no autenticado' });
			return;
		}

		const { friendId } = req.body;

		if (!friendId) {
			res.status(400).json({ message: 'friendId is required' });
			return;
		}

		const friendRequest = await sendFriendRequest(user.id, friendId);
		res.json(friendRequest);
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

export const acceptFriendRequestController = async (req: Request, res: Response): Promise<void> => {
	try {
		const user = getUserFromRequest(req);
		if (!user) {
			res.status(401).json({ message: 'Usuario no autenticado' });
			return;
		}

		const { requesterId } = req.body;

		if (!requesterId) {
			res.status(400).json({ message: 'requesterId is required' });
			return;
		}

		const friendship = await acceptFriendRequest(user.id, requesterId);
		res.json(friendship);
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

export const rejectFriendRequestController = async (req: Request, res: Response): Promise<void> => {
	try {
		const user = getUserFromRequest(req);
		if (!user) {
			res.status(401).json({ message: 'Usuario no autenticado' });
			return;
		}

		const { requesterId } = req.body;

		if (!requesterId) {
			res.status(400).json({ message: 'requesterId is required' });
			return;
		}

		await rejectFriendRequest(user.id, requesterId);
		res.json({ message: 'Solicitud de amistad rechazada' });
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

export const removeFriendController = async (req: Request, res: Response): Promise<void> => {
	try {
		const user = getUserFromRequest(req);
		if (!user) {
			res.status(401).json({ message: 'Usuario no autenticado' });
			return;
		}

		const { friendId } = req.params;

		if (!friendId) {
			res.status(400).json({ message: 'friendId is required' });
			return;
		}

		await removeFriend(user.id, friendId);
		res.json({ message: 'Amistad eliminada' });
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

export const getFriendsController = async (req: Request, res: Response): Promise<void> => {
	try {
		const user = getUserFromRequest(req);
		if (!user) {
			res.status(401).json({ message: 'Usuario no autenticado' });
			return;
		}

		const friends = await getFriends(user.id);
		res.json(friends);
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

export const getPendingRequestsController = async (req: Request, res: Response): Promise<void> => {
	try {
		const user = getUserFromRequest(req);
		if (!user) {
			res.status(401).json({ message: 'Usuario no autenticado' });
			return;
		}

		const requests = await getPendingRequests(user.id);
		res.json(requests);
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

export const getSentRequestsController = async (req: Request, res: Response): Promise<void> => {
	try {
		const user = getUserFromRequest(req);
		if (!user) {
			res.status(401).json({ message: 'Usuario no autenticado' });
			return;
		}

		const requests = await getSentRequests(user.id);
		res.json(requests);
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

// ==================== FOLLOWS ====================

export const followUserController = async (req: Request, res: Response): Promise<void> => {
	try {
		const user = getUserFromRequest(req);
		if (!user) {
			res.status(401).json({ message: 'Usuario no autenticado' });
			return;
		}

		const { userId } = req.params;

		if (!userId) {
			res.status(400).json({ message: 'userId is required' });
			return;
		}

		const follow = await followUser(user.id, userId);
		res.json(follow);
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

export const unfollowUserController = async (req: Request, res: Response): Promise<void> => {
	try {
		const user = getUserFromRequest(req);
		if (!user) {
			res.status(401).json({ message: 'Usuario no autenticado' });
			return;
		}

		const { userId } = req.params;

		if (!userId) {
			res.status(400).json({ message: 'userId is required' });
			return;
		}

		await unfollowUser(user.id, userId);
		res.json({ message: 'Dejaste de seguir a este usuario' });
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

export const getFollowersController = async (req: Request, res: Response): Promise<void> => {
	try {
		const user = getUserFromRequest(req);
		if (!user) {
			res.status(401).json({ message: 'Usuario no autenticado' });
			return;
		}

		const followers = await getFollowers(user.id);
		res.json(followers);
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

export const getFollowingController = async (req: Request, res: Response): Promise<void> => {
	try {
		const user = getUserFromRequest(req);
		if (!user) {
			res.status(401).json({ message: 'Usuario no autenticado' });
			return;
		}

		const following = await getFollowing(user.id);
		res.json(following);
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

// ==================== BLOCKING ====================

export const blockUserController = async (req: Request, res: Response): Promise<void> => {
	try {
		const user = getUserFromRequest(req);
		if (!user) {
			res.status(401).json({ message: 'Usuario no autenticado' });
			return;
		}

		const { userId } = req.params;

		if (!userId) {
			res.status(400).json({ message: 'userId is required' });
			return;
		}

		await blockUser(user.id, userId);
		res.json({ message: 'Usuario bloqueado' });
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

export const unblockUserController = async (req: Request, res: Response): Promise<void> => {
	try {
		const user = getUserFromRequest(req);
		if (!user) {
			res.status(401).json({ message: 'Usuario no autenticado' });
			return;
		}

		const { userId } = req.params;

		if (!userId) {
			res.status(400).json({ message: 'userId is required' });
			return;
		}

		await unblockUser(user.id, userId);
		res.json({ message: 'Usuario desbloqueado' });
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

export const getBlockedUsersController = async (req: Request, res: Response): Promise<void> => {
	try {
		const user = getUserFromRequest(req);
		if (!user) {
			res.status(401).json({ message: 'Usuario no autenticado' });
			return;
		}

		const blocked = await getBlockedUsers(user.id);
		res.json(blocked);
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};
