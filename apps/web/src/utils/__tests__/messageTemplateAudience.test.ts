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
			'PALANCA_REQUEST',
			'PALANCA_REMINDER',
			'PRE_RETREAT_REMINDER',
			'PAYMENT_REMINDER',
			'POST_RETREAT_MESSAGE',
			'CANCELLATION_CONFIRMATION',
			'BIRTHDAY_MESSAGE',
		]) {
			expect(getMessageTemplateAudience(t)).toBe('walker');
		}
	});

	it('clasifica plantillas de servidor', () => {
		for (const t of ['SERVER_WELCOME', 'TABLE_LEADER_BRIEFING', 'PALANQUERO_NEW_WALKER']) {
			expect(getMessageTemplateAudience(t)).toBe('server');
		}
	});

	it('clasifica plantillas de familiar (contacto de emergencia)', () => {
		for (const t of [
			'EMERGENCY_CONTACT_VALIDATION',
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
