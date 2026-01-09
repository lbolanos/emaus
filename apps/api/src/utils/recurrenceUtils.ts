/**
 * Utility functions for calculating recurring meeting occurrences
 */

/**
 * Calculates the next occurrence date for a recurring meeting
 * @param currentStartDate - The current meeting's start date
 * @param frequency - Recurrence frequency ('daily' | 'weekly' | 'monthly')
 * @param interval - Recurrence interval (e.g., 1 for every week, 2 for every 2 weeks)
 * @param dayOfWeek - Day of week for weekly recurrence ('monday', 'tuesday', etc.)
 * @param dayOfMonth - Day of month for monthly recurrence (1-31)
 * @returns The next occurrence date, or null if calculation fails
 */
export function calculateNextOccurrence(
	currentStartDate: Date,
	frequency: 'daily' | 'weekly' | 'monthly' | null,
	interval: number | null,
	dayOfWeek: string | null,
	dayOfMonth: number | null,
): Date | null {
	if (!frequency) return null;

	const current = new Date(currentStartDate);
	let nextDate = new Date(current);

	switch (frequency) {
		case 'daily':
			// Add interval days to current date
			nextDate.setDate(current.getDate() + (interval || 1));
			break;

		case 'weekly': {
			// Calculate based on day of week
			const intervalWeeks = interval || 1;
			const targetDay = getDayNumber(dayOfWeek);
			const currentDay = current.getDay();

			// Calculate days until the next occurrence of the target day
			// If current day is the target day, we want the NEXT occurrence (7 days later + intervals)
			const daysUntilTarget = (targetDay - currentDay + 7) % 7 || 7;

			// Add days to reach target day plus any additional weeks from interval
			nextDate.setDate(current.getDate() + daysUntilTarget + (intervalWeeks - 1) * 7);
			break;
		}

		case 'monthly': {
			// Calculate based on day of month
			const intervalMonths = interval || 1;
			const targetDayOfMonth = dayOfMonth || current.getDate();

			// Add the interval months
			nextDate.setMonth(current.getMonth() + intervalMonths);

			// Set the day, adjusting for months with fewer days
			// (e.g., day 31 in February becomes Feb 28/29)
			const daysInTargetMonth = getDaysInMonth(nextDate);
			nextDate.setDate(Math.min(targetDayOfMonth, daysInTargetMonth));
			break;
		}

		default:
			return null;
	}

	// Preserve time from original meeting
	nextDate.setHours(
		current.getHours(),
		current.getMinutes(),
		current.getSeconds(),
		current.getMilliseconds(),
	);

	return nextDate;
}

/**
 * Converts day name to JavaScript day number
 * @param dayName - Name of day ('sunday', 'monday', etc.)
 * @returns Day number (0=Sunday, 1=Monday, ..., 6=Saturday)
 */
function getDayNumber(dayName: string | null): number {
	const days: Record<string, number> = {
		sunday: 0,
		monday: 1,
		tuesday: 2,
		wednesday: 3,
		thursday: 4,
		friday: 5,
		saturday: 6,
	};
	return days[dayName || ''] ?? 0;
}

/**
 * Gets the number of days in a month
 * @param date - Date within the target month
 * @returns Number of days in the month (28-31)
 */
function getDaysInMonth(date: Date): number {
	// Set to the 0th day of the next month, which gives us the last day of the current month
	return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}
