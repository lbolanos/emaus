# Social Features API Reference

## Overview

The Social Features API provides user profile management, friend connections, follow relationships, and user blocking functionality. All endpoints require authentication via session cookies.

## Authentication

All endpoints require authentication via session cookies. Include session credentials in requests.

## Base URL

```
http://localhost:3001/api/social
```

## Response Format

### Success Response

```json
{
  "userId": "uuid",
  "displayName": "John Doe",
  "avatarUrl": "data:image/webp;base64,...",
  ...
}
```

### Error Response

```json
{
  "message": "Error description in Spanish"
}
```

## Profile Endpoints

### GET /profile

Get the authenticated user's complete profile.

**Authentication:** Required

**Response:**

```json
{
  "userId": "user-uuid",
  "displayName": "John Doe",
  "email": "john@example.com",
  "phone": "+1234567890",
  "bio": "Retreat enthusiast",
  "location": "Madrid, Spain",
  "website": "https://example.com",
  "showEmail": false,
  "showPhone": false,
  "showRetreats": true,
  "interests": ["meditation", "nature", "community"],
  "skills": ["leadership", "organization"],
  "avatarUrl": "data:image/webp;base64,...",
  "participantId": "participant-uuid",
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-15T00:00:00Z"
}
```

---

### PUT /profile

Update the authenticated user's profile.

**Authentication:** Required

**Request Body:**

```json
{
  "bio": "Updated bio text",
  "location": "New location",
  "website": "https://newwebsite.com",
  "showEmail": true,
  "showPhone": false,
  "showRetreats": true,
  "interests": ["meditation", "music"],
  "skills": ["leadership"],
  "avatarUrl": "data:image/webp;base64,..."
}
```

**Response:**

```json
{
  "userId": "user-uuid",
  "displayName": "John Doe",
  "bio": "Updated bio text",
  "location": "New location",
  "website": "https://newwebsite.com",
  "showEmail": true,
  "showPhone": false,
  "showRetreats": true,
  "interests": ["meditation", "music"],
  "skills": ["leadership"],
  "avatarUrl": "data:image/webp;base64,...",
  "updatedAt": "2024-01-15T12:00:00Z"
}
```

---

### PUT /profile/avatar

Update the user's avatar image. Supports both base64 data URLs and S3 URLs depending on configuration.

**Authentication:** Required

**Request Body:**

```json
{
  "avatarUrl": "data:image/webp;base64,..."
}
```

**Base64 Format:**

```
data:image/webp;base64,UklGRiQAAABXRUJQVlA4...
```

**Response (base64 mode):**

```json
{
  "userId": "user-uuid",
  "displayName": "John Doe",
  "avatarUrl": "data:image/webp;base64,..."
}
```

**Response (S3 mode):**

```json
{
  "userId": "user-uuid",
  "displayName": "John Doe",
  "avatarUrl": "https://emaus-avatars.s3.us-east-1.amazonaws.com/avatars/user-uuid.webp"
}
```

**Storage Modes:**

- **base64** (default): Avatar stored as base64 string in database
- **s3**: Avatar uploaded to AWS S3, URL stored in database

Configure via `AVATAR_STORAGE` environment variable.

---

### DELETE /profile/avatar

Remove the user's avatar image.

**Authentication:** Required

**Response:**

```json
{
  "userId": "user-uuid",
  "displayName": "John Doe",
  "avatarUrl": null
}
```

**Behavior:**
- In base64 mode: Removes avatar URL from database
- In S3 mode: Deletes file from S3 bucket and removes URL from database

---

### GET /profile/:userId

Get a public profile of another user.

**Authentication:** Required

**Request Parameters:**

- `userId` (path): Target user's UUID

**Response:**

```json
{
  "userId": "target-user-uuid",
  "displayName": "Jane Smith",
  "bio": "Retreat coordinator and guide",
  "location": "Barcelona, Spain",
  "website": "https://janesmith.com",
  "interests": ["spirituality", "meditation", "community building"],
  "skills": ["facilitation", "conflict resolution"],
  "avatarUrl": "data:image/webp;base64,...",
  "showEmail": false,
  "showPhone": false,
  "showRetreats": true
}
```

**Note:** Email and phone are only included if the user has enabled visibility settings.

---

### GET /search

Search for users by display name, email, or profile attributes.

**Authentication:** Required

**Request Parameters:**

- `q` (query, required): Search query string
- `interests` (query, optional): Filter by interests (comma-separated or array)
- `skills` (query, optional): Filter by skills (comma-separated or array)
- `location` (query, optional): Filter by location
- `retreatId` (query, optional): Filter users linked to a specific retreat

**Example Request:**

```
GET /search?q=maria&interests=meditation&location=Madrid
```

**Response:**

