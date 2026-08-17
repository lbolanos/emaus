/**
 * Videos shown on the public landing page.
 *
 * The landing's audience is walkers, so only videos aimed at them belong here.
 * The rest of the YouTube channel covers running the system and is reached from
 * the in-app help (`apps/web/src/docs/es/*.md`), behind login — the landing does
 * not link the channel at all.
 *
 * Adding one: put its thumbnail in `public/videos/<id>.webp` (never hotlink
 * i.ytimg.com) and its title under `landing.videos.items` in both locales.
 * Recipe and commands: docs/features/landing-page.md
 */
export type LandingVideo = {
	/** YouTube video id */
	id: string;
	/** i18n key for the human-facing title */
	titleKey: string;
	/** Real length reported by YouTube, used for the duration badge */
	seconds: number;
};

export const LANDING_VIDEOS: LandingVideo[] = [
	{ id: 'jQb3q-mUG-8', titleKey: 'landing.videos.items.registration', seconds: 59 },
];
