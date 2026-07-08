# Plantillas de Mensajes

📺 **[Ver video tutorial](https://youtu.be/KpYW_kWYdMk)**

Las plantillas son textos reutilizables (bienvenidas, recordatorios de pago, solicitud de palanca, etc.) que luego envías por correo o WhatsApp a los participantes. Cada plantilla tiene un **tipo** y un **público** (caminantes, servidores, familiares o general).

## Crear y editar

Pulsa **Agregar nueva** para crear una plantilla, o el ícono de lápiz para editar una existente. Puedes buscar por nombre o contenido y filtrar por tipo. En la tabla, cada plantilla muestra una vista previa del mensaje que se despliega para leerlo completo.

## Variables {scope.var}

Dentro del texto puedes insertar variables que se rellenan solas al enviar, con la forma `{ámbito.dato}`:

- **`{participant.*}`** — datos del destinatario: `firstName`, `nickname`, `cellPhone`, `email`, contactos de emergencia, palanquero…
- **`{retreat.*}`** — datos del retiro: `parish`, `startDate`, `endDate`, `cost`, `paymentInfo`…

El editor incluye un selector con las variables disponibles y una **vista previa** con datos de ejemplo. `{custom_message}` no es una variable: es un hueco que tú completas al momento de enviar.

## Plantillas globales

En **Configuración → Plantillas Globales** (solo administradores) mantienes las plantillas base que se copian a cada retiro nuevo. Ahí puedes crear, editar, **activar/desactivar** y eliminar plantillas maestras. Algunas variables de **Sistema** (como `{user.name}` o `{shareLink}`) solo se resuelven en los correos automáticos del servidor, no al enviar un mensaje manual.
