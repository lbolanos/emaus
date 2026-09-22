import { computed } from 'vue';
import { formatMeetingDateOnly, formatMeetingTimeOnly } from '@/utils/meetingFlyer';

/**
 * The date/time pair every meeting flyer style renders: a date-only line (no
 * year, no ghost time) plus a separate "hh:mm hrs." line, both in the
 * community's timezone. Default, Poster and WhatsApp used to carry identical
 * copies of these computeds — one place now, so a style can't drift.
 */
export function useMeetingFlyerDateTime(
	getMeeting: () => any,
	getCommunity: () => any,
) {
	const formattedDateOnly = computed(() => {
		const meeting = getMeeting();
		if (!meeting?.startDate) return '';
		return formatMeetingDateOnly(meeting.startDate, getCommunity());
	});

	const formattedTime = computed(() => {
		const meeting = getMeeting();
		if (!meeting?.startDate) return '';
		return formatMeetingTimeOnly(meeting.startDate, getCommunity());
	});

	return { formattedDateOnly, formattedTime };
}
