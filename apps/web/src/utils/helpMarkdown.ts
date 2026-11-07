import { marked } from 'marked';
import DOMPurify from 'dompurify';

/**
 * URL patterns for YouTube video links used in the in-app help docs
 * (youtu.be short links and the watch/embed/shorts canonical forms).
 * Anchored to the href start so redirect wrappers or lookalike hosts
 * (e.g. https://emaus.cc/out?to=… or https://notyoutu.be/…) are not
 * tagged as video links.
 */
const YOUTUBE_URL_PATTERNS: RegExp[] = [
	/^https?:\/\/(?:www\.)?youtu\.be\/([A-Za-z0-9_-]{6,})/i,
	/^https?:\/\/(?:www\.)?youtube\.com\/watch\?(?:[^#]*&)?v=([A-Za-z0-9_-]{6,})/i,
	/^https?:\/\/(?:www\.)?youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/i,
	/^https?:\/\/(?:www\.)?youtube\.com\/shorts\/([A-Za-z0-9_-]{6,})/i,
];

// Guard against pathological inputs (e.g. data: URLs of megabyte size blow the
// regex stack on Node 20/Linux) — video links in help docs are short URLs.
const MAX_EXTRACT_URL_LENGTH = 2048;

/**
 * Extracts the video id from a YouTube URL, or null if the URL is not a
 * recognizable YouTube video link.
 */
export function extractYouTubeId(url: string): string | null {
	if (!url || url.length > MAX_EXTRACT_URL_LENGTH) return null;
	for (const pattern of YOUTUBE_URL_PATTERNS) {
		const match = pattern.exec(url);
		if (match) return match[1];
	}
	return null;
}

/**
 * Renders the in-app help markdown into safe HTML. YouTube tutorial links get
 * `class="help-video-link"` + `data-video-id` so the help views can intercept
 * the click and play the video inline (their href is preserved for middle /
 * cmd-click). Any other external http(s) link opens in a new tab; relative
 * links are left untouched.
 *
 * Sanitizes with DOMPurify's default allowlist — the same behavior the help
 * views already had — plus `ADD_ATTR: ['target']` for the external links
 * injected above (`class`, `rel` and `data-*` already survive the default).
 */
export function renderHelpMarkdown(markdown: string): string {
	if (!markdown) return '';

	const raw = marked.parse(markdown, { async: false }) as string;
	const doc = new DOMParser().parseFromString(raw, 'text/html');

	doc.querySelectorAll('a[href]').forEach((link) => {
		const href = link.getAttribute('href') ?? '';
		const videoId = extractYouTubeId(href);
		if (videoId) {
			// `help-video-link` is a semantic hook (e2e selectors / future styling);
			// the click delegation matches on data-video-id, not on this class.
			const existingClass = link.getAttribute('class');
			link.setAttribute(
				'class',
				existingClass ? `${existingClass} help-video-link` : 'help-video-link',
			);
			link.setAttribute('data-video-id', videoId);
			return;
		}
		if (/^https?:\/\//i.test(href)) {
			link.setAttribute('target', '_blank');
			link.setAttribute('rel', 'noopener noreferrer');
		}
	});

	return DOMPurify.sanitize(doc.body.innerHTML, { ADD_ATTR: ['target'] });
}
