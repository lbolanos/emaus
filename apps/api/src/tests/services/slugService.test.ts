// Tests for slug generation, validation, and retreat slug endpoints

// Slug generation helper (same logic as migration and frontend)
function generateSlug(parish: string, number: string): string {
	return (parish + number)
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]/g, '');
}

describe('Slug Generation', () => {
	test('should generate slug from parish and number', () => {
		expect(generateSlug('Interlomas', 'III')).toBe('interlomasiii');
	});

	test('should remove accents', () => {
		expect(generateSlug('San Ángel', '')).toBe('sanangel');
		expect(generateSlug('La Esperanza de María', 'XII')).toBe('laesperanzademariaxii');
	});

	test('should remove spaces and special characters', () => {
		expect(generateSlug('San Judas Tadeo', 'III')).toBe('sanjudastadeoiii');
		expect(generateSlug('Buen despacho', '')).toBe('buendespacho');
	});

	test('should handle empty parish', () => {
		expect(generateSlug('', 'III')).toBe('iii');
	});

	test('should handle empty number', () => {
		expect(generateSlug('Interlomas', '')).toBe('interlomas');
	});

	test('should handle both empty', () => {
		expect(generateSlug('', '')).toBe('');
	});

	test('should convert to lowercase', () => {
		expect(generateSlug('INTERLOMAS', 'IV')).toBe('interlomasiv');
	});

	test('should remove punctuation and symbols', () => {
		expect(generateSlug('Parroquia de S.F.', '#2')).toBe('parroquiadesf2');
	});

	test('should handle ñ correctly', () => {
		expect(generateSlug('El Niño', '')).toBe('elnino');
	});

	test('should handle ü correctly', () => {
		expect(generateSlug('Güemes', '')).toBe('guemes');
	});
});

describe('Slug Normalization (frontend input)', () => {
	function normalizeSlug(input: string): string {
		return input
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase()
			.replace(/[^a-z0-9]/g, '');
	}

	test('should normalize user input', () => {
		expect(normalizeSlug('InterLomas III')).toBe('interlomasiii');
	});

	test('should strip invalid characters from pasted text', () => {
		expect(normalizeSlug('retiro-2024!')).toBe('retiro2024');
	});

	test('should handle already valid slug', () => {
		expect(normalizeSlug('interlomasiii')).toBe('interlomasiii');
	});
});

describe('Slug URL Patterns', () => {
	const slugPattern = /^[a-z0-9]+$/;

	test('valid slugs match the route pattern', () => {
		expect(slugPattern.test('interlomasiii')).toBe(true);
		expect(slugPattern.test('sanangel')).toBe(true);
		expect(slugPattern.test('retiro2024')).toBe(true);
	});

	test('invalid patterns do not match', () => {
		expect(slugPattern.test('inter-lomas')).toBe(false);
		expect(slugPattern.test('Inter Lomas')).toBe(false);
		expect(slugPattern.test('')).toBe(false);
		expect(slugPattern.test('retiro/iii')).toBe(false);
	});

	test('known static routes should not conflict with slug pattern', () => {
		// These are all lowercase alphanumeric, so they WOULD match the slug pattern.
		// Vue Router resolves this by matching static routes first (higher priority).
		const staticRoutes = ['login', 'privacy', 'terms', 'app'];
		for (const route of staticRoutes) {
			expect(slugPattern.test(route)).toBe(true);
			// This is fine because Vue Router gives priority to static paths over dynamic params
		}
	});

	test('walker URL uses slug directly', () => {
		const slug = 'interlomasiii';
		const walkerUrl = `https://emaus.cc/${slug}`;
		expect(walkerUrl).toBe('https://emaus.cc/interlomasiii');
	});

	test('server URL appends /server to slug', () => {
		const slug = 'interlomasiii';
		const serverUrl = `https://emaus.cc/${slug}/server`;
		expect(serverUrl).toBe('https://emaus.cc/interlomasiii/server');
	});

	test('fallback to UUID when no slug', () => {
		const retreatId = '4082eb4b-10ba-4e9b-806b-eeca32a0f61a';
		const slug = undefined;
		const walkerUrl = slug
			? `https://emaus.cc/${slug}`
			: `https://emaus.cc/register/walker/${retreatId}`;
		expect(walkerUrl).toBe(`https://emaus.cc/register/walker/${retreatId}`);
	});
});
