import { createI18n } from 'vue-i18n';
import en from './locales/en.json';
import es from './locales/es.json';
import type { MessageFunction, MessageContext } from '@intlify/core-base';

const getBrowserLocale = () => {
	const navigatorLocale = navigator.language.split('-')[0];
	if (['en', 'es'].includes(navigatorLocale)) {
		return navigatorLocale;
	}
	return 'en';
};

const getStoredLocale = () => {
	try {
		const stored = localStorage.getItem('preferred-locale');
		if (stored && ['en', 'es'].includes(stored)) {
			return stored;
		}
	} catch (error) {
		console.warn('Failed to read locale from localStorage:', error);
	}
	return null;
};

const storeLocale = (locale: string) => {
	try {
		localStorage.setItem('preferred-locale', locale);
	} catch (error) {
		console.warn('Failed to store locale to localStorage:', error);
	}
};

/**
 * Enhanced safe message compiler with support for:
 * - Named interpolation: {name}
 * - List interpolation: {0}, {1}
 * - Literal @ symbols (email addresses)
 * - Pluralization: {count} | no items | one item | {count} items
 * - HTML escaping option
 * - Linked messages fallback
 */

/**
 * Enhanced safe message compiler - FIXED version
 * Properly replaces ALL occurrences of placeholders
 */
function safeMessageCompiler(
	message: string,
	options: {
		escapeHtml?: boolean;
		allowHtmlTags?: boolean;
		maxDepth?: number;
	} = {},
): MessageFunction<string> {
	const { escapeHtml = false, allowHtmlTags = false, maxDepth = 3 } = options;

	return (ctx: MessageContext): string => {
		try {
			if (!message || typeof message !== 'string') {
				return '';
			}

			let result = message;
			const processedKeys = new Set<string>();

			// 1. Handle pluralization first
			result = handlePluralization(result, ctx);

			// 2. Handle list interpolation: {0}, {1} - FIXED
			result = handleListInterpolation(result, ctx, processedKeys);

			// 3. Handle named interpolation: {key} - FIXED
			result = handleNamedInterpolation(result, ctx, processedKeys);

			// 4. Handle modifiers
			result = handleModifiers(result, ctx, maxDepth);

			// 5. Escape HTML if needed
			if (escapeHtml) {
				result = escapeHtmlString(result, allowHtmlTags);
			}

			// 6. Clean up unreplaced placeholders
			result = cleanupPlaceholders(result);

			return result;
		} catch (error) {
			console.error('[i18n Compiler Error]', {
				error,
				message,
				context: ctx,
			});

			return sanitizeFallback(message);
		}
	};
}

/**
 * FIXED: Handle list interpolation - replaces ALL occurrences
 */
function handleListInterpolation(
	message: string,
	ctx: MessageContext,
	processedKeys: Set<string>,
): string {
	// Find all unique list indices in the message
	const listPlaceholderRegex = /\{(\d+)\}/g;
	const matches = [...message.matchAll(listPlaceholderRegex)];
	const uniqueIndices = [...new Set(matches.map((m) => parseInt(m[1], 10)))];

	let result = message;

	// Sort indices to process in order
	uniqueIndices.sort((a, b) => a - b);

	uniqueIndices.forEach((index) => {
		const cacheKey = `list_${index}`;
		const placeholder = `{${index}}`;

		if (processedKeys.has(cacheKey)) {
			return;
		}

		processedKeys.add(cacheKey);

		try {
			const value = ctx.list(index);

			if (value === null || value === undefined) {
				console.warn(`[i18n] Missing list value at index: ${index}`);
				// Remove ALL occurrences of this placeholder
				result = replaceAll(result, placeholder, '');
				return;
			}

			// Replace ALL occurrences
			result = replaceAll(result, placeholder, String(value));
		} catch (error) {
			console.error(`[i18n] Error replacing {${index}}:`, error);
			// Keep placeholder on error
		}
	});

	return result;
}

/**
 * FIXED: Handle named interpolation - replaces ALL occurrences
 */
function handleNamedInterpolation(
	message: string,
	ctx: MessageContext,
	processedKeys: Set<string>,
): string {
	const namedPlaceholderRegex = /\{([a-zA-Z_$][a-zA-Z0-9_$]*)\}/g;
	const matches = [...message.matchAll(namedPlaceholderRegex)];
	const uniqueKeys = [...new Set(matches.map((m) => m[1]))];

	let result = message;

	uniqueKeys.forEach((key) => {
		if (processedKeys.has(key)) {
			console.warn(`[i18n] Circular reference detected: ${key}`);
			return;
		}

		processedKeys.add(key);
		const placeholder = `{${key}}`;

		try {
			const value = ctx.named(key);

			if (value === null || value === undefined) {
				console.warn(`[i18n] Missing value for placeholder: ${key}`);
				result = replaceAll(result, placeholder, '');
				return;
			}

			let replacement: string;
			if (typeof value === 'object') {
				replacement = JSON.stringify(value);
			} else {
				replacement = String(value);
			}

			// Replace ALL occurrences
			result = replaceAll(result, placeholder, replacement);
		} catch (error) {
			console.error(`[i18n] Error replacing {${key}}:`, error);
		}
	});

	return result;
}

/**
 * Replace ALL occurrences of a substring
 * More reliable than String.replace() with regex
 */
