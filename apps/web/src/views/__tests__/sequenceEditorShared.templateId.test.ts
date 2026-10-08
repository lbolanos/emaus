import { describe, it, expect } from 'vitest';
import {
	templatesForStepAudience,
	orderTemplatesByEnginePreference,
	StepDraft,
} from '../sequenceEditorShared';

/**
 * M3: la plantilla de un paso se selecciona por `templateId` (permite varias
 * del mismo tipo — el incidente "Ultimo Prendas"). El dropdown del editor
 * filtra por la audiencia del DESTINATARIO, pero la selección actual se
 * conserva por id (y por tipo, para pasos legacy y el editor global): si la
 * plantilla fijada desapareciera de la lista, el usuario guardaría sin verlo
 * un cambio de plantilla.
 */

// getMessageTemplateAudience es el real (@repo/types, sin mock):
// WALKER_WELCOME→walker, SERVER_SHIRT_CONFIRMATION→server,
// PALANCA_REQUEST→family, GENERAL→general.
const walkerTpl = { id: 'tpl-welcome', name: 'Bienvenida', type: 'WALKER_WELCOME' };
const serverTpl = { id: 'tpl-shirt', name: 'Prendas', type: 'SERVER_SHIRT_CONFIRMATION' };
const familyTpl = { id: 'tpl-palanca', name: 'Palanca', type: 'PALANCA_REQUEST' };
const generalTpl = { id: 'tpl-general', name: 'General', type: 'GENERAL' };
const usableTemplates = [walkerTpl, serverTpl, familyTpl, generalTpl];

describe('templatesForStepAudience — M3 selección por templateId', () => {
	it('conserva la plantilla fijada por id aunque su audiencia no corresponda a la del destinatario', () => {
		const shown = templatesForStepAudience(
			usableTemplates,
			{ recipientTarget: 'participant', templateType: 'WALKER_WELCOME', templateId: serverTpl.id },
			'walker',
		);

		// La walker (audiencia) + la server (fijada por id) + la general
		// (aplica a todo); la family es la única que queda fuera.
		expect(shown.map((t: any) => t.id)).toEqual(['tpl-welcome', 'tpl-shirt', 'tpl-general']);
	});

	it('fallback legacy por tipo: sin templateId conserva la del templateType del paso', () => {
		const shown = templatesForStepAudience(
			usableTemplates,
			{ recipientTarget: 'participant', templateType: 'SERVER_SHIRT_CONFIRMATION', templateId: null },
			'walker',
		);

		// Misma semántica que con id: la lista completa de la audiencia (walker
		// + general) MÁS la fijada por tipo (server, aunque su audiencia no
		// corresponda) — sin el fallback el usuario perdería la selección
		// legacy al abrir el editor. La family queda fuera.
		expect(shown.map((t: any) => t.id)).toEqual(['tpl-welcome', 'tpl-shirt', 'tpl-general']);
	});

	it('plantillas sin relación con el paso quedan fuera de la lista', () => {
		const shown = templatesForStepAudience(
			usableTemplates,
			{ recipientTarget: 'participant', templateType: 'WALKER_WELCOME', templateId: null },
			'walker',
		);

		expect(shown.map((t: any) => t.id)).toEqual(['tpl-welcome', 'tpl-general']);
	});

	it('destinatario inviter deriva a family: las plantillas de walker quedan fuera', () => {
		const shown = templatesForStepAudience(
			usableTemplates,
			{ recipientTarget: 'inviter', templateType: 'PALANCA_REQUEST', templateId: null },
			'walker', // audiencia de enrolamiento: irrelevante, el destinatario manda
		);

		expect(shown.map((t: any) => t.id)).toEqual(['tpl-palanca', 'tpl-general']);
	});

	it('audiencia all (participant) no filtra: devuelve el listado completo', () => {
		const shown = templatesForStepAudience(
			usableTemplates,
			{ recipientTarget: 'participant', templateType: 'GENERAL', templateId: null },
			'all',
		);

		// aud null → sin filtro (misma referencia, sin copia).
		expect(shown).toBe(usableTemplates);
	});

	it('community_roster se convoca a servir: solo plantillas de server y general', () => {
		const shown = templatesForStepAudience(
			usableTemplates,
			{ recipientTarget: 'participant', templateType: 'SERVER_CONVOCATION', templateId: null },
			'community_roster',
		);

		expect(shown.map((t: any) => t.id)).toEqual(['tpl-shirt', 'tpl-general']);
	});
});

describe('orderTemplatesByEnginePreference — mismo orden que el motor', () => {
	it('la predeterminada del tipo gana sobre la más antigua (incidente "Recoda Pago Servidor")', () => {
		// Orden de inserción: la plantilla vieja (julio) llega primero; la
		// predeterminada se creó después (octubre). El editor debe ofrecer la
		// predeterminada primero — igual que el fallback del motor.
		const oldPayment = { id: 'tpl-old', isDefault: false, createdAt: '2026-07-16T00:45:44Z' };
		const defaultPayment = { id: 'tpl-default', isDefault: true, createdAt: '2026-10-07T16:55:58Z' };

		const ordered = orderTemplatesByEnginePreference([oldPayment, defaultPayment]);

		expect(ordered.map((t) => t.id)).toEqual(['tpl-default', 'tpl-old']);
	});

	it('entre predeterminadas/iguales desempata createdAt ASC', () => {
		const a = { id: 'a', isDefault: false, createdAt: '2026-05-01T00:00:00Z' };
		const b = { id: 'b', isDefault: false, createdAt: '2026-04-01T00:00:00Z' };

		expect(orderTemplatesByEnginePreference([a, b]).map((t) => t.id)).toEqual(['b', 'a']);
	});

	it('no muta la lista original y tolera isDefault/createdAt ausentes', () => {
		const original = [{ id: 'x' }, { id: 'y' }];
		const ordered = orderTemplatesByEnginePreference(original);

		expect(ordered).not.toBe(original);
		expect(original.map((t) => t.id)).toEqual(['x', 'y']);
		expect(ordered.map((t) => t.id)).toEqual(['x', 'y']);
	});
});

describe('StepDraft — templateId opcional', () => {
	const base: Omit<StepDraft, 'templateId'> = {
		offsetDays: 3,
		sendHour: 9,
		templateType: 'WALKER_WELCOME',
		channel: 'whatsapp',
		recipientTarget: 'participant',
		recipientResponsibility: '',
		condition: {},
	};

	it('acepta un id concreto, null (resolución por tipo) y ausencia (pasos legacy)', () => {
		const withId: StepDraft = { ...base, templateId: 'tpl-shirt' };
		const withoutId: StepDraft = { ...base, templateId: null };
		const legacy: StepDraft = { ...base }; // pasos anteriores a M3: sin el campo

		expect(withId.templateId).toBe('tpl-shirt');
		expect(withoutId.templateId).toBeNull();
		expect('templateId' in legacy).toBe(false);
	});
});
