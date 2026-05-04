#!/usr/bin/env node
/**
 * Propaga los nuevos items del template a retiros existentes.
 *
 * - Detecta el `templateSetId` que cada retiro estaba usando (auto-detect por
 *   los items materializados que ya tiene). Si no hay items, usa el set
 *   predeterminado.
 * - Inserta SOLO los items del template que el retiro aún no tiene
 *   (idempotente: no duplica los existentes).
 *
 * Uso:
 *   vite-node src/cli/propagate-template-to-retreats.ts            # todos los retiros
 *   vite-node src/cli/propagate-template-to-retreats.ts <retreatId>
 *   vite-node src/cli/propagate-template-to-retreats.ts --set <templateSetId>
 *   vite-node src/cli/propagate-template-to-retreats.ts --dry-run
 */
import 'dotenv/config';
import { In } from 'typeorm';
import { AppDataSource } from '../data-source';
import { Retreat } from '../entities/retreat.entity';
import { RetreatScheduleItem } from '../entities/retreatScheduleItem.entity';
import { ScheduleTemplate } from '../entities/scheduleTemplate.entity';
import { ScheduleTemplateSet } from '../entities/scheduleTemplateSet.entity';
import { retreatScheduleService } from '../services/retreatScheduleService';

(async () => {
	const args = process.argv.slice(2);
	const dryRun = args.includes('--dry-run');
	const setIdx = args.indexOf('--set');
	const explicitSetId = setIdx >= 0 ? args[setIdx + 1] : undefined;
	const explicitRetreatId = args.find((a) => !a.startsWith('--') && a !== explicitSetId);

	await AppDataSource.initialize();

	const retreatRepo = AppDataSource.getRepository(Retreat);
	const itemRepo = AppDataSource.getRepository(RetreatScheduleItem);
	const tplRepo = AppDataSource.getRepository(ScheduleTemplate);
	const setRepo = AppDataSource.getRepository(ScheduleTemplateSet);

	const retreats = explicitRetreatId
		? await retreatRepo.find({ where: { id: explicitRetreatId } })
		: await retreatRepo.find();

	if (!retreats.length) {
		console.log('Sin retiros para procesar.');
		await AppDataSource.destroy();
		return;
	}

	const defaultSet = await setRepo.findOne({ where: { isDefault: true } });
	const fallbackSetId = explicitSetId ?? defaultSet?.id;

	const summary: Array<{
		retreat: string;
		setName: string;
		added: number;
		skipped: number;
		total: number;
	}> = [];

	console.log(`\n${dryRun ? '[DRY-RUN] ' : ''}Procesando ${retreats.length} retiro(s)…\n`);

	for (const r of retreats) {
		// Detectar templateSetId por los items ya materializados del retiro
		const itemTemplateIds = (await itemRepo.find({ where: { retreatId: r.id } }))
			.map((i) => i.scheduleTemplateId)
			.filter((x): x is string => !!x);

		let setId = explicitSetId;
		if (!setId && itemTemplateIds.length) {
			const tpls = await tplRepo.find({ where: { id: In(itemTemplateIds) } });
			const counts = new Map<string, number>();
			for (const t of tpls) {
				if (!t.templateSetId) continue;
				counts.set(t.templateSetId, (counts.get(t.templateSetId) ?? 0) + 1);
			}
			setId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? fallbackSetId;
		}
		if (!setId) setId = fallbackSetId;
		if (!setId) {
			console.log(`⚠️  ${r.parish}: no hay templateSet para usar (skip)`);
			continue;
		}

		const set = await setRepo.findOne({ where: { id: setId } });
		const setName = set?.name ?? setId;

		if (dryRun) {
			const total = await tplRepo.count({ where: { templateSetId: setId, isActive: true } });
			const existing = await itemRepo.count({ where: { retreatId: r.id } });
			console.log(
				`📋 ${r.parish.padEnd(40)} → ${setName.padEnd(20)} | template:${total} items, retreat:${existing} items`,
			);
			continue;
		}

		const baseDate = r.startDate ? new Date(r.startDate) : new Date();
		const result = await retreatScheduleService.addMissingTemplateItems(r.id, baseDate, setId);
		summary.push({ retreat: r.parish, setName, ...result });
		console.log(
			`✅ ${r.parish.padEnd(40)} → ${setName.padEnd(20)} | added=${result.added} skipped=${result.skipped} (total templates=${result.total})`,
		);
	}

	if (!dryRun && summary.length) {
		const totalAdded = summary.reduce((a, s) => a + s.added, 0);
		console.log(
			`\nTotal: ${totalAdded} items agregados a ${summary.length} retiros.`,
		);
	}

	await AppDataSource.destroy();
})().catch((err) => {
	console.error('❌ Error:', err);
	process.exit(1);
});
