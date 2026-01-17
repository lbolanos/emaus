/**
 * Social Network Type Definitions
 *
 * Shared types for the social network system.
 * These types ensure type safety across all social components.
 */

import type { Participant } from '@repo/types';

// ============================================================================
// User Types
// ============================================================================

/**
 * Basic user information
 */
export interface SocialUser {
	id: string;
	displayName: string;
	email?: string;
	avatarUrl?: string;
	isOnline?: boolean;
}

/**
 * User profile information
 */
export interface SocialProfile {
	userId: string;
	bio?: string;
	location?: string;
	website?: string;
	showEmail: boolean;
	showPhone: boolean;
	showRetreats: boolean;
	interests?: string[];
	skills?: string[];
}

/**
 * Combined user with profile data
 */
export interface UserWithProfile extends SocialUser {
	profile?: SocialProfile;
	participant?: Participant | null;
}

// ============================================================================
// Friend Types
// ============================================================================

/**
 * Friend relationship status
 */
export type FriendshipStatus = 'none' | 'pending' | 'accepted' | 'sent';

/**
 * Friend relationship data
 */
export interface Friendship {
	id: string;
	userId: string;
	friendId: string;
	status: FriendshipStatus;
	createdAt: string;
	updatedAt: string;
}

/**
 * User with friendship information
 */
export interface UserWithFriendship extends UserWithProfile {
	friendship?: {
		status: FriendshipStatus;
		isFriend: boolean;
		isPending: boolean;
		isSentRequest: boolean;
		createdAt?: string;
	};
}

// ============================================================================
// Follow Types
// ============================================================================

/**
 * Follow relationship data
 */
export interface Follow {
	id: string;
	followerId: string;
	followingId: string;
	createdAt: string;
}

/**
 * User with follow information
 */
export interface UserWithFollow extends UserWithProfile {
	isFollowing?: boolean;
	isFollower?: boolean;
	followSince?: string;
}

// ============================================================================
// Search Types
// ============================================================================

/**
 * Search filters for user search
 */
export interface SearchFilters {
	interests?: string[];
	skills?: string[];
	location?: string;
	retreatId?: string;
	participantType?: 'walker' | 'server' | 'all';
}

/**
 * Sort options for user search
 */
export type SortOption = 'relevance' | 'nameAsc' | 'nameDesc' | 'location' | 'recentActivity';

/**
 * Search result with all relationship information
 */
export interface SearchResult extends UserWithProfile, UserWithFriendship, UserWithFollow {
	mutualFriendsCount?: number;
	relevanceScore?: number;
}

// ============================================================================
// Activity Types
// ============================================================================

/**
 * Activity type
 */
export type ActivityType =
	| 'profile_updated'
	| 'friend_request_sent'
	| 'friend_request_accepted'
	| 'friend_removed'
	| 'followed'
	| 'unfollowed'
	| 'joined_retreat'
	| 'left_retreat';

/**
 * User activity
 */
export interface UserActivity {
	id: string;
	userId: string;
	type: ActivityType;
	data?: Record<string, unknown>;
	createdAt: string;
}

// ============================================================================
// Suggestion Types
// ============================================================================

/**
 * Friend suggestion with reason
 */
export interface FriendSuggestion extends UserWithProfile {
	reason: SuggestionReason;
	mutualFriendsCount?: number;
	commonInterests?: string[];
	commonRetreats?: string[];
}

/**
 * Reason for suggestion
 */
export type SuggestionReason =
	| 'mutual_friends'
	| 'same_retreat'
	| 'similar_interests'
	| 'recently_joined';

// ============================================================================
// Component Props Types
// ============================================================================

/**
 * Props for UserCard component
 */
export interface UserCardProps {
	user: SocialUser;
	profile?: SocialProfile;
	participant?: Participant | null;
	friendship?: {
		status: FriendshipStatus;
		isFriend: boolean;
		isPending: boolean;
		isSentRequest: boolean;
	};
	isFollowing?: boolean;
	isOnline?: boolean;
	mutualFriends?: number;
	variant?: 'default' | 'compact' | 'detailed';
	showActions?: boolean;
	clickable?: boolean;
	loading?: boolean;
}

/**
 * Props for AvatarUpload component
 */
export interface AvatarUploadProps {
	currentAvatar?: string;
	displayName: string;
	size?: 'sm' | 'md' | 'lg' | 'xl';
	editable?: boolean;
	maxSize?: number;
	onUpload?: (avatarUrl: string) => void;
	onRemove?: () => void;
}

/**
 * Props for UserTagList component
 */
export interface UserTagListProps {
	tags: string[];
	editable?: boolean;
	variant?: 'interests' | 'skills';
	maxTags?: number;
	onAdd?: (tag: string) => void;
	onRemove?: (tag: string) => void;
	placeholder?: string;
}

/**
 * Props for UserActions component
 */
export interface UserActionsProps {
	userId: string;
	isFriend?: boolean;
	isFollowing?: boolean;
	friendshipStatus?: FriendshipStatus;
	variant?: 'default' | 'compact' | 'icon-only';
	onAction?: (action: string, data?: unknown) => void;
}

/**
 * Props for EmptyState component
 */
export interface EmptyStateProps {
	type:
		| 'no-friends'
		| 'no-followers'
		| 'no-following'
		| 'no-results'
		| 'no-activity'
		| 'no-pending'
		| 'no-sent';
	title?: string;
	description?: string;
	actionLabel?: string;
	onAction?: () => void;
}

/**
 * Props for FilterPanel component
 */
export interface FilterPanelProps {
	filters: SearchFilters;
	availableInterests: string[];
	availableSkills: string[];
	availableLocations: string[];
	availableRetreats: Array<{ id: string; name: string }>;
	onChange: (filters: SearchFilters) => void;
	onClear: () => void;
}

/**
 * Pagination options
 */
export interface PaginationOptions {
	page: number;
	limit: number;
	total: number;
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
	data: T[];
	pagination: {
		page: number;
		limit: number;
		total: number;
		totalPages: number;
	};
}
