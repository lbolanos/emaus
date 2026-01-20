# Landing Stories Feature Documentation

## Overview

The Landing Stories feature displays approved testimonials on the public landing page. This section showcases authentic experiences from retreat participants who have chosen to share their stories publicly.

## Purpose

- **Public Showcase**: Display approved testimonials to visitors on the landing page
- **Social Proof**: Show potential participants authentic experiences from past retreats
- **Engagement**: Encourage authenticated users to share their own stories

## Architecture

### Backend Components

#### API Endpoint

**Route:** `GET /api/landing/testimonials`

**Controller:** `getLandingTestimonialsController` in `apps/api/src/controllers/testimonialController.ts`

**Service:** `getLandingTestimonials` in `apps/api/src/services/testimonialService.ts`

**Authentication:** Public (no authentication required)

**Response:**

```typescript
{
  id: number;
  content: string;
  createdAt: string; // ISO date string
  approvedForLanding: boolean;
  user: {
    displayName: string;
    photo: string | null;
  };
  retreat: {
    parish: string;
  } | null;
}[]
```

#### Query Logic

The service retrieves testimonials that meet these criteria:

1. `approvedForLanding = true` (manually approved by superadmin)
2. `visibility = 'public'` (publicly visible)
3. Ordered by creation date (newest first)

#### Related Entities

- **Testimonial**: Core entity with content, visibility settings
- **UserProfile**: User display information (displayName, photo)
- **Retreat**: Associated retreat information (parish name)

### Frontend Components

#### Main Component

**File:** `apps/web/src/views/LandingView.vue`

**Location in Template:** After Community Table section (line ~290), before CTA Footer

**Key Sections:**

1. **Loading State**: Spinner while fetching testimonials
2. **Empty State**: Message when no approved testimonials exist
3. **Testimonials Grid**: Responsive 3-column layout
4. **Authentication CTA**: Call-to-action for non-authenticated users

#### State Management

```typescript
const loadingTestimonials = ref(true);
const testimonials = ref<any[]>([]);
```

#### Helper Functions

```typescript
// Extract initials from display name for avatar fallback
const getInitials = (name: string) => {
	if (!name) return '?';
	const names = name.trim().split(/\s+/);
	if (names.length === 1) return names[0].charAt(0).toUpperCase();
	return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase();
};

// Format date with relative time (today, yesterday, X days ago, etc.)
const formatDate = (dateString: string) => {
	const date = new Date(dateString);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

	if (diffDays === 0) return $t('landing.today');
	if (diffDays === 1) return $t('landing.yesterday');
	if (diffDays < 7) return `${diffDays} ${$t('landing.daysAgo')}`;
	if (diffDays < 30) return `${Math.floor(diffDays / 7)} ${$t('landing.weeksAgo')}`;
	return `${Math.floor(diffDays / 30)} ${$t('landing.monthsAgo')}`;
};
```

#### API Integration

```typescript
import { getLandingTestimonials } from '@/services/api';

const fetchTestimonials = async () => {
	try {
		loadingTestimonials.value = true;
		const data = await getLandingTestimonials();
		testimonials.value = data;
	} catch (error) {
		console.error('Failed to fetch landing testimonials:', error);
		testimonials.value = [];
	} finally {
		loadingTestimonials.value = false;
	}
};
```

#### Lifecycle

```typescript
onMounted(() => {
	fetchTestimonials();
});
```

### UI Design

#### Layout

- **Container**: Centered max-width container with padding
- **Grid**: Responsive layout
  - Desktop: 3 columns
  - Tablet: 2 columns
  - Mobile: 1 column
- **Spacing**: 8 unit gap between cards

#### Card Design

Each testimonial card includes:

1. **Header Section**
   - User avatar (photo or initials)
   - Display name
   - Relative date

2. **Content Section**
   - Testimonial text (preserved whitespace)
   - Full text display (no truncation)

3. **Retreat Info** (conditional)
   - Icon + parish name
   - Only shown if retreat is associated

4. **Footer Indicator**
   - "Published on landing page" badge
   - Sage color accent

#### Styling

