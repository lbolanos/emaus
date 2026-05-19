import cron from 'node-cron';
import { AppDataSource } from '../data-source';
import { CommunityMeeting } from '../entities/communityMeeting.entity';
import { CommunityService } from './communityService';
import { calculateNextOccurrence } from '../utils/recurrenceUtils';
import { IsNull, Not } from 'typeorm';

/**
 * Genera automáticamente instancias futuras de reuniones recurrentes en
 * background, evitando que el coordinador tenga que clickear "crear siguiente"
 * cada vez. Estrategia:
 *
 *   1. Cada día a las 06:00 (cron diario) recorre todos los templates activos
 *      (con `recurrenceFrequency` definido).
 *   2. Para cada template, va calculando la próxima ocurrencia a partir de la
 *      última instancia conocida; si esa próxima cae dentro de la ventana
 *      `now + LOOKAHEAD_DAYS`, la materializa.
 *   3. Repite hasta superar la ventana o el `recurrenceEndDate` del template.
 *   4. Cada instancia creada dispara `notifyMembersOfMeeting` (fire-and-forget)
 *      para que los miembros se enteren del próximo encuentro.
 *
 * Idempotente: usa `findOne({ startDate })` para no duplicar instancias en la
 * misma fecha. Si el servicio se cae y reinicia, simplemente continúa.
 */
export class MeetingInstanceGeneratorService {
	private static instance: MeetingInstanceGeneratorService;
	private isRunning = false;
	// Lazy para evitar capturar referencias a AppDataSource antes de
	// setupTestDatabase() en el harness de Jest.
	private _communityService: CommunityService | null = null;
	private get communityService(): CommunityService {
		if (!this._communityService) {
			this._communityService = new CommunityService();
		}
		return this._communityService;
	}

	/** Días hacia adelante para los que materializamos instancias proactivamente. */
	public readonly LOOKAHEAD_DAYS = 14;

	/** Safety net por template para evitar runaway loops. */
	private readonly MAX_INSTANCES_PER_RUN = 52;

	public static getInstance(): MeetingInstanceGeneratorService {
		if (!MeetingInstanceGeneratorService.instance) {
			MeetingInstanceGeneratorService.instance = new MeetingInstanceGeneratorService();
		}
		return MeetingInstanceGeneratorService.instance;
	}

	public startScheduledTasks(): void {
		if (this.isRunning) {
			console.log('Meeting instance generator already running');
			return;
		}

		// Diario a las 06:00 — temprano para que las instancias del día existan
		// antes de cualquier consulta de UI.
		cron.schedule('0 6 * * *', async () => {
			console.log('⏰ Running meeting instance generator...');
			try {
				const result = await this.performGeneration();
				console.log(
					`⏰ Meeting instance generator: generated=${result.generated}, skipped=${result.skipped}, errors=${result.errors}`,
				);
			} catch (err) {
				console.error('❌ Error in meeting instance generator:', err);
			}
		});

		this.isRunning = true;
		console.log('✅ Meeting instance generator scheduled tasks started');
	}

	/**
	 * Recorre todos los templates activos y genera instancias hasta cubrir la
	 * ventana de lookahead. Retorna métricas para tests/logging.
	 */
	public async performGeneration(now: Date = new Date()): Promise<{
		generated: number;
		skipped: number;
		errors: number;
	}> {
		const meetingRepo = AppDataSource.getRepository(CommunityMeeting);
		const windowEnd = new Date(now.getTime() + this.LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);

		// Templates raíz activos: tienen recurrenceFrequency y no son hijos de otro
		// template. Excluye cancelados.
		const rootTemplates = await meetingRepo.find({
			where: {
				recurrenceFrequency: Not(IsNull()),
				parentMeetingId: IsNull(),
				exceptionType: IsNull(),
			},
		});

		let generated = 0;
		let skipped = 0;
		let errors = 0;

		for (const template of rootTemplates) {
			try {
				const created = await this.generateForTemplate(template, now, windowEnd);
				generated += created;
			} catch (err) {
				errors++;
				console.error(
					`[meetingInstanceGenerator] template ${template.id} failed:`,
					err,
				);
			}
			if (generated === 0) skipped++;
		}

		return { generated, skipped, errors };
	}

	/**
	 * Para un template específico, materializa instancias hasta cubrir
	 * [now, windowEnd]. La cadena empieza desde la última instancia conocida (o
	 * el template mismo si no hay ninguna).
	 */
	private async generateForTemplate(
		template: CommunityMeeting,
		now: Date,
		windowEnd: Date,
	): Promise<number> {
		const meetingRepo = AppDataSource.getRepository(CommunityMeeting);

		// Si la fecha tope ya pasó, no generamos más.
		const endDate = template.recurrenceEndDate ? new Date(template.recurrenceEndDate) : null;
		if (endDate && endDate < now) return 0;

		// Última instancia conocida (incluye al template si no hay otras).
		const latestInstance = await meetingRepo
			.createQueryBuilder('m')
			.where('(m.id = :rootId OR m.parentMeetingId = :rootId)', { rootId: template.id })
			.orderBy('m.startDate', 'DESC')
			.getOne();

		const seed = latestInstance ?? template;
		let seedId = seed.id;
		let cursor: Date = seed.startDate;
		let generated = 0;

		while (generated < this.MAX_INSTANCES_PER_RUN) {
			const nextDate = calculateNextOccurrence(
				cursor,
				template.recurrenceFrequency ?? null,
				template.recurrenceInterval ?? null,
				template.recurrenceDayOfWeek ?? null,
				template.recurrenceDayOfMonth ?? null,
			);
			if (!nextDate) break;

			// Salirse cuando excede la ventana o la fecha tope.
			if (nextDate > windowEnd) break;
			if (endDate && nextDate > endDate) break;

			// Crear la instancia delegando en el service (centraliza la copia de
			// campos y la notificación). Si la fecha está en el pasado (e.g. estamos
			// llenando un backlog), no notificar.
			const isPast = nextDate <= now;
			try {
				const { meeting: created } = await this.communityService.createNextMeetingInstance(
					seedId,
					{ notify: !isPast },
				);
				generated++;
				cursor = created.startDate;
				seedId = created.id;
			} catch (err: any) {
				// Si createNextMeetingInstance no avanza (e.g. choca con el límite o ya
				// existe), cortar para no entrar en bucle infinito.
				if (
					err?.message?.includes('Recurrence end date reached') ||
					err?.message?.includes('Maximum number of instances') ||
					err?.message?.includes('already exists')
				) {
					break;
				}
				throw err;
			}
		}

		return generated;
	}
}

// Lazy proxy para evitar inicializar el singleton (y por extensión CommunityService)
// al momento de importar el módulo. Los tests requieren que AppDataSource esté
// inicializado vía setupTestDatabase() antes de instanciar repositorios.
export const meetingInstanceGeneratorService = {
	startScheduledTasks: () => MeetingInstanceGeneratorService.getInstance().startScheduledTasks(),
	performGeneration: (now?: Date) =>
		MeetingInstanceGeneratorService.getInstance().performGeneration(now),
};
