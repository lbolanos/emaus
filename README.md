# Retreat Logistics Management System

This repository contains the monorepo for the Retreat Logistics Management System, a full-stack application designed to manage religious retreats.

El logotipo de Emaús Hombres, consiste en dos simples figuras, pragmáticas y superpuestas: la pri- mera es una cruz vacía o de color blanca, con bordes en color dorado, que se extiende desde la parte inferior; y la segunda figura, es una rosa roja, que aparece erguida desde la base de la cruz, hasta llegar al centro de ésta, con sus pétalos abiertos y extendidos.

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
hacer que funcione lint
roles: un superadmin, un usuario administrador del retiro, un usuario servidor del retiro, treasurer, logistics, palancas
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

cualquier mensaje se puede enviar por correo o por whatsapp
llevar un registro de las comunicaciones del participantes.

show the rol in header for the specific retreat selected
do not send email if is importing and if the retreat is not public
cuando un participante se registre enviar correo de bienvenida
cuando un caminante se registre enviar correo de bienvenida enviar tambien correo al servidor que lo invito para informar.
asignacion de cuartos tal como se hace en las mesas con un dashboard.
remover del menu todos las paginas que requieras retiro si no esta seleccionado.
Que debe pasar cuando se cancele un participante ... unassign from retreatBed and from tableMesa
agregar al retiro hora de llegada de caminantes ... y hora de llegada de servidores el viernes.
add a button to create a docx file to imprimir la mesa con lideres caminantes telefonos, medicamentos y alimentos para entregar a los servidores.
gafete apodo o nombre, tableMesa, habitacion (floor, room, bed type) y imagen de una rosa
crear el flyer del retiro en la web.
verificar mover los caminantes en el vista de camas. already has another bed assignment. verificar permisos para admin.
mas grande el mensaje de un encuentr o de esperanza
enpequeñecer el que llevar
colocar una imagen en el footer
atrevete vivelo en centro de la footer
que quede fijo el header en la creacion de las habitaciones de la casa

Telemetry
litera arriba, litera abajo

obligatorio un telefono celular
no obligatorios
parroquia y ocupacion
obligatorio dos contactos de emergencia y obligatorio correo y algun celular
agregar litera de arriba y de abajo.

Considera que esta es la primera persona a la que contactaremos en caso de alguna emergencia.
preguntar en el formulario si tiene discapacidad
agregar un parametro en el retiro para no solicitar punto de Convenient meeting point

una forma de agregar tags a los participantes para que no queden en la misma mesa. caminantes y servidores que tengan los mismos tags no pueden estar en la misma mesa.
al agarrar un caminante debe hacer scroll para cambiar abajo o arriba
esta poniendo un dia antes al registrar un pago.

agregar un filtro de quienes han pagado en la lista de caminantes.
listado de caminantes imprimir.

imprimir bag report

1. Implement dependency injection for DataSource (remove singleton pattern)
2. Redesign services to accept DataSource as a constructor parameter
3. Add more component tests - Test additional components in the codebase
4. Improve test coverage - Add edge cases and integration tests
5. Set up coverage reporting - Generate code coverage reports
6. Move to API backend tests - Work on the API service/controller tests
7. Review and clean up code - Remove any console.logs or temporary debug code

nombre del retiro en gafete. No colocar el piso solo el cuarto y cama.
poder imprimir solo algunos gafetes.

create a detail plan for community managment.  
I need the user can create his own community with address where is the meeting and a way to announce the the meetings or events and duration.  
from the retreat the user has access, add the participants to the community.  
the system must know which community members assist to meeting in order to send message to members that do not assist
the idea is that admin community can follow the participant if he can continue with the process.  
the community participant can be part of diferent communities in each community he has a state: far_from_location, no_answer, another_group, active_member.
i need dashboard with pie with state. another pie with frequency of participation with high, medium, low, none.
Add the way to invite another user to admin my community

location fields apps/web/src/views/CommunityListView.vue based on apps/web/src/components/AddEditHouseModal.vue

cuando edito la comunidad y cierro el dialogo la interface se queda sin reponder

el boton de submit al agregar una reunion no esta haciendo nada
when clic in importar miembros the dialog is not closed

enhance the ux and usability of all community views

se debe contar desde la fecha de ingreso para el porcentaje de participacion de los miembros de la comunidad

agregar notas a los participantes de la comunidad
agregar historial de reuniones y eventos de un miembro
un boton para mostrar todos los mensajes enviados a un participante y la forma de enviar un mensaje tal como se hace en apps/web/src/components/ParticipantList.vue

