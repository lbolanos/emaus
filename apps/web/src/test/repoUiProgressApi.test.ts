/**
 * Contrato del `Progress` de `@repo/ui`.
 *
 * Envuelve reka-ui, que sólo entiende `modelValue`. Un `:value` se descarta en
 * silencio: la barra se pinta entera en gris, sin relleno, y nadie ve un error.
 * Es la misma familia de bug que `:checked` en Checkbox/Switch (ver
 * `repoUiToggleApi.test.ts`), y el mock global de `@repo/ui` acepta cualquier
 * prop, así que ningún test montado lo detecta — hay que importar el componente
 * real por ruta.
 *
 * DEUDA CONOCIDA: `TelemetryDashboardView` y `RetreatDashboardView` ya usaban
 * `:value` antes de este test (16 sitios). Sus barras están vacías hoy. Están en
 * la allowlist de abajo para no romper la suite; arreglarlas es un cambio aparte
 * porque toca pantallas ajenas a esta feature. Lo que el guard SÍ impide es que
 * aparezcan nuevas.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, join } from 'path';
import Progress from '../../../../packages/ui/src/components/ui/progress/Progress.vue';

const indicatorTransform = (wrapper: ReturnType<typeof mount>): string =>
	wrapper.find('[data-reka-progress-indicator], [class*="bg-primary"]').attributes('style') ?? '';

describe('@repo/ui Progress', () => {
	it('mueve el indicador con model-value', () => {
		expect(indicatorTransform(mount(Progress, { props: { modelValue: 75 } }))).toContain(
			'translateX(-25%)',
		);
		expect(indicatorTransform(mount(Progress, { props: { modelValue: 100 } }))).toContain(
			'translateX(-0%)',
		);
	});

	it('ignora `value`: la barra se queda en cero', () => {
		// Este es el bug. Si algún día reka-ui acepta `value`, este test falla y
		// hay que revisar la allowlist de abajo.
		expect(indicatorTransform(mount(Progress, { props: { value: 75 } as never }))).toContain(
			'translateX(-100%)',
		);
	});
});

const collectVueFiles = (dir: string, found: string[] = []): string[] => {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) collectVueFiles(full, found);
		else if (entry.endsWith('.vue')) found.push(full);
	}
	return found;
};

/** Pantallas con `:value` heredado, pendientes de arreglar aparte. */
const KNOWN_OFFENDERS = ['views/TelemetryDashboardView.vue', 'views/RetreatDashboardView.vue'];

describe('ningún archivo nuevo bindea :value en Progress', () => {
	const files = collectVueFiles(resolve(__dirname, '..'));

	it('encuentra archivos .vue que revisar', () => {
		expect(files.length).toBeGreaterThan(50);
	});

	it('sólo la deuda conocida usa :value', () => {
		const offenders: string[] = [];
		for (const file of files) {
			const relative = file.split('/apps/web/src/')[1] ?? file;
			if (KNOWN_OFFENDERS.includes(relative)) continue;
			const tags = readFileSync(file, 'utf-8').match(/<Progress\b[^>]*>/gs) ?? [];
			for (const tag of tags) {
				if (/(^|\s):value=/.test(tag)) {
					offenders.push(`${relative} → ${tag.replace(/\s+/g, ' ').slice(0, 80)}`);
				}
			}
		}
		expect(offenders).toEqual([]);
	});
});
