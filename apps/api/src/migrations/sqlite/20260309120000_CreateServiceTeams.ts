import { MigrationInterface, QueryRunner } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { charlaDocumentation, responsibilityDocumentation } from '../../data/charlaDocumentation.js';
import { defaultCharlas } from '../../data/serviceTeamData.js';

// ─── All service teams (25 total) ───────────────────────────────────────────

const allServiceTeams = [
	{
		name: 'Cocina / Comedor',
		teamType: 'cocina',
		priority: 1,
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
	},
	{
		name: 'Música y Alabanza',
		teamType: 'musica',
		priority: 2,
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
	},
	{
		name: 'Palancas',
		teamType: 'palancas',
		priority: 3,
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
	},
	{
		name: 'Logística',
		teamType: 'logistica',
		priority: 4,
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
	},
	{
		name: 'Limpieza y Orden',
		teamType: 'limpieza',
		priority: 5,
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
	},
	{
		name: 'Intercesión / Oración',
		teamType: 'oracion',
		priority: 6,
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
	},
	{
		name: 'Liturgia',
		teamType: 'liturgia',
		priority: 7,
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
	},
	{
		name: 'Bienvenida / Registro',
		teamType: 'bienvenida',
		priority: 8,
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
	},
	{
		name: 'Salón',
		teamType: 'salon',
		priority: 9,
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
	},
	{
		name: 'Cuartos',
		teamType: 'cuartos',
		priority: 10,
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
	},
	{
		name: 'Transporte',
		teamType: 'transporte',
		priority: 11,
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
	},
	{
		name: 'Snacks',
		teamType: 'snacks',
		priority: 12,
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
	},
	{
		name: 'Dinámica de la Pared',
		teamType: 'dinamica',
		priority: 13,
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
	},
	{
		name: 'Serenata',
		teamType: 'dinamica',
		priority: 14,
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
	},
	{
		name: 'Dinámica del Perdón / Clausura',
		teamType: 'dinamica',
		priority: 15,
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
	},
	{
		name: 'Dinámica de la Rosa',
		teamType: 'dinamica',
		description: 'Dinámica de apertura con la rosa',
		priority: 16,
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
	},
	{
		name: 'Dinámica de las Máscaras',
		teamType: 'dinamica',
		description: 'Dinámica de las máscaras — autenticidad y vulnerabilidad',
		priority: 17,
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
	},
	{
		name: 'Sanación de los Recuerdos',
		teamType: 'dinamica',
		description: 'Dinámica de sanación interior y oración de sanación',
		priority: 18,
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
	},
	{
		name: 'Reglas del Retiro',
		teamType: 'otro',
		description: 'Normas de convivencia y reglamento para caminantes',
		priority: 19,
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
	},
	{
		name: 'Rosario en Cadena',
		teamType: 'otro',
		description: 'Cadena de oración del rosario con familias',
		priority: 20,
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
	},
	{
		name: 'Trabajo de Pasillo',
		teamType: 'otro',
		description: 'Acompañamiento personal a caminantes entre actividades',
		priority: 21,
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
	},
	{
		name: 'Líder de Mesa (Primero de Mesa)',
		teamType: 'otro',
		description: 'Responsabilidades del líder principal de mesa',
		priority: 22,
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
	},
	{
		name: 'Colíder de Mesa (Segundo de Mesa)',
		teamType: 'otro',
		description: 'Responsabilidades del colíder / segundo de mesa',
		priority: 23,
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
	},
	{
		name: 'Oración por Intercesión en Mesa',
		teamType: 'dinamica',
		description: 'Ejercicios de oración de acción de gracias y petición en mesa',
		priority: 24,
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
	},
	{
		name: 'Examen de Conciencia / Quema de Pecados',
		teamType: 'dinamica',
		description: 'Dinámica de examen de conciencia y quema de pecados (Anexo A-2-16)',
		priority: 25,
		instructions: `## Examen de Conciencia / Quema de Pecados

### Contexto
Esta dinámica es el inicio de una serie que incluye la pared y la reconciliación, terminando con la misa del sábado. Muchos caminantes quizás nunca han confesado sus pecados o no se confiesan desde hace mucho tiempo. Se busca que el caminante, en un ambiente de reflexión y en forma individual, haga una introspección profunda sobre sus faltas y escriba sus pecados, para concientizar la necesidad de un cambio profundo en su vida.

### Propósito
- Guiar a los caminantes en un examen de conciencia personal
- Invitar a la introspección profunda sobre faltas cometidas y bien omitido hacia Dios, el prójimo y uno mismo
- Preparar el corazón para el sacramento de la reconciliación
- Simbolizar la liberación de los pecados mediante la quema de los papeles

### Preparación
- Preparar hojas de papel y bolígrafos/plumas para cada caminante
- Conseguir un envase metálico resistente al fuego para la quema
- Tener aceite y hojas secas para iniciar el fuego
- Preparar dos vasos de plástico pequeños para la pasta de ceniza
- Coordinar el espacio exterior seguro para la fogata
- Tener agua cerca como medida de seguridad contra incendios
- Preparar música suave y de recogimiento

### Materiales
- Hojas de papel (una por caminante)
- Bolígrafos o plumas
- Envase metálico para quemar los papeles
- Aceite y hojas secas para el fuego
- Agua (para mezclar con ceniza y como seguridad)
- Dos vasos de plástico pequeños
- Encendedor o fósforos
- Música de recogimiento preparada

### Desarrollo
1. Se invita a los caminantes a escribir en silencio todos los pecados que puedan recordar
2. Se les asegura que **nadie leerá los papeles** — serán quemados
3. Los caminantes permanecen sentados en silencio hasta que todos terminen
4. Se organizan en círculo alrededor del envase preparado
5. Se inicia el fuego con hojas y aceite en el fondo del envase
6. Cada caminante se acerca a depositar su papel en el fuego
7. Se entonan canciones suaves mientras se queman los papeles
8. La ceniza se mezcla con agua/aceite para formar una pasta
9. Se ordena a los caminantes en dos filas **por edad** (mayor a menor)
10. Dos servidores colocan una **cruz de ceniza en las manos** de cada caminante diciendo: *"Estas cenizas representan todos los pecados que escribiste y los que no escribiste, los cuales solo en confesión te serán perdonados por Dios"*
11. Se indica a los participantes que pasen al salón de actividades

### Coordinación con Líderes de Mesa
- Los líderes de mesa deben ser informados para ser los primeros en entrar al salón
- Deben sentarse en los últimos asientos para facilitar el vendaje de los caminantes
- Los servidores NO serán vendados (para la dinámica siguiente de la Pared)

### ⚠️ Confidencialidad
**No divulgar los detalles de esta dinámica a los caminantes antes del retiro.** La experiencia de escribir y quemar los pecados debe ser completamente espontánea.

---
*Las instrucciones detalladas paso a paso deben seguirse del Manual oficial de Emaús de su parroquia/diócesis. Consulte con el Rector del retiro.*`,
	},
];