function replaceAll(str: string, search: string, replacement: string): string {
	// Escape special regex characters in search string
	const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return str.replace(new RegExp(escapedSearch, 'g'), replacement);
}

/**
 * Handle pluralization
 */
function handlePluralization(message: string, ctx: MessageContext): string {
	const pluralRegex = /\{(\w+)\}\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*(.+)/;
	const match = message.match(pluralRegex);

	if (match) {
		const [, countKey, zero, one, many] = match;
		const count = Number(ctx.named(countKey) ?? 0);

		let selected: string;
		if (count === 0) {
			selected = zero.trim();
		} else if (count === 1) {
			selected = one.trim();
		} else {
			selected = many.trim();
		}

		// Replace placeholders in selected string
		const processedKeys = new Set<string>();
		selected = handleNamedInterpolation(selected, ctx, processedKeys);
		selected = handleListInterpolation(selected, ctx, processedKeys);

		return selected;
	}

	return message;
}

/**
 * Handle modifiers
 */
function handleModifiers(
	message: string,
	ctx: MessageContext,
	maxDepth: number,
	depth: number = 0,
): string {
	if (depth >= maxDepth) {
		console.warn('[i18n] Max recursion depth reached');
		return message;
	}

	const modifierRegex = /@(?:\.(\w+))?:([a-zA-Z0-9._]+)/g;

	return message.replace(modifierRegex, (match, modifier, key) => {
		try {
			let linkedValue = match;

			if (modifier && typeof linkedValue === 'string') {
				switch (modifier.toLowerCase()) {
					case 'upper':
						linkedValue = linkedValue.toUpperCase();
						break;
					case 'lower':
						linkedValue = linkedValue.toLowerCase();
						break;
					case 'capitalize':
						linkedValue = linkedValue.charAt(0).toUpperCase() + linkedValue.slice(1);
						break;
					case 'literal':
						linkedValue = key;
						break;
					default:
						console.warn(`[i18n] Unknown modifier: ${modifier}`);
				}
			}

			return linkedValue;
		} catch (error) {
			console.error(`[i18n] Error processing modifier ${match}:`, error);
			return match;
		}
	});
}

/**
 * Escape HTML
 */
function escapeHtmlString(str: string, allowBasicTags: boolean = false): string {
	const htmlEscapeMap: Record<string, string> = {
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
		"'": '&#x27;',
		'/': '&#x2F;',
	};

	const escapeHtml = (text: string): string => {
		return text.replace(/[&<>"'/]/g, (char) => htmlEscapeMap[char] || char);
	};

	if (allowBasicTags) {
		const allowedTags = ['b', 'i', 'strong', 'em', 'span', 'br'];
		const tagRegex = new RegExp(`<(/?(${allowedTags.join('|')})[^>]*)>`, 'gi');

		const parts: string[] = [];
		let lastIndex = 0;

		str.replace(tagRegex, (match, _, offset) => {
			if (offset > lastIndex) {
				parts.push(escapeHtml(str.slice(lastIndex, offset)));
			}
			parts.push(match);
			lastIndex = offset + match.length;
			return match;
		});

		if (lastIndex < str.length) {
			parts.push(escapeHtml(str.slice(lastIndex)));
		}

		return parts.join('');
	}

	return escapeHtml(str);
}

/**
 * Clean up unreplaced placeholders
 */
function cleanupPlaceholders(message: string): string {
	return message.replace(/\{[^}]+\}/g, (match) => {
		console.warn(`[i18n] Unreplaced placeholder: ${match}`);
		return ''; // Remove unreplaced placeholders
	});
}

/**
 * Sanitize fallback
 */
function sanitizeFallback(message: string): string {
	try {
		return message
			.replace(/@(?![a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, '&#64;')
			.replace(/<script[^>]*>.*?<\/script>/gi, '')
			.replace(/javascript:/gi, '');
	} catch {
		return 'Translation error';
	}
}

/**
 * Create i18n instance with safe compiler
 */
export function createSafeI18n(messages: Record<string, any>) {
	return createI18n({
		legacy: false,
		locale: 'es',
		fallbackLocale: 'en',
		messages,
		messageCompiler: (message: string) =>
			safeMessageCompiler(message, {
				escapeHtml: false,
				allowHtmlTags: true,
				maxDepth: 3,
			}),
		missing: (locale, key) => {
			console.warn(`[i18n] Missing translation: ${key} (${locale})`);
			return key;
		},
		missingWarn: false,
		fallbackWarn: false,
		silentTranslationWarn: true,
		silentFallbackWarn: true,
	});
}

const i18n = createI18n({
	legacy: false,
	locale: getStoredLocale() || getBrowserLocale(),
	fallbackLocale: 'en',
	messages: {
		en,
		es,
	},
	messageCompiler: (message: string) =>
		safeMessageCompiler(message, {
			escapeHtml: false, // Set true if you need XSS protection
			allowHtmlTags: true, // Allow basic HTML tags like <b>, <i>
			maxDepth: 3, // Max recursion for linked messages
		}),
	missing: (locale, key) => {
		console.warn(`Missing: ${key} (${locale})`);
		return key;
	},
	silentTranslationWarn: process.env.NODE_ENV === 'production',
	silentFallbackWarn: process.env.NODE_ENV === 'production',
	missingWarn: process.env.NODE_ENV !== 'production',
	fallbackWarn: process.env.NODE_ENV !== 'production',
});

export { storeLocale };

export default i18n;
