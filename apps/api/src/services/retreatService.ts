import { AppDataSource } from '../data-source';
import { Retreat } from '../entities/retreat.entity';
import { House } from '../entities/house.entity';
import { RetreatBed } from '../entities/retreatBed.entity';
import { MessageTemplate } from '../entities/messageTemplate.entity';
import { createDefaultChargesForRetreat } from './chargeService';
import { createDefaultTablesForRetreat } from './tableMesaService';
import type { CreateRetreat, UpdateRetreat } from '@repo/types';
import { v4 as uuidv4 } from 'uuid';

export const getRetreats = async () => {
  const retreatRepository = AppDataSource.getRepository(Retreat);
  return retreatRepository.find({ relations: ['house'], order: { startDate: 'DESC' } });
};

export const findById = async (id: string) => {
  const retreatRepository = AppDataSource.getRepository(Retreat);
  return retreatRepository.findOne({ where: { id }, relations: ['house'] });
}

export const update = async (id: string, retreatData: UpdateRetreat) => {
  const retreatRepository = AppDataSource.getRepository(Retreat);
  const retreat = await retreatRepository.findOne({ where: { id } });
  if (!retreat) {
    return null;
  }
  Object.assign(retreat, retreatData);
  await retreatRepository.save(retreat);
  return retreat;
}

const createDefaultMessageTemplatesForRetreat = async (retreat: Retreat) => {
  const messageTemplateRepository = AppDataSource.getRepository(MessageTemplate);
  
  const defaultTemplates = [
    {
      name: "Bienvenida Caminante",
      type: "WALKER_WELCOME" as const,
      message: "¡Hola, **{participant.nickname}**!\n\nCon mucho gusto confirmamos tu lugar para la experiencia de fin de semana. Todo el equipo organizador está preparando los detalles para recibirte.\n\n**Datos importantes para tu llegada:**\n* **Nº de Participante:** {participant.numero_participante}\n* **Fecha de encuentro:** {retreat.startDate}\n* **Hora de llegada:** {participant.hora_llegada}\n\nTe pedimos ser puntual para facilitar el registro de todos. ¡Estamos muy contentos de que participes! Nos vemos pronto.",
      retreatId: retreat.id,
    },
    {
      name: "Bienvenida Servidor",
      type: "SERVER_WELCOME" as const,
      message: "¡Hermano/a **{participant.nickname}**! ✝️\n\n¡Gracias por tu \"sí\" generoso al Señor! Es una verdadera bendición contar contigo en el equipo para preparar el camino a nuestros hermanos caminantes. Tu servicio y tu oración son el corazón de este retiro.\n\n**Información clave para tu servicio:**\n* **Nº de Servidor:** {participant.numero_servidor}\n* **Fecha de inicio de misión:** {retreat.startDate}\n* **Hora de llegada:** {participant.hora_llegada}\n\nQue el Señor te ilumine y fortalezca en esta hermosa misión que te encomienda. ¡Unidos en oración y servicio!\n\n¡Cristo ha resucitado!",
      retreatId: retreat.id,
    },
    {
      name: "Validación Contacto de Emergencia",
      type: "EMERGENCY_CONTACT_VALIDATION" as const,
      message: "Hola **{participant.nickname}**, esperamos que estés muy bien.\n\nEstamos preparando todos los detalles para que tu fin de semana sea seguro. Para ello, necesitamos validar un dato importante.\n\n**Contacto de Emergencia Registrado:**\n* **Nombre:** {participant.emergencyContact1Name}\n* **Teléfono:** {participant.emergencyContact1CellPhone}\n\nPor favor, ayúdanos respondiendo a este mensaje con la palabra **CONFIRMADO** si los datos son correctos. Si hay algún error, simplemente envíanos la información correcta.\n\n¡Muchas gracias por tu ayuda!",
      retreatId: retreat.id,
    },
    {
      name: "Solicitud de Palanca",
      type: "PALANCA_REQUEST" as const,
      message: "¡Hola, hermano/a **{participant.nickname}**! ✨\n\nTe invitamos a ser parte del motor espiritual de este retiro. Tu **palanca** es mucho más que una carta: es una oración hecha palabra, un tesoro de amor y ánimo para un caminante que la recibirá como un regalo del cielo en el momento justo.\n\nEl Señor quiere usar tus manos para escribir un mensaje que toque un corazón.\n\n* **Fecha límite para enviar tu palanca:** {retreat.fecha_limite_palanca}\n\nQue el Espíritu Santo inspire cada una de tus palabras. ¡Contamos contigo y con tu oración!",
      retreatId: retreat.id,
    },
    {
      name: "Recordatorio de Palanca",
      type: "PALANCA_REMINDER" as const,
      message: "¡Paz y Bien, **{participant.nickname}**! 🙏\n\nEste es un recordatorio amistoso y lleno de cariño. Un caminante está esperando esas palabras de aliento que el Señor ha puesto en tu corazón; esa oración que solo tú puedes escribirle. ¡No dejes pasar la oportunidad de ser luz en su camino!\n\n* **La fecha límite para enviar tu palanca es el:** {retreat.fecha_limite_palanca}\n\nGracias por tu generosidad y por sostener este retiro con tu oración.",
      retreatId: retreat.id,
    },
    {
      name: "Mensaje General",
      type: "GENERAL" as const,
      message: "Hola **{participant.nickname}**, te escribimos de parte del equipo del Retiro de Emaús.\n\n{custom_message}\n\nQue tengas un día muy bendecido. Te tenemos presente en nuestras oraciones.\n\nUn abrazo en Cristo Resucitado.",
      retreatId: retreat.id,
    },
    {
      name: "Recordatorio Pre-Retiro",
      type: "PRE_RETREAT_REMINDER" as const,
      message: "¡Hola, **{participant.nickname}**!\n\n¡Ya falta muy poco para el inicio de la experiencia! Estamos preparando los últimos detalles para recibirte.\n\nTe recordamos algunos puntos importantes:\n* **Fecha:** {retreat.startDate}\n* **Hora de llegada:** {participant.hora_llegada}\n* **Lugar de encuentro:** {participant.pickupLocation}\n\n**Sugerencias sobre qué llevar:**\n{retreat.thingsToBringNotes}\n\nVen con la mente abierta y sin expectativas, ¡prepárate para un fin de semana diferente!\n\nUn saludo.",
      retreatId: retreat.id,
    },
    {
      name: "Recordatorio de Pago",
      type: "PAYMENT_REMINDER" as const,
      message: "Hola **{participant.nickname}**, ¿cómo estás?\n\nTe escribimos del equipo de organización. Para poder cerrar los detalles administrativos, te recordamos que está pendiente tu aporte de **${retreat.cost}**.\n\nAquí te dejamos la información para realizarlo:\n{retreat.paymentInfo}\n\nSi ya lo realizaste, por favor ignora este mensaje. Si tienes alguna dificultad, no dudes en contactarnos con toda confianza. ¡Tu presencia es lo más importante!\n\nSaludos.",
      retreatId: retreat.id,
    },
    {
      name: "Mensaje Post-Retiro (Cuarto Día)",
      type: "POST_RETREAT_MESSAGE" as const,
      message: "¡Bienvenido a tu Cuarto Día, **{participant.nickname}**! 🎉\n\n¡Cristo ha resucitado! ¡En verdad ha resucitado!\n\nEl retiro ha terminado, pero tu verdadero camino apenas comienza. Jesús resucitado camina contigo, no lo olvides nunca. La comunidad de Emaús está aquí para apoyarte.\n\nTe esperamos en nuestras reuniones de perseverancia para seguir creciendo juntos en la fe. La próxima es el **{retreat.next_meeting_date}**.\n\n¡Ánimo, peregrino! Un fuerte abrazo.",
      retreatId: retreat.id,
    },
    {
      name: "Confirmación de Cancelación",
      type: "CANCELLATION_CONFIRMATION" as const,
      message: "Hola, **{participant.nickname}**.\n\nHemos recibido tu notificación de cancelación. Lamentamos que no puedas acompañarnos en esta ocasión y esperamos que te encuentres bien.\n\nLas puertas siempre estarán abiertas para cuando sea el momento adecuado para ti. Te enviamos nuestros mejores deseos.\n\nUn saludo cordial.",
      retreatId: retreat.id,
    }
  ];

  const newTemplates = defaultTemplates.map(template => 
    messageTemplateRepository.create({
      id: uuidv4(),
      ...template,
    })
  );

  await messageTemplateRepository.save(newTemplates);
};

