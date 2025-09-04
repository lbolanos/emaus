# Retreat Logistics Management System

This repository contains the monorepo for the Retreat Logistics Management System, a full-stack application designed to manage religious retreats.

## Tech Stack

-   **Monorepo:** pnpm Workspaces + Turborepo
-   **Language:** TypeScript (Strict Mode)
-   **Backend:** Node.js, Express.js, TypeORM, SQLite
-   **Frontend:** Vue.js 3 (Composition API), Vite, Pinia
-   **UI:** Tailwind CSS, shadcn-vue
-   **Validation:** Zod
-   **Code Quality:** ESLint, Prettier

## Project Structure

The monorepo is organized into `apps` and `packages`:

-   `apps/api`: The Express.js backend server.
-   `apps/web`: The Vue.js frontend application.
-   `packages/config`: Shared ESLint configurations.
-   `packages/tsconfig`: Shared TypeScript configurations.
-   `packages/types`: Shared Zod schemas and TypeScript types.
-   `packages/ui`: Shared Vue components.

## Getting Started

### Prerequisites

-   [Node.js](https://nodejs.org/) (v20 or later)
-   [pnpm](https://pnpm.io/)

### Installation

1.  Clone the repository:
    ```bash
    git clone <repository-url>
    cd emaus
    ```

2.  Install dependencies using pnpm:
    ```bash
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
importar todos los participantes de un archivo de excel o csv.  se importan de acuerdo a su correo electronico.  Si no existe se crea y si existe se actualiza.
crear un formulario en el que le diga los campos que puede modificar y los campos a mostrar
agregar un menu para los participantes borrados
menu item para adicionar y editar casas de retiro. las casas tienen un listado de camas de habitacion con identificacion que corresponde a numero de habitacion y numero de cama,  tipo de cama puede ser normal, litera o colchon, uso por defecto para caminante o servidor. Ubicacion de la casa google maps y direccion.
adicionar campo de notas a la casa como no tiene baños, no tiene almohadas etc.
al crear el retiro se deben leer las habitaciones de la casa de retiro, crear una entidad room_bed que contiene el numero de habitacion y numero de cama o colchon y asignarlas al retiro.  Tambien se deben crear al menos 5 mesas.  Tiene que tener un maximo de caminantes por mesa y un minimo y al crear participante si sobrepasa algun limite crear o borrar una mesa y reordenar las mesas teniendo en cuenta las reglas.
el campo house es obligatorio
adicionar al retiro notas de inicio,  notas de cierre, notas de cosas para traer cepillo, jabon, medicinas.  Generar codigo QR de los enlaces.
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
Si sobrepasa este limite al crear un nuevo caminante debe colocarlo como  tipo 'waiting'
Cuando se selecciona una casa en la creación del retiro se debe colocar el numero de camas de caminantes como maximo numero de caminantes del retiro.  Lo mismo con los servidores.


IN PROGRESS
agregar piso a los cuartos.  
En listado de cuartos agregar los campos piso, edad, type y la forma de asignar

TODO

al selecciona menu casas de retiro debe desaparecer la seleccion de retiro porque es independiente del retiro.


cada que se agregue un caminante debe asignarse una mesa en la que no este ningun caminante con el mismo servidor que lo invito, tambien debe asignarse una habitacion de acuerdo a su edad.  los que tienen litera para los jovenes.  los que no tienen litera para los mas viejos. En caso de colchon para los servidores primero.
agregar una forma de administrar las tablas de la base de datos con solo permisos para el superadmin.
manejo de inventario.  importar y export excel o csv.  Debe tener un ratio con respecto al numero de caminantes de las unidades por defecto y alertar si sobrepasa.  ej si 10 caminante y ratio 1 entonces debe tener al menos 10 unidades. Si 10 caminantes y ratio 0.5 entonces debe tener al menos 5 unidades.
llevar tambien el registro de las camisetas y chaquetas que necesitan los servidores.
cada usuario tiene asociado un listado de retiros y puede invitar a otro usuario con el correo a cualquier retiro que el tenga asociado.
guardar en cache el listado de columnas que se han modificado

alimentos y medicinas agregar columna mesa para ordenar y lider
asignar lider y colider de mesa
cargos ...  palancas 1,  palancas 2,  palancas 3,  logistica, Inventario, Tesorero
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


un usuario administrador y un usuario normal
el administrador puede borrar casas de retiro
colocar en español las columnas de participantes

cookie jwt para acceso



posibles host
https://www.vultr.com/
https://www.hostinger.com/
https://www.digitalocean.com/


This will use Turborepo to run the `dev` script in both `apps/api` and `apps/web`.

-   The API will be available at `http://localhost:3001`.
-   The Web app will be available at `http://localhost:5173`.











