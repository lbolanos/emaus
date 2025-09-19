# Retreat Logistics Management System

This repository contains the monorepo for the Retreat Logistics Management System, a full-stack application designed to manage religious retreats.

## Tech Stack

- **Monorepo:** pnpm Workspaces + Turborepo
- **Language:** TypeScript (Strict Mode)
- **Backend:** Node.js, Express.js, TypeORM, SQLite
- **Frontend:** Vue.js 3 (Composition API), Vite, Pinia
- **UI:** Tailwind CSS, shadcn-vue
- **Validation:** Zod
- **Code Quality:** ESLint, Prettier

## Project Structure

The monorepo is organized into `apps` and `packages`:

- `apps/api`: The Express.js backend server.
- `apps/web`: The Vue.js frontend application.
- `packages/config`: Shared ESLint configurations.
- `packages/tsconfig`: Shared TypeScript configurations.
- `packages/types`: Shared Zod schemas and TypeScript types.
- `packages/ui`: Shared Vue components.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v20 or later)
- [pnpm](https://pnpm.io/)

### Installation

1.  Clone the repository:

    ```bash
    git clone <repository-url>
    cd emaus
    ```

2.  Install dependencies using pnpm:
    ```bash
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    command -v nvm
    nvm install --lts
    nvm install node
    node -v
    npm -v
    npm install -g pnpm
    npm install -g @google/gemini-cli
    corepack up
    pnpm install
    ```

must call
pnpm --filter api db:seed

### Development

To start the development servers for both the backend and frontend, run the following command from the root of the project:

```bash
pnpm dev
```

El listado de participantes debe poder descargarse en formato excel o csv.
debe poder seleccionar las columnas que desea ver en el listado.
debe poder buscar un participante y orden por alguna columna.
Los participantes nunca se borrar pero cambiar a type = 'deleted'
importar todos los participantes de un archivo de excel o csv. se importan de acuerdo a su correo electronico. Si no existe se crea y si existe se actualiza.
crear un formulario en el que le diga los campos que puede modificar y los campos a mostrar
agregar un menu para los participantes borrados
menu item para adicionar y editar casas de retiro. las casas tienen un listado de camas de habitacion con identificacion que corresponde a numero de habitacion y numero de cama, tipo de cama puede ser normal, litera o colchon, uso por defecto para caminante o servidor. Ubicacion de la casa google maps y direccion.
adicionar campo de notas a la casa como no tiene baños, no tiene almohadas etc.
al crear el retiro se deben leer las habitaciones de la casa de retiro, crear una entidad room_bed que contiene el numero de habitacion y numero de cama o colchon y asignarlas al retiro. Tambien se deben crear al menos 5 mesas. Tiene que tener un maximo de caminantes por mesa y un minimo y al crear participante si sobrepasa algun limite crear o borrar una mesa y reordenar las mesas teniendo en cuenta las reglas.
el campo house es obligatorio
adicionar al retiro notas de inicio, notas de cierre, notas de cosas para traer cepillo, jabon, medicinas. Generar codigo QR de los enlaces.
based on @apps/web/src/views/WalkersView.vue copy it and change the fields necessary for the task
Listado Palancas
Listado Pagos, Notas & Puntos de Encuentro
Listado Notas & Puntos de Encuentro
Listado Cuartos
Listado Mesa y Tipo de Usuario
Listado Alimentos
Listado Para Cancelar & Notas
Listado En Espera, Tipo Usuario, Cancelar
Reporte Bolsas con campos id_retreat Nombre Apellidos Mesa Talla
Reporte Medicinas
agregar costo del retiro y notas de la cuenta y forma de pago
agregar un limite de caminantes maximo y un limite de servidores maximo al retiro.
Si sobrepasa este limite al crear un nuevo caminante debe colocarlo como tipo 'waiting'
Cuando se selecciona una casa en la creación del retiro se debe colocar el numero de camas de caminantes como maximo numero de caminantes del retiro. Lo mismo con los servidores.
agregar piso a los cuartos.  
En listado de cuartos agregar los campos piso, edad, type y la forma de asignar participante a la cama
ordenar la lista de asignacion de camas por edad.
crea un plan para crear una nueva entidad con su vista para los responsabilidades del retiro. Se deben poder asignar a un servidor. Los responsabilidades por defecto se deben crear junto con la creacion de un retiro y son
Palancas 1, Palancas 2, Palancas 3,
logistica, Inventario, Tesorero
Sacerdotes
Mantelitos
Snacks
Compras
Transporte
Música
Comedor
Salón
Cuartos
Oración
Palanquitas
Santísmo
Campanero
Continua

add lider, colider 1 and colider 2 to the table entity
add a view to manage tables (mesas). In the top are boxes with server names at the left, and boxes with walker at the right.
below TableCard with all tables. each TableCard has 4 dropzones, for lider, colider1, colider2 and walkers. The user can drag server and put in lider, colider1 or colider2. Drag walker and put in walkers dropzone.
asignar lider y colider de mesa
colocar en español las columnas de participantes
en el formulario de servidores preguntar por si necesita camiseta
cada que se agregue un caminante, debe asignarse a una mesa aleatoria en la que no este ningun caminante con el mismo servidor que lo invito. Tambien debe asignarse una cama de habitacion de acuerdo a su edad. los que tienen litera para los jovenes. las camas normales en los primeros pisos para los mas viejos. En caso de que toque asignar colchon para los servidores mas jovenes primero.
al asignar la cama se deben asociar en la habitacion los que roncan con los que roncan y los que no roncan con los que no roncan.
para la asignacion de mesas has que los en las mesas has que las cajas que se arrastran con servidores y caminantes sean bubbles con el primer nombre y la inicial de su apellido
verificar que un participante solo puede estar en una mesa
al crear un caminante detectar que puede ser familiar o invitado por el mismo servidor de otro caminante y colocarlos de un mismo color usando el campo en participant family_friend_color. if a walker has color, use this for the other. if not take an available color from a pool of 40 colors and verify not exists in any walker.
it searches for existing participants invited by the same person using: - invitedBy field - Inviter email (case-insensitive) - Inviter phone numbers (last 8 digits, normalized)
i need the detect a walker is invited by any person. if two walker are invited by same person put same color. this behaviour is for walker not for server
● Perfect! Now the color assignment logic works exactly as you want:

Updated logic:

1. Only for walkers - No color assignment for servers
2. Groups only - Colors are only assigned when there are 2 or more walkers in a group
3. Group detection by:
   - Same invitedBy (invited by same person)
   - Same inviter contact info (email, phone for Emaus members)
   - Same lastName (family relationship)

When colors are assigned:

- When creating the 2nd+ walker in a group → assigns color to all walkers in the group
- When any walker in a group already has a color → reuses that color
- When it's the first walker in a potential group → no color assigned

When no colors are assigned:

- Single walkers with no group relationships
- Servers
- Walkers who don't match any group criteria

en la vista de habitacion mostrar si ronca en la asignacion
en mesas al pasar a un caminante o servidor validar que la mesa no tenga un familiar o invitador.
make a plan │
crear una tabla en la base de datos con una vista para llevar los │
Mensajes que envia palancas por defecto por whatsapp en la edicion de las palancas. │
Mensaje de Bienvenida a caminante │
Mensaje validar contacto de emergencia │
Mensaje para solicitar las palancas. │
Mensaje para recordar envio de las palancas. │
como son templates ingeniarse la forma para agregar los campos de participant o retreat necesarios en la plantilla │
Ej: Hola {participant.name} Bienvenido al retiro {retreat.name}
select one participant and preview how the message is going to send.
create the default messages when the retreat is created

En la lista de participantes el boton de mensajes debe abrir un dialogo en que puedes seleccionar el numero de telefono de todos los que tiene el participante: telefono casa, mobil, trabajo, telefono emergencia ..., telefono invitador, indicando de quien es el telefono, seleccionar el mensaje a enviar un boton enviar.

manejo de inventario para el retiro.  
Debe tener un ratio con respecto al numero de caminantes de las unidades por defecto y alertar si sobrepasa.  
ej si 10 caminante y ratio 1 entonces debe tener al menos 10 unidades. Si 10 caminantes y ratio 0.5 entonces debe tener al menos 5 unidades.
importar y export excel o csv.
cada articulo tiene que tener una categoria. las categorias son snacks, botiquin, aseo personal, papeleria
tambien debe tener un campo de equipo y son: Recepción, Caminantes, Botiquín 1Eros Aux, Música, Comedor Salón Santísimo Campana Cuartos Papelería Palancas Snacks, Quema De Pecados, Pared Lavado De Manos Bolsas Salida
un campo de cantidad requerida
un campo de unidad: frascos, cajas, litros ... etc
al crear el retiro se deben crear por defecto todo el listado y poder agregar, modificar y borrar.
add requiredQuantity to apps/api/src/entities/inventoryItem.entity.ts if is null or empty the ratio works but if has a value then the ratio does not work and have a fixed number of items not related with the amount of walkers

apps/web/src/views/ParticipantRegistrationView.vue
En el registro de los servidores se necesita agregar cuatro campos uno para preguntar si necesita la camiseta blanca, si necesita la camiseta azul, y si necesita chaqueta, ademas de la talla.
adicione los campos necesarios a apps/api/src/entities/retreatInventory.entity.ts
en el inventario agregar camisetas blancas talla M que en el inventario del retiro requiredQuantity correspondera a la suma de los caminantes con tshirtSize=M mas el numero de servidores con el campo necesita camiseta blanca y con tshirtSize=M. Lo mismo para las otras tallas.
create a database migration pattern with a table in database to manage the migrations already executed.
add support for sqlite migrations and postgress migrations.
En el registro de los servidores se necesita modificar los campos si necesita la camiseta blanca, si necesita la camiseta azul, y si necesita chaqueta modificar the boolean a string y preguntar la talla o no necesita. si no necesita dejar en null.

guardar en un store el listado de columnas que se han modificado

roles: un superadmin, un usuario administrador del retiro, un usuario servidor del retiro, tesorero, logística, palancas
superadmin puede acceso total
solo el superadmin puede borrar casas de retiro, articulos de inventario
El administrador puede crear y editar casas de retiro, articulos de inventario.
el servidor solo puede leer casas de retiro, articulos de inventario.
cada usuario administrador tiene asociado un listado de retiros y puede invitar a otro usuario con el correo a cualquier retiro que el tenga asociado como administrador o como servidor del retiro o como ....
export const DEFAULT_OPERATIONS = ['create', 'read', 'update', 'delete', 'list'] as const;
export const RESOURCES = {
participant: [...DEFAULT_OPERATIONS] as const,

en los controller
@GlobalScope('participant:update')
async updateParticipant(...

enviar los permisos del usuario al frontend en el login
y usar esta informacion para mostrar lo que esta autorizado a hacer

create a UserManagementMailer service that get MessageTemplate of the retreat to send message to user to invite, passwordReset, notifyRetreatShared
create the default MessageTemplate in retreat creation.
get smtp connection parameters from env

create a plan to create an InvitationController with inviteUser
@Post('/', { rateLimit: { limit: 10 } })
@GlobalScope('user:create')
@Post('/:id/accept', { skipAuth: true })
async acceptInvitation(
en the frontend Views

Crear sistema para registrar los pagos realizados

analisis de seguridad de todo el sitio

colocar en nombre de piso camas y habitacion en edicion de casas
add a field telefono de contacto en retiro
telefon caminante esposa todos en la ficha de mesas
id en la tabla de mesas
si va litera en etiqueta de cuartos
colocar en reporte de bolsas recordatorio de agua bendita, playera, celulares palancas, invitacion para otro retiro.
si cumple en los dias del retiro sacar una alarma.

IN PROGRESS
cualquier mensaje se puede enviar por correo o por whatsapp
llevar un registro de las comunicaciones del participantes.

TODO
since it is not in production modify apps/api/src/migrations/sqlite/20250910163337_CreateSchema.ts for schema.

cuando un servidor se registre enviar tambien correo al servidor que lo invito para informar.

en el mensaje de bienvenida del servidor agregar una url para que pueda cambiar su registro

dinamica imprimir dinamica de los equipos instrucciones de la dinamica
agregar todas las actividades por servidor

asigncacion de cuartos tal como se hace en las mesas con un dashboard.

gafete mesa nombre apodo cuarto rosa

Notificaciones por correo. Caminante ingresa. Servidor ingresa.

agregar una forma de administrar las tablas de la base de datos con solo permisos para el superadmin.

alimentos y medicinas agregar columna mesa para ordenar y lider

para las palancas agregar datos de si son becados y pagos y notas de pagos
importar pagos
agregar mesa y lider a alimentos y medicinas impresion.

una forma de hacer backup del retiro y luego importar.

Que debe pasar cuando se cancele un participante ... unassign from retreatBed and from tableMesa

hacer que funcione lint

imprimir la mesa con lider caminantes telefonos, medicamentos y alimentos.
usar la ia para conversar y agregar o quitar base de datos.

posibles host
https://www.vultr.com/
https://www.hostinger.com/
https://www.digitalocean.com/
supabase

al selecciona menu casas de retiro debe desaparecer la seleccion de retiro porque es independiente del retiro.
This will use Turborepo to run the `dev` script in both `apps/api` and `apps/web`.

- The API will be available at `http://localhost:3001`.
- The Web app will be available at `http://localhost:5173`.
