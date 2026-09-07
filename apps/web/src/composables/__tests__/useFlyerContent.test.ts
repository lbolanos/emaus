import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { useFlyerContent, type FlyerContent } from '../useFlyerContent';

/**
 * The composable needs an active component instance (useI18n), so it is exercised
 * through a throwaway one. `t` is mocked globally and returns the key, which is why
 * the assertions below compare against 'retreatFlyer.*'.
 */
function contentFor(
	retreat: Record<string, any> | null,
	options: Record<string, any> | null = null,
	registrationLink?: string,
): FlyerContent {
	let content!: FlyerContent;
	mount(
		defineComponent({
			setup() {
				content = useFlyerContent(
					() => retreat,
					() => options,
					() => registrationLink,
				);
				return () => null;
			},
		}),
	);
	return content;
}

const items = (thingsToBringNotes: string) => contentFor({ thingsToBringNotes }).thingsToBringItems;

describe('useFlyerContent', () => {
	describe('what to bring', () => {
		// The bug that started the whole editor: a comma-separated list came out as one
		// long line, truncated to "Termo, Chamarra/Sudadera, Ropa co…"
		it('splits a single comma-separated line into items', () => {
			expect(items('Termo, Chamarra, Ropa cómoda')).toEqual(['Termo', 'Chamarra', 'Ropa cómoda']);
		});

		// …but only when there is nothing else to go on: a retreat that writes one item
		// per line has entries like "Chamarra, sudadera", and splitting those invents items
		it('leaves commas alone once the list has real structure', () => {
			expect(items('Termo\nChamarra, sudadera\nToalla')).toEqual([
				'Termo',
				'Chamarra, sudadera',
				'Toalla',
			]);
			expect(items('• Termo • Chamarra, sudadera')).toEqual(['Termo', 'Chamarra, sudadera']);
		});

		it('strips bullets, numbering and blank entries', () => {
			expect(items('1. Termo\n- Toalla\n\n* Sandalias')).toEqual(['Termo', 'Toalla', 'Sandalias']);
		});

		it('drops the filler that reads badly in a bullet list', () => {
			expect(items('Termo (para tu uso)\nJabón y pasta, etc.')).toEqual(['Termo', 'Jabón y pasta,']);
		});

		it('keeps numbers that belong to the item', () => {
			expect(items('2 pares de calcetines\n1. Termo')).toEqual(['2 pares de calcetines', 'Termo']);
		});

		// A trailing full stop on the last item looks like a typo next to the others
		it('drops the final full stop', () => {
			expect(items('Termo\nToalla.')).toEqual(['Termo', 'Toalla']);
		});

		it('reads a leading heading as the subtitle, not as an item', () => {
			const withColon = contentFor({ thingsToBringNotes: 'Indispensable:\nTermo\nToalla' });
			expect(withColon.thingsToBringSubtitle).toBe('Indispensable');
			expect(withColon.thingsToBringItems).toEqual(['Termo', 'Toalla']);

			const shouting = contentFor({ thingsToBringNotes: 'NO OLVIDES\nTermo\nToalla' });
			expect(shouting.thingsToBringSubtitle).toBe('NO OLVIDES');
		});

		it('keeps a lone item as an item, heading-shaped or not', () => {
			const single = contentFor({ thingsToBringNotes: 'TERMO' });
			expect(single.thingsToBringSubtitle).toBe('');
			expect(single.thingsToBringItems).toEqual(['TERMO']);
		});

		it('has nothing to show when the retreat says nothing', () => {
			expect(contentFor({}).thingsToBringItems).toEqual([]);
		});
	});

	describe('editable texts', () => {
		it('falls back to the default wording', () => {
			expect(contentFor({}).dareToLiveItText).toBe('retreatFlyer.dareToLiveIt');
		});

		it('uses the override when there is one', () => {
			expect(contentFor({}, { dareToLiveItOverride: 'Ven y verás' }).dareToLiveItText).toBe(
				'Ven y verás',
			);
		});

		// Hiding is not the same as clearing: an empty override means "use the default
		// wording", hidden means the line does not belong on this flyer at all.
		it('returns nothing at all for a hidden text, override or not', () => {
			expect(
				contentFor({}, { hiddenTexts: ['dareToLiveItOverride'] }).dareToLiveItText,
			).toBe('');
			expect(
				contentFor({}, { dareToLiveItOverride: 'Ven', hiddenTexts: ['dareToLiveItOverride'] })
					.dareToLiveItText,
			).toBe('');
		});

		it('hides the title and subtitle too, which resolve through legacy keys', () => {
			expect(contentFor({}, { hiddenTexts: ['hopeOverride'] }).titleText).toBe('');
			expect(contentFor({}, { hiddenTexts: ['weekendOfHopeOverride'] }).subtitleText).toBe('');
			// The older key still wins over the default when nothing is hidden
			expect(contentFor({}, { titleOverride: 'Fe' }).titleText).toBe('Fe');
		});

		it('hides the description, which is the one that goes through HTML', () => {
			expect(
				contentFor({}, { hiddenTexts: ['encounterDescriptionOverride'] }).encounterDescriptionHtml,
			).toBe('');
		});
	});

	describe('contact details', () => {
		it('splits names from numbers, across lines and commas', () => {
			const content = contentFor({ contactPhones: 'Marco 55-6525-0861\nEnrique 56-4464-2016' });

			expect(content.contactPhones).toEqual([
				{ name: 'Marco', number: '55-6525-0861' },
				{ name: 'Enrique', number: '56-4464-2016' },
			]);
		});

		it('names a bare number rather than showing it label-less', () => {
			expect(contentFor({ contactPhones: '55-6525-0861' }).contactPhones).toEqual([
				{ name: 'Contacto', number: '55-6525-0861' },
			]);
		});

		it('takes an array as well as a string', () => {
			expect(contentFor({ contactPhones: ['Ana 55 1234 5678'] }).contactPhones).toEqual([
				{ name: 'Ana', number: '55 1234 5678' },
			]);
		});

		it('pulls the emails out of the same field and counts both', () => {
			const content = contentFor({ contactPhones: 'Marco 55-6525-0861\ninfo@emaus.cc' });

			expect(content.contactEmails).toEqual(['info@emaus.cc']);
			expect(content.totalContactItems).toBe(2);
		});

		it('has nothing to show when the retreat has no contacts', () => {
			const content = contentFor({});
			expect(content.contactPhones).toEqual([]);
			expect(content.totalContactItems).toBe(0);
		});
	});

	describe('cost', () => {
		it('formats a number as Mexican pesos', () => {
			expect(contentFor({ cost: '3100' }).formatCost).toMatch(/3,100/);
		});

		it('keeps wording that is not a number', () => {
			expect(contentFor({ cost: 'Donativo' }).formatCost).toBe('Donativo');
		});

		it('falls back rather than printing an empty price', () => {
			expect(contentFor({}).formatCost).toBe('$ 2,800');
		});
	});

	describe('times', () => {
		it('derives the opening time from the walkers arrival time', () => {
			expect(contentFor({ walkerArrivalTime: '17:00' }).openingTimeDisplay).toBe(
				'5:00 PM EN PUNTO',
			);
			expect(contentFor({ walkerArrivalTime: '09:30' }).openingTimeDisplay).toBe(
				'9:30 AM EN PUNTO',
			);
		});

		it('gives the registration deadline half an hour later', () => {
			expect(contentFor({ walkerArrivalTime: '17:00' }).registrationDeadline).toBe(
				'Llegar 5:30 PM máximo para registro',
			);
		});

		it('lets the retreat write its own deadline note instead', () => {
			expect(
				contentFor({ walkerArrivalTime: '17:00', openingNotes: 'Hemos hecho oración por ustedes.' })
					.registrationDeadline,
			).toBe('Hemos hecho oración por ustedes.');
		});
	});

	describe('dates', () => {
		// A date-only string parsed as UTC lands on the previous day west of Greenwich,
		// which is how a retreat that starts on Friday ends up printed as Thursday.
		it('keeps the calendar day whatever the timezone', () => {
			expect(contentFor({}).formatDate('2026-10-16')).toContain('16');
			expect(contentFor({}).formatDate('2026-10-16T00:00:00.000Z')).toContain('16');
		});

		it('writes the range as one month with two days', () => {
			expect(
				contentFor({ startDate: '2026-10-16', endDate: '2026-10-18' }).formatDateRange,
			).toBe('16 al 18 de octubre');
		});

		it('says nothing when a date is missing', () => {
			expect(contentFor({ startDate: '2026-10-16' }).formatDateRange).toBe('');
			expect(contentFor({}).formatDate(undefined)).toBe('');
		});
	});

	describe('payment info', () => {
		it('turns line breaks into markup so the flyer shows them', () => {
			expect(contentFor({ paymentInfo: 'Banco X\nCuenta 123' }).paymentInfo).toBe(
				'Banco X<br>Cuenta 123',
			);
		});

		// Bank details get pasted in from PDFs and email, which drags control characters along
		it('strips the control characters that come with pasted bank details', () => {
			expect(contentFor({ paymentInfo: 'Banco X' }).paymentInfo).toBe('Banco X');
		});

		// happy-dom makes DOMPurify blank the whole string rather than strip the tag, so
		// this asserts what matters — the script does not survive — and not the rest.
		it('sanitises it: this text is rendered as HTML', () => {
			const content = contentFor({ paymentInfo: 'Pago <script>alert(1)</script> aquí' });
			expect(content.paymentInfo).not.toContain('script');
			expect(contentFor({ paymentInfo: 'Pago <b>en efectivo</b>' }).paymentInfo).toBe(
				'Pago <b>en efectivo</b>',
			);
		});
	});

	describe('links', () => {
		it('shortens a Google Maps place URL to what the QR needs', () => {
			const url = contentFor({
				house: { googleMapsUrl: 'https://www.google.com/maps/place/Casa?g_mp=x&hl=es&entry=ttu' },
			}).googleMapsUrl;

			expect(url).toContain('/place/Casa');
			expect(url).not.toContain('g_mp');
			expect(url).not.toContain('entry');
		});

		it('prefers the cid form, which is the shortest of all', () => {
			expect(
				contentFor({ house: { googleMapsUrl: 'https://www.google.com/maps?cid=12345&hl=es' } })
					.googleMapsUrl,
			).toBe('https://maps.google.com/?cid=12345');
		});

		it('leaves short links and anything that is not a URL alone', () => {
			expect(
				contentFor({ house: { googleMapsUrl: 'https://goo.gl/maps/abc' } }).googleMapsUrl,
			).toBe('https://goo.gl/maps/abc');
			expect(contentFor({ house: { googleMapsUrl: 'Frente a la parroquia' } }).googleMapsUrl).toBe(
				'Frente a la parroquia',
			);
		});

		it('shows the registration domain with its slug, and falls back cleanly', () => {
			expect(contentFor({}, null, 'https://emaus.cc/interlomasiii').registrationDomain).toBe(
				'emaus.cc/interlomasiii',
			);
			expect(contentFor({}, null, 'not a url').registrationDomain).toBe('emaus.cc');
		});
	});

	describe('retreat type', () => {
		it('follows the retreat type when it has one', () => {
			const content = contentFor({ retreat_type: 'women' });
			expect(content.retreatTypeText).toBe('retreatModal.types.women');
			expect(content.retreatTypeLogo).toBe('/woman_logo.png');
		});

		// Retreats created before the field existed only say so in their own words
		it('falls back to reading the parish and house names', () => {
			expect(contentFor({ parish: 'Emaús de Mujeres' }).retreatTypeText).toBe(
				'retreatModal.types.women',
			);
			expect(contentFor({ house: { name: 'Casa de Matrimonios' } }).retreatTypeText).toBe(
				'retreatModal.types.couples',
			);
			expect(contentFor({}).retreatTypeText).toBe('retreatModal.types.men');
		});
	});

	describe('address and venue', () => {
		it('joins the parts the house actually has', () => {
			expect(
				contentFor({ house: { address1: 'Jalapa 73', city: 'CDMX', country: 'México' } })
					.retreatAddress,
			).toBe('Jalapa 73, CDMX, México');
		});

		it('names the venue from the house, the parish, or neither', () => {
			expect(contentFor({ house: { name: 'Casa Emaús' } }).retreatLocation).toBe('Casa Emaús');
			expect(contentFor({ parish: 'El Buen Despacho' }).retreatLocation).toBe('El Buen Despacho');
			expect(contentFor({}).retreatLocation).toBe('Casa de Retiro');
		});
	});

	// v1 flyers only had the two blanket toggles; they still have to mean something
	describe('legacy QR toggles', () => {
		it('follows the blanket toggle, and the specific one when set', () => {
			expect(contentFor({}, {}).showQrCodesLocation).toBe(true);
			expect(contentFor({}, { showQrCodes: false }).showQrCodesLocation).toBe(false);
			expect(
				contentFor({}, { showQrCodes: false, showQrCodesLocation: true }).showQrCodesLocation,
			).toBe(true);
		});
	});
});
