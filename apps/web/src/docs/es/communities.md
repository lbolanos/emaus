# Gestión de Comunidades

La función de Gestión de Comunidades le permite mantener relaciones continuas con los participantes de retiros organizándolos en comunidades, rastreando su participación y administrando actividades grupales.

## Descripción General

Las comunidades son grupos de personas que han participado en retiros y desean mantenerse conectados. Esta función le ayuda a:

- Organizar participantes en comunidades
- Rastrear la participación y el compromiso de los miembros
- Programar y registrar reuniones comunitarias
- Monitorear estados de miembros (activo, inactivo, reubicado, etc.)
- Invitar y administrar administradores de la comunidad

## Crear una Comunidad

1. Navegue a **Comunidades** desde el menú principal
2. Haga clic en **Nueva Comunidad**
3. Complete los detalles de la comunidad:
   - **Nombre**: Un nombre descriptivo para la comunidad
   - **Dirección**: Detalles de ubicación física (calle, ciudad, estado, código postal, país)
   - **Descripción** (opcional): Información adicional sobre la comunidad
4. Haga clic en **Crear Comunidad**

Será agregado automáticamente como propietario de la comunidad.

## Administrar Miembros

### Importar Miembros desde un Retiro

1. Abra el panel de la comunidad
2. Vaya a la pestaña **Miembros**
3. Haga clic en **Importar desde Retiro**
4. Seleccione el retiro
5. Elija los participantes a importar
6. Haga clic en **Importar Seleccionados**

### Estados de Miembros

Los miembros pueden estar en uno de los siguientes estados:

- **Miembro Activo**: Participa regularmente en actividades comunitarias
- **Lejos de la Ubicación**: Vive demasiado lejos para participar regularmente
- **Sin Respuesta**: No ha respondido a intentos recientes de contacto
- **Otro Grupo**: Participa en una comunidad diferente

Puede actualizar el estado de un miembro haciendo clic en su estado actual en la lista de miembros.

### Eliminar Miembros

Para eliminar un miembro de la comunidad:

1. Encuentre al miembro en la lista de miembros
2. Haga clic en el botón **Eliminar**
3. Confirme la acción

## Reuniones y Asistencia

### Crear una Reunión

1. Vaya a la pestaña **Reuniones**
2. Haga clic en **Nueva Reunión**
3. Complete los detalles de la reunión:
   - **Título**: Nombre de la reunión
   - **Fecha de Inicio**: Cuándo ocurrirá la reunión
   - **Duración**: Duración en minutos
   - **Ubicación** (opcional): Dónde se llevará a cabo la reunión
   - **Notas** (opcional): Información adicional
4. Haga clic en **Crear Reunión**

### Registrar Asistencia

1. Abra una reunión de la lista de reuniones
2. Haga clic en **Registrar Asistencia**
3. Marque cada miembro como presente o ausente
4. Agregue notas para miembros individuales si es necesario
5. Haga clic en **Guardar Asistencia**

## Panel y Análisis

El panel de la comunidad proporciona información sobre:

- **Total de Miembros**: Número actual de miembros de la comunidad
- **Distribución de Estados de Miembros**: Desglose por estado de miembro
- **Conteo de Reuniones**: Número de reuniones realizadas
- **Frecuencia de Participación**: Con qué frecuencia asisten los miembros a las reuniones
  - Alta: 75%+ de asistencia
  - Media: 25-75% de asistencia
  - Baja: <25% de asistencia
  - Ninguna: No se registró asistencia

## Administrar Administradores

### Invitar a un Administrador

1. Vaya a la pestaña **Administradores**
2. Haga clic en **Invitar Administrador**
3. Ingrese la dirección de correo electrónico del usuario
4. Haga clic en **Enviar Invitación**

El sistema generará un enlace de invitación que puede compartir con el usuario.

### Compartir el Enlace de Invitación

Después de crear una invitación:

1. Copie el enlace de invitación que se muestra en la ventana modal
2. Compártalo con el usuario invitado por correo electrónico, chat o cualquier otro método
3. El enlace de invitación es válido por 7 días

El enlace se verá así: `https://tu-dominio.com/accept-community-invitation/{token}`

### Qué Debe Hacer el Usuario Invitado

Cuando un usuario recibe un enlace de invitación:

1. **Haga clic en el enlace de invitación** - Esto abrirá la página de aceptación de invitación
2. **Si no ha iniciado sesión**:
   - Haga clic en "Iniciar Sesión"
   - El sistema recordará el token de invitación
   - Después de iniciar sesión, regrese al mismo enlace
3. **Revise los detalles de la invitación**:
   - Nombre de la comunidad
   - Su dirección de correo electrónico
   - Fecha de vencimiento
4. **Haga clic en "Aceptar Invitación"**
5. **Espere la confirmación** - Será redirigido al panel de la comunidad

Después de aceptar:
- La comunidad aparecerá en su barra lateral bajo "Comunidades"
- Tendrá acceso completo de administrador para administrar miembros, reuniones y ver análisis

**Importante**: El usuario ya debe tener una cuenta en el sistema. Si no tiene una cuenta, necesita crear una primero antes de aceptar la invitación.

### Roles de Administrador

- **Propietario**: Control total sobre la comunidad (no se puede eliminar)
- **Administrador**: Puede administrar miembros, reuniones y ver análisis

### Revocar Acceso de Administrador

1. Encuentre al administrador en la lista de administradores
2. Haga clic en **Revocar Acceso**
3. Confirme la acción

Nota: No puede revocar el acceso del propietario de la comunidad.

## Mejores Prácticas

1. **Actualizaciones Regulares**: Mantenga los estados de los miembros actualizados para mantener análisis precisos
2. **Reuniones Consistentes**: Programe reuniones regulares para mantener la participación de la comunidad
3. **Seguimiento de Asistencia**: Registre la asistencia rápidamente después de cada reunión
4. **Comunicación con Miembros**: Use notas de miembros para rastrear información importante
5. **Gestión de Administradores**: Invite a administradores de confianza para ayudar a administrar comunidades más grandes

## Consejos

- Use la función de búsqueda para encontrar rápidamente miembros específicos
- Filtre miembros por estado para enfocarse en grupos específicos
- Exporte listas de miembros para herramientas de comunicación externas
- Revise las estadísticas del panel regularmente para identificar tendencias de participación
- Actualice los estados de los miembros según los patrones de asistencia