- **Colors**: Stone palette for neutrals, Sage (#8DAA91) for accents
- **Shadows**: Subtle shadow with hover elevation
- **Border Radius**: Rounded corners (rounded-2xl)
- **Transitions**: Smooth shadow transition on hover

### Internationalization

#### English Translations (`apps/web/src/locales/en.json`)

```json
{
	"landing.storiesBadge": "Real Stories",
	"landing.storiesTitle": "Stories from Retreat",
	"landing.storiesSubtitle": "Read authentic experiences from participants who have walked the path",
	"landing.noStories": "No stories published yet. Be the first to share your experience!",
	"landing.shareYourStory": "Participated in a retreat? Share your experience with others.",
	"landing.loginToShare": "Login to Share Your Story",
	"landing.publishedOnLanding": "Published on landing page",
	"landing.today": "Today",
	"landing.yesterday": "Yesterday",
	"landing.daysAgo": "days ago",
	"landing.weeksAgo": "weeks ago",
	"landing.monthsAgo": "months ago"
}
```

#### Spanish Translations (`apps/web/src/locales/es.json`)

```json
{
	"landing.storiesBadge": "Historias Reales",
	"landing.storiesTitle": "Historias de los Retiros",
	"landing.storiesSubtitle": "Lee experiencias auténticas de participantes que han caminado el camino",
	"landing.noStories": "Aún no hay historias publicadas. ¡Sé el primero en compartir tu experiencia!",
	"landing.shareYourStory": "¿Participaste en un retiro? Comparte tu experiencia con otros.",
	"landing.loginToShare": "Inicia sesión para Compartir tu Historia",
	"landing.publishedOnLanding": "Publicado en landing page",
	"landing.today": "Hoy",
	"landing.yesterday": "Ayer",
	"landing.daysAgo": "días atrás",
	"landing.weeksAgo": "semanas atrás",
	"landing.monthsAgo": "meses atrás"
}
```

## User Workflow

### For Visitors (Non-authenticated)

1. **View Stories**: Navigate to landing page, scroll to Stories section
2. **Read Testimonials**: Browse approved testimonials from past participants
3. **CTA Prompt**: See message encouraging to share their own story
4. **Login Redirect**: Click "Login to Share Your Story" button → redirected to `/login`

### For Authenticated Users

1. **View Stories**: Same experience as visitors
2. **No CTA**: Login prompt is hidden (already authenticated)
3. **Share Story**: Navigate to `/social/testimonials` to create new testimonial

### For Superadmins (Approval Process)

1. **View Pending**: Navigate to `/social/testimonials`
2. **Review**: Read testimonials with `allowLandingPage: true`
3. **Approve**: Click "Approve for Landing" button
4. **Publish**: Testimonial appears on landing page immediately

## Testing

### Test Coverage

**File:** `apps/web/src/views/__tests__/LandingView.test.ts`

Total LandingView tests: **20 tests**

- Original tests: 9
- Stories section tests: 11

#### Stories Section Tests

1. **Rendering Tests**
   - Should render the stories section with id="stories"
   - Should render stories section with correct styling

2. **State Tests**
   - Should show empty state when no testimonials are available
   - Should show loading state while fetching testimonials
   - Should display testimonials when available

3. **Authentication Tests**
   - Should show login CTA when user is not authenticated
   - Should not show login CTA when user is authenticated

4. **Display Tests**
   - Should display user initials when no photo is available
   - Should display retreat parish when retreat is associated
   - Should call getLandingTestimonials on mount

#### Running Tests

```bash
# Run all web tests
pnpm test

# Run LandingView tests only
pnpm vitest run LandingView

# Run with coverage
pnpm test:coverage
```

### Test Results

Current status: **All tests passing**

```
Test Files: 1 passed (1)
Tests: 20 passed (20)
```

## Configuration

### Required Permissions

- **Viewing**: None (public endpoint)
- **Creating**: Must be authenticated
- **Approving**: Superadmin role only

### Visibility Rules

A testimonial appears on the landing page ONLY if:

1. `visibility = 'public'` (user-selected setting)
2. `allowLandingPage = true` (user consent)
3. `approvedForLanding = true` (superadmin approval)

### Related Settings

Users can set their default visibility in their profile:

- **Private**: Only visible to user
- **Friends**: Visible to friends
- **Public**: Visible to all authenticated users + eligible for landing page

## Troubleshooting

### Common Issues

#### Stories Not Appearing

**Check:**

1. Is `approvedForLanding = true` in database?
2. Is `visibility = 'public'`?
3. Is `allowLandingPage = true`?
4. Is the user profile displayName set?

**Debug:**

```typescript
// In browser console
fetch('/api/landing/testimonials')
	.then((r) => r.json())
	.then(console.log);
```

#### Avatar Not Showing

**Check:**

1. Does user have a photo URL?
2. If no photo, are initials displaying correctly?
3. Check `getInitials()` function logic

#### Wrong Date Display

**Check:**

1. Is `createdAt` a valid ISO date string?
2. Check browser locale settings
3. Verify `formatDate()` function output

## Related Features

- **Social Testimonials**: Full testimonial management at `/social/testimonials`
- **User Profiles**: Display name and photo settings
- **Retreat Management**: Association of testimonials with retreats
- **Visibility Config**: User privacy settings

## Future Enhancements

Potential improvements:

1. **Pagination**: Load more testimonials as user scrolls
2. **Filtering**: Filter by retreat, date range
3. **Sorting**: Sort by popularity, recent, featured
4. **Featured Stories**: Pin specific testimonials to top
5. **Video Support**: Embed video testimonials
6. **Social Sharing**: Share individual testimonial cards

## Files Reference

### Backend

- `apps/api/src/controllers/testimonialController.ts` - Landing page endpoint controller
- `apps/api/src/services/testimonialService.ts` - Query logic for landing testimonials
- `apps/api/src/entities/testimonial.entity.ts` - Testimonial data model
- `apps/api/src/routes/testimonial.routes.ts` - Route definitions

### Frontend

- `apps/web/src/views/LandingView.vue` - Main landing page with Stories section
- `apps/web/src/services/api.ts` - getLandingTestimonials API function
- `apps/web/src/locales/en.json` - English translations
- `apps/web/src/locales/es.json` - Spanish translations
- `apps/web/src/views/__tests__/LandingView.test.ts` - Component tests

### Documentation

- `docs_dev/SOCIAL_FEATURES_API.md` - Full social features API documentation
- `docs_dev/AVATAR_TESTING_GUIDE.md` - Avatar system testing guide
- `docs_dev/s3-avatar-storage.md` - S3 avatar storage implementation

---

**Last Updated:** 2026-01-18
**Feature Version:** 1.0.0
**Status:** Production Ready