// ─── Default charlas (imported from ../../data/serviceTeamData.ts) ─────────

// ─── Migration ──────────────────────────────────────────────────────────────

export class CreateServiceTeams20260309120000 implements MigrationInterface {
	name = 'CreateServiceTeams20260309120000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// ── 1. Create service_teams and service_team_members tables ──

		await queryRunner.query(`
			CREATE TABLE "service_teams" (
				"id" varchar PRIMARY KEY NOT NULL,
				"name" varchar NOT NULL,
				"teamType" varchar NOT NULL,
				"description" text,
				"instructions" text,
				"retreatId" varchar NOT NULL,
				"leaderId" varchar,
				"priority" integer NOT NULL DEFAULT (0),
				"isActive" boolean NOT NULL DEFAULT (1),
				"createdAt" datetime NOT NULL DEFAULT (datetime('now')),
				"updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
				CONSTRAINT "FK_service_teams_retreat" FOREIGN KEY ("retreatId") REFERENCES "retreat" ("id") ON DELETE CASCADE,
				CONSTRAINT "FK_service_teams_leader" FOREIGN KEY ("leaderId") REFERENCES "participants" ("id") ON DELETE SET NULL
			)
		`);

		await queryRunner.query(`
			CREATE TABLE "service_team_members" (
				"id" varchar PRIMARY KEY NOT NULL,
				"serviceTeamId" varchar NOT NULL,
				"participantId" varchar NOT NULL,
				"role" varchar,
				"createdAt" datetime NOT NULL DEFAULT (datetime('now')),
				CONSTRAINT "FK_service_team_members_team" FOREIGN KEY ("serviceTeamId") REFERENCES "service_teams" ("id") ON DELETE CASCADE,
				CONSTRAINT "FK_service_team_members_participant" FOREIGN KEY ("participantId") REFERENCES "participants" ("id") ON DELETE CASCADE
			)
		`);

