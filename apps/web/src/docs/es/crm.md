# Comunicación (CRM)

📺 **[Ver video tutorial: plantillas y secuencias](https://youtu.be/KpYW_kWYdMk)**

📺 **[Ver video tutorial: secuencias, de la plantilla al envío](https://youtu.be/AUxhUHiOF4w)** (plantilla por paso, la predeterminada, pasos vencidos y detalle por paso)

📺 **[Ver video tutorial: seguimiento de caminantes](https://youtu.be/Xmxa8K-lg-E)**

Esta sección explica cómo comunicarte con los participantes de forma más eficiente: enviar mensajes en grupo por WhatsApp, automatizar recordatorios y seguimientos, y llevar el control de a quién ya contactaste.

## Visión general

El sistema reúne varias herramientas para que no tengas que mandar cada mensaje a mano:

- **Cola de WhatsApp**: envía un mensaje a varios participantes, uno por uno, desde **tu propia cuenta de WhatsApp**.
- **Segmentos**: guarda combinaciones de filtros (por ejemplo "caminantes con pago pendiente") para reutilizarlas.
- **Secuencias automáticas**: programa envíos por evento o fecha (bienvenida al registrarse, recordatorio antes del retiro, seguimiento después).
- **Tablero de comunicación**: ve cuántos mensajes se han enviado y a cuántas personas.
- **Tareas y seguimiento**: recordatorios para ti y el estado de cada participante (contactado, confirmó, etc.).

### Una regla importante sobre WhatsApp

Cada coordinador envía WhatsApp **desde su propia cuenta** (su teléfono). El sistema **no** manda WhatsApp por ti de forma automática: prepara el mensaje, lo abre en tu WhatsApp y tú lo envías con un clic. Esto evita bloqueos de WhatsApp y que los mensajes lleguen de un número desconocido.

> El **correo** sí se envía solo (de forma automática). El **WhatsApp** siempre requiere tu clic.

## Cola de WhatsApp

Sirve para mandar el mismo mensaje (personalizado) a varios participantes por WhatsApp, sin copiar y pegar uno por uno.

1. Ve a **Caminantes** (o **Servidores**).
2. Marca la casilla de los participantes que quieres contactar.
3. En la barra azul de selección, pulsa el ícono verde de envío (**Cola de WhatsApp**).
4. Elige una plantilla (o escribe el mensaje). Las variables como el nombre se rellenan solas para cada persona.
5. Por cada destinatario, pulsa **Abrir WhatsApp**: se abre tu WhatsApp con el mensaje listo. Envíalo y la fila queda marcada como enviada.

La barra de progreso te muestra cuántos llevas (por ejemplo "7 de 20 enviados"). Cada envío queda guardado en el historial del participante.

## Segmentos

Un **segmento** es una combinación de filtros con nombre, para no volver a configurarla cada vez.

- **Guardar**: aplica los filtros que quieras en la lista de participantes (tipo, etiquetas, estado de pago…) y pulsa el ícono de marcador para guardarlos con un nombre (ej. "Caminantes sin pagar").
- **Aplicar**: selecciona el segmento del menú desplegable y la lista se filtra automáticamente.
- **Eliminar**: desde el mismo diálogo de guardado puedes borrar segmentos que ya no uses.

Los segmentos también pueden usarse como audiencia de una secuencia automática.

## Secuencias automáticas

Una **secuencia** envía mensajes solos según un disparador y un desfase de tiempo. Ideal para bienvenidas, recordatorios de pago y seguimientos.

Para crear una:

1. Ve a **Secuencias Automáticas** y pulsa **Nueva secuencia**.
2. Ponle un **nombre** y elige el **disparador**:
   - **Al registrarse**: cuenta desde que el participante se dio de alta.
   - **Días antes del retiro** / **Días después del retiro**.
   - **En su cumpleaños**.
3. Elige la **audiencia**:
   - **Todos**, **Caminantes** o **Servidores**.
   - **Líderes/colíderes de mesa**: solo los servidores asignados como líder o colíder de alguna mesa del retiro.
4. Agrega uno o más **pasos**. Cada paso tiene:
   - **Días**: el desfase respecto al disparador (por ejemplo, 7 días antes).
   - **Hora**: a qué hora del día se envía.
   - **Plantilla**: el mensaje a usar.
   - **Canal**: **Email** (se envía solo) o **WhatsApp** (va a la bandeja de pendientes).
   - **Enviar a**: a quién va el mensaje de ese paso:
     - **Participante**: al caminante/servidor.
     - **Contacto de emergencia 1** / **Contacto de emergencia 2**: a la familia del participante (usa su teléfono/correo y el mensaje se dirige a su nombre).
     - **Invitador (palanquero)**: al servidor que invitó al participante (útil para avisarle "se registró un nuevo caminante").
     - **Responsabilidad…**: al titular de una responsabilidad del retiro (eliges cuál: Coordinador de Palancas, Tesorero, etc.). Sirve para avisar a un responsable cuando alguien se registra.
5. Guarda. Puedes activar o desactivar la secuencia cuando quieras.

> Como el destinatario se elige **por paso**, una misma secuencia puede, por ejemplo, mandar un mensaje al caminante y otro a su contacto de emergencia.

El sistema revisa cada hora qué mensajes toca enviar. Los de **correo** salen automáticamente; los de **WhatsApp** aparecen en la **bandeja de pendientes**, donde los despachas con un clic (cuando el paso va a un contacto de emergencia, se abre con el teléfono de ese contacto). *Por defecto los pasos nuevos se crean en **WhatsApp**.*

La página se organiza en tres pestañas: **Secuencias** (la lista), **Pendientes** (la bandeja de WhatsApp por enviar) y **Problemas** (los que no se pudieron enviar). En Pendientes y Problemas tienes **buscador**, **orden** y **paginación**; y en Pendientes un filtro **Mostrar: Todos / Míos / Sin asignar**.

En la bandeja, cada pendiente muestra el **estado de seguimiento** del participante (por contactar, contactado, confirmado, etc.) para que decidas con contexto. Además del botón para enviar, hay un botón **"Omitir"** para descartar ese mensaje sin enviarlo (por ejemplo, si el participante ya confirmó y el recordatorio ya no aplica).

Si haces **clic en el nombre** del participante (en Pendientes o en Problemas) se abre su **detalle**, con todo lo que necesitas para decidir si enviar u omitir: su **estado de seguimiento** (y nota), el **mensaje que se enviará** (vista previa), las **cartas/palancas** (si las pidió y cuáles recibió), sus **notas** y los **mensajes que ya se le enviaron** (historial reciente). Desde ese mismo panel puedes **enviar** u **omitir**.

**Opciones para enviar lo justo y a quien corresponde:**
- **Condición por paso**: cada paso puede enviarse solo a quien cumpla un filtro (por ejemplo, "solo si el pago está pendiente" o "solo caminantes"). Así un recordatorio de pago no le llega a quien ya pagó.
- **Parar cuando ya confirmó**: se logra con la **condición del paso** "solo si la asistencia está *pendiente*". Así el recordatorio deja de enviarse en cuanto la persona confirma (o declina) su asistencia. Quien **declinó** (en seguimiento) deja de recibir mensajes siempre.
- **No enviar si venció hace más de N días**: evita que a alguien que se registra tarde le lleguen de golpe todos los recordatorios previos ya vencidos.
- **No contactar**: desde el detalle de un pendiente puedes marcar a una persona como "no contactar"; queda excluida de los envíos automáticos.

**Enviar por WhatsApp con control:** en la bandeja, **"Abrir WhatsApp"** abre el mensaje en tu cuenta (queda marcado como *abierto*) y, cuando realmente lo enviaste, pulsas **"Ya lo envié"** para sacarlo de la bandeja. Si activas **"Marcar enviado al abrir"**, abrir el chat ya lo marca como enviado (te saltas el segundo paso). Puedes **tomar** un pendiente para que quede a tu nombre (sirve para repartir el trabajo entre coordinadores: filtra por **Míos** / **Sin asignar**) y usar **"Abrir siguiente"** para ir rápido (abre el próximo de lo que estás viendo).

> **Renovar con plantilla actual**: si editas una plantilla, los mensajes ya en la bandeja conservan el texto anterior (se "congela" al encolar). Este botón los actualiza con el texto vigente, sin cambiar a quién ni cuándo se envían.

> El botón **Ejecutar ahora** procesa las secuencias activas en el momento, sin esperar al chequeo automático.

> **Pasos con fecha ya pasada**: un paso "X días antes (o después) del retiro" cuya fecha ya pasó **no se programa solo**, ni al activar la secuencia ni en el chequeo automático. Así, una secuencia creada tarde o con los días mal puestos no manda mensajes viejos de golpe. En el editor, esa fecha aparece en ámbar. Si de verdad quieres enviarlo, pulsa **Ejecutar ahora**: te muestra los pasos vencidos con cuántas personas los recibirían, y eliges cuáles **enviar ahora** (los de WhatsApp entran a la bandeja; los de correo salen en ese momento) u **omitir**. Lo que omitas se te vuelve a preguntar la próxima vez que ejecutes. Si una secuencia tiene varios pasos vencidos, solo viene marcado el más reciente, para que a nadie le lleguen varios mensajes juntos.

> **Registros tardíos** (pasos "al registrarse"): si el mensaje de alguien recién registrado va con hasta 2 días de retraso, se envía igual; con más retraso no se programa solo, y *Ejecutar ahora* también te lo pregunta.

> **Secuencias apagadas**: al desactivar una secuencia, lo que ya estaba en la bandeja se oculta (el filtro *Activos* no lo muestra y no cuenta en la pestaña), pero la bandeja te avisa cuántos hay y el botón **Ver pausados** los muestra; se pueden enviar a mano igual. Lo que estaba en *Programados* no se borra, pero tampoco se encola mientras la secuencia siga apagada: por eso se oculta de la lista y no cuenta en la pestaña, y la tarjeta de la secuencia dice **"N en pausa"** en vez de "N programados". **Ver pausados** los muestra (marcados **Pausado**), y al reactivar la secuencia vuelven a programarse tal como estaban.

**Qué pasa en cada caso:**

- Cada secuencia muestra un resumen: cuántos mensajes se **enviaron**, están **en cola**, se **omitieron** o **fallaron**.
- **Detalle por paso** (en la tarjeta de la secuencia) despliega cada paso con su fecha, su plantilla y dónde están sus mensajes: por ejemplo *"Paso 1 · 21 sep → 28 en cola, 1 enviado"*. Si un paso no tiene mensajes y su fecha ya pasó, lo dice: es un paso que no se programó solo (*Ejecutar ahora* te pregunta si enviarlo).
- Los mensajes que no se pudieron enviar aparecen en la pestaña **"Problemas"** con el motivo (por ejemplo, "sin plantilla en el retiro", "destinatario sin teléfono") y una línea **"Cómo corregir"** que te dice qué hacer. Por cada uno puedes **Reenviar** (re-encolar tras corregir el dato) o **Descartar** (quitarlo); y hay **"Reenviar todos" / "Descartar todos"** para resolver en bloque.
- Si un mensaje no aplica porque el participante simplemente **no tiene ese vínculo** (p. ej. no registró invitador, o la responsabilidad no tiene titular), se **descarta solo** y **no aparece** en Problemas (no es un error que debas corregir). El apodo, si falta, se reemplaza por el **primer nombre** (el saludo nunca queda en blanco).
- Si **desactivas** una secuencia, sus mensajes pendientes se pausan (no se envían hasta que la reactives).
- Si un participante se **cancela**, deja de recibir los mensajes programados.
- Al **editar** una secuencia no se reenvía a quienes ya recibieron; al guardar también verás un **preview** del mensaje con un participante de ejemplo.

### Plantillas globales de secuencias

Si usas las mismas secuencias en varios retiros, puedes definirlas **una sola vez** como plantilla global y reutilizarlas:

- En **Configuración Global → Secuencias Globales** creas una secuencia (disparador, audiencia, pasos) igual que en un retiro, pero sin atarla a ninguno. El selector de plantilla usa las **plantillas globales**.
- En cada retiro, en **Secuencias Automáticas** pulsa **"Importar de plantilla global"** y elige la que quieras. Se crea una copia en ese retiro.
- La secuencia importada queda **inactiva**: revísala (por ejemplo, verifica que el retiro tenga las plantillas que usa) y **actívala** cuando esté lista. Así nunca se envían mensajes por sorpresa.
- Editar o borrar una plantilla global **no afecta** a las secuencias ya importadas en los retiros (son copias independientes).

> **Mensajes del registro**: la bienvenida (caminante y servidor), el aviso de privacidad y el aviso al palanquero **ahora se envían mediante secuencias automáticas** (no desde el alta). Cada retiro ya trae esas secuencias creadas y **activas**; salen al momento al registrarse la persona. Si no quieres que se envíen, **desactiva** la secuencia correspondiente.

El sistema ya trae un **pack listo para importar** (lo verás en Secuencias Globales):
- **Bienvenida al caminante** (al registrarse).
- **Pre-retiro: palancas y confirmación** — pide palancas a los contactos de emergencia (21 días antes), las recuerda (7 días antes) y envía la confirmación de asistencia al caminante (3 días antes).
- **Briefing a líderes y colíderes de mesa** (1 día antes).
- **Seguimiento post-retiro (Cuarto Día)** (1 día después), invitando al Cuarto Día y a unirse a una comunidad cercana con el link de la landing.

Importa las que necesites en tu retiro y ajusta canales, días o destinatarios antes de activarlas.

## Tablero de comunicación

Un resumen rápido del retiro:

- **Total enviados** y desglose por **WhatsApp** y **Email**.
- **Participantes contactados** (a cuántas personas distintas les has escrito).
- **Pendientes de WhatsApp** por despachar.
- **Actividad de los últimos 30 días** y las **plantillas más usadas**.

## Seguimiento de caminantes

Un tablero con cinco columnas, una por etapa. Todos los participantes empiezan en *Por contactar*,
no hay que dar de alta a nadie. El tablero abre filtrado a **caminantes**; usa el filtro de tipo si
necesitas ver a los servidores.

- **Por contactar** · **Contactado** · **Confirmó** · **Sin respuesta** · **Declinó**

Para cambiar a alguien de etapa, **toca su tarjeta** y elige la etapa arriba de su historial — así
puedes anotar en el mismo lugar lo que te dijo. En la computadora también puedes **arrastrar la
tarjeta** de una columna a otra.

La barra de etapas, arriba del tablero, muestra cuántas personas hay en cada una. En el teléfono
elige qué columna se ve y cada etapa se muestra como ícono con su conteo (los botones de etapa del
historial usan los mismos íconos); en la computadora te lleva hasta ella.

La última columna, **Con sus cartas**, no es una etapa: se llena sola con quienes tienen al menos el
mínimo de cartas del retiro (3 por defecto) y no se le arrastra nada — captura el número en la ficha
y la tarjeta aparece ahí. Quien está en esa columna sigue apareciendo en su etapa de contacto.

⚠️ **Al mover una tarjeta a Confirmó o Declinó también se registra la confirmación de asistencia**,
que es la que hace que las secuencias dejen de insistirle a esa persona. Es lo que normalmente
quieres, pero tenlo presente: si mueves tarjetas sólo para ordenar el tablero, vas a apagar
recordatorios. Mover la tarjeta hacia atrás no deshace la confirmación.

Cada tarjeta te dice de un vistazo cuántas **cartas** lleva (verde = llegó al mínimo del retiro,
ámbar = le faltan, gris = ninguna), si confirmó asistencia, cuántos mensajes le hemos mandado, si
está en la lista de no contactar y cuántas tareas abiertas tiene. Arriba puedes filtrar por nombre,
por tipo y por cartas — **"por debajo del mínimo" responde de un clic a quién le falta palanca**.

Las cartas se capturan en la ficha del caminante (sección **Palancas** → *Cartas Recibidas*): sólo
el número. Lo que quieras contar —de quién vinieron, si falta alguna— va en las notas de palancas.
El mínimo por caminante se configura por retiro; si no se toca, son 3.

Si una tarjeta muestra `?` en las cartas, es que están anotadas como texto ("tres de su mamá") en
vez de número, así que no se pueden contar. Escribe el número en la ficha y la tarjeta se pone al
día. En el tablero, el filtro **Sin capturar** te las junta todas.

Cuando un caminante alcanza el mínimo, queda anotado en su historial con la fecha — así sabes
*cuándo* se cubrió, no sólo que está cubierto.

### Historial y notas de una persona

Haz clic en cualquier tarjeta y se abre su historial completo:

- **Con quién hemos hablado**: el caminante, sus familiares (con el parentesco) y quien lo invitó.
  De cada uno ves cuántos mensajes le mandamos y cuándo fue el último.
  - **WhatsApp** abre la conversación real con esa persona, para leer lo que contestó.
  - **Escribir** abre el envío con plantilla.
  - Al hacer clic en un contacto, el historial se filtra a lo que le dijimos **sólo a él**.
- **Caja de notas**, siempre arriba. Escribe y presiona *Agregar nota* (o `Ctrl+Enter`). Las notas
  se acumulan con tu nombre y la hora — no se sobrescriben. Puedes editar o borrar las tuyas.
- **Historial**: mensajes enviados y programados, notas, cambios de etapa, pagos, el registro, la
  llegada al retiro y las cartas, todo en orden.

> **Lo que ves es lo que enviamos desde Emaús.** Las respuestas llegan a *tu* WhatsApp, no a la
> aplicación, así que no aparecen aquí — para eso está el botón que abre la conversación. Si alguien
> te dice algo que importa, anótalo: justo para eso es la caja de notas.

## Tareas

Recordatorios para ti (ej. "Llamar a Juan para confirmar pago"), con fecha de vencimiento opcional.
Márcalas como completadas cuando las termines. Se crean desde el historial de la persona y aparecen
como contador en su tarjeta.

> El seguimiento es un marcador de gestión tuyo; no cambia permisos ni mueve al participante de lista.