```json
{
  "results": [
    {
      "userId": "user-uuid-1",
      "displayName": "Maria Garcia",
      "bio": "Yoga instructor and retreat guide",
      "location": "Madrid, Spain",
      "interests": ["meditation", "yoga", "wellness"],
      "avatarUrl": "data:image/webp;base64,..."
    },
    {
      "userId": "user-uuid-2",
      "displayName": "Maria Rodriguez",
      "bio": "Community organizer",
      "location": "Madrid, Spain",
      "interests": ["meditation", "community"],
      "avatarUrl": null
    }
  ],
  "total": 2
}
```

---

## Participant Linking

### POST /link/participant/:participantId

Link a user account to a participant record (becoming a "server").

**Authentication:** Required

**Request Parameters:**

- `participantId` (path): Participant UUID to link

**Response:**

```json
{
  "userId": "user-uuid",
  "participantId": "participant-uuid",
  "linkedAt": "2024-01-15T00:00:00Z"
}
```

---

### DELETE /link/participant

Unlink the user from their participant record.

**Authentication:** Required

**Response:**

```json
{
  "message": "Vínculo eliminado exitosamente"
}
```

---

## Friend Requests

### POST /friends/request

Send a friend request to another user.

**Authentication:** Required

**Request Body:**

```json
{
  "friendId": "target-user-uuid"
}
```

**Response (success):**

```json
{
  "userId": "user-uuid",
  "friendId": "target-user-uuid",
  "status": "pending",
  "initiatedByUser": true,
  "createdAt": "2024-01-15T00:00:00Z"
}
```

**Error Responses:**

- `400`: friendId is required
- `409`: Friend request already exists or users are already friends
- `404`: Target user not found

---

### PUT /friends/accept

Accept a pending friend request.

**Authentication:** Required

**Request Body:**

```json
{
  "requesterId": "requester-user-uuid"
}
```

**Response:**

```json
{
  "userId": "user-uuid",
  "friendId": "requester-user-uuid",
  "status": "accepted",
  "respondedAt": "2024-01-15T12:00:00Z"
}
```

---

### DELETE /friends/request

Reject or cancel a friend request.

**Authentication:** Required

**Request Body:**

```json
{
  "requesterId": "requester-user-uuid"
}
```

**Response:**

```json
{
  "message": "Solicitud de amistad rechazada"
}
```

---

### DELETE /friends/:friendId

Remove an existing friend connection.

**Authentication:** Required

**Request Parameters:**

- `friendId` (path): Friend's user UUID

**Response:**

```json
{
  "message": "Amistad eliminada"
}
```

---

### GET /friends

Get the authenticated user's friends list.

**Authentication:** Required

**Response:**

```json
{
  "friends": [
    {
      "userId": "friend-uuid-1",
      "displayName": "Jane Smith",
      "avatarUrl": "data:image/webp;base64,...",
      "bio": "Retreat coordinator",
      "location": "Barcelona, Spain",
      "status": "accepted",
      "friendsSince": "2024-01-01T00:00:00Z"
    },
    {
      "userId": "friend-uuid-2",
      "displayName": "Bob Johnson",
      "avatarUrl": null,
      "bio": "Spiritual guide",
      "location": "Valencia, Spain",
      "status": "accepted",
      "friendsSince": "2024-01-10T00:00:00Z"
    }
  ],
  "total": 2
}
```

---

### GET /friends/pending

Get pending friend requests received by the user.

**Authentication:** Required

**Response:**

```json
{
  "requests": [
    {
      "userId": "requester-uuid",
      "displayName": "Alice Brown",
      "avatarUrl": "data:image/webp;base64,...",
      "bio": "Meditation teacher",
      "requestedAt": "2024-01-15T00:00:00Z"
    }
  ],
  "total": 1
}
```

---

### GET /friends/sent

Get friend requests sent by the user that are still pending.

**Authentication:** Required

**Response:**

```json
{
  "requests": [
    {
      "userId": "recipient-uuid",
      "displayName": "Charlie Davis",
      "avatarUrl": null,
      "requestedAt": "2024-01-14T00:00:00Z"
    }
  ],
  "total": 1
}
```

---

## Follow Relationships

### POST /follow/:userId

Follow another user.

**Authentication:** Required

**Request Parameters:**

- `userId` (path): User UUID to follow

**Response:**

```json
{
  "id": "follow-uuid",
  "followerId": "user-uuid",
  "followingId": "target-user-uuid",
  "createdAt": "2024-01-15T00:00:00Z"
}
```

**Error Responses:**

- `400`: userId is required
- `409`: Already following this user
- `404`: Target user not found

---

### DELETE /follow/:userId

Unfollow a user.

**Authentication:** Required

**Request Parameters:**

- `userId` (path): User UUID to unfollow

**Response:**

```json
{
  "message": "Dejaste de seguir a este usuario"
}
```

---

### GET /followers

Get users who follow the authenticated user.

**Authentication:** Required

**Response:**

