import { ValueTransformer } from 'typeorm';

export class DateTransformer implements ValueTransformer {
	to(value: Date | string | null): string | null {
		if (!value) {
			return null;
		}
		// If it's already a string, assume it's in the correct format or an ISO string.
		if (typeof value === 'string') {
			return value.split('T')[0];
		}
		// If it's a Date object, convert it to an ISO string and take the date part.
		return value.toISOString().split('T')[0];
	}

	from(value: string | null): Date | null {
		if (!value) {
			return null;
		}
		// When reading from the database, it will be a string in 'YYYY-MM-DD' format.
		// new Date() will parse this correctly as a UTC date.
		return new Date(value);
	}
}

/**
 * Transformer for datetime columns in SQLite.
 * SQLite stores datetime strings without timezone info (e.g. '2026-01-30 02:00:00.000').
 * Without this transformer, new Date() treats those strings as LOCAL time instead of UTC,
 * causing dates to shift by the timezone offset on every read.
 */
export class DateTimeTransformer implements ValueTransformer {
	to(value: Date | string | null): string | null {
		if (!value) return null;
		if (typeof value === 'string') return value;
		return value.toISOString();
	}

	from(value: string | null): Date | null {
		if (!value) return null;
		// Ensure SQLite datetime strings are interpreted as UTC
		if (typeof value === 'string' && !value.endsWith('Z') && !value.includes('+')) {
			return new Date(value.replace(' ', 'T') + 'Z');
		}
		return new Date(value);
	}
}