		await queryRunner.query(`CREATE INDEX "IDX_service_teams_retreatId" ON "service_teams" ("retreatId")`);
		await queryRunner.query(`CREATE INDEX "IDX_service_team_members_teamId" ON "service_team_members" ("serviceTeamId")`);
		await queryRunner.query(`CREATE INDEX "IDX_service_team_members_participantId" ON "service_team_members" ("participantId")`);

		// ── 2. Seed all 25 service teams for every retreat ──

		const retreats: { id: string }[] = await queryRunner.query(`SELECT id FROM "retreat"`);

		for (const retreat of retreats) {
			for (const team of allServiceTeams) {
				const existing = await queryRunner.query(
					`SELECT id FROM "service_teams" WHERE "retreatId" = ? AND "name" = ?`,
					[retreat.id, team.name],
				);
				if (existing.length === 0) {
					const id = uuidv4();
					await queryRunner.query(
						`INSERT INTO "service_teams" ("id", "name", "teamType", "description", "instructions", "retreatId", "priority", "isActive")
						 VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
						[id, team.name, team.teamType, (team as any).description || null, team.instructions, retreat.id, team.priority],
					);
				}
			}
		}

		// ── 3. Recreate retreat_responsibilities with 'charlista' type ──

		await queryRunner.query(`PRAGMA foreign_keys = OFF`);

		await queryRunner.query(`
			CREATE TABLE "retreat_responsibilities_new" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"name" VARCHAR(255) NOT NULL,
				"description" TEXT,
				"responsabilityType" VARCHAR(50) NOT NULL DEFAULT 'otro' CHECK ("responsabilityType" IN ('lider', 'colider', 'servidor', 'musica', 'oracion', 'limpieza', 'cocina', 'charlista', 'otro')),
				"isLeadership" BOOLEAN NOT NULL DEFAULT 0,
				"priority" INTEGER NOT NULL DEFAULT 0,
				"isActive" BOOLEAN NOT NULL DEFAULT 1,
				"retreatId" VARCHAR(36) NOT NULL,
				"participantId" VARCHAR(36),
				"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY ("retreatId") REFERENCES "retreat" ("id") ON DELETE CASCADE,
				FOREIGN KEY ("participantId") REFERENCES "participants" ("id") ON DELETE SET NULL
			)
		`);

		await queryRunner.query(`INSERT INTO "retreat_responsibilities_new" SELECT * FROM "retreat_responsibilities"`);
		await queryRunner.query(`DROP TABLE "retreat_responsibilities"`);
		await queryRunner.query(`ALTER TABLE "retreat_responsibilities_new" RENAME TO "retreat_responsibilities"`);

		await queryRunner.query(`CREATE INDEX "idx_retreat_responsibilities_retreatId" ON "retreat_responsibilities" ("retreatId")`);
		await queryRunner.query(`CREATE INDEX "idx_retreat_responsibilities_participantId" ON "retreat_responsibilities" ("participantId")`);
		await queryRunner.query(`CREATE INDEX "idx_retreat_responsibilities_responsabilityType" ON "retreat_responsibilities" ("responsabilityType")`);
		await queryRunner.query(`CREATE INDEX "idx_retreat_responsibilities_isActive" ON "retreat_responsibilities" ("isActive")`);
		await queryRunner.query(`CREATE INDEX "idx_retreat_responsibilities_priority" ON "retreat_responsibilities" ("priority")`);

		await queryRunner.query(`PRAGMA foreign_keys = ON`);

		// ── 4. Seed charlas for existing retreats ──

		for (const retreat of retreats) {
			const existingCharlas = await queryRunner.query(
				`SELECT id FROM "retreat_responsibilities" WHERE "retreatId" = ? AND "responsabilityType" = 'charlista' LIMIT 1`,
				[retreat.id],
			);
			if (existingCharlas.length > 0) continue;

			for (const charla of defaultCharlas) {
				const id = uuidv4();
				const now = new Date().toISOString();
				await queryRunner.query(
					`INSERT INTO "retreat_responsibilities" ("id", "name", "description", "responsabilityType", "isLeadership", "priority", "isActive", "retreatId", "createdAt", "updatedAt")
					 VALUES (?, ?, ?, 'charlista', 0, 0, 1, ?, ?, ?)`,
					[id, charla.name, charla.anexo, retreat.id, now, now],
				);
			}
		}

		// ── 5. Seed Moderador responsibility for all retreats ──

		const moderadorDescription = `# Anexo A-4-4

## Guía para Moderadores

### Rol Principal
**El papel más importante (sino el único) del moderador, es mantener el retiro estrictamente dentro del horario establecido en el programa general.**

### Reglas Generales
- Al principio de cada día se ora (realizado por un caminante) y se lee la lectura de Emaús Lucas 24:13-35 (realizado por un servidor)
- **Casos críticos**: Déjalos que se vayan. Algunos caminantes pueden presentar problemas de adaptación y mostrar deseos de irse. Déjalos ir, no trates de retenerlos. Facilítales su transporte, etc.
- En los espacios entre charlas, puedes dar información **breve** (recalcamos, MUY breve), reforzando la charla que se acaba de dar
- **Confidencialidad**: Después de cada charla recuerda la confidencialidad
- El lenguaje del moderador debe ser sencillo, prudente (no usar malas palabras o palabras de doble sentido), claro, concreto y breve
- Estar en contacto permanente con el campanero para darle instrucciones respecto al toque de campana

### Organización por Segmentos
Es deseable que el retiro se divida en **cinco (5) segmentos**, cada uno moderado por un moderador diferente:
1. Viernes en la noche
2. Sábado en la mañana
3. Sábado en la tarde
4. Domingo en la mañana
5. Domingo en la tarde

Cada moderador debe recibir una copia del programa a desarrollar en su espacio de tiempo.

---

### Viernes en la Noche — Introducción y Bienvenida

#### Apertura
- Presentarse: "Buenas noches a todos, mi nombre es ___"
- Dar la bienvenida en nombre del Padre ___ párroco de la iglesia ___ patrocinante del retiro
- Dar la bienvenida en nombre de todos los hermanos de Emaús que estarán sirviendo
- Indicar número de retiro: "Este retiro es el ___ retiro patrocinado por esta parroquia"

#### Oración y Lectura
- Oración por un caminante
- Lectura del pasaje de Emaús Lucas 24:13-35 por un servidor
- Reflexión sobre el pasaje (por un servidor o el moderador), siempre referirlo a nuestra vida cotidiana

#### Quiénes Somos
- "Somos gente común como tú, que una vez estuvimos allí sentados"
- Explicar que hay dos tipos de personas: caminantes y servidores
- "Nadie es orador ni predicador — somos gente común"
- "No nos fijemos en el mensajero, fijémonos en el mensaje que nos trae"
- "Nadie cobra por esto — todos hemos dejado nuestras actividades para servir voluntariamente"
- "Este es un retiro católico, diocesano, preparado por laicos y dado por laicos para laicos"
- "No hay teología — nadie te va a caer a bibliazos"
- "Aquí no se forza a nadie a hacer nada que no quiera hacer"

#### Celulares y Familia
- Desconectar celulares — recordar la carta de no traer celular
- La familia: no pasará nada, tienen los teléfonos de los coordinadores
- "No hemos aprendido a soltar, a dejarle al Señor que Él se encargue de nuestras cosas"
- "Desconéctate por estos tres días, dedícatelo a ti, no mires el reloj"

#### Motivación
- "Solo te pedimos abrir el corazón, abrirlo muy grande"
- "Tú estás aquí porque el Señor así lo ha querido"
- "En cualquier momento durante estos tres días, tú vas a tener un encuentro personal con el Señor"
- "El que no quiso venir hoy, usualmente el domingo no se quiere ir"
- "Dale un abrazo al que está al lado y dile que estás contento que esté aquí"

#### Disposición del Edificio
- Explicar: sala de conferencia, comedor, dormitorios, baños, sala de oración
- Área de fumadores (asegurarse que en el recinto se pueda fumar) — colillas en los basureros
- Introducir hermanos que explicarán:
  - Horario, recesos y campanero (presentarlo)
  - Historia de los Retiros de Emaús
  - Palanca — explicación
  - Lema "Jesucristo Ha Resucitado, En Verdad Resucitó" — explicación
  - Lema de la Confidencialidad
- Distribuir cancioneros y diarios — explicar — poner nombre y número de mesa — intercambiar direcciones, teléfonos, etc.

#### Comedor
- Bendición de los alimentos (un caminante)
- El pan y el vino (Dinámica del Ágape) — explicar — compartir el pan y vino en cada mesa

#### Después de la Charla de las Máscaras
- Confidencialidad (después de cada charla)
- La bendición — ejemplo — realizar el ejercicio de la bendición (todos)
- Ponerse en círculo — rezar el Padre Nuestro

#### Reunión de Evaluación (Final del Viernes)
- Revisión por mesas — casos críticos y de mayor atención
- Discusión de las debilidades observadas en la organización
- Día siguiente: alertar sobre actividades que requieren mayor atención (la Pared, etc.)

---

### Sábado en la Mañana
- Oración (caminante) y lectura de Lucas 24:13-35 (servidor)
- Reflexión: Conocer al Señor a través de las Sagradas Escrituras y la Oración
- "Para todo hay que entrenar, incluso nuestra relación con Dios"
- "Nuestro primer pensamiento debe ser para el Señor"

### Sábado en la Tarde
- "Abrir el corazón, abrirlo muy grande — más charlas, más compartir"
- Confidencialidad: "Aquí se están contando cosas que posiblemente nadie las sabe, ni siquiera sus esposas"
- Resumen de charlas: Máscaras, Escrituras, Oración, Sacramentos — ¿Qué tienen en común? Nuestro Dios Padre
- Reflexiones de Las Cargas y Sanando Heridas:
  - "A veces, las caídas más aparatosas es lo que salva a mucha gente de vivir condenada a una rutina"
  - "No es lo que te pasa sino lo que hagas con lo que te pasa"
  - "Los antecedentes solo si son compartidos ayudan"
  - "No desechemos nuestro dolor — usémoslos para ayudar a otros"
  - "Nunca sabrás que Dios es todo lo que necesitas hasta que Él sea todo lo que tengas"
  - "Todo lo que te pasa tiene significado espiritual — TODO!" (Romanos 8:28-29)
  - "Cuando te pase algo malo empieza a preguntarte 'Para qué Señor' en vez de 'Por qué Señor'"
- Ejercicio de la oración dando gracias

### Sábado en la Noche
- La Pared (La Confianza) — explicar lo que significa la confianza
- Recordar a los que tienen lentes quitárselos
- Claustrofóbicos: no ponerles la venda, pedirles que mantengan cerrados los ojos
- **Reunión de evaluación**: revisión por mesas, ajustes, alertar sobre actividades del día siguiente (mantelitos — advertir que es solo para caminantes, serenata, etc.)

---

### Domingo en la Mañana
- Muy temprano: comedor — hacer oración para poner los mantelitos en las mesas (solo servidores)
- Sala de conferencia: oración (caminante) y lectura de Lucas 24:13-35 (servidor)
- Serenata: explicar que si no viste a tu esposa en la serenata, es porque probablemente no ha hecho Emaús
- Dar explicación detallada de los mantelitos: "Mensaje directo del Señor para un problema que tienes, una respuesta que andas buscando"
- Explicar el rol de los líderes de mesa
- Reflexión Charla Familia y Amigos:
  - "De los 10 mandamientos, tres se refieren a nuestra relación con Dios y 7 a nuestras relaciones con nuestros semejantes"
  - "La familia es el legado más hermoso que el Señor le legó a la humanidad"
  - "Ama a los tuyos, díselo y demuéstraselos"
- Después del almuerzo: advertir a los caminantes que recojan todas sus pertenencias y tengan listas sus maletas

### Domingo en la Tarde
- Reflexión después de la charla del Servicio:
  - "Cada uno tiene que descubrir los dones recibidos del Señor y ponerlos al servicio de nuestros semejantes"
  - "El que no sirve… no sirve"
  - "Nuestro éxito se mide en cuántos nos sirven… en vez de a cuántos servimos"
  - "Pensar en los demás es la esencia de ser semejantes a Cristo"
- Ejercicio de la oración: pedir por los demás
  - "Una de las obligaciones que tiene todo creyente es orar por los demás" (Santiago 5:16)
- Entrega de paquetes a los líderes de mesa (camisetas, agua bendita, etc.)

#### Cierre
- "Somos gente común que ha experimentado el poder de Dios en nuestras propias vidas"
- Confidencialidad — tres vertientes:
  1. Lo que dijo cada charlista
  2. Lo que te dijo algún caminante en privado
  3. Lo que viste aquí con relación a las actividades
- Importancia de las reuniones: "Para mantener una lámpara prendida, tenemos que continuar echándole aceite"
- "No tires la pelea solo, da la pelea en tu comunidad, con tus hermanos"
- "En la calle vas a conseguir los mismos problemas que dejaste el viernes — el que ha cambiado eres tú"
- "Bendice a la gente, en tu trabajo, en tu casa — arriésgate a cambiar tu actitud y tu mundo va a cambiar"
- "Abraza a tus seres queridos, diles que los amas"
- "Envía a tu esposa a hacer el Emaús si no lo ha hecho — camina junto a ella este camino"
- "Esto puede ser el inicio de un cambio en tu vida… depende de ti"
- "La única cosa que necesita el maligno para triunfar es que la gente buena no haga nada"
- "Abraza al hermano que está al lado y dile que estás contento de haber compartido con él estos tres días"

---
*Referencia: Anexo A-4-4 del Manual de Emaús*`;

		for (const retreat of retreats) {
			const existingModerador = await queryRunner.query(
				`SELECT id FROM "retreat_responsibilities" WHERE "retreatId" = ? AND "name" = 'Moderador' LIMIT 1`,
				[retreat.id],
			);
			if (existingModerador.length === 0) {
				const id = uuidv4();
				const now = new Date().toISOString();
				await queryRunner.query(
					`INSERT INTO "retreat_responsibilities" ("id", "name", "description", "responsabilityType", "isLeadership", "priority", "isActive", "retreatId", "createdAt", "updatedAt")
					 VALUES (?, ?, ?, 'otro', 0, 0, 1, ?, ?, ?)`,
					[id, 'Moderador', moderadorDescription, retreat.id, now, now],
				);
			}
		}

		// ── 6. Seed Diario responsibility for all retreats ──

		const diarioDescription = `## Diario del Caminante

### ¿Qué es?
El Diario es un cuadernillo personal que se entrega a cada caminante al inicio del retiro. Sirve como herramienta de reflexión donde el caminante puede escribir sus pensamientos, oraciones y notas durante las charlas y dinámicas.

### Preparación
- Imprimir o adquirir suficientes diarios para todos los caminantes
- Cada diario debe tener el nombre del caminante y su número de mesa
- Incluir cancionero integrado (letras de los cantos del retiro)
- Entregar junto con una pluma/bolígrafo

### Contenido del Diario
- Portada con el lema del retiro
- Espacio para datos personales (nombre, mesa, teléfono)
- Páginas en blanco para notas de cada charla
- Cancionero con las letras de los cantos
- Espacio para reflexiones personales
- Oración de Emaús

### Distribución
- Se entrega el viernes en la noche durante la bienvenida
- El moderador explica su uso: "Poner nombre y número de mesa, intercambiarse direcciones, teléfonos, etc."
- Animar a los caminantes a escribir durante todo el retiro

### Notas
- Es un recuerdo personal del retiro — el caminante se lo lleva
- No debe ser leído por nadie más que el caminante
- Coordinar con el equipo de logística e impresión`;

		for (const retreat of retreats) {
			const existingDiario = await queryRunner.query(
				`SELECT id FROM "retreat_responsibilities" WHERE "retreatId" = ? AND "name" = 'Diario' LIMIT 1`,
				[retreat.id],
			);
			if (existingDiario.length === 0) {
				const id = uuidv4();
				const now = new Date().toISOString();
				await queryRunner.query(
					`INSERT INTO "retreat_responsibilities" ("id", "name", "description", "responsabilityType", "isLeadership", "priority", "isActive", "retreatId", "createdAt", "updatedAt")
					 VALUES (?, ?, ?, 'otro', 0, 0, 1, ?, ?, ?)`,
					[id, 'Diario', diarioDescription, retreat.id, now, now],
				);
			}
		}

		// ── 7. Update charla and responsibility descriptions with documentation ──

		for (const [charlaName, documentation] of Object.entries(charlaDocumentation)) {
			await queryRunner.query(
				`UPDATE "retreat_responsibilities" SET "description" = ? WHERE "name" = ? AND "responsabilityType" = 'charlista'`,
				[documentation, charlaName],
			);
		}

		for (const [respName, documentation] of Object.entries(responsibilityDocumentation)) {
			await queryRunner.query(
				`UPDATE "retreat_responsibilities" SET "description" = ? WHERE "name" = ? AND "responsabilityType" != 'charlista'`,
				[documentation, respName],
			);
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// ── Revert charla documentation ──

		const charlaAnexos: Record<string, string> = {
			'Charla: De la Rosa': 'A-2-1',
			'Charla: Conociendo a Dios a través del Conocimiento Personal (Las Máscaras)': 'A-2-2',
			'Charla: Conociendo a Dios a través de la Escrituras': 'A-2-3',
			'Charla: Conociendo a Dios a través de la Oración': 'A-2-4',
			'Charla: Conociendo a Dios a través de los Sacramentos': 'A-2-5',
			'Charla: Las Cargas que Llevamos': 'A-2-6',
			'Charla: Sanación de los Recuerdos (Sanando Heridas)': 'A-2-7',
			'Charla: Conociendo a Dios a través de la Familia y Amigos': 'A-2-8',
			'Charla: Amando a Dios a través del Servicio': 'A-2-9',
			'Texto: Reflexión sobre Lucas 24, 13-35': 'A-2-10',
			'Texto: Historia de los Retiros de Emaús': 'A-2-11',
			'Texto: Explicación del Lema "Jesucristo Ha Resucitado"': 'A-2-12',
			'Texto: Explicación de la Confidencialidad': 'A-2-13',
			'Texto: Explicación de La Palanca': 'A-2-14',
			'Texto: Explicación del Ágape': 'A-2-15',
			'Texto: Dinámica Examen de Conciencia': 'A-2-16',
			'Charla: De la Confianza': 'A-2-17',
			'Texto: Dinámica de la Pared': 'A-2-18',
			'Texto: Lavado de Manos': 'A-2-19',
		};

		for (const [name, anexo] of Object.entries(charlaAnexos)) {
			await queryRunner.query(
				`UPDATE "retreat_responsibilities" SET "description" = ? WHERE "name" = ? AND "responsabilityType" = 'charlista'`,
				[anexo, name],
			);
		}

		for (const respName of Object.keys(responsibilityDocumentation)) {
			await queryRunner.query(
				`UPDATE "retreat_responsibilities" SET "description" = NULL WHERE "name" = ? AND "responsabilityType" != 'charlista'`,
				[respName],
			);
		}

		// ── Remove charla entries ──

		await queryRunner.query(`DELETE FROM "retreat_responsibilities" WHERE "responsabilityType" = 'charlista'`);

		// ── Revert CHECK constraint (remove 'charlista') ──

		await queryRunner.query(`PRAGMA foreign_keys = OFF`);

		await queryRunner.query(`
			CREATE TABLE "retreat_responsibilities_old" (
				"id" VARCHAR(36) PRIMARY KEY NOT NULL,
				"name" VARCHAR(255) NOT NULL,
				"description" TEXT,
				"responsabilityType" VARCHAR(50) NOT NULL DEFAULT 'otro' CHECK ("responsabilityType" IN ('lider', 'colider', 'servidor', 'musica', 'oracion', 'limpieza', 'cocina', 'otro')),
				"isLeadership" BOOLEAN NOT NULL DEFAULT 0,
				"priority" INTEGER NOT NULL DEFAULT 0,
				"isActive" BOOLEAN NOT NULL DEFAULT 1,
				"retreatId" VARCHAR(36) NOT NULL,
				"participantId" VARCHAR(36),
				"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				"updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
				FOREIGN KEY ("retreatId") REFERENCES "retreat" ("id") ON DELETE CASCADE,
				FOREIGN KEY ("participantId") REFERENCES "participants" ("id") ON DELETE SET NULL
			)
		`);

		await queryRunner.query(`INSERT INTO "retreat_responsibilities_old" SELECT * FROM "retreat_responsibilities"`);
		await queryRunner.query(`DROP TABLE "retreat_responsibilities"`);
		await queryRunner.query(`ALTER TABLE "retreat_responsibilities_old" RENAME TO "retreat_responsibilities"`);

		await queryRunner.query(`CREATE INDEX "idx_retreat_responsibilities_retreatId" ON "retreat_responsibilities" ("retreatId")`);
		await queryRunner.query(`CREATE INDEX "idx_retreat_responsibilities_participantId" ON "retreat_responsibilities" ("participantId")`);
		await queryRunner.query(`CREATE INDEX "idx_retreat_responsibilities_responsabilityType" ON "retreat_responsibilities" ("responsabilityType")`);
		await queryRunner.query(`CREATE INDEX "idx_retreat_responsibilities_isActive" ON "retreat_responsibilities" ("isActive")`);
		await queryRunner.query(`CREATE INDEX "idx_retreat_responsibilities_priority" ON "retreat_responsibilities" ("priority")`);

		await queryRunner.query(`PRAGMA foreign_keys = ON`);

		// ── Drop service team tables ──

		await queryRunner.query(`DROP INDEX "IDX_service_team_members_participantId"`);
		await queryRunner.query(`DROP INDEX "IDX_service_team_members_teamId"`);
		await queryRunner.query(`DROP INDEX "IDX_service_teams_retreatId"`);
		await queryRunner.query(`DROP TABLE "service_team_members"`);
		await queryRunner.query(`DROP TABLE "service_teams"`);
	}
}
