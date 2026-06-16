import { describe, it, expect } from 'vitest';
import { getMessageTemplateAudience } from '@repo/types';

describe('getMessageTemplateAudience', () => {
	it('clasifica plantillas de caminante', () => {
		for (const t of [
			'WALKER_WELCOME',
			'WALKER_FOLLOWUP_WEEK_1',
			'WALKER_FOLLOWUP_YEAR_1',
			'WALKER_REUNION_INVITATION',
			'WALKER_CONFIRMATION',
			'POST_RETREAT_MESSAGE',
		]) {
			expect(getMessageTemplateAudience(t)).toBe('walker');
		}
	});

	it('clasifica como participante (caminante y servidor) las que aplican a ambos', () => {
		for (const t of [
			'PRE_RETREAT_REMINDER',
			'PAYMENT_REMINDER',
			'CANCELLATION_CONFIRMATION',
			'BIRTHDAY_MESSAGE',
			'EMERGENCY_CONTACT_VALIDATION',
		]) {
			expect(getMessageTemplateAudience(t)).toBe('participant');
		}
	});

	it('clasifica plantillas de servidor', () => {
		expect(getMessageTemplateAudience('SERVER_WELCOME')).toBe('server');
	});

	it('clasifica briefing de mesa como líder/colíder', () => {
		expect(getMessageTemplateAudience('TABLE_LEADER_BRIEFING')).toBe('table_leader');
	});

	it('clasifica aviso de palanquero como responsable', () => {
		expect(getMessageTemplateAudience('PALANQUERO_NEW_WALKER')).toBe('responsible');
	});

	it('clasifica plantillas de familiar (palanquero / familia)', () => {
		for (const t of [
			'PALANCA_REQUEST',
			'PALANCA_REMINDER',
			'FAMILY_CLOSING_INVITATION_WHATSAPP',
			'FAMILY_CLOSING_INVITATION_EMAIL',
		]) {
			expect(getMessageTemplateAudience(t)).toBe('family');
		}
	});

	it('clasifica el resto como general (default)', () => {
		for (const t of [
			'GENERAL',
			'PRIVACY_DATA_DELETE',
			'COMMUNITY_MEETING_INVITATION',
			'SYS_PASSWORD_RESET',
			'UNKNOWN_TYPE_XYZ',
		]) {
			expect(getMessageTemplateAudience(t)).toBe('general');
		}
	});
});
