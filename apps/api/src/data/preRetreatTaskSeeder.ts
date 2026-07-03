import { AppDataSource } from '../data-source';
import { PreRetreatTaskTemplate } from '../entities/preRetreatTaskTemplate.entity';
import { PreRetreatTaskTemplateSet } from '../entities/preRetreatTaskTemplateSet.entity';

/**
 * Seed del template "Pre-retiro — Emaús": checklist "Qué Hacer y Cuándo Antes
 * de un Retiro" (Excel Del Valle I, hoja Que-Cuando). Offsets en días antes de
 * retreat.startDate (mes = 30 días). Sin responsables: esos se asignan por
 * retiro. Sub-tareas con dueOffsetDays undefined heredan el offset del padre
 * al materializar.
 */

export type SeedTask = {
	name: string;
	description?: string;
	dueOffsetDays: number | null;
	defaultOrder: number;
	supportNotes?: string | null;
	children?: Array<{
		name: string;
		description?: string;
		dueOffsetDays?: number | null;
		defaultOrder: number;
		supportNotes?: string | null;
	}>;
};

const PRE_RETIRO_EMAUS: SeedTask[] = [
	{ name: 'Buscar parroquia', dueOffsetDays: 120, defaultOrder: 10 },
	{
		name: 'Tener Parroquia / apoyo del Párroco',
		dueOffsetDays: 120,
		defaultOrder: 20,
		children: [
			{ name: 'Hablar con el párroco haciendo una presentación formal del retiro', defaultOrder: 10 },
			{ name: 'Explicar el formato de las reuniones de preparación y su posible participación', defaultOrder: 20 },
			{ name: 'Pedir un espacio / salón para las reuniones', defaultOrder: 30 },
			{ name: 'Definir día y hora para las reuniones — hacer un calendario / Misa de Salida', defaultOrder: 40 },
		],
	},
	{
		name: 'Casa de Retiro',
		dueOffsetDays: 120,
		defaultOrder: 30,
		children: [
			{ name: 'Buscar posibles fechas en diferentes casas de retiro — casa sin otras actividades', defaultOrder: 10 },
			{ name: 'No cerrar fechas ni dar anticipo sin consultar con Consejo para no empalmar con otros retiros', defaultOrder: 20 },
			{ name: 'Establecida la fecha, dar anticipo para asegurarla con la casa', defaultOrder: 30 },
			{ name: 'Confirmar número de camas disponibles y fecha máxima para confirmar participantes (comida)', defaultOrder: 40 },
		],
	},
	{
		name: 'Equipo de Logística',
		description: 'Determinar e invitar a equipo de logística (mínimo 2 personas)',
		dueOffsetDays: null,
		defaultOrder: 40,
	},
	{
		name: 'Costo',
		dueOffsetDays: 120,
		defaultOrder: 50,
		children: [
			{ name: 'Establecer el costo del retiro, máximo de caminantes y máximo de servidores', defaultOrder: 10 },
			{ name: 'No hay becas — el servidor que invita se responsabiliza de la beca', defaultOrder: 20 },
			{ name: 'Establecer quién es el contacto con la casa: 1 persona encargada', defaultOrder: 30 },
		],
	},
	{ name: 'Mandar cartas de Jesús', description: 'Mandar por correo', dueOffsetDays: 120, defaultOrder: 60 },
	{
		name: 'Calendario de preparaciones y fechas de reuniones',
		description: 'Establecer el calendario específico con día (fecha) y preparación',
		dueOffsetDays: 90,
		defaultOrder: 70,
	},
	{
		name: 'Preparar hoja de inscripción',
		dueOffsetDays: 90,
		defaultOrder: 80,
		children: [
			{ name: 'Mandar todos los datos para la hoja de invitación y póster', defaultOrder: 10 },
			{ name: 'Abrir los links para las inscripciones y pasar los passwords para: Líder, Logística, Palancas, etc.', defaultOrder: 20 },
		],
	},
	{
		name: 'Mantelitos',
		description: 'Mandar a hacer mantelitos con catecismos y/o colegios',
		dueOffsetDays: 60,
		defaultOrder: 85,
	},
	{
		name: 'Mandar invitación general para servir',
		description:
			'Hacer invitación en las reuniones de seguimiento y mandar mail a los que han caminado en la parroquia',
		dueOffsetDays: 84,
		defaultOrder: 90,
	},
	{
		name: 'Preparar con el párroco qué se necesita de él (calendario)',
		description:
			'Pedirle Misas de preparaciones (opcional), Hora Santa (opcional), Misa de envío, charla de sacramentos, confesiones, Misa sábado noche y Misa de salida',
		dueOffsetDays: 84,
		defaultOrder: 100,
	},
	{
		name: 'Determinar cuenta bancaria y tesorero',
		description: 'Establecer qué y cómo se va a recibir el dinero: efectivo, transferencias, tarjetas, etc.',
		dueOffsetDays: 84,
		defaultOrder: 110,
	},
	{
		name: 'Presupuesto',
		dueOffsetDays: 84,
		defaultOrder: 120,
		children: [
			{ name: 'Determinar presupuesto por equipos', defaultOrder: 10 },
			{ name: 'Invitar a uno de los servidores a ser el tesorero: SOLO 1 tesorero', defaultOrder: 20 },
		],
	},
	{
		name: 'Recaudación de fondos',
		description: 'Cómo se van a recaudar fondos para el retiro: rifas, sorteos, ventas, etc.',
		dueOffsetDays: 84,
		defaultOrder: 130,
	},
	{
		name: 'Charlas: invitación',
		dueOffsetDays: 70,
		defaultOrder: 140,
		children: [
			{ name: 'Listado de posibles charlistas para el retiro', defaultOrder: 10 },
			{ name: 'Invitación personal (hablar) a cada charlista para confirmar su participación — ideal que sirvan en el retiro completo', defaultOrder: 20 },
			{ name: 'Mantener contacto con charlistas durante todas las preparaciones y tener plan B', defaultOrder: 30 },
		],
	},
	{
		name: 'Invitación internacional',
		description: 'Si se quiere invitar a alguien, establecer contacto directo (hablar) y confirmar',
		dueOffsetDays: 70,
		defaultOrder: 150,
	},
	{
		name: 'Preparaciones: inicio',
		description:
			'Desde la primera preparación dar a conocer fechas, reglas claras de participación, costo, becas, ayudas',
		dueOffsetDays: 70,
		defaultOrder: 160,
	},
	{
		name: 'Equipos',
		dueOffsetDays: null,
		defaultOrder: 170,
		children: [
			{ name: 'Definir equipos: Logística, Tesorero, Palancas, Inventario, Sacerdotes, Mantelitos, Snacks, Compras, Transporte, Música, Comedor, Salón, Cuartos, Oración, Palanquitas', defaultOrder: 10 },
			{ name: 'De los equipos 1 al 5, determinar y avisar desde antes para que empiecen a trabajar', defaultOrder: 20 },
		],
	},
	{
		name: 'Inventario',
		description: 'Hacer inventario físico de acuerdo a la lista proporcionada para determinar qué hace falta',
		dueOffsetDays: 56,
		defaultOrder: 180,
	},
	{
		name: 'Misa de salida',
		dueOffsetDays: 56,
		defaultOrder: 190,
		children: [
			{ name: 'Si se va a contratar música/coro/etc., confirmar', defaultOrder: 10 },
			{ name: 'Definir si las rosas salen de la casa de retiro o en la Misa de Salida, quién las lleva y asegurar que estén en excelente estado', defaultOrder: 20 },
		],
	},
	{
		name: 'Tener lista de servidores',
		description: 'Confirmar quién necesita playeras y sus tallas',
		dueOffsetDays: 35,
		defaultOrder: 200,
	},
	{
		name: 'Invitar sacerdotes a confesar',
		dueOffsetDays: 35,
		defaultOrder: 210,
		children: [
			{ name: 'Asegurar que esté anotado el sábado 8:40pm en su agenda y en la Parroquia', defaultOrder: 10 },
			{ name: 'Organizar cómo llegan los sacerdotes: taxi, chofer, su coche, etc.', defaultOrder: 20 },
		],
	},
	{ name: 'Abrir inscripciones', dueOffsetDays: 35, defaultOrder: 220 },
	{
		name: 'Mandar invitación por mail',
		description: 'A la base de datos de hombres y mujeres',
		dueOffsetDays: 35,
		defaultOrder: 230,
	},
	{
		name: 'Preparar pósters y quién va a parroquias a invitar',
		description: 'Hacer equipos para cubrir horarios de Misa en la parroquia y otras parroquias cercanas',
		dueOffsetDays: 35,
		defaultOrder: 240,
	},
	{
		name: 'Contratar fotógrafo',
		description: 'Quién va a tomar, arreglar e imprimir la foto',
		dueOffsetDays: 28,
		defaultOrder: 250,
	},
	{
		name: 'Pedir polos y sudaderas',
		description: 'Tener confirmadas tallas de nuevos servidores y polos para caminantes',
		dueOffsetDays: 28,
		defaultOrder: 260,
	},
	{
		name: 'Biblias',
		description: 'Comprarlas o pedirlas al inventario de Consejo',
		dueOffsetDays: 28,
		defaultOrder: 270,
	},
	{ name: 'Preparar Hora Santa antes del retiro', description: 'Confirmar', dueOffsetDays: 28, defaultOrder: 280 },
	{
		name: 'Palancas',
		dueOffsetDays: 28,
		defaultOrder: 290,
		children: [
			{ name: 'Confirmar equipo de palancas y método para solicitarlas (buzón físico, mail, teléfono, etc.)', defaultOrder: 10 },
			{ name: 'Empezar a pedir palancas de los caminantes conforme se vayan inscribiendo', defaultOrder: 20 },
		],
	},
	{ name: 'Rosarios, aguas benditas, agua para bendecir y cirios', dueOffsetDays: 21, defaultOrder: 300 },
	{
		name: 'Palanquitas: libros diarios',
		description: 'Verificar con charlistas (qué palanca quieren dar) y con el inventario',
		dueOffsetDays: 21,
		defaultOrder: 310,
	},
	{
		name: 'Snacks',
		dueOffsetDays: 14,
		defaultOrder: 320,
		children: [
			{ name: 'Comprar snacks de acuerdo a presupuesto y caminantes', defaultOrder: 10 },
			{ name: 'Pedir snack para sábado en la noche y cena de sacerdotes', defaultOrder: 20 },
			{ name: 'Verificar con la casa si hay cafeteras y garrafones de agua o hay que llevar', defaultOrder: 30 },
		],
	},
	{
		name: 'Compras de papelería',
		description: 'Revisar inventario y presupuesto',
		dueOffsetDays: 14,
		defaultOrder: 330,
	},
	{ name: 'Pedir música a charlistas', dueOffsetDays: 14, defaultOrder: 340 },
	{
		name: 'Envío de playlist con la foto',
		description: 'Para caminantes y determinar cuántos para servidores',
		dueOffsetDays: 14,
		defaultOrder: 350,
	},
	{
		name: 'Menús',
		dueOffsetDays: 14,
		defaultOrder: 360,
		children: [
			{ name: 'Confirmar a la casa de retiro menús y número de participantes totales (caminantes y servidores)', defaultOrder: 10 },
			{ name: 'Dar a conocer a la casa de retiro los horarios de comidas', defaultOrder: 20 },
		],
	},
	{
		name: 'Cumpleaños durante el fin de semana',
		description: 'Ver si algún caminante/servidor cumple años durante el retiro / comprar pastel',
		dueOffsetDays: 7,
		defaultOrder: 370,
	},
	{ name: 'Botiquín médico', description: 'Medicinas y kit', dueOffsetDays: 7, defaultOrder: 380 },
	{
		name: 'Flores',
		dueOffsetDays: 2,
		defaultOrder: 390,
		children: [
			{ name: 'Flores para el Santísimo durante el retiro', defaultOrder: 10 },
			{ name: 'Rosas para la salida del retiro / rosa para la explicación', defaultOrder: 20 },
		],
	},
];

