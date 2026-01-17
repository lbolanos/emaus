import { Router } from 'express';
import {
	getMyProfile,
	updateMyProfile,
	getPublicProfileById,
	searchUsersController,
	linkUserToParticipantController,
	unlinkUserFromParticipantController,
	updateAvatar,
	removeAvatar,
} from '../controllers/userProfileController';
import {
	sendFriendRequestController,
	acceptFriendRequestController,
	rejectFriendRequestController,
	removeFriendController,
	getFriendsController,
	getPendingRequestsController,
	getSentRequestsController,
	followUserController,
	unfollowUserController,
	getFollowersController,
	getFollowingController,
	blockUserController,
	unblockUserController,
	getBlockedUsersController,
} from '../controllers/userSocialController';
import { isAuthenticated } from '../middleware/authentication';

const router = Router();

// All routes require authentication
router.use(isAuthenticated);

// ==================== PROFILE ROUTES ====================

// Get my profile
router.get('/profile', getMyProfile);

// Update my profile
router.put('/profile', updateMyProfile);

// Update avatar
router.put('/profile/avatar', updateAvatar);

// Remove avatar
router.delete('/profile/avatar', removeAvatar);

// Get public profile of another user
router.get('/profile/:userId', getPublicProfileById);

// Search users
router.get('/search', searchUsersController);

// Link user to participant (become a server)
router.post('/link/participant/:participantId', linkUserToParticipantController);

// Unlink user from participant
router.delete('/link/participant', unlinkUserFromParticipantController);

// ==================== FRIEND REQUESTS ====================

// Send friend request
router.post('/friends/request', sendFriendRequestController);

// Accept friend request
router.put('/friends/accept', acceptFriendRequestController);

// Reject friend request
router.delete('/friends/request', rejectFriendRequestController);

// Remove friend
router.delete('/friends/:friendId', removeFriendController);

// Get friends list
router.get('/friends', getFriendsController);

// Get pending friend requests
router.get('/friends/pending', getPendingRequestsController);

// Get sent friend requests
router.get('/friends/sent', getSentRequestsController);

// ==================== FOLLOWS ====================

// Follow user
router.post('/follow/:userId', followUserController);

// Unfollow user
router.delete('/follow/:userId', unfollowUserController);

// Get followers
router.get('/followers', getFollowersController);

// Get following
router.get('/following', getFollowingController);

// ==================== BLOCKING ====================

// Block user
router.post('/block/:userId', blockUserController);

// Unblock user
router.delete('/block/:userId', unblockUserController);

// Get blocked users
router.get('/blocked', getBlockedUsersController);

export default router;