```json
{
  "followers": [
    {
      "userId": "follower-uuid-1",
      "displayName": "Emma Wilson",
      "avatarUrl": "data:image/webp;base64,...",
      "bio": "Wellness coach",
      "followedAt": "2024-01-10T00:00:00Z"
    },
    {
      "userId": "follower-uuid-2",
      "displayName": "Frank Miller",
      "avatarUrl": null,
      "bio": "Retreat organizer",
      "followedAt": "2024-01-12T00:00:00Z"
    }
  ],
  "total": 2
}
```

---

### GET /following

Get users that the authenticated user follows.

**Authentication:** Required

**Response:**

```json
{
  "following": [
    {
      "userId": "following-uuid-1",
      "displayName": "Grace Lee",
      "avatarUrl": "data:image/webp;base64,...",
      "bio": "Meditation instructor",
      "followingSince": "2024-01-05T00:00:00Z"
    }
  ],
  "total": 1
}
```

---

## User Blocking

### POST /block/:userId

Block another user.

**Authentication:** Required

**Request Parameters:**

- `userId` (path): User UUID to block

**Response:**

```json
{
  "message": "Usuario bloqueado"
}
```

**Side Effects:**
- Removes any existing friend relationship
- Removes any existing follow relationships (both directions)
- Prevents future friend requests or follows

---

### DELETE /block/:userId

Unblock a previously blocked user.

**Authentication:** Required

**Request Parameters:**

- `userId` (path): User UUID to unblock

**Response:**

```json
{
  "message": "Usuario desbloqueado"
}
```

---

### GET /blocked

Get list of users blocked by the authenticated user.

**Authentication:** Required

**Response:**

```json
{
  "blocked": [
    {
      "userId": "blocked-uuid-1",
      "displayName": "Henry Black",
      "avatarUrl": null,
      "blockedAt": "2024-01-15T00:00:00Z"
    }
  ],
  "total": 1
}
```

---

## Avatar Storage Configuration

### Environment Variables

```bash
# Storage Mode Selection
AVATAR_STORAGE=base64  # Options: base64, s3

# AWS S3 Configuration (required when AVATAR_STORAGE=s3)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
S3_BUCKET_NAME=emaus-avatars
S3_BUCKET_PREFIX=avatars/
```

### Storage Behavior

#### Base64 Mode (Default)
- Avatar stored as base64 data URL in `user_profiles.avatarUrl`
- No external dependencies
- Avatar URL format: `data:image/webp;base64,...`
- Suitable for small deployments with limited users

#### S3 Mode
- Avatar uploaded to S3 as WebP file
- S3 public URL stored in `user_profiles.avatarUrl`
- Automatic image processing (resize to 512px, WebP conversion)
- Suitable for production with many users

### Image Processing

When using S3 storage, uploaded images are automatically:
1. Resized to maximum 512x512 pixels (maintaining aspect ratio)
2. Converted to WebP format at 85% quality
3. Stored with cache control headers (1 year cache)

File naming: `avatars/{userId}.webp`

---

## Error Messages

| Error | Description |
|-------|-------------|
| `Usuario no autenticado` | User not authenticated |
| `Perfil no encontrado` | Profile not found |
| `friendId is required` | Missing friend ID parameter |
| `userId is required` | Missing user ID parameter |
| `requesterId is required` | Missing requester ID parameter |
| `avatarUrl es requerido` | Missing avatar URL |
| `Query parameter "q" is required` | Missing search query |
| `Solicitud de amistad rechazada` | Friend request rejected |
| `Amistad eliminada` | Friendship removed |
| `Dejaste de seguir a este usuario` | User unfollowed |
| `Usuario bloqueado` | User blocked |
| `Usuario desbloqueado` | User unblocked |
| `Vínculo eliminado exitosamente` | Participant link removed |

---

## HTTP Status Codes

- `200` - Success
- `400` - Bad Request (missing required parameters)
- `401` - Unauthorized (not authenticated)
- `404` - Not Found (user/profile not found)
- `409` - Conflict (duplicate relationships)
- `500` - Internal Server Error

---

## Database Schema

### UserProfile Entity

```typescript
{
  userId: string (primary key, references User.id),
  bio: string | null,
  location: string | null,
  website: string | null,
  showEmail: boolean (default: false),
  showPhone: boolean (default: false),
  showRetreats: boolean (default: true),
  interests: string[] | null,
  skills: string[] | null,
  avatarUrl: string | null,
  createdAt: Date,
  updatedAt: Date
}
```

### Friend Entity

```typescript
{
  userId: string (primary key),
  friendId: string (primary key),
  status: 'pending' | 'accepted' | 'blocked' (default: 'pending'),
  createdAt: Date,
  respondedAt: Date | null,
  initiatedByUser: boolean (default: true)
}
```

### Follow Entity

```typescript
{
  id: string (primary generated key),
  followerId: string,
  followingId: string,
  createdAt: Date
}
```

---

_This API reference covers all social features endpoints. For implementation details and best practices, refer to the service layer documentation._
