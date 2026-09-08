import type { MeetingType } from '@repo/types';

/**
 * Catálogo de tipos de reunión, en el orden en que se ofrecen en los selectores.
 *
 * El orden no es alfabético a propósito: 'general' primero porque es el default
 * y el caso mayoritario, y 'preparation' segundo porque es el que se consulta
 * para armar las mesas. Las etiquetas viven en i18n (`community.meetingTypes.*`).
 */
export const MEETING_TYPES: MeetingType[] = [
	'general',
	'preparation',
	'formation',
	'service',
	'fellowship',
	'other',
];
