import { ServiceTeamType } from '@repo/types';

export interface DefaultServiceTeamTemplate {
	name: string;
	teamType: ServiceTeamType;
	description: string;
	instructions?: string;
	priority: number;
}

const NOTA_DINAMICAS = `\n\n---\n*Las instrucciones detalladas paso a paso deben seguirse del Manual oficial de Emaús de su parroquia/diócesis. Consulte con el Rector del retiro.*`;

export const defaultServiceTeams: DefaultServiceTeamTemplate[] = [
	{
		name: 'Cocina / Comedor',
		teamType: ServiceTeamType.COCINA,
		description: 'Preparación de alimentos y servicio de comedor',
		instructions: `## Equipo de Cocina / Comedor

### Regla Principal
**Ningún servidor come hasta que todos los caminantes estén servidos.** Los servidores comen después, en un segundo turno.

### Responsabilidades
- Preparar desayuno, comida y cena según el menú establecido
- Servir alimentos en el comedor a las horas indicadas
- **Verificar alergias y restricciones alimenticias** de todos los caminantes ANTES de la primera comida (revisar lista proporcionada por el equipo de registro)
- Mantener la cocina limpia y ordenada después de cada comida
- Lavar y guardar todos los utensilios e insumos
- Coordinar con el equipo de snacks para los tiempos entre charlas

### Horarios por Día

#### Viernes
- **Cena**: 8:00 PM (primera comida del retiro — dar la bienvenida con algo especial)

#### Sábado
- **Desayuno**: 7:30 AM
- **Comida**: 1:30 PM
- **Cena**: 7:30 PM

#### Domingo
- **Desayuno**: 7:30 AM
- **Comida de clausura**: 1:30 PM (comida festiva, puede incluir invitados/familiares)

### Notas Importantes
- Tener siempre agua disponible en el comedor y en el salón de charlas
- Preparar suficiente comida considerando servidores + caminantes + sacerdotes
- Coordinar con snacks: no duplicar lo que ya se ofrece entre charlas
- Reportar cualquier incidente alimenticio al equipo de logística inmediatamente`,
		priority: 1,
	},
	{
		name: 'Música y Alabanza',
		teamType: ServiceTeamType.MUSICA,
		description: 'Momentos de alabanza y música durante el retiro',
		instructions: `## Equipo de Música y Alabanza

### Filosofía
La música es un instrumento poderoso que habla directamente al corazón. No se trata de un concierto — se trata de crear un ambiente donde el Espíritu Santo pueda tocar a los caminantes.

### Responsabilidades
- **Ensayar previamente** todo el repertorio (al menos 1-2 ensayos antes del retiro)
- Tener listo el equipo de sonido antes de cada sesión
- Coordinar con el equipo de liturgia para los cantos de la eucaristía
- Preparar letras impresas o proyectadas para que todos puedan cantar
- Adaptar la intensidad musical al momento espiritual

### Momentos de Música

#### Viernes
- Alabanza de apertura (bienvenida, crear ambiente de comunidad)

#### Sábado
- Cantos de apertura de la mañana
- Cantos entre charlas (transiciones suaves, 1-2 canciones)
- Alabanza nocturna (momento profundo de adoración)

#### Domingo
- **Serenata** al amanecer (coordinar con equipo de serenata)
- Cantos de alabanza y acción de gracias
- Música de clausura (celebración, alegría, envío)

### Repertorio Sugerido
- Tener al menos 20-25 cantos preparados de diferentes estilos
- Incluir cantos lentos de adoración y cantos alegres de alabanza
- Cantos conocidos que la comunidad pueda cantar fácilmente
- Tener cantos de respaldo por si el Espíritu guía en otra dirección

### Notas
- Volumen apropiado: que acompañe, no que ensordezca
- Estar atentos a las señales del rector o equipo de logística para iniciar/terminar
- Tener baterías/cables de respaldo para equipos`,
		priority: 2,
	},
	{
		name: 'Palancas',
		teamType: ServiceTeamType.PALANCAS,
		description: 'Recolección y distribución de palancas',
		instructions: `## Equipo de Palancas

### ¿Qué son las Palancas?
Las palancas son cartas, oraciones y muestras de cariño que familiares, amigos y la comunidad escriben para los caminantes. Son uno de los momentos más emotivos del retiro.

### Preparación ANTES del Retiro (Crítico)
1. **Recolectar cartas** de familiares y amigos de cada caminante
   - Solicitar vía email, WhatsApp o entrega física
   - Dar fecha límite de entrega (al menos 3 días antes del retiro)
   - Proporcionar guía de qué escribir: palabras de amor, apoyo, perdón
2. **Recibir palancas de servidores y colaboradores** de la comunidad
3. **Imprimir** las cartas recibidas por email
4. **Organizar por caminante**: usar sobres individuales con el nombre de cada caminante
5. Verificar que TODOS los caminantes tengan al menos una palanca

### Durante el Retiro
- Mantener las palancas en un lugar seguro y privado
- **Distribuir ÚNICAMENTE en el momento indicado** por el rector
- La entrega especial se realiza durante la dinámica de cartas
- Tener pañuelos desechables disponibles (momento muy emotivo)

### Palancas de Servidores
- Los servidores también reciben palancas entre sí
- Coordinar la entrega de palancas de servidores en el momento apropiado

### Notas Importantes
- **Confidencialidad total**: no leer las cartas de los caminantes
- Si falta alguna carta, avisar al rector para coordinar solución
- Tener papel y plumas extra por si algún servidor quiere escribir una palanca adicional`,
		priority: 3,
	},
	{
		name: 'Logística',
		teamType: ServiceTeamType.LOGISTICA,
		description: 'Coordinación general y materiales del retiro',
		instructions: `## Equipo de Logística

### Rol
Son los coordinadores generales del retiro. Aseguran que todo fluya según el programa y que todos los equipos tengan lo que necesitan.

### Preparación Pre-Retiro
- Seleccionar, organizar e imprimir todos los materiales necesarios
- Preparar carpetas/folders para cada charla con sus materiales
- Distribuir responsabilidades entre los miembros del equipo
- Verificar que cada equipo tenga sus instrucciones y materiales
- Revisar el programa completo con el rector

### Durante el Retiro
- **Manejar tiempos y transiciones** entre actividades
- Ser el enlace de comunicación entre todos los equipos
- Resolver imprevistos y tomar decisiones rápidas
- Mantener el programa del retiro actualizado
- Coordinar con el rector cualquier cambio de horario

### Materiales para Preparar
- Materiales para cada charla (hojas de trabajo, lecturas)
- Materiales para dinámicas (según instrucciones específicas)
- Gafetes para caminantes y servidores
- Programa impreso para líderes de equipo
- Lista de contactos de emergencia
- Botiquín de primeros auxilios

### Comunicación
- Definir un método de comunicación rápida entre equipos (radio, WhatsApp, señales)
- Hacer breves reuniones de coordinación al inicio de cada día
- Dar aviso con anticipación (10-15 min) antes de cada cambio de actividad`,
		priority: 4,
	},
	{
		name: 'Limpieza y Orden',
		teamType: ServiceTeamType.LIMPIEZA,
		description: 'Aseo de espacios y turnos de limpieza',
		instructions: `## Equipo de Limpieza y Orden

### Responsabilidades
- Mantener todas las áreas de la casa de retiros limpias y ordenadas
- Crear un ambiente agradable que favorezca la experiencia espiritual

### Áreas y Turnos

#### Baños
- Revisar y limpiar **cada 2-3 horas** durante el día
- Mantener abastecidos: papel higiénico, jabón, toallas de papel
- Limpieza profunda en la mañana y antes de dormir

#### Cocina/Comedor
- Limpiar mesas y pisos después de cada comida
- Coordinar con equipo de cocina (ellos lavan trastes, limpieza limpia el área)

#### Salón de Charlas
- Barrer/trapear al inicio del día
- Recoger basura entre actividades
- Ordenar sillas si se mueven durante dinámicas

#### Áreas Comunes y Exteriores
- Pasillos, escaleras, jardines
- Recoger basura de botes regularmente
- Mantener botes de basura con bolsa

#### Turnos Nocturnos
- Asignar al menos una persona para revisión nocturna de baños
- Verificar que las áreas comunes estén limpias antes de dormir

### Materiales Necesarios
- Escobas, trapeadores, cubetas
- Productos de limpieza (desinfectante, jabón, cloro)
- Bolsas de basura
- Papel higiénico, jabón de manos, toallas de papel (reserva suficiente)
- Guantes de limpieza`,
		priority: 5,
	},
	{
		name: 'Intercesión / Oración',
		teamType: ServiceTeamType.ORACION,
		description: 'Oración continua y turnos de adoración',
		instructions: `## Equipo de Intercesión / Oración

### Misión
El retiro se sostiene en la oración. Este equipo es el motor espiritual invisible que acompaña cada momento del fin de semana.

### Antes del Retiro
- Organizar **días de ayuno** previos al retiro (1-3 días antes)
- Recopilar intenciones específicas de oración por cada caminante
- Preparar el espacio de oración/adoración (capilla o lugar designado)

### Durante el Retiro — Oración Continua 24 Horas
- Organizar turnos de oración para cubrir las 24 horas del retiro
- Cada turno: mínimo 1-2 personas orando
- **Turnos de adoración al Santísimo** (si hay exposición del Santísimo)

### Vigilia Nocturna
- Organizar vigilia de oración la noche del sábado
- Interceder especialmente durante las dinámicas más profundas
- Los intercesores pueden pernoctar en la casa de retiros para facilitar los turnos

### Intenciones de Oración
- Orar por cada caminante **por nombre**
- Orar por los charlistas antes y durante sus charlas
- Orar por el rector y el equipo de logística
- Orar por las familias de los caminantes
- Orar por situaciones difíciles que surjan durante el retiro

### Organización de Turnos
| Horario | Viernes | Sábado | Domingo |
|---------|---------|--------|---------|
| 6:00-9:00 | — | Turno 1 | Turno 1 |
| 9:00-12:00 | — | Turno 2 | Turno 2 |
| 12:00-15:00 | — | Turno 3 | — |
| 15:00-18:00 | — | Turno 4 | — |
| 18:00-21:00 | Turno 1 | Turno 5 | — |
| 21:00-00:00 | Turno 2 | Turno 6 (Vigilia) | — |
| 00:00-3:00 | Turno 3 | Turno 7 (Vigilia) | — |
| 3:00-6:00 | Turno 4 | Turno 8 (Vigilia) | — |`,
		priority: 6,
	},
	{
		name: 'Liturgia',
		teamType: ServiceTeamType.LITURGIA,
		description: 'Preparación de eucaristía y lecturas',
		instructions: `## Equipo de Liturgia

### Responsabilidades
Preparar todo lo necesario para las celebraciones litúrgicas y momentos de oración comunitaria.

### Preparación del Espacio Litúrgico
- **Altar**: mantel, cruz, cirios, flores
- **Velas**: suficientes para procesiones y momentos de oración
- **Vestiduras litúrgicas**: alba, estola, casulla para el sacerdote
- **Vasos sagrados**: cáliz, patena, copón, vinajeras
- Rosarios (si se rezará el rosario comunitario)

### Coordinación con el Sacerdote
- Confirmar horarios de eucaristía y sacramento de reconciliación
- Coordinar lecturas, moniciones y oración de los fieles
- Preparar lo necesario para la confesión (sillas, lugar privado, estola morada)
- Verificar intenciones de misa

### Lecturas y Participación
- Asignar lectores para cada celebración
- Preparar hojas con las lecturas impresas
- Preparar moniciones (introducciones a las lecturas)
- Preparar oración universal / oración de los fieles

### Materiales Especiales
- **Hojas de oración** para los caminantes
- **Examen de conciencia** impreso para antes de la reconciliación
- Preparar ofrendas para la procesión de ofertorio
- Cancioneros o proyección de cantos litúrgicos

### Sacramento de Reconciliación
- Coordinar horario con el sacerdote (usualmente sábado por la noche)
- Preparar el espacio: lugar privado, iluminación adecuada, crucifijo
- Distribuir exámenes de conciencia con anticipación
- Organizar el flujo de caminantes para evitar aglomeraciones

### Coordinación con Otros Equipos
- **Música**: cantos litúrgicos apropiados para cada momento
- **Salón**: disposición del espacio para la eucaristía
- **Logística**: horarios de las celebraciones`,
		priority: 7,
	},
	{
		name: 'Bienvenida / Registro',
		teamType: ServiceTeamType.BIENVENIDA,
		description: 'Recepción, equipaje y registro de caminantes',
		instructions: `## Equipo de Bienvenida / Registro

### Viernes — Recepción de Caminantes

#### Antes de la Llegada
- Preparar mesa de registro con listas impresas
- Tener gafetes listos con nombres de caminantes
- Preparar materiales de bienvenida (carpeta, libreta, pluma)
- Conocer la asignación de cuartos para guiar a cada caminante

#### Al Llegar los Caminantes
1. **Recibir con alegría** — primera impresión del retiro
2. **Confirmar asistencia** y verificar datos de contacto/emergencia
3. **Procesar equipaje**: ayudar a bajar maletas, indicar dónde dejarlo
4. **Entregar gafete** y materiales iniciales
5. **Guiar a habitaciones**: acompañar personalmente al caminante a su cuarto
6. **Entregar rosario** (si aplica según la tradición de la comunidad)

#### Registro de Datos
- Verificar nombre completo, teléfono de emergencia
- Confirmar alergias o condiciones médicas
- Registrar hora de llegada
- Notificar a logística cuando todos los caminantes hayan llegado

### Durante el Retiro
- Estar disponibles para preguntas de los caminantes
- Coordinar con transporte si algún caminante llega tarde

### Materiales Necesarios
- Lista impresa de caminantes con datos
- Gafetes (caminantes con un color, servidores con otro)
- Carpetas de bienvenida
- Plumas, libretas
- Rosarios (si aplica)
- Mapa de la casa de retiros (si la casa es grande)`,
		priority: 8,
	},
	{
		name: 'Salón',
		teamType: ServiceTeamType.SALON,
		description: 'Decoración y preparación del salón de charlas',
		instructions: `## Equipo de Salón

### Responsabilidades
El salón es el espacio principal donde suceden las charlas y dinámicas. La decoración y ambiente deben acompañar el proceso espiritual de los caminantes.

### Decoración por Momentos
- **Cada charla puede tener una temática visual diferente** — coordinar con el rector y logística
- Cambiar elementos decorativos entre charlas/dinámicas según se indique
- Usar mantas, imágenes, símbolos que refuercen el mensaje de cada charla

### Preparación del Espacio
- Organizar sillas y mesas según el formato de cada actividad:
  - **Charlas**: sillas en semicírculo o filas, mirando al frente
  - **Dinámicas grupales**: mesas redondas con sillas
  - **Oración/Adoración**: disposición más íntima
- Colocar letreros, carteles y materiales visuales
- Verificar iluminación apropiada para cada momento
- Asegurar que el proyector/pantalla funcione (si se usa)

### Materiales
- Telas, manteles de colores para decorar
- Flores naturales o artificiales
- Imágenes religiosas, crucifijos
- Velas (eléctricas o reales según permisos del lugar)
- Letreros y materiales visuales para cada charla
- Cinta adhesiva, tijeras, alfileres, hilo

### Coordinación
- Recibir del equipo de logística los materiales específicos por charla
- Coordinar con música la ubicación de instrumentos y equipo de sonido
- Avisar a logística cuando el salón esté listo para la siguiente actividad`,
		priority: 9,
	},
	{
		name: 'Cuartos',
		teamType: ServiceTeamType.CUARTOS,
		description: 'Preparación de habitaciones',
		instructions: `## Equipo de Cuartos

### Antes de la Llegada (Viernes Temprano)
1. **Preparar cada habitación**:
   - Colocar el **nombre del caminante en la puerta** del cuarto
   - Verificar que cada cama tenga sábanas, almohada y cobija
   - Colocar toalla si la casa de retiros no las provee
2. **Colocar detalles/palancas en las camas** (coordinar con equipo de palancas):
   - Carta de bienvenida
   - Pequeños regalos o detalles del equipo de servidores
3. **Revisar que funcione**: luz, baño, regadera, chapas de puertas

### Durante el Retiro
- Mantener pasillos y áreas de cuartos limpios
- Verificar que los baños de las habitaciones estén abastecidos
- Coordinar con limpieza para aseo de cuartos si es necesario
- Estar pendientes de cualquier necesidad de los caminantes con su habitación

### Detalles Especiales
- Según indique el rector, colocar palancas o detalles adicionales en las camas durante el retiro (mientras los caminantes están en charlas)
- Estos detalles sorpresa son parte de la experiencia del retiro

### Notas
- Respetar la privacidad de los caminantes
- No entrar a los cuartos cuando los caminantes estén descansando
- Reportar cualquier problema de mantenimiento a logística`,
		priority: 10,
	},
	{
		name: 'Transporte',
		teamType: ServiceTeamType.TRANSPORTE,
		description: 'Logística de transporte de caminantes y servidores',
		instructions: `## Equipo de Transporte

### Antes del Retiro
- Definir el **punto de encuentro** para la salida del viernes
- Organizar vehículos suficientes y confirmar conductores
- Planear rutas al lugar del retiro
- Coordinar transporte de materiales y suministros (comida, decoración, equipo de sonido)

### Viernes — Llegada
- Recibir a los caminantes en el punto de encuentro
- Verificar que todos los caminantes registrados estén presentes antes de salir
- Transportar equipaje de los caminantes
- Si hay caminantes que llegan por su cuenta, darles indicaciones claras

### Durante el Retiro
- Estar disponibles para emergencias de transporte
- Transportar sacerdotes u otros invitados si es necesario
- Hacer viajes por suministros que hagan falta

### Domingo — Salida
- Coordinar la salida final después de la comida de clausura
- Organizar vehículos para el regreso
- Verificar que nadie olvide pertenencias
- Asegurar que todos los caminantes tengan transporte de regreso

### Lista de Verificación
- [ ] Vehículos confirmados con gasolina suficiente
- [ ] Conductores asignados con licencia vigente
- [ ] Ruta al lugar de retiro (compartida con todos los conductores)
- [ ] Números de teléfono de todos los conductores
- [ ] Plan B en caso de vehículo descompuesto`,
		priority: 11,
	},
	{
		name: 'Snacks',
		teamType: ServiceTeamType.SNACKS,
		description: 'Preparación de snacks y bebidas entre actividades',
		instructions: `## Equipo de Snacks

### Responsabilidad Principal
Mantener **café, té y bebidas calientes siempre disponibles** durante todo el retiro. Preparar snacks para los tiempos entre charlas.

### Estación de Bebidas (Permanente)
- Café caliente (regular y descafeinado si es posible)
- Agua caliente para té (variedad de tés)
- Agua fresca / agua natural
- Azúcar, sustituto de azúcar, crema para café
- Vasos desechables, cucharas, servilletas

### Snacks entre Charlas
- Preparar mesa de snacks 10 minutos antes de cada receso
- Galletas, fruta picada, pan dulce, cacahuates, etc.
- Variar la oferta en cada receso
- Recoger y limpiar la mesa al terminar el receso

### Horarios de Recesos
Coordinar con logística los horarios exactos. Generalmente:
- **Sábado**: 2-3 recesos entre charlas (mañana y tarde)
- **Domingo**: 1-2 recesos

### Coordinación con Cocina
- No duplicar lo que cocina ya preparó
- Avisar a cocina si se necesita reabastecer agua caliente
- Coordinar el uso del espacio si la estación está cerca de la cocina

### Notas
- Verificar alergias/restricciones (lista del equipo de registro)
- Tener siempre bolsa de basura cerca de la mesa de snacks
- Limpiar cualquier derrame inmediatamente`,
		priority: 12,
	},
	{
		name: 'Dinámica de la Pared',
		teamType: ServiceTeamType.DINAMICA,
		description: 'Dinámica espiritual de la Pared',
		instructions: `## Dinámica de la Pared

### Contexto
Esta dinámica está relacionada con la **confianza y el examen de conciencia**. Se realiza generalmente el **sábado por la noche**, antes del sacramento de la reconciliación. Es uno de los momentos más profundos e impactantes del retiro.

### Preparación del Espacio
- Preparar el espacio según las indicaciones del manual oficial
- Reunir todos los materiales necesarios con anticipación
- Verificar que el espacio esté listo al menos 1 hora antes de la dinámica
- Coordinar iluminación especial (tenue, velas)

### Equipo de Apoyo
- **Equipo médico/primeros auxilios** debe estar presente y pendiente
- Tener agua y pañuelos disponibles
- Servidores de apoyo emocional capacitados deben estar cerca
- Mantener un ambiente de respeto y silencio

### Durante la Dinámica
- Seguir las instrucciones del Manual oficial **paso a paso**
- El rector guía la dinámica — el equipo apoya según se indique
- Mantener la reverencia y solemnidad del momento
- Estar atentos a caminantes que necesiten apoyo emocional

### Después de la Dinámica
- Coordinar transición hacia el sacramento de reconciliación
- Limpiar y recoger el espacio
- Los materiales utilizados deben desecharse con respeto

### Materiales
- Según el Manual oficial de Emaús de su comunidad

### ⚠️ Confidencialidad
**No divulgar los detalles de esta dinámica a los caminantes antes del retiro.** La sorpresa y espontaneidad son esenciales para la experiencia.

---
*Las instrucciones detalladas paso a paso deben seguirse del Manual oficial de Emaús de su parroquia/diócesis. Consulte con el Rector del retiro.*`,
		priority: 13,
	},
	{
		name: 'Serenata',
		teamType: ServiceTeamType.DINAMICA,
		description: 'Dinámica de la Serenata',
		instructions: `## Serenata

### Contexto
La serenata se realiza el **domingo temprano por la mañana**. Los servidores cantan a los caminantes como una celebración **en honor a Cristo Resucitado** y como muestra del amor de la comunidad. Es un momento de profunda alegría y emoción.

### Preparación
- **Ensayar los cantos** con el equipo de música (al menos 1 ensayo previo)
- Preparar velas o lámparas para cada servidor participante
- Coordinar la hora exacta con logística y el rector
- Definir el recorrido (por los cuartos de los caminantes)

### Desarrollo de la Serenata
1. Los servidores se reúnen **en silencio** en el punto acordado
2. Encender velas/lámparas
3. Caminar en procesión hacia los cuartos de los caminantes
4. Comenzar a cantar suavemente, aumentando gradualmente
5. Invitar a los caminantes a despertar y unirse
6. Guiar a todos hacia el salón o capilla
7. Cerrar con una oración comunitaria de acción de gracias

### Cantos Sugeridos
- Cantos de resurrección y vida nueva
- Cantos de alabanza y agradecimiento
- Cantos alegres que inviten a celebrar

### Reglas Importantes
- **No actos de afecto físico** entre servidores y caminantes durante la serenata
- Mantener el enfoque en Cristo y la comunidad
- Ser respetuosos con el despertar de los caminantes
- Cuidar las velas para evitar accidentes

### ⚠️ Confidencialidad
**No divulgar esta actividad a los caminantes antes del retiro.** La sorpresa es parte fundamental de la experiencia.

---
*Las instrucciones detalladas paso a paso deben seguirse del Manual oficial de Emaús de su parroquia/diócesis. Consulte con el Rector del retiro.*`,
		priority: 14,
	},
	{
		name: 'Dinámica del Perdón / Clausura',
		teamType: ServiceTeamType.DINAMICA,
		description: 'Dinámica de reconciliación y cierre del retiro',
		instructions: `## Dinámica del Perdón / Clausura

### Contexto
Esta dinámica marca el cierre espiritual del retiro. Es un momento de **reconciliación, perdón y celebración** de la transformación vivida durante el fin de semana. Generalmente se realiza el **domingo antes de la misa de clausura**.

### Preparación del Espacio
- Iluminación tenue (velas, luces bajas)
- Disposición del espacio que invite a la intimidad y reflexión
- Música suave de fondo (coordinar con equipo de música)
- Materiales de escritura en cada lugar

### Desarrollo de la Dinámica
1. **Meditación guiada** sobre el perdón — dirigida por el rector
2. Los caminantes reflexionan sobre personas a quienes necesitan perdonar y de quienes necesitan pedir perdón
3. **Momento de reconciliación** entre caminantes y con los servidores
4. Cierre con el **abrazo de la paz**
5. Transición hacia la misa de clausura

### Misa de Clausura
- Celebración eucarística que sella la experiencia del retiro
- Momento de envío: los caminantes son ahora parte de la comunidad
- Coordinar con equipo de liturgia todos los elementos
- Invitar a familiares si es tradición de la comunidad

### Materiales
- Papel y sobres para cartas de perdón
- Plumas/bolígrafos suficientes
- Velas (una por participante si es posible)
- Pañuelos desechables
- Música suave de fondo preparada

### Después de la Clausura
- Comida festiva de cierre con todos (caminantes, servidores, invitados)
- Fotos grupales
- Entrega de certificados o recuerdos (si aplica)
- Intercambio de datos de contacto para mantener la comunidad

### ⚠️ Confidencialidad
**No divulgar los detalles de esta dinámica a los caminantes antes del retiro.** La experiencia debe ser vivida sin expectativas previas.

---
*Las instrucciones detalladas paso a paso deben seguirse del Manual oficial de Emaús de su parroquia/diócesis. Consulte con el Rector del retiro.*`,
		priority: 15,
	},
	{
		name: 'Dinámica de la Rosa',
		teamType: ServiceTeamType.DINAMICA,
		description: 'Dinámica de apertura con la rosa',
		instructions: `## Dinámica de la Rosa

### Contexto
La Dinámica de la Rosa es una de las **primeras actividades del retiro** (viernes por la noche). Sirve como dinámica de apertura para que los caminantes comiencen su proceso de reflexión personal y se abran a la experiencia espiritual del fin de semana.

### Propósito
- Romper el hielo y crear un ambiente de confianza
- Invitar a los caminantes a la introspección desde el inicio
- Simbolizar la belleza interior de cada persona y su relación con Dios
- Preparar el corazón para las charlas y dinámicas que seguirán

### Preparación
- Conseguir una rosa natural por cada caminante (o una rosa para el grupo, según la tradición de la comunidad)
- Preparar el espacio con iluminación apropiada
- Tener música suave de fondo
- Coordinar con el rector el momento exacto y el guión de la reflexión

### Materiales
- Rosas naturales (rojas, preferentemente)
- Velas
- Música ambiental suave
- Texto de reflexión/meditación (proporcionado por el rector)

### ⚠️ Confidencialidad
**No divulgar los detalles de esta dinámica a los caminantes antes del retiro.** La sorpresa es parte fundamental de la experiencia.

---
*Las instrucciones detalladas paso a paso deben seguirse del Manual oficial de Emaús de su parroquia/diócesis. Consulte con el Rector del retiro.*`,
		priority: 16,
	},
	{
		name: 'Dinámica de las Máscaras',
		teamType: ServiceTeamType.DINAMICA,
		description: 'Dinámica de las máscaras — autenticidad y vulnerabilidad',
		instructions: `## Dinámica de las Máscaras

### Contexto
Esta dinámica invita a los caminantes a reflexionar sobre las **máscaras que usamos en la vida cotidiana** — las apariencias, los miedos, las defensas que nos impiden ser auténticos ante Dios y ante los demás.

### Propósito
- Reflexionar sobre cómo nos proyectamos ante el mundo por miedo a ser juzgados
- Identificar las máscaras que nos ponemos (perfección, fortaleza, indiferencia, etc.)
- Invitar a la vulnerabilidad y autenticidad
- Preparar el corazón para un encuentro más profundo con Dios

### Preparación del Espacio
- Ambiente a oscuras con una luz focal
- Los servidores aparecen uno a uno con máscaras de papel
- Cada servidor se quita la máscara y comparte brevemente su testimonio
- Se invita a los caminantes a reflexionar sobre sus propias máscaras

### Materiales
- Máscaras de papel o cartón (blancas, una por servidor participante)
- Luz focal o linterna
- Música de fondo suave
- Papel y plumas para que los caminantes escriban sus reflexiones

### Desarrollo
1. Oscurecer el salón completamente
2. Los servidores entran uno por uno, iluminados por la luz focal
3. Cada uno porta una máscara y comparte qué máscara usaba en su vida
4. Se quitan la máscara como símbolo de autenticidad
5. Se invita a los caminantes a compartir cuáles son sus máscaras (voluntario)
6. Cierre con oración pidiendo la gracia de ser auténticos

### ⚠️ Confidencialidad
**No divulgar los detalles de esta dinámica a los caminantes antes del retiro.**

---
*Las instrucciones detalladas paso a paso deben seguirse del Manual oficial de Emaús de su parroquia/diócesis. Consulte con el Rector del retiro.*`,
		priority: 17,
	},
	{
		name: 'Sanación de los Recuerdos',
		teamType: ServiceTeamType.DINAMICA,
		description: 'Dinámica de sanación interior y oración de sanación',
		instructions: `## Sanación de los Recuerdos

### Contexto
La Sanación de los Recuerdos es una dinámica profunda donde los caminantes son guiados a **revisar su historia personal** y permitir que Dios sane las heridas del pasado. Es uno de los momentos más transformadores del retiro.

### Propósito
- Guiar a los caminantes en una revisión de su historia personal ("Película de la Vida")
- Identificar heridas, resentimientos y momentos dolorosos no sanados
- Llevar esas heridas ante Dios en oración para recibir sanación
- Liberar cargas emocionales y espirituales del pasado

### Preparación
- Espacio íntimo y recogido (iluminación tenue)
- Música suave de oración de fondo
- Pañuelos desechables disponibles (momento muy emotivo)
- Servidores de apoyo emocional distribuidos por el salón
- Agua disponible

### Desarrollo
1. El rector o charlista guía una **meditación/oración de sanación**
2. Se invita a recorrer cronológicamente la vida: infancia, adolescencia, juventud, presente
3. En cada etapa, identificar relaciones y heridas con Dios, consigo mismo y con otros
4. Se ora específicamente por la sanación de cada recuerdo doloroso
5. Momento de silencio personal
6. Oración comunitaria de cierre

### Equipo de Apoyo
- Tener servidores capacitados para acompañar emocionalmente
- Estar atentos a caminantes que necesiten apoyo individual
- Respetar el proceso de cada persona — no forzar reacciones
- Tener agua y pañuelos accesibles

### Materiales
- Hojas para la "Película de la Vida" (cronología personal)
- Plumas/bolígrafos
- Pañuelos desechables
- Velas
- Música de oración preparada

### ⚠️ Confidencialidad
**No divulgar los detalles de esta dinámica a los caminantes antes del retiro.**

---
*Las instrucciones detalladas paso a paso deben seguirse del Manual oficial de Emaús de su parroquia/diócesis. Consulte con el Rector del retiro.*`,
		priority: 18,
	},
	{
		name: 'Reglas del Retiro',
		teamType: ServiceTeamType.OTRO,
		description: 'Normas de convivencia y reglamento para caminantes',
		instructions: `## Reglas del Retiro — Normas de Convivencia

### Para Leer a los Caminantes al Inicio del Retiro

Estas normas existen para crear un ambiente de respeto, reflexión y encuentro espiritual. Les pedimos su colaboración para que todos puedan vivir esta experiencia plenamente.

### 1. Celulares y Dispositivos Electrónicos
- **Se pide entregar el celular y reloj** al equipo de registro al llegar
- Se guardarán en un sobre con su nombre y serán devueltos al final del retiro
- El mundo puede esperar 48 horas — este tiempo es para ti y para Dios
- Si hay una emergencia familiar, el equipo de logística tiene comunicación con el exterior

### 2. Confidencialidad
- **Lo que se comparte en el retiro, se queda en el retiro**
- Respetamos la privacidad de cada persona y sus testimonios
- No se permite grabar audio, video ni tomar fotografías durante las dinámicas
- Después del retiro, puedes compartir tu propia experiencia pero nunca la de otros

### 3. Puntualidad
- Respetar los horarios de cada actividad
- Llegar al salón **5 minutos antes** de cada charla o dinámica
- Los horarios de comida deben respetarse para que el equipo de cocina pueda servir a todos

### 4. Participación
- La participación en las dinámicas es **voluntaria** — nadie será obligado a hablar o compartir
- Sin embargo, se invita a mantener una actitud abierta y receptiva
- Escuchar con respeto cuando otros comparten sus testimonios

### 5. Convivencia
- Tratar a todos con respeto y caridad
- No se permiten bebidas alcohólicas ni sustancias prohibidas
- No se permite salir de la casa de retiros sin autorización
- Respetar los horarios de descanso y silencio nocturno
- Mantener limpias las áreas comunes y habitaciones

### 6. Libertad
- La puerta siempre está abierta — nadie está obligado a quedarse
- Si alguien necesita retirarse, puede hacerlo en cualquier momento hablando con el rector
- Sin embargo, se invita a dar la oportunidad completa a la experiencia antes de tomar esa decisión

### 7. Salud y Seguridad
- Informar al equipo de registro sobre alergias, medicamentos o condiciones médicas
- Si se siente mal durante el retiro, avisar inmediatamente a cualquier servidor
- El equipo de logística tiene un botiquín de primeros auxilios

### 8. Actitud
- Venir con el corazón abierto y sin expectativas
- Dejar los prejuicios fuera
- Permitirse sentir, llorar, reír y ser vulnerable
- Confiar en el proceso

---
*Estas reglas pueden ser adaptadas según las necesidades de cada comunidad y casa de retiros.*`,
		priority: 19,
	},
	{
		name: 'Rosario en Cadena',
		teamType: ServiceTeamType.OTRO,
		description: 'Cadena de oración del rosario con familias',
		instructions: `## Rosario en Cadena

### ¿Qué es?
El Rosario en Cadena es una **cadena de oración organizada con las familias** de los caminantes durante el retiro. Mientras los caminantes viven su experiencia, sus seres queridos oran por ellos desde casa o en la parroquia.

### Preparación ANTES del Retiro
1. Contactar a los familiares de cada caminante (padres, esposo/a, hijos, amigos cercanos)
2. Asignar **turnos de oración** por hora durante el fin de semana
3. Cada turno: un familiar o grupo reza un rosario completo o un misterio
4. Entregar a cada familia su horario asignado
5. Preparar un cartel con los nombres de las familias que están orando

### Durante el Retiro
- Colocar el cartel del Rosario en Cadena en un lugar visible para los caminantes
- Actualizar si es posible quién está orando en cada momento
- Los caminantes se conmueven al saber que sus familias están orando por ellos
- Este cartel se muestra en el momento indicado por el rector

### Organización de Turnos
- Cubrir desde el viernes por la noche hasta el domingo por la tarde
- Cada turno: 1 hora (un rosario completo toma ~20 minutos, pero se asigna la hora)
- Tener turnos de respaldo por si alguna familia no puede cumplir
- Incluir conventos o grupos de oración de la parroquia si es posible

### Materiales
- Lista impresa de turnos con nombres de familias
- Cartel grande para exhibir durante el retiro
- Comunicación a familias (WhatsApp, llamada, impreso)`,
		priority: 20,
	},
	{
		name: 'Trabajo de Pasillo',
		teamType: ServiceTeamType.OTRO,
		description: 'Acompañamiento personal a caminantes entre actividades',
		instructions: `## Trabajo de Pasillo

### ¿Qué es?
El Trabajo de Pasillo es considerado **una de las labores más importantes pero menos visibles** del retiro. Consiste en el acompañamiento personal, el diálogo y el compartir con los caminantes en los momentos entre actividades.

### Filosofía
"Antes de hablarle a los hombres de Dios, hay que hablarle mucho a Dios de esos hombres." El servidor de pasillo no impone — **escucha, acompaña y está presente**.

### Responsabilidades
- Estar disponible en los pasillos, jardines y áreas comunes durante los recesos
- Acercarse con naturalidad a los caminantes que se vean solos o pensativos
- **Escuchar más que hablar** — el caminante necesita ser escuchado
- Compartir la propia experiencia solo si el caminante lo pide o si surge naturalmente
- No forzar conversaciones ni dinámicas fuera de programa

### Actitudes del Servidor de Pasillo
- **Humildad**: mirar desde abajo, no desde arriba
- **Disponibilidad**: estar presente sin ser invasivo
- **Paciencia**: respetar los tiempos de cada caminante
- **Discreción**: lo que un caminante comparte en el pasillo es confidencial
- **Oración**: orar internamente por el caminante mientras se acompaña

### Momentos Clave
- Después de charlas profundas (el caminante puede necesitar procesar)
- Durante las comidas (sentarse con los caminantes, no solo entre servidores)
- En los recesos de snacks
- Antes de dormir (algunos caminantes necesitan hablar)

### Notas Importantes
- **No dar consejos psicológicos** — somos acompañantes espirituales, no terapeutas
- Si un caminante muestra señales de crisis seria, avisar al rector inmediatamente
- Nunca minimizar el dolor o las emociones de un caminante
- Recordar que la conversión es obra de Dios, no nuestra`,
		priority: 21,
	},
	{
		name: 'Líder de Mesa (Primero de Mesa)',
		teamType: ServiceTeamType.OTRO,
		description: 'Responsabilidades del líder principal de mesa',
		instructions: `## Líder de Mesa (Primero de Mesa)

### ¿Qué es?
El Líder de Mesa es el **facilitador principal** del pequeño grupo de caminantes asignados a su mesa. Es el monitor y guía — de una manera muy sutil — de los caminantes durante todo el retiro. Representa el ejemplo vivo de Cristo para los caminantes de su mesa.

### Cualidades Requeridas
- **Maduro y discreto** — alguien confiable para que el caminante se abra
- **Buen escucha y humilde** — no protagonista
- **Promotor del diálogo participativo** — que todos hablen, no solo uno
- Habilidades de comunicación efectivas y empatía
- Capacidad de facilitar conversaciones profundas

### Antes del Retiro
- Participar en los **rodajes** (reuniones de preparación del equipo)
- Conocer el programa completo y el orden de charlas/dinámicas
- Orar por cada caminante de su mesa por nombre
- Preparar su propio testimonio de compartir (breve, honesto, vulnerable)

### Funciones Durante el Retiro

#### Facilitar el Compartir después de cada Charla
1. Después de cada charla, el rector indica que es momento de compartir en mesa
2. El líder **inicia la oración** — se pasa el crucifijo de mano en mano
3. Cada persona ora en voz alta sosteniendo el crucifijo (voluntario)
4. El colíder (segundo de mesa) cierra la oración
5. El líder **abre el diálogo** con una pregunta o reflexión sencilla
6. Comparte primero brevemente su propia experiencia para romper el hielo
7. Invita a cada caminante a compartir — **sin presionar**
8. No permite que una sola persona domine la conversación
9. Escucha activamente, asiente, valida sentimientos

#### Postura y Ubicación
- Sentarse de modo que pueda **ver a todos los caminantes** de su mesa
- Sentarse de espaldas al charlista para que los caminantes queden de frente
- Estar atento a las reacciones de los caminantes durante las charlas

#### Acompañamiento Continuo
- Mostrar un ambiente **positivo y familiar**, de manera informal
- Tratar de que los caminantes se abran al diálogo con naturalidad
- No mostrar signos de ser servidor (en retiros donde los líderes son "incógnitos")
- Estar disponible en comidas, recesos y momentos libres
- Dar seguimiento a los caminantes de su mesa **durante y después del retiro**

### Ejercicios de Oración en Mesa
El líder facilita dos ejercicios especiales de oración con su mesa:

#### Oración de Acción de Gracias (Sábado)
- Guiar a los caminantes a dar gracias a Dios en voz alta
- Promover la apertura — que cada uno comparta por qué agradece
- Usar el crucifijo como símbolo de quién habla

#### Oración de Petición (Domingo)
- Guiar a los caminantes a hacer peticiones a Dios en voz alta
- Interceder unos por otros — cada caminante pide por las intenciones de los demás
- Momento profundo de comunidad y vulnerabilidad

### Notas Importantes
- **Tu liderazgo debe ser sutil pero no invisible**
- Los caminantes son también peregrinos — no asumas privilegios
- No tomes orgullo falso por haber hecho el retiro antes
- Afirma a cada persona por quien es y donde está en su camino de fe
- Si un caminante no quiere hablar, respétalo completamente`,
		priority: 22,
	},
	{
		name: 'Colíder de Mesa (Segundo de Mesa)',
		teamType: ServiceTeamType.OTRO,
		description: 'Responsabilidades del colíder / segundo de mesa',
		instructions: `## Colíder de Mesa (Segundo de Mesa)

### ¿Qué es?
El Colíder o Segundo de Mesa es el **apoyo directo del Líder de Mesa**. Actúa como un caminante cooperativo modelo — sigue indicaciones, es puntual, y ayuda a mantener las dinámicas de mesa en buen camino.

### Diferencia con el Líder de Mesa
- El **Líder** abre las dinámicas y guía el compartir
- El **Colíder** apoya, cierra oraciones, y modela la participación
- Si el líder inicia la oración, el colíder la cierra
- Si el líder hace la primera reflexión, el colíder puede ser el segundo en compartir para animar a los demás

### Funciones Principales

#### Durante la Oración en Mesa
- **Cerrar la oración** cuando el crucifijo llega al final de la ronda
- Si uno o más caminantes deciden no orar en voz alta, el colíder puede no orar en voz alta tampoco (para que no se sientan solos)
- Estar preparado para cerrar el tiempo de oración en cualquier momento

#### Durante el Compartir
- Modelar la participación: compartir con honestidad y brevedad
- Ayudar a mantener la discusión en tema
- Animar a los caminantes callados a participar (con sutileza)
- Si alguien domina la conversación, ayudar a redirigir amablemente
- Complementar al líder — si el líder olvida algo, el colíder lo cubre

#### Apoyo Logístico en Mesa
- Asegurar que los materiales estén en la mesa (hojas, plumas, etc.)
- Estar pendiente del tiempo — avisar al líder si se extienden demasiado
- Coordinar con logística si hace falta algo en la mesa

### Actitudes del Colíder
- **Cooperación**: trabajar en equipo con el líder, nunca competir
- **Discreción**: apoyar sin llamar la atención
- **Disponibilidad**: estar presente para los caminantes fuera de las sesiones
- **Sensibilidad**: detectar caminantes que necesiten atención especial
- **Flexibilidad**: adaptarse al estilo del líder de mesa

### Coordinación con el Líder
- Reunirse brevemente con el líder al inicio de cada día para coordinar
- Compartir observaciones sobre los caminantes de la mesa
- Dividir responsabilidades de acompañamiento fuera de sesiones
- Si el líder necesita un descanso, el colíder puede tomar la guía temporalmente

### Notas Importantes
- El colíder NO es un rol inferior — es un rol complementario esencial
- Ambos (líder y colíder) son responsables del bienestar de los caminantes de su mesa
- Mantener comunicación constante con el líder sobre lo que observan`,
		priority: 23,
	},
	{
		name: 'Oración por Intercesión en Mesa',
		teamType: ServiceTeamType.DINAMICA,
		description: 'Ejercicios de oración de acción de gracias y petición en mesa',
		instructions: `## Oración por Intercesión en Mesa

### Contexto
Durante el retiro se realizan **ejercicios de oración grupal en cada mesa**, donde los caminantes aprenden a orar en voz alta, a interceder unos por otros, y a experimentar la oración comunitaria. Estos son momentos profundos donde muchos caminantes oran en voz alta por primera vez en su vida.

### Los Dos Ejercicios de Oración

#### 1. Oración de Acción de Gracias (Sábado por la tarde)

**Propósito**: Que los caminantes reconozcan y agradezcan las bendiciones de Dios en sus vidas.

**Desarrollo**:
1. El líder de mesa explica brevemente la dinámica
2. Se coloca el **crucifijo** en el centro de la mesa
3. El líder toma el crucifijo y hace una breve oración de acción de gracias
4. Pasa el crucifijo al siguiente caminante
5. Cada persona **ora en voz alta** dando gracias a Dios (por su familia, salud, este retiro, etc.)
6. Si alguien no desea orar en voz alta, simplemente pasa el crucifijo — **sin presión**
7. El colíder cierra la oración
8. Momento de silencio

**Para el líder**:
- Dar un ejemplo breve y sencillo al iniciar ("Gracias Señor por mi familia, por estar aquí...")
- Promover la apertura — que cada caminante comparta desde el corazón
- Validar cada oración con un gesto o un "amén"

#### 2. Oración de Petición / Intercesión (Domingo por la mañana)

**Propósito**: Que los caminantes intercedan unos por otros, pidiendo a Dios por las necesidades de sus compañeros de mesa.

**Desarrollo**:
1. El líder invita a cada caminante a compartir brevemente una intención de oración
2. Cada persona comparte su petición (salud de un familiar, reconciliación, trabajo, etc.)
3. Después de que todos comparten, se pasa el crucifijo
4. Cada caminante **ora por las intenciones de los demás** — no por las propias
5. Este acto de interceder por el otro crea un vínculo profundo de comunidad
6. El colíder cierra con una oración que recoja todas las intenciones

**Para el líder**:
- Este es generalmente el momento más emotivo del retiro en las mesas
- Tener pañuelos disponibles
- Dar tiempo suficiente — no apurar
- Si alguien llora, permitir el momento — no interrumpir

### Uso del Crucifijo
- El crucifijo se usa como **símbolo de quién tiene la palabra**
- Solo habla quien sostiene el crucifijo
- Esto evita interrupciones y crea un ambiente de escucha respetuosa
- El crucifijo representa que estamos hablando ante Cristo

### Preparación
- Cada mesa debe tener un crucifijo pequeño
- Verificar que hay pañuelos desechables en cada mesa
- El líder debe haber practicado antes cómo guiar estos ejercicios
- Coordinar con logística el momento exacto dentro del programa

### Notas Importantes
- **Nunca obligar** a nadie a orar en voz alta
- Si un caminante se emociona mucho, darle espacio y tiempo
- Estos ejercicios son progresivos: primero dar gracias (más fácil), luego pedir (más vulnerable)
- Muchos caminantes dicen que estos momentos fueron los más impactantes del retiro

---
*Las instrucciones detalladas paso a paso deben seguirse del Manual oficial de Emaús de su parroquia/diócesis. Consulte con el Rector del retiro.*`,
		priority: 24,
	},
];
