# En qué vamos

El cruce entre el **Minuto a Minuto** y las **funciones de cada servidor**: eliges en qué actividad están, y la pantalla arma el momento — quién está en escena, dónde y qué le toca a cada quien.

📺 **[Ver video tutorial (1:56)](https://youtu.be/I0Zmz0G7-OY)**

## Estamos en

- Por defecto está en **⏵ Automático**: sigue por WebSocket la actividad que esté **en curso** (la que iniciaste desde el Minuto a Minuto).
- Para mirar otra actividad, elígela en el selector: el grupo se rearma al instante y queda fijo (badge **manual**). Con **volver a automático** regresa a seguir el retiro en vivo.
- La vista se actualiza sola: al iniciar o completar una actividad, **En escena** se mueve al siguiente momento sin recargar.

## En escena

- Muestra a los **responsables** de la actividad elegida y al **titular** de su responsabilidad, con sus roles (🎤), la **ubicación** (📍), su **mesa** y cuántos **📎 documentos** tiene.
- Si nadie está asignado a la actividad, te lo dice y te lleva a **Asignar responsables** (si tienes permiso de gestión).
- Busca un servidor por nombre en el buscador: filtra ambas secciones sin distinguir acentos.

## Los demás servidores

- Cada servidor aparece con su **próximo momento** del día de la actividad elegida, su mesa y el conteo de documentos. Quien no tiene momentos ese día aparece como *sin momentos asignados*.

## Briefing de un servidor

- Toca cualquier servidor para abrir su briefing:
  - **Ahora**: dónde debe estar y qué le toca en la actividad elegida.
  - **Su día**: todas sus actividades de ese día, en orden, con la elegida resaltada.
  - **Asignaciones**: sus responsabilidades fijas y sus equipos de servicio con las instrucciones de cada dinámica.
  - **Documentos**: los documentos de cada momento y de sus responsabilidades, listos para abrir desde el celular.

## Requisitos

- La vista necesita que el retiro tenga su **Minuto a Minuto materializado** y **responsables asignados** (desde *Asignar responsables* o desde el propio Minuto a Minuto). Sin responsables, "En escena" aparece vacío.
- En *Producción* el tiempo real corre por WebSocket; en desarrollo requiere que el proxy tenga WebSocket habilitado.