Implementar la funcionalidad de invitar un usuario a ser administrador de la comunidad

agregar una flyer para la reunion que pueda salvarse como pdf para que tengan el link de la ubicacion o imprimirse con el QR de la ubicacion. Crear un campo en la reunion con mensaje template que utilice variables como fecha, nombre, descripcion, duracion, localizacion de la comunidad para mostrar en el flyer.

agregar un formulario basico para crear un participante de la comunidad asi no tenga retiro asociado.

apps/web/src/views/CommunityMeetingFlyerView.vue componentize the flyer to create a list of flyer styles.
create button the open apps/web/src/components/community/MeetingFormModal.vue and change data for the flyer.
en el formulario aumentar el width y agrega una pestaña para el flyerTemplate en el que se pueda hacer ver el mensaje final y el listado de variables que se puede agregar haciendo clic.
adicionar un nuevo flyer style con el siguiente formato: use apps/web/public/poster.png as background
the MessageTemplate and ParticipantCommunication now belongs to a retreat. I need new entity to save message templates for community. also ParticipantCommunication save if was a communication of the retreat or the community.
en el dashboard la frecuencia de participacion no esta funcionando corectamente
al cerrar el dialogo de editar comunidad la interfaz deja de funcionar (frezee when closing edit community). Try Teleport
standarize the breadcrumb in community apps/web/src/views/CommunityListView.vue
in the login put the logo with a link to landingpage
when login it redirects to landing ... make dashboard the first page when logged
cambio de password requiere oontraseña actual. para los usuarios que se registraron por google solo configurar el password.
Política de Privacidad y terminos y un reCAPTCHA al formulario

Error al copiar la imagen del flyer de la reunión.

## Social Features

The system now includes social networking features for users (servers/converted walkers):

- **User Profiles**: Bio, location, website, interests, skills, and avatar management
- **Friend System**: Send/accept/reject friend requests, manage friendships
- **Follow System**: Follow/unfollow users, view followers and following lists
- **User Blocking**: Block/unblock users
- **User Search**: Search users by name, interests, skills, location
- **Avatar Storage**: Base64 or AWS S3 storage with automatic image processing

For detailed API documentation, see [docs_dev/SOCIAL_FEATURES_API.md](./docs_dev/SOCIAL_FEATURES_API.md).

Community management and landing page improvements.
crear una forma en el que los usuarios puedan ver y crear testimonios o mensajes de otros acerca de su experiencia.

## IN PROGRESS

create a migration script just for testing red social. is not for production. create users, retreats, communities, houses, participants, messages, friends, followers, blocks, searches, avatars, and messages.
Cuando un usuario se registra y existe como caminante de algun retiro convertirlo en usuario y que pueda ver el historial de retiros en los que ha participado como servidor y el retiro en el que camino como principal.
al registrar un servidor es posible que ya exista como caminante que debemos hacer en este caso?
El registro de charlistas globales. El charlista es un servidor.
Agregar los charlistas del retiro ya registrados previamente.

apps/web/src/components/layout/Sidebar.vue apps/web/src/components/layout/Header.vue docs_dev/HELP_SYSTEM_GUIDE.md
necesito que mejores la usabilidad y user experience del sitio. hay temas globales como retiros, casas de retiros, comunidades, Telemetria, Plantillas globales.
cuando se selecciona retiros se muestra para poder seleccionar el retiro. Pero si selecciona alguna otra no se necesita seleccionar retiro.
agrega la documenatcion necesaria acerca de esto en apps/web/src/docs
crear una landing page que muestre los retiros proximos y las comunidades y sus proximas reuniones

## TODO

dinamica imprimir dinamica de los equipos instrucciones de la dinamica
agregar todas las actividades por servidor

Crear un retiro a partir de los datos del anterior retiro. Casa de retiro, inventario, mensajes.

agregar una forma de administrar las tablas de la base de datos con solo permisos para el superadmin.

alimentos y medicinas agregar columna mesa para ordenar y lider

para las palancas agregar datos de si son becados y pagos y notas de pagos
importar pagos
agregar mesa y lider a alimentos y medicinas impresion.

una forma de hacer backup del retiro y luego importar.

usar la ia para conversar y agregar o quitar base de datos.

una forma de asegurar que no se modifique las mesas. lock tables

api.ts:709
POST http://localhost:3001/api/communities 400 (Bad Request)
Promise.then
createCommunity @ api.ts:709
createCommunity @ communityStore.ts:91
handleSave @ CommunityListView.vue:429

