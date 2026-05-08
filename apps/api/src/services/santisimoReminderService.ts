import cron from 'node-cron';
import { AppDataSource } from '../data-source';
import { SantisimoSignup } from '../entities/santisimoSignup.entity';
import { SantisimoSlot } from '../entities/santisimoSlot.entity';
import { Participant } from '../entities/participant.entity';
import { Retreat } from '../entities/retreat.entity';
import { EmailService } from './emailService';

/**
 * Envía recordatorios de email 24 horas antes de cada Guardia de la Capilla
 * a los angelitos del sistema (participantId IS NOT NULL con email registrado).
 *
 * El deduplicado se hace en memoria con un Map<signupId, Date> para evitar
 * dobles envíos sin necesitar una columna adicional en BD.
 * Las entradas del Map se limpian cuando superan las 48 h de antigüedad.
 */
export class SantisimoReminderService {
	private static instance: SantisimoReminderService;
	private isRunning = false;
	private emailService = new EmailService();

	/** signupId → fecha en que se envió el recordatorio */
	private reminderSentAt = new Map<string, Date>();

	public static getInstance(): SantisimoReminderService {
		if (!SantisimoReminderService.instance) {
			SantisimoReminderService.instance = new SantisimoReminderService();
		}
		return SantisimoReminderService.instance;
	}

	public startScheduledTasks(): void {
		if (this.isRunning) {
			console.log('Santísimo reminder service already running');
			return;
		}

		// Corre cada hora en punto
		cron.schedule('0 * * * *', async () => {
			console.log('⏰ Running Santísimo reminder check...');
			try {
				const result = await this.performReminders();
				console.log(`⏰ Santísimo reminders sent: ${result.sent}`);
			} catch (err) {
				console.error('❌ Error in Santísimo reminder service:', err);
			}
		});

		this.isRunning = true;
		console.log('✅ Santísimo reminder service scheduled tasks started');
	}

	/**
	 * Busca slots cuyo startTime esté entre now+23h y now+25h, y envía un
	 * recordatorio por email a los angelitos del sistema que aún no lo hayan
	 * recibido.
	 *
	 * @returns número de emails enviados (útil para tests)
	 */
	public async performReminders(): Promise<{ sent: number }> {
		this.cleanOldEntries();

		const now = new Date();
		const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000); // now + 23 h
		const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000);   // now + 25 h

		// Buscar slots en la ventana
		const slots = await AppDataSource.getRepository(SantisimoSlot)
			.createQueryBuilder('slot')
			.where('slot.startTime >= :windowStart AND slot.startTime <= :windowEnd', {
				windowStart: windowStart.toISOString(),
				windowEnd: windowEnd.toISOString(),
			})
			.leftJoinAndSelect('slot.retreat', 'retreat')
			.getMany();

		if (!slots.length) return { sent: 0 };

		const slotIds = slots.map((s) => s.id);
		const slotMap = new Map(slots.map((s) => [s.id, s]));

		// Buscar signups de angelitos del sistema (participantId NOT NULL)
		const signups = await AppDataSource.getRepository(SantisimoSignup)
			.createQueryBuilder('signup')
			.where('signup.slotId IN (:...slotIds)', { slotIds })
			.andWhere('signup.participantId IS NOT NULL')
			.getMany();

		if (!signups.length) return { sent: 0 };

		// Cargar participantes con email
		const participantIds = [...new Set(signups.map((s) => s.participantId as string))];
		const participants = await AppDataSource.getRepository(Participant)
			.createQueryBuilder('p')
			.where('p.id IN (:...participantIds)', { participantIds })
			.select(['p.id', 'p.firstName', 'p.email'])
			.getMany();

		const participantMap = new Map(participants.map((p) => [p.id, p]));

		let sent = 0;
		for (const signup of signups) {
			// Saltar si ya se envió recordatorio para este signup
			if (this.reminderSentAt.has(signup.id)) continue;

			const participant = participantMap.get(signup.participantId as string);
			if (!participant?.email) continue;

			const slot = slotMap.get(signup.slotId);
			if (!slot) continue;

			const retreat = slot.retreat;
			const retreatLabel = retreat ? retreat.parish : 'Retiro';

			const startLabel = this.formatTime(slot.startTime, retreat);
			const endLabel = this.formatTime(slot.endTime, retreat);

			const subject = `⏰ Guardia de la Capilla mañana — ${retreatLabel}`;
			const html = `
				<p>Hola <strong>${participant.firstName}</strong>,</p>
				<p>Recuerda que mañana tienes <strong>Guardia de la Capilla</strong> de <strong>${startLabel}</strong> a <strong>${endLabel}</strong>.</p>
				<p>¡Gracias por tu servicio! 🙏</p>
			`.trim();
			const text =
				`Hola ${participant.firstName}, recuerda que mañana tienes Guardia de la Capilla de ${startLabel} a ${endLabel}. ¡Gracias por tu servicio!`;

			try {
				await this.emailService.sendEmail({
					to: participant.email,
					subject,
					html,
					text,
				});
				this.reminderSentAt.set(signup.id, new Date());
				sent++;
			} catch (err) {
				console.error(
					`❌ Failed to send Santísimo reminder to ${participant.email} (signup ${signup.id}):`,
					err,
				);
			}
		}

		return { sent };
	}

	/** Formatea una hora en español (CDMX o la timezone del retiro si aplica). */
	private formatTime(date: Date | string, retreat?: Retreat | null): string {
		const d = date instanceof Date ? date : new Date(date);
		const timezone = retreat?.timezone || 'America/Mexico_City';
		return d.toLocaleString('es-MX', {
			hour: '2-digit',
			minute: '2-digit',
			hour12: false,
			timeZone: timezone,
		});
	}

	/** Elimina del Map las entradas más viejas de 48 h para evitar fuga de memoria. */
	private cleanOldEntries(): void {
		const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
		for (const [signupId, sentAt] of this.reminderSentAt.entries()) {
			if (sentAt < cutoff) {
				this.reminderSentAt.delete(signupId);
			}
		}
	}
}

export const santisimoReminderService = SantisimoReminderService.getInstance();