export const createRetreat = async (retreatData: CreateRetreat) => {
  const retreatRepository = AppDataSource.getRepository(Retreat);
  const houseRepository = AppDataSource.getRepository(House);
  const retreatBedRepository = AppDataSource.getRepository(RetreatBed);

  // 1. Create and save the retreat
  const newRetreat = retreatRepository.create({
    ...retreatData,
    id: uuidv4(),
  });
  await retreatRepository.save(newRetreat);

  // 2. Create default charges
  await createDefaultChargesForRetreat(newRetreat);

  // 3. Create default tables
  await createDefaultTablesForRetreat(newRetreat);

  // 4. Create default message templates
  await createDefaultMessageTemplatesForRetreat(newRetreat);

  // 5. Create retreat beds from house beds
  if (retreatData.houseId) {
    const house = await houseRepository.findOne({
      where: { id: retreatData.houseId },
      relations: ['beds'],
    });

    if (house && house.beds) {
      const newRetreatBeds = house.beds.map(bed => {
        return retreatBedRepository.create({
          id: uuidv4(),
          roomNumber: bed.roomNumber,
          bedNumber: bed.bedNumber,
          floor: bed.floor,
          type: bed.type,
          defaultUsage: bed.defaultUsage,
          retreat: newRetreat,
        });
      });
      await retreatBedRepository.save(newRetreatBeds);
    }
  }

  return newRetreat;
};