const SET_NAME = 'Pre-retiro — Emaús';

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();
const pairKey = (parentName: string | null | undefined, name: string) =>
	`${norm(parentName)}__${norm(name)}`;

async function upsertSet(): Promise<PreRetreatTaskTemplateSet> {
	const repo = AppDataSource.getRepository(PreRetreatTaskTemplateSet);
	let s = await repo.findOne({ where: { name: SET_NAME } });
	if (!s) {
		s = await repo.save(
			repo.create({
				name: SET_NAME,
				description:
					'Checklist "Qué Hacer y Cuándo Antes de un Retiro" (basado en Del Valle I). ~40 tareas con tiempos de 4 meses a 2 días antes del retiro.',
				sourceTag: 'que_cuando_xlsx',
				isActive: true,
				isDefault: true,
			}),
		);
	} else if (!s.isDefault) {
		await repo.update(s.id, { isDefault: true });
		s.isDefault = true;
	}
	return s;
}

/**
 * Inserta las filas que falten (aditivo, idempotente). Clave de identidad:
 * (nombre del padre normalizado || '', nombre normalizado) — análoga al
 * (defaultDay, name) del seeder del Minuto a Minuto.
 */
async function seedSet(setId: string): Promise<{ added: number }> {
	const repo = AppDataSource.getRepository(PreRetreatTaskTemplate);
	const existing = await repo.find({ where: { templateSetId: setId } });
	const existingById = new Map(existing.map((e) => [e.id, e]));
	const existingKeys = new Map<string, PreRetreatTaskTemplate>();
	for (const e of existing) {
		const parent = e.parentId ? existingById.get(e.parentId) : undefined;
		existingKeys.set(pairKey(parent?.name ?? null, e.name), e);
	}

	let added = 0;
	for (const root of PRE_RETIRO_EMAUS) {
		let rootEntity = existingKeys.get(pairKey(null, root.name));
		if (!rootEntity) {
			rootEntity = await repo.save(
				repo.create({
					templateSetId: setId,
					parentId: null,
					name: root.name,
					description: root.description ?? null,
					dueOffsetDays: root.dueOffsetDays,
					defaultOrder: root.defaultOrder,
					supportNotes: root.supportNotes ?? null,
					isActive: true,
				}),
			);
			existingKeys.set(pairKey(null, root.name), rootEntity);
			added++;
		}
		for (const child of root.children ?? []) {
			if (existingKeys.has(pairKey(root.name, child.name))) continue;
			const saved = await repo.save(
				repo.create({
					templateSetId: setId,
					parentId: rootEntity.id,
					name: child.name,
					description: child.description ?? null,
					dueOffsetDays: child.dueOffsetDays ?? null,
					defaultOrder: child.defaultOrder,
					supportNotes: child.supportNotes ?? null,
					isActive: true,
				}),
			);
			existingKeys.set(pairKey(root.name, child.name), saved);
			added++;
		}
	}
	return { added };
}

