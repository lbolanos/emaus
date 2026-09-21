import { computed, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import {
	formatCommunityAddress,
	formatDuration,
	formatMeetingDateOnly,
	formatMeetingTimeOnly,
	replaceFlyerVariables,
	titleCaseForDisplay,
	type MeetingFlyerData,
} from '@/utils/meetingFlyer';

/**
 * Everything the meeting flyer renders, derived from the meeting, its community
 * and the community's saved flyer options.
 *
 * Mirrors useFlyerContent: shared by the published view and the editor's live
 * preview, so it takes its inputs as getters instead of reading stores.
 */
export interface MeetingFlyerContent {
	// Header (fixed chrome, but its texts are overridable)
	kickerText: string;
	titleText: string;
	showEmausLine: boolean;
	emausLine: string;
	communityName: string;

	// dateTime block
	dateLabelText: string;
	dateOnly: string;
	timeOnly: string;
	durationLabelText: string;
	durationText: string;

	// description block
	descriptionLabelText: string;
	descriptionText: string;

	// location block
	locationLabelText: string;
	address: string;

	// locationQr block
	qrCaptionText: string;
	googleMapsUrl: string | undefined;

	// community block
	communityBrandText: string;

	// Footer
	footerText: string;
}

/**
 * Community names like "Emaús del Valle" already carry the movement's name;
 * repeating "EMAÚS" above them reads as a stutter, so the line is dropped.
 */
const STARTS_WITH_EMAUS = /^ema[úu]s\b/i;

export function useMeetingFlyerContent(
	getMeeting: () => any,
	getCommunity: () => any,
	getFlyerOptions: () => any,
): MeetingFlyerContent {
	const { t } = useI18n();

	const meeting = computed(() => getMeeting() || null);
	const community = computed(() => getCommunity() || null);
	const options = computed(() => getFlyerOptions() || null);

	/** Texts the coordinator took off the flyer altogether. */
	const hiddenTexts = computed<string[]>(() => options.value?.hiddenTexts ?? []);

	/** Override first, then the default wording — hidden means the template drops it. */
	const editableText = (key: string, fallback: () => string) =>
		computed(() => {
			if (hiddenTexts.value.includes(key)) return '';
			return options.value?.[key] || fallback();
		});

	const communityName = computed(() => titleCaseForDisplay(community.value?.name || ''));

	const address = computed(() =>
		community.value ? formatCommunityAddress(community.value) : '',
	);

	const durationText = computed(() => {
		// An announcement has no end; the duration line would read as a mistake.
		if (!meeting.value?.durationMinutes || meeting.value?.isAnnouncement) return '';
		return formatDuration(meeting.value.durationMinutes);
	});

	/** The meeting's own template copy, with its variables resolved. */
	const templatedDescription = computed(() => {
		if (!meeting.value || !community.value) return '';

		const flyerData: MeetingFlyerData = {
			fecha: formatMeetingDateOnly(meeting.value.startDate, community.value),
			hora: formatMeetingTimeOnly(meeting.value.startDate, community.value),
			nombre: meeting.value.title || '',
			descripcion: meeting.value.description || '',
			duracion: durationText.value,
			ubicacion: address.value,
			comunidad: communityName.value,
		};

		return replaceFlyerVariables(meeting.value.flyerTemplate || undefined, flyerData);
	});

	return reactive({
		kickerText: editableText('kickerOverride', () => t('meetingFlyer.kicker')),
		titleText: editableText('titleOverride', () => meeting.value?.title || ''),
		showEmausLine: computed(() => !STARTS_WITH_EMAUS.test(community.value?.name || '')),
		emausLine: computed(() => t('meetingFlyer.emausLine')),
		communityName,

		dateLabelText: editableText('dateLabelOverride', () => t('meetingFlyer.dateLabel')),
		dateOnly: computed(() =>
			meeting.value?.startDate
				? formatMeetingDateOnly(meeting.value.startDate, community.value)
				: '',
		),
		timeOnly: computed(() =>
			meeting.value?.startDate
				? formatMeetingTimeOnly(meeting.value.startDate, community.value)
				: '',
		),
		durationLabelText: editableText('durationLabelOverride', () =>
			t('meetingFlyer.durationLabel'),
		),
		durationText,

		descriptionLabelText: editableText('descriptionLabelOverride', () =>
			t('meetingFlyer.descriptionLabel'),
		),
		descriptionText: editableText('descriptionOverride', () => templatedDescription.value),

		locationLabelText: editableText('locationLabelOverride', () => t('meetingFlyer.locationLabel')),
		address,

		qrCaptionText: editableText('qrCaptionOverride', () => t('meetingFlyer.qrCaption')),
		googleMapsUrl: computed(() => {
			const raw = community.value?.googleMapsUrl;
			return raw && raw.trim() ? raw.trim() : undefined;
		}),

		communityBrandText: computed(() => t('meetingFlyer.communityBrand', { name: communityName.value })),

		footerText: editableText('footerTextOverride', () => t('meetingFlyer.footerText')),
	}) as MeetingFlyerContent;
}
