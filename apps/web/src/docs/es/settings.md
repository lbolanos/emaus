# Configuración

Esta sección explica las opciones de configuración disponibles en el sistema Emaus.

## Descripción General

La sección Configuración permite a los administradores configurar varios aspectos del sistema, incluyendo cuentas de usuario, configuraciones de retiro y preferencias del sistema.

## Gestión de Usuarios

### Agregar Usuarios

1. Navegue a **Configuración → Usuarios**
2. Haga clic en **Agregar Usuario**
3. Ingrese información del usuario:
   - Nombre
   - Correo electrónico
   - Rol (Superadministrador, Administrador, Coordinador, Visor)
4. El usuario recibirá un correo para establecer su contraseña

### Roles de Usuario

**Superadministrador**

- Acceso completo al sistema
- Puede gestionar otros usuarios
- Capacidades de gestión de base de datos
- Acceso a reportes financieros

**Administrador**

- Gestiona todos los retiros
- Gestión de usuarios (excepto superadministradores)
- Acceso completo a reportes

**Coordinador**

- Asignado a retiros específicos
- Gestiona participantes para retiros asignados
- Reportes limitados

**Visor**

- Acceso de solo lectura
- Puede ver retiros asignados
- Sin capacidades de edición

### Gestionar Permisos

1. Seleccione un usuario de la lista
2. Haga clic en **Editar Permisos**
3. Marque/desmarque permisos según sea necesario
4. Guarde los cambios

## Configuración del Retiro

### Configuración de Casas

Configure casas de retiro:

1. Navegue a **Configuración → Casas**
2. Seleccione una casa o agregue una nueva
3. Configure:
   - Cantidad y distribución de habitaciones
   - Tipos y cantidades de camas
   - Información de pisos
   - Límites de capacidad
   - Notas especiales

### Valores Predeterminados

Establezca valores predeterminados para nuevos retiros:

- Máximo de caminantes
- Máximo de servidores
- Tamaño predeterminado de mesa
- Montos de pago

## Configuración del Sistema

### Configuración de Correo

Configure las notificaciones por correo:

1. Navegue a **Configuración → Correo**
2. Ingrese detalles SMTP:
   - Dirección del servidor
   - Número de puerto
   - Credenciales de autenticación
3. Pruebe la configuración
4. Guarde los ajustes

### Configuración de Respaldo

Configure respaldos automáticos:

1. Navegue a **Configuración → Respaldo**
2. Configure la frecuencia de respaldo
3. Elija la ubicación del respaldo
4. Configure la política de retención

## Importación/Exportación de Datos

### Configuración de Exportación

Configure opciones de exportación predeterminadas:

- Formato de archivo (Excel, CSV, PDF)
- Incluir/excluir campos
- Formato de fecha
- Formato de números

### Plantillas de Importación

Descargue y configure plantillas de importación:

- Campos requeridos
- Campos opcionales
- Reglas de validación
- Valores predeterminados

## Localización

### Configuración de Idioma

El sistema admite múltiples idiomas:

- Inglés (en)
- Español (es)

Los usuarios pueden seleccionar su idioma preferido desde el encabezado. La configuración se guarda para sesiones futuras.

### Formatos de Fecha y Hora

Configure formatos regionales:

- Formato de fecha (DD/MM/AAAA vs MM/DD/AAAA)
- Formato de hora (12h vs 24h)
- Formato de números (separador decimal, separador de miles)

## Configuración de Seguridad

### Políticas de Contraseña

Establezca requisitos de contraseña:

- Longitud mínima
- Requisitos de complejidad
- Política de vencimiento

### Gestión de Sesiones

Configure sesiones de usuario:

- Duración del tiempo de espera de sesión
- Duración de "recordarme"
- Máximo de sesiones concurrentes

## Registro de Auditoría

Vea la actividad del sistema:

1. Navegue a **Configuración → Registro de Auditoría**
2. Filtre por:
   - Rango de fechas
   - Usuario
   - Tipo de acción
3. Exporte el registro para análisis

El registro de auditoría rastrea:

- Inicios de sesión de usuario
- Cambios de datos
- Actualizaciones de configuración
- Actividades de exportación
