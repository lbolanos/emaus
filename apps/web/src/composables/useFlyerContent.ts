import { computed, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import DOMPurify from 'dompurify';

export interface FlyerContactPhone {
	name: string;
	number: string;
}

/**
 * Everything the flyer blocks render, derived from the retreat and its flyer options.
 *
 * Shared by the read-only flyer view and the editor's live preview, so it takes the
 * retreat and options as getters instead of reading the store directly.
 */
export interface FlyerContent {
	// Header / banner
	retreatTypeText: string;
	retreatTypeLogo: string;
	retreatParish: string;
	retreatNumber: string;
	formatDateRange: string;
	titleText: string;
	subtitleText: string;
	quoteText: string;
	catholicRetreatText: string;
	emausForText: string;

	// Dates
	startDate: Date | string | undefined;
	endDate: Date | string | undefined;
	openingTimeDisplay: string;
	registrationDeadline: string;
	closingLocation: string | undefined;

	// Location
	retreatLocation: string;
	retreatAddress: string;
	googleMapsUrl: string | undefined;
	showQrCodesLocation: boolean;

	// Cost
	formatCost: string;
	paymentInfo: string;
	paymentMethods: string | undefined;

	// Contact
	contactPhones: FlyerContactPhone[];
	contactEmails: string[];
	totalContactItems: number;

	// What to bring
	thingsToBringItems: string[];
	thingsToBringSubtitle: string;

	// Registration
	registrationUrl: string;
	registrationDomain: string;

	// Body copy
	encounterDescriptionHtml: string;
	dareToLiveItText: string;
	arrivalTimeNoteText: string;
	whatToBringText: string;
	registerText: string;
	scanToRegisterText: string;

	// Footer
	comeText: string;
	limitedCapacityText: string;
	dontMissItText: string;
	reservationNoteText: string;

	formatDate: (value: Date | string | undefined) => string;
}

/** Control characters that leak in from copy-pasted bank details. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/g;

/** Parses a date string/Date keeping the calendar day, without timezone shifting. */
const parseCalendarDate = (dateValue: Date | string): Date => {
	if (typeof dateValue === 'string') {
		const match = dateValue.match(/^(\d{4}-\d{2}-\d{2})/);
		if (match) {
			const [year, month, day] = match[1].split('-').map(Number);
			return new Date(year, month - 1, day);
		}
		const parsed = new Date(dateValue);
		return new Date(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
	}
	return new Date(dateValue.getUTCFullYear(), dateValue.getUTCMonth(), dateValue.getUTCDate());
};

export function useFlyerContent(
	getRetreat: () => any,
	getFlyerOptions: () => any,
	getRegistrationLink: () => string | undefined,
): FlyerContent {
	const { t } = useI18n();

	const retreat = computed(() => getRetreat() || null);
	const options = computed(() => getFlyerOptions() || null);

	/** Texts the coordinator took off the flyer altogether. */
	const hiddenTexts = computed<string[]>(() => options.value?.hiddenTexts ?? []);

	/**
	 * Resolves one editable text: the override, then the default wording — unless it is
	 * hidden, in which case it returns '' and the template drops the element.
	 */
	const editableText = (key: string, fallbackKey: string) =>
		computed(() => {
			if (hiddenTexts.value.includes(key)) return '';
			return options.value?.[key] || t(`retreatFlyer.${fallbackKey}`);
		});

	const retreatTypeText = computed(() => {
		if (retreat.value?.retreat_type) {
			return t(`retreatModal.types.${retreat.value.retreat_type}`);
		}

		const parish = retreat.value?.parish?.toLowerCase() || '';
		const houseName = retreat.value?.house?.name?.toLowerCase() || '';
		const paymentInfoRaw = retreat.value?.paymentInfo?.toLowerCase() || '';

		if (parish.includes('mujer') || houseName.includes('mujer') || paymentInfoRaw.includes('mujer')) {
			return t('retreatModal.types.women');
		}
		if (parish.includes('joven') || houseName.includes('joven') || paymentInfoRaw.includes('joven')) {
			return 'JÓVENES';
		}
		if (
			parish.includes('matrimonio') ||
			houseName.includes('matrimonio') ||
			paymentInfoRaw.includes('matrimonio')
		) {
			return t('retreatModal.types.couples');
		}

		return t('retreatModal.types.men');
	});

	const retreatTypeLogo = computed(() => {
		if (retreat.value?.retreat_type) {
			const logos: Record<string, string> = {
				men: '/oficial_mejorado.png',
				women: '/woman_logo.png',
				couples: '/crossRoseButtT.png',
				effeta: '/crossRoseButtT.png',
			};
			return logos[retreat.value.retreat_type] || '/crossRoseButtT.png';
		}

		const parish = retreat.value?.parish?.toLowerCase() || '';
		const houseName = retreat.value?.house?.name?.toLowerCase() || '';
		const paymentInfoRaw = retreat.value?.paymentInfo?.toLowerCase() || '';

		if (parish.includes('mujer') || houseName.includes('mujer') || paymentInfoRaw.includes('mujer')) {
			return '/woman_logo.png';
		}
		if (
			parish.includes('matrimonio') ||
			houseName.includes('matrimonio') ||
			paymentInfoRaw.includes('matrimonio')
		) {
			return '/man_logo.png';
		}

		return '/man_logo.png';
	});

	const formatDate = (dateValue: Date | string | undefined) => {
		if (!dateValue) return '';
		return parseCalendarDate(dateValue).toLocaleDateString('es-ES', {
			weekday: 'long',
			day: 'numeric',
			month: 'long',
		});
	};

	const formatDateRange = computed(() => {
		if (!retreat.value?.startDate || !retreat.value?.endDate) return '';
		const start = parseCalendarDate(retreat.value.startDate);
		const end = parseCalendarDate(retreat.value.endDate);
		return `${start.getDate()} al ${end.getDate()} de ${start.toLocaleDateString('es-ES', { month: 'long' })}`;
	});

	const openingTimeDisplay = computed(() => {
		const walkerArrivalTime = retreat.value?.walkerArrivalTime;
		if (walkerArrivalTime) {
			const [hours, minutes] = walkerArrivalTime.split(':');
			const hour = parseInt(hours);
			const ampm = hour >= 12 ? 'PM' : 'AM';
			const displayHour = hour > 12 ? hour - 12 : hour || 12;
			return `${displayHour}:${minutes || '00'} ${ampm} EN PUNTO`;
		}
		return '5:00 PM EN PUNTO';
	});

	const registrationDeadline = computed(() => {
		const openingNotes = retreat.value?.openingNotes;
		if (openingNotes && openingNotes.trim()) {
			return openingNotes.trim();
		}

		const walkerArrivalTime = retreat.value?.walkerArrivalTime;
		if (walkerArrivalTime) {
			const [hours, minutes] = walkerArrivalTime.split(':');
			const hour = parseInt(hours) + 0.5;
			const displayHour = hour > 12 ? Math.floor(hour - 12) : Math.floor(hour);
			const displayMinutes = hour % 1 !== 0 ? '30' : minutes || '00';
			const ampm = hour >= 12 ? 'PM' : 'AM';
			return `Llegar ${displayHour}:${displayMinutes} ${ampm} máximo para registro`;
		}

		return 'Llegar 5:30 PM máximo para registro';
	});

	const retreatAddress = computed(() => {
		const house = retreat.value?.house;
		if (!house) return '';

		return [house.address1, house.address2, house.city, house.state, house.zipCode, house.country]
			.filter((part: string) => part && part.trim())
			.join(', ')
			.replace(/^,\s*/, '');
	});

	const thingsToBringParsed = computed(() => {
		const notes = retreat.value?.thingsToBringNotes;
		if (!notes) return { subtitle: '', items: [] as string[] };

		const items = notes
			.split(/[\n•*]/)
			.map((item: string) => item.trim())
			.map((item: string) => item.replace(/^[•*\-\d.]\s*/, ''))
			.filter((item: string) => item.length > 0)
			.map((item: string) =>
				item
					.replace(/\(para tu uso\)/gi, '')
					.replace(/etc\./gi, '')
					.trim(),
			)
			.filter((item: string) => item.length > 0);

		// A first item that ends with ":" or is all caps reads as a heading, not an item.
		if (items.length > 1 && (items[0].endsWith(':') || items[0] === items[0].toUpperCase())) {
			return { subtitle: items[0].replace(/:$/, ''), items: items.slice(1) };
		}

		return { subtitle: '', items };
	});

	const formatCost = computed(() => {
		const cost = retreat.value?.cost;
		if (!cost) return '$ 2,800';

		const numericCost = parseFloat(cost.toString().replace(/[^0-9.]/g, ''));
		if (isNaN(numericCost)) return cost.trim();

		return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(numericCost);
	});

	const paymentInfo = computed(() => {
		const paymentInfoRaw = retreat.value?.paymentInfo;
		if (!paymentInfoRaw) return '';

		const info = paymentInfoRaw.replace(/\n/g, '<br>')
			.replace(CONTROL_CHARS, '')
			.trim();
		return DOMPurify.sanitize(info);
	});

	const contactPhones = computed<FlyerContactPhone[]>(() => {
		const phones = retreat.value?.contactPhones;
		if (!phones) return [];

		try {
			const phoneStr = Array.isArray(phones) ? phones.join('\n') : phones.toString();

			return phoneStr
				.split(/[\n,]+/)
				.map((phone: string) => phone.trim())
				.filter((phone: string) => phone.length > 0)
				.map((phone: string) => {
					const match = phone.match(/(.+?)\s*(\d[\d\s-]*\d)/);
					if (match) {
						return { name: match[1].trim(), number: match[2].trim() };
					}
					const numberMatch = phone.match(/(\d[\d\s-]*\d)/);
					return numberMatch ? { name: 'Contacto', number: numberMatch[1] } : null;
				})
				.filter(Boolean) as FlyerContactPhone[];
		} catch {
			return [];
		}
	});

	const contactEmails = computed<string[]>(() => {
		const phones = retreat.value?.contactPhones;
		if (!phones) return [];

		const phoneStr = Array.isArray(phones) ? phones.join('\n') : phones.toString();
		return phoneStr.match(/[\w.-]+@[\w.-]+\.\w+/g) || [];
	});

	const registrationUrl = computed(() => getRegistrationLink() || 'https://emaus.cc/');

	const registrationDomain = computed(() => {
		try {
			const parsed = new URL(registrationUrl.value);
			const domain = parsed.hostname.replace('www.', '');
			const path = parsed.pathname;
			// Short slug URLs read better with the path (e.g. emaus.cc/interlomasiii)
			if (path && path !== '/' && path.length < 30) {
				return domain + path;
			}
			return domain;
		} catch {
			return 'emaus.cc';
		}
	});

	const googleMapsUrl = computed(() => {
		const raw = retreat.value?.house?.googleMapsUrl;
		if (!raw || !raw.trim()) return raw;

		const url = raw.trim();

		// Shorter URLs make a denser QR easier to scan.
		try {
			const parsed = new URL(url);

			const cid = parsed.searchParams.get('cid');
			if (cid) {
				return `https://maps.google.com/?cid=${cid}`;
			}

			if (parsed.pathname.includes('/place/')) {
				parsed.searchParams.delete('g_mp');
				parsed.searchParams.delete('source');
				parsed.searchParams.delete('hl');
				parsed.searchParams.delete('entry');
				return parsed.toString();
			}

			if (parsed.hostname.includes('goo.gl')) {
				return url;
			}
		} catch {
			// Not a URL; leave it untouched.
		}

		return url;
	});

	const legacyShowQrCodes = computed(() => options.value?.showQrCodes ?? true);

	return reactive({
		retreatTypeText,
		retreatTypeLogo,
		retreatParish: computed(() => retreat.value?.parish),
		retreatNumber: computed(() => retreat.value?.retreat_number_version || ''),
		formatDateRange,
		titleText: computed(() => {
			if (hiddenTexts.value.includes('hopeOverride')) return '';
			return options.value?.hopeOverride || options.value?.titleOverride || t('retreatFlyer.hope');
		}),
		subtitleText: computed(() => {
			if (hiddenTexts.value.includes('weekendOfHopeOverride')) return '';
			return (
				options.value?.weekendOfHopeOverride ||
				options.value?.subtitleOverride ||
				t('retreatFlyer.weekendOfHope')
			);
		}),
		quoteText: editableText('hopeQuoteOverride', 'hopeQuote'),
		catholicRetreatText: editableText('catholicRetreatOverride', 'catholicRetreat'),
		emausForText: editableText('emausForOverride', 'emausFor'),

		startDate: computed(() => retreat.value?.startDate),
		endDate: computed(() => retreat.value?.endDate),
		openingTimeDisplay,
		registrationDeadline,
		closingLocation: computed(() => retreat.value?.closingNotes),

		retreatLocation: computed(
			() => retreat.value?.house?.name || retreat.value?.parish || 'Casa de Retiro',
		),
		retreatAddress,
		googleMapsUrl,
		showQrCodesLocation: computed(() => options.value?.showQrCodesLocation ?? legacyShowQrCodes.value),

		formatCost,
		paymentInfo,
		paymentMethods: computed(() => retreat.value?.paymentMethods),

		contactPhones,
		contactEmails,
		totalContactItems: computed(() => contactPhones.value.length + contactEmails.value.length),

		thingsToBringItems: computed(() => thingsToBringParsed.value.items),
		thingsToBringSubtitle: computed(() => thingsToBringParsed.value.subtitle),

		registrationUrl,
		registrationDomain,

		encounterDescriptionHtml: computed(() => {
			if (hiddenTexts.value.includes('encounterDescriptionOverride')) return '';
			const text =
				options.value?.encounterDescriptionOverride || t('retreatFlyer.encounterDescription');
			return DOMPurify.sanitize(text.replace(/\n/g, '<br>'));
		}),
		dareToLiveItText: editableText('dareToLiveItOverride', 'dareToLiveIt'),
		arrivalTimeNoteText: editableText('arrivalTimeNoteOverride', 'arrivalTimeNote'),
		whatToBringText: editableText('whatToBringOverride', 'whatToBring'),
		registerText: editableText('registerOverride', 'register'),
		scanToRegisterText: editableText('scanToRegisterOverride', 'scanToRegister'),

		comeText: editableText('comeOverride', 'come'),
		limitedCapacityText: editableText('limitedCapacityOverride', 'limitedCapacity'),
		dontMissItText: editableText('dontMissItOverride', 'dontMissIt'),
		reservationNoteText: editableText('reservationNoteOverride', 'reservationNote'),

		formatDate,
	}) as FlyerContent;
}