CommunityListView.vue:439 Failed to save community:
AxiosError {message: 'Request failed with status code 400', name: 'AxiosError', code: 'ERR_BAD_REQUEST', config: {…}, request: XMLHttpRequest, …}
handleSave @ CommunityListView.vue:439

en el mensaje de bienvenida del servidor agregar una url para que pueda cambiar su registro
Notificaciones por correo a los administradores del retiro de eventos como Caminante ingresa. Servidor ingresa. Forma de desactivar estas notificaciones.
que los caminantes no vayan con la persona que lo invito
no deja enviar correo de invitacion si el usuario existe

aumentar el coverage de las pruebas
verificar que todas la pruebas pasen.

## comunidades

Las comunidades tienen que ser aceptadas por los administradores de otras comunidades.

los usuarios que quieran crear testimonios tienen que tener una comunidad asociada y el testimonio debe ser aceptado por el administrador de la comunidad asociada para poderse publicar.

## landing

stories

una forma de agregar retiros desde mucho antes y que la gente se pueda inscribir sin necesidad de que tenga toda la informacion de la casa de retiro.
Colocar la fecha de la proxima reunion en Horarios de reuniones. Cuando haga clic en el lugar lance google maps

en la seccion the path Agregar la lectura del dia en audio y en texto. un boton solo visible para el superadmin con el que se suben.  
tambien aregar en la seccion de path otro audio y otro texto.
estos audios y texto se suben a la s3 publica.

## Pepe Toño

en el inventario agregar un campo que indique cuantas unidades deben comprarse y sacar un reporte de inventario a comprar.

deberia enviar directo al link despues de accept InvitationController

al dar clic en print tables, seleccionar los campos que se deben imprimir.

pendiente en listado de pagos que ordene
listado de pagos que se pueda imprimir

en caso de que no se pueda en ninguna mesa que hacer con ese caminante

al selecciona menu casas de retiro debe desaparecer la seleccion de retiro porque es independiente del retiro.

This will use Turborepo to run the `dev` script in both `apps/api` and `apps/web`.

- The API will be available at `http://localhost:3001`.
- The Web app will be available at `http://localhost:5173`.

## prompts:

now is working. tell me a little description of how to solve this problem to remember you next time
Please use the Playwright MCP server to test the following process:
connect http://localhost:5173
login with
SEED_MASTER_USER_EMAIL=leonardo.bolanos@gmail.com
SEED_MASTER_USER_PASSWORD=ewdesrrcdww
Clic Menu Global Templates
Search for BIRTHDAY_MESSAGE and clic title="Editar"
Select text "¡Feliz cumpleaños" y clic en boton negrillas.
Fix any issue with text changes

pnpm lint && echo "✅ Lint passed" && pnpm format --check && echo "✅ Format check passed"

./start.sh

git clean -fdx
lsof -ti:3001 | xargs -r kill -9
git tag -d v0.0.1
git push origin --delete v0.0.1
sudo nginx -t
sudo systemctl status nginx
pm2 restart emaus-api
pm2 status
sudo lsof -i :3001
curl http://localhost/api/health
curl http://localhost/assets/index.js
curl http://localhost:3001/api/auth/status
less /root/.pm2/logs/emaus-api-error.log
less /var/log/emaus-api-out.log
pm2 logs emaus-api
rsync -avz . root@155.138.230.215:/var/www/emaus/
rsync -avz \
--exclude '.git' \
--exclude '.turbo' \
--exclude 'apps/api/database.sqlite' \
--exclude 'apps/api/.env' \
--exclude 'apps/web/.env' \
 . root@155.138.230.215:/var/www/emaus/

rsync -avz \
--exclude '.git' \
--exclude '.turbo' \
--exclude 'apps/api/database.sqlite' \
--exclude 'apps/api/.env' \
--exclude 'node_modules' \
--exclude 'apps/web/.env' \
 . root@155.138.230.215:/var/www/emaus/

scp root@155.138.230.215:/var/www/emaus/apps/api/database.sqlite apps/api/database.sqlite
sqlite3 /var/www/emaus/apps/api/database.sqlite "INSERT OR IGNORE INTO user_roles (userId, roleId) VALUES ('254a1d26-3c53-485a-a0ec-950a43d30aed', 3);"
sqlite3 /var/www/emaus/apps/api/database.sqlite "SELECT u.email, u.displayName, r.name as role_name FROM users u LEFT JOIN user_roles ur ON u.id = ur.userId LEFT JOIN roles r ON ur.roleId = r.id WHERE u.email = 'lunavalentinabe@isb.edu.mx';"
ssh root@155.138.230.215 "cat /var/www/emaus/apps/api/database.sqlite" > apps/api/database.sqlite

