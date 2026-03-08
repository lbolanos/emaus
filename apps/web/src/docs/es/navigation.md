# Arquitectura de Navegacion

## Secciones del Sistema

El sistema se divide en dos tipos de secciones:

### Secciones de Retiro
Estas secciones dependen de un retiro seleccionado. El selector de retiro aparece en el encabezado para que puedas elegir con cual retiro trabajar.

- **Principal**: Dashboard del retiro, volante
- **Personas**: Caminantes, servidores, angelitos, lista de espera, cancelados
- **Asignaciones**: Mesas, cuartos, tipo de usuario y mesa, asignacion de camas, responsabilidades
- **Financiero**: Pagos
- **Reportes**: Reporte de bolsas, reporte de medicinas, gafetes
- **Servicios**: Palancas, notas y puntos de encuentro, alimentos, cancelacion y notas, inventario, plantillas de mensajes
- **Administracion**: Gestion de roles

### Secciones Globales
Estas secciones no dependen de un retiro especifico. El selector de retiro se oculta y en su lugar se muestra el titulo de la seccion actual.

- **Comunidad**: Comunidades, miembros, reuniones, administradores, plantillas
- **Red Social**: Perfil, buscar usuarios, amigos, seguidores, testimonios, mis retiros
- **Configuracion Global**: Casas, telemetria, plantillas globales, articulos de inventario, cambiar contrasena, ayuda

## Comportamiento del Selector de Retiro

- El selector solo aparece cuando navegas a una seccion que requiere un retiro
- Tu seleccion de retiro se mantiene al navegar entre secciones
- Al cambiar de retiro, los permisos se actualizan automaticamente
- Si no hay retiros disponibles, se muestra un boton para crear uno nuevo