/**
 * Sincroniza campos de filas ya seedeadas con el seed actual. Semántica por
 * campo: undefined → no tocar; null → limpiar; valor → actualizar si difiere.
 */
const SYNCABLE_FIELDS = ['dueOffsetDays', 'defaultOrder', 'description', 'supportNotes'] as const;

async function syncTemplateFields(setId: string): Promise<number> {
	const repo = AppDataSource.getRepository(PreRetreatTaskTemplate);
	const existing = await repo.find({ where: { templateSetId: setId } });
	const existingById = new Map(existing.map((e) => [e.id, e]));
	const byKey = new Map<string, PreRetreatTaskTemplate>();
	for (const e of existing) {
		const parent = e.parentId ? existingById.get(e.parentId) : undefined;
		byKey.set(pairKey(parent?.name ?? null, e.name), e);
	}

	let patched = 0;
	const syncRow = async (
		row: { [k: string]: unknown },
		key: string,
	): Promise<void> => {
		const entity = byKey.get(key);
		if (!entity) return;
		const updates: Partial<PreRetreatTaskTemplate> = {};
		for (const field of SYNCABLE_FIELDS) {
			const seedVal = row[field];
			if (seedVal === undefined) continue;
			if (seedVal === null) {
				if ((entity as any)[field] != null) (updates as any)[field] = null;
				continue;
			}
			if ((entity as any)[field] !== seedVal) (updates as any)[field] = seedVal;
		}
		if (Object.keys(updates).length === 0) return;
		await repo.update(entity.id, updates);
		patched++;
	};

	for (const root of PRE_RETIRO_EMAUS) {
		await syncRow(root as any, pairKey(null, root.name));
		for (const child of root.children ?? []) {
			await syncRow(child as any, pairKey(root.name, child.name));
		}
	}
	return patched;
}

export async function createDefaultPreRetreatTaskTemplate(): Promise<void> {
	const set = await upsertSet();
	const { added } = await seedSet(set.id);
	if (added) {
		console.log(`[preRetreatTaskSeeder] ${SET_NAME}: added=${added}`);
	}
	const patched = await syncTemplateFields(set.id);
	if (patched) {
		console.log(`[preRetreatTaskSeeder] sync fields: ${patched} items`);
	}
}

export const __TEST__ = { PRE_RETIRO_EMAUS, SET_NAME };
