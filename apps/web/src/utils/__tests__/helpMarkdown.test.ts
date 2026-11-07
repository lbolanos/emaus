import { describe, it, expect } from 'vitest';
import { renderHelpMarkdown, extractYouTubeId } from '../helpMarkdown';

describe('extractYouTubeId', () => {
	it('extracts the id from a youtu.be short link', () => {
		expect(extractYouTubeId('https://youtu.be/AHhyWbUv_Is')).toBe('AHhyWbUv_Is');
	});

	it('extracts the id from a watch?v= URL', () => {
		expect(extractYouTubeId('https://www.youtube.com/watch?v=AHhyWbUv_Is')).toBe('AHhyWbUv_Is');
	});

	it('extracts the id from a watch URL with extra params', () => {
		expect(extractYouTubeId('https://www.youtube.com/watch?t=2&v=3XZlQJZlcmo')).toBe('3XZlQJZlcmo');
	});

	it('extracts the id from an embed URL', () => {
		expect(extractYouTubeId('https://www.youtube.com/embed/jQb3q-mUG-8')).toBe('jQb3q-mUG-8');
	});

	it('extracts the id from a shorts URL', () => {
		expect(extractYouTubeId('https://www.youtube.com/shorts/V3JJkwi8tpc')).toBe('V3JJkwi8tpc');
	});

	it('returns null for non-YouTube URLs', () => {
		expect(extractYouTubeId('https://vimeo.com/123456')).toBe(null);
		expect(extractYouTubeId('/help/getting-started')).toBe(null);
		expect(extractYouTubeId('mailto:someone@example.com')).toBe(null);
	});

	it('returns null for empty or overlong input', () => {
		expect(extractYouTubeId('')).toBe(null);
		expect(extractYouTubeId(`https://youtu.be/x${'a'.repeat(3000)}`)).toBe(null);
	});

	it('does not tag redirect wrappers or lookalike hosts (anchored patterns)', () => {
		expect(extractYouTubeId('https://emaus.cc/out?to=https://youtu.be/AHhyWbUv_Is')).toBe(null);
		expect(extractYouTubeId('https://notyoutu.be/abcdefghijk')).toBe(null);
		expect(extractYouTubeId('https://evil.com/watch?v=AAAAAAAAAAA')).toBe(null);
		const html = renderHelpMarkdown('[x](https://fakeyoutube.com/watch?v=12345678901)');
		expect(html).not.toContain('data-video-id');
		expect(html).toContain('target="_blank"');
	});
});

describe('renderHelpMarkdown', () => {
	it('tags YouTube links with data-video-id and the help-video-link class, without target', () => {
		const html = renderHelpMarkdown('[Ver video tutorial](https://youtu.be/AHhyWbUv_Is)');
		expect(html).toContain('data-video-id="AHhyWbUv_Is"');
		expect(html).toContain('help-video-link');
		expect(html).toContain('href="https://youtu.be/AHhyWbUv_Is"');
		expect(html).not.toContain('target=');
	});

	it('opens non-YouTube external links in a new tab', () => {
		const html = renderHelpMarkdown('[Docs](https://example.com/guide)');
		expect(html).toContain('target="_blank"');
		expect(html).toContain('rel="noopener noreferrer"');
		expect(html).not.toContain('data-video-id');
	});

	it('leaves relative links untouched', () => {
		const html = renderHelpMarkdown('[Otra sección](/help/tables)');
		expect(html).toContain('href="/help/tables"');
		expect(html).not.toContain('target=');
		expect(html).not.toContain('data-video-id');
	});

	it('renders regular markdown structure', () => {
		const html = renderHelpMarkdown('# Título\n\nPaso **uno**\n\n- item');
		expect(html).toContain('<h1>');
		expect(html).toContain('<strong>uno</strong>');
		expect(html).toContain('<li>item</li>');
	});

	it('strips script tags', () => {
		// NOTE: happy-dom's DOMParser EVALUATES inline <script> tags at parse time
		// (browsers do not), so the payload uses a non-JS MIME type to reach the
		// sanitizer instead of exploding the harness. DOMPurify strips <script>
		// regardless of its type attribute.
		const html = renderHelpMarkdown('Hola <script type="application/json">{"a":1}</script>');
		expect(html).not.toContain('<script');
		expect(html).toContain('Hola');
	});

	it('strips event handlers and javascript: URIs', () => {
		// NOTE: no <script> in this payload — happy-dom + DOMPurify lets dangerous
		// attributes survive on nodes that FOLLOW a removed <script> (harness-only
		// quirk; real browsers are not affected). Keep the two assertions in
		// separate payloads.
		const html = renderHelpMarkdown(
			'Un <img src="x" onclick="alert(2)" onerror="alert(3)"> y <a href="javascript:alert(1)">x</a>',
		);
		expect(html).not.toContain('onclick');
		expect(html).not.toContain('onerror');
		expect(html).not.toContain('javascript:');
	});

	it('returns empty string for empty input', () => {
		expect(renderHelpMarkdown('')).toBe('');
	});

	it('does not intercept links that merely mention youtube in the text', () => {
		const html = renderHelpMarkdown('[Busca en YouTube](https://example.com/search?q=youtube)');
		expect(html).toContain('target="_blank"');
		expect(html).not.toContain('data-video-id');
	});
});
