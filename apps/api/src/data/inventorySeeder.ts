import { AppDataSource } from '../data-source';
import { InventoryCategory } from '../entities/inventoryCategory.entity';
import { InventoryTeam } from '../entities/inventoryTeam.entity';
import { InventoryItem } from '../entities/inventoryItem.entity';
import { v4 as uuidv4 } from 'uuid';

export const createDefaultInventoryData = async () => {
	const categoryRepository = AppDataSource.getRepository(InventoryCategory);
	const teamRepository = AppDataSource.getRepository(InventoryTeam);
	const itemRepository = AppDataSource.getRepository(InventoryItem);

	// Check if data already exists
	const existingCategories = await categoryRepository.count();
	if (existingCategories > 0) {
		console.log('Default inventory data already exists');
		return;
	}

	// Create default categories
	const categories = [
		{ name: 'Snacks', description: 'Alimentos y botanas para los caminantes' },
		{ name: 'Botiquín', description: 'Suministros médicos y de primeros auxilios' },
		{ name: 'Aseo Personal', description: 'Artículos de higiene personal' },
		{ name: 'Papelería', description: 'Material de oficina y escritura' },
		{ name: 'Material Requerido', description: 'Material general requerido para el retiro' },
		{ name: 'Botiquín 1Eros Aux', description: 'Botiquín de primeros auxilios' },
		{ name: 'Oración', description: 'Material para oración y actividades espirituales' },
		{ name: 'Santísimo', description: 'Material para el Santísimo' },
		{ name: 'Quema De Pecados', description: 'Material para la quema de pecados' },
		{ name: 'Lavado De Manos', description: 'Material para lavado de manos' },
		{ name: 'Bolsas Salida', description: 'Material para bolsas de salida' },
	];

	const createdCategories = await categoryRepository.save(
		categories.map((cat) =>
			categoryRepository.create({
				id: uuidv4(),
				...cat,
			}),
		),
	);

	// Create default teams
	const teams = [
		{ name: 'Recepción', description: 'Equipo de recepción y registro' },
		{ name: 'Caminantes', description: 'Atención a los caminantes' },
		{ name: 'Palanquitas', description: 'Equipo de palanquitas' },
		{ name: 'Botiquín 1Eros Aux', description: 'Equipo de botiquín y primeros auxilios' },
		{ name: 'Música', description: 'Equipo de música y alabanza' },
		{ name: 'Comedor', description: 'Equipo de comedor y alimentación' },
		{ name: 'Salón', description: 'Equipo del salón' },
		{ name: 'Oración', description: 'Equipo de oración' },
		{ name: 'Santísimo', description: 'Equipo del Santísimo' },
		{ name: 'Campana', description: 'Equipo de la campana' },
		{ name: 'Cuartos', description: 'Equipo de asignación de cuartos' },
		{ name: 'Papelería', description: 'Equipo de papelería y materiales' },
		{ name: 'Palancas', description: 'Equipo de palancas y cartas' },
		{ name: 'Quema De Pecados', description: 'Equipo de la quema de pecados' },
		{ name: 'Pared', description: 'Equipo de la pared' },
		{ name: 'Lavado De Manos', description: 'Equipo de lavado de manos' },
		{ name: 'Bolsas Salida', description: 'Equipo de bolsas de salida' },
	];

	const createdTeams = await teamRepository.save(
		teams.map((team) =>
			teamRepository.create({
				id: uuidv4(),
				...team,
			}),
		),
	);

	// Create default inventory items
	const items = [
		// Recepción
		{
			name: 'Cajas de Plástico para Celulares',
			categoryId: 'Material Requerido',
			teamId: 'Recepción',
			ratio: 0.03,
			unit: 'cajas',
		},
		{
			name: 'Bolsas Zip Lock Sándwich',
			categoryId: 'Material Requerido',
			teamId: 'Recepción',
			ratio: 0.04,
			unit: 'bolsas',
		},
		{
			name: 'Marcadores y Plumas',
			categoryId: 'Material Requerido',
			teamId: 'Recepción',
			ratio: 0.08,
			unit: 'piezas',
		},
		{
			name: 'Gafetes Porta gafetes Plástico',
			categoryId: 'Material Requerido',
			teamId: 'Recepción',
			ratio: 1.0,
			unit: 'piezas',
		},

		// Caminantes
		{
			name: 'Biblias',
			categoryId: 'Material Requerido',
			teamId: 'Caminantes',
			ratio: 1.0,
			unit: 'piezas',
		},
		{
			name: 'Cuadernitos',
			categoryId: 'Material Requerido',
			teamId: 'Caminantes',
			ratio: 1.0,
			unit: 'piezas',
		},
		{
			name: 'Pluma',
			categoryId: 'Material Requerido',
			teamId: 'Caminantes',
			ratio: 1.0,
			unit: 'piezas',
		},
		{
			name: 'Rosarios',
			categoryId: 'Material Requerido',
			teamId: 'Caminantes',
			ratio: 1.0,
			unit: 'piezas',
		},

		// Palanquitas
		{
			name: 'Juego Palanquitas X Caminante',
			categoryId: 'Material Requerido',
			teamId: 'Palanquitas',
			ratio: 1.0,
			unit: 'juegos',
		},

		// Botiquín
		{
			name: 'Botiquín (Ver Listado Aparte)',
			categoryId: 'Botiquín 1Eros Aux',
			teamId: 'Botiquín 1Eros Aux',
			ratio: 0.01,
			unit: 'botiquín',
		},

		// Música
		{
			name: 'Bocina y Micrófono para Salón',
			categoryId: 'Material Requerido',
			teamId: 'Música',
			ratio: 0.03,
			unit: 'piezas',
		},
		{
			name: 'Bocina y Micrófono para Comedor',
			categoryId: 'Material Requerido',
			teamId: 'Música',
			ratio: 0.01,
			unit: 'piezas',
		},
		{
			name: 'Laptop para Charlas',
			categoryId: 'Material Requerido',
			teamId: 'Música',
			ratio: 0.01,
			unit: 'piezas',
		},
		{
			name: 'Micrófono Adicional',
			categoryId: 'Material Requerido',
			teamId: 'Música',
			ratio: 0.01,
			unit: 'piezas',
		},
		{
			name: 'Masking Tape Grueso (Cables Piso)',
			categoryId: 'Material Requerido',
			teamId: 'Música',
			ratio: 0.01,
			unit: 'piezas',
		},
		{
			name: 'Caja de Música',
			categoryId: 'Material Requerido',
			teamId: 'Música',
			ratio: 0.01,
			unit: 'piezas',
		},

		// Comedor
		{
			name: 'Pastel',
			categoryId: 'Material Requerido',
			teamId: 'Comedor',
			ratio: 0.03,
			unit: 'pasteles',
		},
		{
			name: 'Velitas',
			categoryId: 'Material Requerido',
			teamId: 'Comedor',
			ratio: 0.03,
			unit: 'piezas',
		},
		{
			name: 'Letreros Mesas con Número',
			categoryId: 'Material Requerido',
			teamId: 'Comedor',
			ratio: 0.17,
			unit: 'piezas',
		},

		// Salón
		{
			name: 'Kleenex',
			categoryId: 'Material Requerido',
			teamId: 'Salón',
			ratio: 0.14,
			unit: 'cajas',
		},
		{
			name: 'Banners: Invocación Al Espíritu Santo',
			categoryId: 'Material Requerido',
			teamId: 'Salón',
			ratio: 0.06,
			unit: 'piezas',
		},
		{
			name: 'Banners: Confidencialidad',
			categoryId: 'Material Requerido',
			teamId: 'Salón',
			ratio: 0.01,
			unit: 'piezas',
		},
		{
			name: 'Banners: Jesucristo Ha Resucitado',
			categoryId: 'Material Requerido',
			teamId: 'Salón',
			ratio: 0.01,
			unit: 'piezas',
		},
		{
			name: 'Banners: Divina Misericordia',
			categoryId: 'Material Requerido',
			teamId: 'Salón',
			ratio: 0.01,
			unit: 'piezas',
		},
		{
			name: 'Banners: Rembrandt Hijo Pródigo',
			categoryId: 'Material Requerido',
			teamId: 'Salón',
			ratio: 0.01,
			unit: 'piezas',
		},
		{
			name: 'Banner / Cuadro Virgen de Guadalupe',
			categoryId: 'Material Requerido',
			teamId: 'Salón',
			ratio: 0.01,
			unit: 'piezas',
		},
		{
			name: 'Prit Tack para Letreros Cuartos',
			categoryId: 'Material Requerido',
			teamId: 'Salón',
			ratio: 0.03,
			unit: 'piezas',
		},

		// Oración
		{ name: 'Santísimo', categoryId: 'Oración', teamId: 'Oración', ratio: 0.01, unit: 'piezas' },

		// Santísimo
		{
			name: 'Cirios No Mayor de 15 cms',
			categoryId: 'Santísimo',
			teamId: 'Santísimo',
			ratio: 0.06,
			unit: 'piezas',
		},
		{
			name: 'Platos para Cirios',
			categoryId: 'Santísimo',
			teamId: 'Santísimo',
			ratio: 0.06,
			unit: 'piezas',
		},
		{
			name: 'Corporal Grande',
			categoryId: 'Santísimo',
			teamId: 'Santísimo',
			ratio: 0.01,
			unit: 'piezas',
		},
		{ name: 'Lámpara', categoryId: 'Santísimo', teamId: 'Santísimo', ratio: 0.01, unit: 'piezas' },
		{
			name: 'Pilas AAA',
			categoryId: 'Santísimo',
			teamId: 'Santísimo',
			ratio: 0.04,
			unit: 'piezas',
		},
		{
			name: 'Tijeras Pequeñas',
			categoryId: 'Santísimo',
			teamId: 'Santísimo',
			ratio: 0.01,
			unit: 'piezas',
		},
		{
			name: 'Encendedores',
			categoryId: 'Santísimo',
			teamId: 'Santísimo',
			ratio: 0.01,
			unit: 'piezas',
		},
		{
			name: 'Folder Oraciones Santísimo',
			categoryId: 'Santísimo',
			teamId: 'Santísimo',
			ratio: 0.01,
			unit: 'piezas',
		},
		{
			name: 'Letreros Santísimo Expuesto',
			categoryId: 'Santísimo',
			teamId: 'Santísimo',
			ratio: 0.01,
			unit: 'piezas',
		},
		{
			name: 'Caja para Palancas Reclusorios',
			categoryId: 'Santísimo',
			teamId: 'Santísimo',
			ratio: 0.01,
			unit: 'piezas',
		},
		{
			name: 'Bocina para Santísimo',
			categoryId: 'Santísimo',
			teamId: 'Santísimo',
			ratio: 0.01,
			unit: 'piezas',
		},

		// Campana
		{
			name: 'Campanas',
			categoryId: 'Material Requerido',
			teamId: 'Campana',
			ratio: 0.03,
			unit: 'piezas',
		},

		// Cuartos
		{
			name: 'Papel de Baño',
			categoryId: 'Material Requerido',
			teamId: 'Cuartos',
			ratio: 1.0,
			unit: 'rollos',
		},

		// Papelería
		{
			name: 'Cinta Canela Café',
			categoryId: 'Papelería',
			teamId: 'Papelería',
			ratio: 0.01,
			unit: 'piezas',
		},
		{ name: 'Diurex', categoryId: 'Papelería', teamId: 'Papelería', ratio: 0.01, unit: 'piezas' },
		{
			name: 'Engrapadoras',
			categoryId: 'Papelería',
			teamId: 'Papelería',
			ratio: 0.01,
			unit: 'piezas',
		},
		{
			name: 'Guillotinas',
			categoryId: 'Papelería',
			teamId: 'Papelería',
			ratio: 0.01,
			unit: 'piezas',
		},
		{
			name: 'Hojas Blancas',
			categoryId: 'Papelería',
			teamId: 'Papelería',
			ratio: 13.89,
			unit: 'hojas',
		},
		{
			name: 'Laptop e Impresora para Logística',
			categoryId: 'Papelería',
			teamId: 'Papelería',
			ratio: 0.01,
			unit: 'piezas',
		},
		{ name: 'Lápices', categoryId: 'Papelería', teamId: 'Papelería', ratio: 1.39, unit: 'piezas' },
		{
			name: 'Sobres Blancos Grandes Oficio No. 10',
			categoryId: 'Papelería',
			teamId: 'Papelería',
			ratio: 3.47,
			unit: 'sobres',
		},
		{
			name: 'Saca Puntas',
			categoryId: 'Papelería',
			teamId: 'Papelería',
			ratio: 0.03,
			unit: 'piezas',
		},
		{
			name: 'Tarjetas de Agradecimiento Padres',
			categoryId: 'Papelería',
			teamId: 'Papelería',
			ratio: 0.28,
			unit: 'piezas',
		},
		{ name: 'Tijeras', categoryId: 'Papelería', teamId: 'Papelería', ratio: 0.01, unit: 'piezas' },

		// Palancas
		{
			name: 'Sobres para Palancas',
			categoryId: 'Material Requerido',
			teamId: 'Palancas',
			ratio: 1.53,
			unit: 'sobres',
		},
		{
			name: 'Bolsas Salida',
			categoryId: 'Bolsas Salida',
			teamId: 'Palancas',
			ratio: 0.01,
			unit: 'piezas',
		},
		{
			name: 'Kleenex: Paquetitos Individuales',
			categoryId: 'Material Requerido',
			teamId: 'Palancas',
			ratio: 0.69,
			unit: 'paquetes',
		},
		{
			name: 'Impresora: Cartuchos Tinta / Toners',
			categoryId: 'Material Requerido',
			teamId: 'Palancas',
			ratio: 0.01,
			unit: 'piezas',
		},

		// Snacks
		{
			name: 'Garrafones / Vitroleros Agua',
			categoryId: 'Snacks',
			teamId: 'Caminantes',
			ratio: 0.03,
			unit: 'piezas',
		},
		{
			name: 'Vasos desechables',
			categoryId: 'Snacks',
			teamId: 'Caminantes',
			ratio: 0.69,
			unit: 'pzas',
		},
		{
			name: 'Vasos para café',
			categoryId: 'Snacks',
			teamId: 'Caminantes',
			ratio: 0.69,
			unit: 'pzas',
		},
		{
			name: 'Bolsa de carton (Son las bolsas de salida)',
			categoryId: 'Snacks',
			teamId: 'Caminantes',
			ratio: 0.69,
			unit: 'pzas',
		},
		{ name: 'Lata Café', categoryId: 'Snacks', teamId: 'Caminantes', ratio: 0.01, unit: 'latas' },
		{
			name: 'Botella de valentina',
			categoryId: 'Snacks',
			teamId: 'Caminantes',
			ratio: 0.01,
			unit: 'pzas',
		},
		{
			name: 'Botella de Chamoy o Miguelito',
			categoryId: 'Snacks',
			teamId: 'Caminantes',
			ratio: 0.01,
			unit: 'botellas',
		},
		{
			name: 'Jarabes Agua Fresca',
			categoryId: 'Snacks',
			teamId: 'Caminantes',
			ratio: 0.06,
			unit: 'botellas',
		},
		{
			name: 'Cajas de Te variados',
			categoryId: 'Snacks',
			teamId: 'Caminantes',
			ratio: 0.01,
			unit: 'pzas',
		},
		{
			name: 'Azucar, Splenda, una de cada uno. (sobres)',
			categoryId: 'Snacks',
			teamId: 'Caminantes',
			ratio: 0.01,
			unit: 'cajas',
		},
		{
			name: 'Cofeemate (sustituto de crema)',
			categoryId: 'Snacks',
			teamId: 'Caminantes',
			ratio: 0.01,
			unit: 'bote / caja',
		},
		{ name: 'Cucharitas', categoryId: 'Snacks', teamId: 'Caminantes', ratio: 1.67, unit: 'bolsa' },
		{
			name: 'Bolsas de basura grandes',
			categoryId: 'Snacks',
			teamId: 'Caminantes',
			ratio: 0.01,
			unit: 'caja de 10',
		},
		{
			name: 'Platos desechables grandes para poner snacks',
			categoryId: 'Snacks',
			teamId: 'Caminantes',
			ratio: 0.03,
			unit: 'paquete',
		},
		{
			name: 'Cajas de Galletas',
			categoryId: 'Snacks',
			teamId: 'Caminantes',
			ratio: 0.06,
			unit: 'cajas',
		},
		{
			name: 'Papas / Frituras',
			categoryId: 'Snacks',
			teamId: 'Caminantes',
			ratio: 0.07,
			unit: 'kgs',
		},
		{ name: 'Cacahuates', categoryId: 'Snacks', teamId: 'Caminantes', ratio: 0.04, unit: 'kgs' },
		{ name: 'Gomitas', categoryId: 'Snacks', teamId: 'Caminantes', ratio: 0.03, unit: 'kgs' },
		{
			name: 'Mentas',
			categoryId: 'Snacks',
			teamId: 'Caminantes',
			ratio: 0.01,
			unit: 'bolsa grande',
		},
		{
			name: 'Cholocates minis para palanquitas',
			categoryId: 'Snacks',
			teamId: 'Caminantes',
			ratio: 0.04,
			unit: 'bolsas 50',
		},
		{
			name: 'Botella agua 500ml / 600ml',
			categoryId: 'Snacks',
			teamId: 'Caminantes',
			ratio: 0.28,
			unit: 'piezas',
		},
		{
			name: 'Refresco cola 2L',
			categoryId: 'Snacks',
			teamId: 'Caminantes',
			ratio: 0.06,
			unit: '2L',
		},
		{
			name: 'Refresco cola light 2L',
			categoryId: 'Snacks',
			teamId: 'Caminantes',
			ratio: 0.04,
			unit: '2L',
		},
		{
			name: 'Refresco manzana 2L',
			categoryId: 'Snacks',
			teamId: 'Caminantes',
			ratio: 0.04,
			unit: '2L',
		},
		{
			name: 'Refresco sprite 2L',
			categoryId: 'Snacks',
			teamId: 'Caminantes',
			ratio: 0.04,
			unit: '2L',
		},
		{
			name: 'Jugo de manzana 1L',
			categoryId: 'Snacks',
			teamId: 'Caminantes',
			ratio: 0.06,
			unit: '1L',
		},
		{ name: 'Pavera', categoryId: 'Snacks', teamId: 'Caminantes', ratio: 0.01, unit: 'piezas' },

		// Botiquín Médico
		{
			name: 'Next, caja 10 tabletas',
			categoryId: 'Botiquín',
			teamId: 'Botiquín 1Eros Aux',
			ratio: 0.14,
			unit: 'cajas',
		},
		{
			name: 'Agua oxigenada, botella 230ml',
			categoryId: 'Botiquín',
			teamId: 'Botiquín 1Eros Aux',
			ratio: 3.19,
			unit: 'ml',
		},
		{
			name: 'Alcohol, botella 200 ml',
			categoryId: 'Botiquín',
			teamId: 'Botiquín 1Eros Aux',
			ratio: 2.78,
			unit: 'ml',
		},
		{
			name: 'Eskapar cápsulas 200 mg',
			categoryId: 'Botiquín',
			teamId: 'Botiquín 1Eros Aux',
			ratio: 0.21,
			unit: 'capsulas',
		},
		{
			name: 'Treda, 8 pastillas sueltas',
			categoryId: 'Botiquín',
			teamId: 'Botiquín 1Eros Aux',
			ratio: 0.11,
			unit: 'pastillas',
		},
		{
			name: 'Advil, frasco 100 tabletas',
			categoryId: 'Botiquín',
			teamId: 'Botiquín 1Eros Aux',
			ratio: 1.39,
			unit: 'tabletas',
		},
		{
			name: 'Tylenol frasco, 6 tabletas',
			categoryId: 'Botiquín',
			teamId: 'Botiquín 1Eros Aux',
			ratio: 0.08,
			unit: 'tabletas',
		},
		{
			name: 'Aliviax caja 4 tabletas',
			categoryId: 'Botiquín',
			teamId: 'Botiquín 1Eros Aux',
			ratio: 0.06,
			unit: 'tabletas',
		},
		{
			name: 'Jeringas, caja con 3 unidades',
			categoryId: 'Botiquín',
			teamId: 'Botiquín 1Eros Aux',
			ratio: 0.04,
			unit: 'unidades',
		},
		{
			name: 'Curitas, caja 75 piezas',
			categoryId: 'Botiquín',
			teamId: 'Botiquín 1Eros Aux',
			ratio: 1.04,
			unit: 'piezas',
		},
		{
			name: 'Gasas, caja con 10 piezas',
			categoryId: 'Botiquín',
			teamId: 'Botiquín 1Eros Aux',
			ratio: 0.14,
			unit: 'piezas',
		},
		{
			name: 'Nazil gotas imitado, 15 ml',
			categoryId: 'Botiquín',
			teamId: 'Botiquín 1Eros Aux',
			ratio: 0.21,
			unit: 'ml',
		},
		{
			name: 'Alta Seltzer, cajas 12 tabletas',
			categoryId: 'Botiquín',
			teamId: 'Botiquín 1Eros Aux',
			ratio: 0.28,
			unit: 'tabletas',
		},
		{
			name: 'Melox, tabletas masticables',
			categoryId: 'Botiquín',
			teamId: 'Botiquín 1Eros Aux',
			ratio: 0.42,
			unit: 'tabletas',
		},
		{
			name: 'Pepto bismol PLUS, frasco',
			categoryId: 'Botiquín',
			teamId: 'Botiquín 1Eros Aux',
			ratio: 0.01,
			unit: 'frasco',
		},
		{
			name: 'Clorotrimeton repetabs, tabletas',
			categoryId: 'Botiquín',
			teamId: 'Botiquín 1Eros Aux',
			ratio: 0.26,
			unit: 'tabletas',
		},
		{
			name: 'Andantol, jalea 25g',
			categoryId: 'Botiquín',
			teamId: 'Botiquín 1Eros Aux',
			ratio: 0.35,
			unit: 'gr',
		},
		{
			name: 'cIproxina, tabletas 500 mg',
			categoryId: 'Botiquín',
			teamId: 'Botiquín 1Eros Aux',
			ratio: 0.19,
			unit: 'tabletas',
		},
		{
			name: 'Firac plus tab 1 tab cada 8 hrs',
			categoryId: 'Botiquín',
			teamId: 'Botiquín 1Eros Aux',
			ratio: 0.28,
			unit: 'tabletas',
		},
		{
			name: 'Transpore cinta de 5 cms.',
			categoryId: 'Botiquín',
			teamId: 'Botiquín 1Eros Aux',
			ratio: 0.01,
			unit: 'piezas',
		},
		{
			name: 'Gatorade frasco',
			categoryId: 'Botiquín',
			teamId: 'Botiquín 1Eros Aux',
			ratio: 0.01,
			unit: 'frasco',
		},

		// Aseo Personal
		{
			name: 'Cepillos de dientes',
			categoryId: 'Aseo Personal',
			teamId: 'Caminantes',
			ratio: 0.14,
			unit: 'piezas',
		},
		{
			name: 'Jabon de tocador',
			categoryId: 'Aseo Personal',
			teamId: 'Caminantes',
			ratio: 0.14,
			unit: 'piezas',
		},
		{
			name: 'Papel de baño, paquete 4 piezas',
			categoryId: 'Aseo Personal',
			teamId: 'Caminantes',
			ratio: 0.07,
			unit: 'piezas',
		},
		{
			name: 'Pasta de dientes chicas',
			categoryId: 'Aseo Personal',
			teamId: 'Caminantes',
			ratio: 0.14,
			unit: 'piezas',
		},
		{
			name: 'Shampoo chicos (de viaje)',
			categoryId: 'Aseo Personal',
			teamId: 'Caminantes',
			ratio: 0.14,
			unit: 'piezas',
		},
		{
			name: 'Tapones de oído',
			categoryId: 'Aseo Personal',
			teamId: 'Caminantes',
			ratio: 0.35,
			unit: 'piezas',
		},
		{
			name: 'Rastrillos desechables',
			categoryId: 'Aseo Personal',
			teamId: 'Caminantes',
			ratio: 0.07,
			unit: 'piezas',
		},

		// Quema De Pecados
		{
			name: 'Encendedores Largos',
			categoryId: 'Quema De Pecados',
			teamId: 'Quema De Pecados',
			ratio: 0.03,
			unit: 'piezas',
		},
		{
			name: 'Iniciador de Fuego (Doritos)',
			categoryId: 'Quema De Pecados',
			teamId: 'Quema De Pecados',
			ratio: 0.01,
			unit: 'piezas',
		},
		{
			name: 'Pavera para Quema de Pecados',
			categoryId: 'Quema De Pecados',
			teamId: 'Quema De Pecados',
			ratio: 0.01,
			unit: 'piezas',
		},
		{
			name: 'Porta Paveras de Alambre Rigido',
			categoryId: 'Quema De Pecados',
			teamId: 'Quema De Pecados',
			ratio: 0.01,
			unit: 'piezas',
		},

		// Pared
		{
			name: 'Linternas',
			categoryId: 'Material Requerido',
			teamId: 'Pared',
			ratio: 0.03,
			unit: 'piezas',
		},
		{
			name: 'Láser',
			categoryId: 'Material Requerido',
			teamId: 'Pared',
			ratio: 0.03,
			unit: 'piezas',
		},
		{
			name: 'Veladoras',
			categoryId: 'Material Requerido',
			teamId: 'Pared',
			ratio: 0.69,
			unit: 'piezas',
		},

		// Lavado De Manos
		{
			name: 'Jarra para Lavado de Manos',
			categoryId: 'Lavado De Manos',
			teamId: 'Lavado De Manos',
			ratio: 0.01,
			unit: 'piezas',
		},
		{
			name: 'Recipiente de Agua (Palangana)',
			categoryId: 'Lavado De Manos',
			teamId: 'Lavado De Manos',
			ratio: 0.01,
			unit: 'piezas',
		},

		// Bolsas Salida
		{
			name: 'CDs: Etiquetas',
			categoryId: 'Bolsas Salida',
			teamId: 'Bolsas Salida',
			ratio: 0.01,
			unit: 'piezas',
		},
		{
			name: 'CDs: Grabados',
			categoryId: 'Bolsas Salida',
			teamId: 'Bolsas Salida',
			ratio: 1.53,
			unit: 'piezas',
		},
		{
			name: 'CDs: Sobres',
			categoryId: 'Bolsas Salida',
			teamId: 'Bolsas Salida',
			ratio: 1.53,
			unit: 'piezas',
		},
		{
			name: 'Playeras',
			categoryId: 'Bolsas Salida',
			teamId: 'Bolsas Salida',
			ratio: 1.0,
			unit: 'piezas',
		},

		// Material Adicional
		{
			name: 'Paquete hojas tamaño carta',
			categoryId: 'Papelería',
			teamId: 'Papelería',
			ratio: 0.01,
			unit: 'piezas',
		},
		{
			name: 'Sobres tamaño carta',
			categoryId: 'Papelería',
			teamId: 'Papelería',
			ratio: 1.39,
			unit: 'piezas',
		},
		{ name: 'Plumas', categoryId: 'Papelería', teamId: 'Papelería', ratio: 0.97, unit: 'piezas' },
		{
			name: 'Refrescos de 2 litros Ligth.',
			categoryId: 'Snacks',
			teamId: 'Caminantes',
			ratio: 0.08,
			unit: 'piezas',
		},
		{
			name: 'Refrescos de 2 litros Sabor.',
			categoryId: 'Snacks',
			teamId: 'Caminantes',
			ratio: 0.03,
			unit: 'piezas',
		},
		{
			name: 'Portagafetes',
			categoryId: 'Material Requerido',
			teamId: 'Recepción',
			ratio: 0.97,
			unit: 'piezas',
		},
		{
			name: 'Rollo de servitoallas',
			categoryId: 'Snacks',
			teamId: 'Caminantes',
			ratio: 0.01,
			unit: 'piezas',
		},
		{ name: 'Tijeras', categoryId: 'Papelería', teamId: 'Papelería', ratio: 0.03, unit: 'piezas' },
		{
			name: 'Botellitas para agua bendita',
			categoryId: 'Material Requerido',
			teamId: 'Santísimo',
			ratio: 0.69,
			unit: 'piezas',
		},
		{
			name: 'Rosarios',
			categoryId: 'Material Requerido',
			teamId: 'Caminantes',
			ratio: 0.69,
			unit: 'piezas',
		},
		{
			name: 'Campanas',
			categoryId: 'Material Requerido',
			teamId: 'Campana',
			ratio: 0.03,
			unit: 'piezas',
		},
		{
			name: 'Lásers',
			categoryId: 'Material Requerido',
			teamId: 'Pared',
			ratio: 0.04,
			unit: 'piezas',
		},
		{
			name: 'Etiquetas blancas adhesivas. 30 x D25',
			categoryId: 'Papelería',
			teamId: 'Papelería',
			ratio: 0.63,
			unit: 'piezas',
		},
		{
			name: 'Plumones negros Sharpie/Esterbook',
			categoryId: 'Papelería',
			teamId: 'Papelería',
			ratio: 0.03,
			unit: 'piezas',
		},
		{
			name: 'Bolsas indivudales de paquetes de Kleenex',
			categoryId: 'Material Requerido',
			teamId: 'Palancas',
			ratio: 0.21,
			unit: 'piezas',
		},
		{
			name: 'Rollos de cinta canela',
			categoryId: 'Papelería',
			teamId: 'Papelería',
			ratio: 0.03,
			unit: 'piezas',
		},
		{
			name: 'Caja 50 bolsas Zip block Congelar Grande (Jumbo)',
			categoryId: 'Material Requerido',
			teamId: 'Recepción',
			ratio: 0.01,
			unit: 'piezas',
		},
		{
			name: 'Bolsas de palpel grandes para Salida.',
			categoryId: 'Bolsas Salida',
			teamId: 'Bolsas Salida',
			ratio: 0.63,
			unit: 'piezas',
		},
		{
			name: 'Engrapadora',
			categoryId: 'Papelería',
			teamId: 'Papelería',
			ratio: 0.01,
			unit: 'piezas',
		},
		{ name: 'Pavera', categoryId: 'Snacks', teamId: 'Caminantes', ratio: 0.01, unit: 'piezas' },
	];

	const createdItems = await itemRepository.save(
		items.map((item) => {
			const category = createdCategories.find((cat) => cat.name === item.categoryId);
			const team = createdTeams.find((t) => t.name === item.teamId);

			if (!category || !team) {
				throw new Error(`Category ${item.categoryId} or team ${item.teamId} not found`);
			}

			return itemRepository.create({
				id: uuidv4(),
				name: item.name,
				categoryId: category.id,
				teamId: team.id,
				ratio: item.ratio,
				unit: item.unit,
			});
		}),
	);

	console.log('Default inventory data created successfully');
	console.log(
		`Created ${createdCategories.length} categories, ${createdTeams.length} teams, and ${createdItems.length} items`,
	);
};
