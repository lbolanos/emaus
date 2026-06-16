import { describe, it, expect } from 'vitest';
import { messageTemplateTypes, getMessageTemplateAudience } from '@repo/types';
import es from '@/locales/es.json';
import en from '@/locales/en.json';

// Guard: cada tipo de plantilla debe tener etiqueta i18n (es/en) y mapear a una
// audiencia conocida. Atrapa el caso (visto en e2e) donde un tipo nuevo se agrega
// sin su `messageTemplates.types.*` y aparece como key cruda en el admin.
const types = messageTemplateTypes.options as readonly string[];
const validAudiences = ['walker', 'server', 'participant', 'family', 'general', 'table_leader', 'responsible'];

describe('i18n y audiencia de tipos de plantilla', () => {
	it('cada tipo tiene etiqueta en español', () => {
		const typesEs = (es as any).messageTemplates?.types ?? {};
		const missing = types.filter((t) => !typesEs[t]);
		expect(missing).toEqual([]);
	});

	it('cada tipo tiene etiqueta en inglés', () => {
		const typesEn = (en as any).messageTemplates?.types ?? {};
		const missing = types.filter((t) => !typesEn[t]);
		expect(missing).toEqual([]);
	});

	it('cada tipo mapea a una audiencia válida', () => {
		for (const t of types) {
			expect(validAudiences).toContain(getMessageTemplateAudience(t));
		}
	});

	it('cada audiencia tiene etiqueta i18n en es/en', () => {
		for (const a of validAudiences) {
			expect((es as any).messageTemplates?.audience?.[a]).toBeTruthy();
			expect((en as any).messageTemplates?.audience?.[a]).toBeTruthy();
		}
	});
});