scp root@155.138.230.215:/var/www/emaus/apps/api/.env ./apps/api/
scp root@155.138.230.215:/var/www/emaus/apps/api/.env.production ./apps/api/

# how to deploy best way

## local

scp root@155.138.230.215:/var/www/emaus/apps/web/.env ./apps/web/
scp root@155.138.230.215:/var/www/emaus/apps/web/.env.production ./apps/web/

enhance usability of
enhance with user experience

export frontend_url='https://emaus.cc'  
export DOMAIN_NAME='emaus.cc'
export VPS_HOST=155.138.230.215
export VPS_USER=root
export GITHUB_REPO=lbolanos/emaus
export NEW_TAG=v0.0.5
export RELEASE_TAG=v0.0.5
export CERTBOT_EMAIL=leonardo.bolanos@gmail.com

./create-release.sh

## remote

ssh root@155.138.230.215

cd /var/www/emaus/
export frontend_url='https://emaus.cc'  
export DOMAIN_NAME='emaus.cc'
export VPS_HOST=155.138.230.215
export VPS_USER=root
export GITHUB_REPO=lbolanos/emaus
export NEW_TAG=v0.0.5
export RELEASE_TAG=v0.0.5
export CERTBOT_EMAIL=leonardo.bolanos@gmail.com
./release-from-github.sh

# how to update

## local testing the migration

scp root@155.138.230.215:/var/www/emaus/apps/api/database.sqlite apps/api/database.sqlite
pnpm migration:run

## copy files

rsync -avz \
--exclude '.git' \
--exclude '.turbo' \
--exclude 'apps/api/database.sqlite' \
--exclude 'apps/api/.env' \
--exclude 'apps/web/.env' \
 . root@155.138.230.215:/var/www/emaus/

## remote

pm2 logs emaus-api
pm2 restart emaus-api

## posibles host

https://www.vultr.com/
https://www.hostinger.com/
https://www.digitalocean.com/
supabase

## migration vultr to aws

scp -i ~/.ssh/emaus-key.pem ubuntu@3.138.49.105:/var/www/emaus/apps/api/database.sqlite apps/api/database.sqlite 2>&1 && echo "✅ Database copied from AWS"

sudo chown www-data:www-data -R /var/www/emaus
sudo chown ubuntu:ubuntu -R /var/www/emaus
rsync -avz -e "ssh -i ~/.ssh/emaus-key.pem" \
--exclude '.git' \
--exclude '.turbo' \
--exclude 'apps/api/database.sqlite' \
--exclude 'apps/api/.env' \
--exclude 'node_modules' \
--exclude 'apps/web/.env' \
 . ubuntu@3.138.49.105:/var/www/emaus/

scp -i ~/.ssh/emaus-key.pem apps/api/database.sqlite ubuntu@3.138.49.105:/var/www/emaus/apps/api/database.sqlite 2>&1 && echo "✅ Database uploaded to AWS"

## aws

ssh -i ~/.ssh/emaus-key.pem ubuntu@$(aws ec2 describe-instances --filters "Name=tag:Name,Values=emaus\*" "Name=instance-state-name,Values=running" --query "Reservations[0].Instances[0].PublicIpAddress" --output text --region us-east-2 --profile emaus) "cd /var/www/emaus && if [ -f apps/api/.env.example ]; then cp apps/api/.env.example
apps/api/.env.production && echo 'Copied .env.example to .env.production'; else echo 'No .env.example found'; fi"
ssh -i ~/.ssh/emaus-key.pem ubuntu@3.138.49.105

📋 Next Steps:

1. Copy the setup script to the instance:
   scp -i ~/.ssh/emaus-key.pem deploy/aws/setup-aws.sh ubuntu@3.138.49.105:/home/ubuntu/
   scp -i ~/.ssh/emaus-key.pem deploy/aws/deploy-aws.sh ubuntu@3.138.49.105:/home/ubuntu/

2. SSH into the instance:
   ssh -i ~/.ssh/emaus-key.pem ubuntu@3.138.49.105

3. Run the setup script:
   chmod +x setup-aws.sh && ./setup-aws.sh

4. Set environment variables and deploy:
   export DOMAIN_NAME=emaus.cc
   export RELEASE_TAG=v0.0.5
   cd /var/www/emaus/deploy/aws && ./deploy-aws.sh

## que hacer en el proximo retiro

hablar con mucha gente, hacer conocer el sistema
hacer entrevistas a los servidores de como les cambio la vida emaus. Pedir concentimiento para poner sus datos en la pagina.
