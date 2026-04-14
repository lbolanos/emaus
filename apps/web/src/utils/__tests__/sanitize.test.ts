import { describe, it, expect } from 'vitest';
import {
	sanitizeHtml,
	sanitizeText,
	sanitizeEmailHtml,
	isSafeUrl,
	sanitizeAttribute,
	markdownToSafeHtml,
} from '../sanitize';

describe('sanitize utilities', () => {
	describe('sanitizeHtml', () => {
		it('returns empty string for falsy input', () => {
			expect(sanitizeHtml('')).toBe('');
			expect(sanitizeHtml(null as any)).toBe('');
			expect(sanitizeHtml(undefined as any)).toBe('');
		});

		it('allows safe tags', () => {
			const html = '<p>Hello <strong>world</strong></p>';
			expect(sanitizeHtml(html)).toBe('<p>Hello <strong>world</strong></p>');
		});

		it('strips script tags', () => {
			const html = '<p>Hi</p><script>alert("xss")</script>';
			const result = sanitizeHtml(html);
			expect(result).not.toContain('<script>');
			expect(result).not.toContain('alert');
		});

		it('strips event handlers', () => {
			const html = '<p onclick="alert(1)">Click me</p>';
			expect(sanitizeHtml(html)).toBe('<p>Click me</p>');
		});

		it('strips javascript: URLs from links', () => {
			const html = '<a href="javascript:alert(1)">Bad link</a>';
			const result = sanitizeHtml(html);
			expect(result).not.toContain('javascript:');
		});

		it('allows safe attributes like href and class', () => {
			const html = '<a href="https://example.com" class="link">Link</a>';
			expect(sanitizeHtml(html)).toContain('href="https://example.com"');
			expect(sanitizeHtml(html)).toContain('class="link"');
		});

		it('strips style attribute (not in allowed list)', () => {
			const html = '<p style="color:red">Styled</p>';
			const result = sanitizeHtml(html);
			expect(result).not.toContain('style=');
		});

		it('allows table elements', () => {
			const html = '<table><thead><tr><th>Header</th></tr></thead><tbody><tr><td>Cell</td></tr></tbody></table>';
			const result = sanitizeHtml(html);
			expect(result).toContain('<table>');
			expect(result).toContain('<th>Header</th>');
			expect(result).toContain('<td>Cell</td>');
		});

		it('strips iframe tags', () => {
			const html = '<iframe src="https://evil.com"></iframe>';
			expect(sanitizeHtml(html)).not.toContain('iframe');
		});

		it('strips img onerror XSS', () => {
			const html = '<img src=x onerror="alert(1)">';
			const result = sanitizeHtml(html);
			expect(result).not.toContain('onerror');
		});

		it('strips onerror attribute from img tags', () => {
			// DOMPurify strips event handler attributes regardless of src content
			const html = '<img src="x.png" onerror="alert(1)" onload="alert(2)">';
			const result = sanitizeHtml(html);
			expect(result).not.toContain('onerror');
			expect(result).not.toContain('onload');
			expect(result).not.toContain('alert');
		});
	});

	describe('sanitizeText', () => {
		it('returns empty string for falsy input', () => {
			expect(sanitizeText('')).toBe('');
			expect(sanitizeText(null as any)).toBe('');
		});

		it('strips all HTML tags', () => {
			expect(sanitizeText('<p>Hello <b>world</b></p>')).toBe('Hello world');
		});

		it('leaves plain text unchanged', () => {
			expect(sanitizeText('Hello world')).toBe('Hello world');
		});
	});

	describe('sanitizeEmailHtml', () => {
		it('returns empty string for falsy input', () => {
			expect(sanitizeEmailHtml('')).toBe('');
		});

		it('allows style attributes (needed for email templates)', () => {
			const html = '<p style="color:red;font-size:14px">Styled email</p>';
			const result = sanitizeEmailHtml(html);
			expect(result).toContain('style=');
		});

		it('strips script tags', () => {
			const html = '<p>Email</p><script>steal_cookies()</script>';
			expect(sanitizeEmailHtml(html)).not.toContain('script');
		});

		it('strips event handlers', () => {
			const html = '<div onmouseover="alert(1)">Content</div>';
			const result = sanitizeEmailHtml(html);
			expect(result).not.toContain('onmouseover');
		});
	});

	describe('isSafeUrl', () => {
		it('returns false for falsy input', () => {
			expect(isSafeUrl('')).toBe(false);
			expect(isSafeUrl(null as any)).toBe(false);
		});

		it('allows http URLs', () => {
			expect(isSafeUrl('http://example.com')).toBe(true);
		});

		it('allows https URLs', () => {
			expect(isSafeUrl('https://example.com')).toBe(true);
		});

		it('allows mailto URLs', () => {
			expect(isSafeUrl('mailto:user@example.com')).toBe(true);
		});

		it('allows tel URLs', () => {
			expect(isSafeUrl('tel:+1234567890')).toBe(true);
		});

		it('rejects javascript: URLs', () => {
			expect(isSafeUrl('javascript:alert(1)')).toBe(false);
		});

		it('rejects data: URLs', () => {
			expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
		});

		it('rejects invalid URLs', () => {
			expect(isSafeUrl('not-a-url')).toBe(false);
		});
	});

	describe('sanitizeAttribute', () => {
		it('returns empty string for falsy input', () => {
			expect(sanitizeAttribute('')).toBe('');
		});

		it('HTML-encodes dangerous characters instead of stripping', () => {
			expect(sanitizeAttribute('a"b\'c<d>e&f')).toBe('a&quot;b&#39;c&lt;d&gt;e&amp;f');
		});

		it('preserves ampersands in content like AT&T', () => {
			expect(sanitizeAttribute('AT&T')).toBe('AT&amp;T');
		});

		it('collapses whitespace', () => {
			expect(sanitizeAttribute('a   b   c')).toBe('a b c');
		});

		it('trims leading/trailing whitespace', () => {
			expect(sanitizeAttribute('  hello  ')).toBe('hello');
		});
	});

	describe('markdownToSafeHtml', () => {
		it('returns empty string for falsy input', () => {
			expect(markdownToSafeHtml('')).toBe('');
		});

		it('converts bold markdown', () => {
			const result = markdownToSafeHtml('**bold text**');
			expect(result).toContain('<strong>bold text</strong>');
		});

		it('converts italic markdown', () => {
			const result = markdownToSafeHtml('*italic text*');
			expect(result).toContain('<em>italic text</em>');
		});

		it('converts inline code', () => {
			const result = markdownToSafeHtml('`code`');
			expect(result).toContain('<code>code</code>');
		});

		it('converts newlines to br', () => {
			const result = markdownToSafeHtml('line1\nline2');
			expect(result).toContain('<br>');
		});

		it('sanitizes the output (no XSS via markdown)', () => {
			const result = markdownToSafeHtml('**<script>alert(1)</script>**');
			expect(result).not.toContain('<script>');
		});
	});
});
