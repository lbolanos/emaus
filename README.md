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

### Development

To start the development servers for both the backend and frontend, run the following command from the root of the project:

```bash
pnpm dev
```

El listado de participantes debe poder descargarse en formato excel o csv.
debe poder seleccionar las columnas que desea ver en el listado.
debe poder buscar un participante y orden por alguna columna.
Los participantes nunca se borrar pero cambiar a type = 'deleted'
importar todos los participantes de un archivo de excel o csv.  se importan de acuerdo a su correo electronico.  Si no existe si crea y si existe se actualiza.
menu para adicionar y editar casas de retiro. al hacer clic debe desaparecer la seleccion de retiro porque es independiente del retiro.  las casas tienen un listado de habitaciones con numero de camas y colchones, uso por defecto para caminante o servidor y si tiene litera. Ubicacion de la casa google maps y direccion.
al crear el retiro se deben leer las habitaciones de la casa de retiro, crear una entidad room_bed que contiene el numero de habitacion y numero de cama o colchon y asignarlas al retiro.  Tambien se deben crear al menos 5 mesas.  Tiene que tener un maximo de caminantes por mesa y un minimo y al crear participante si sobrepasa algun limite crear o borrar una mesa y reordenar las mesas teniendo en cuenta las reglas.
cada que se agregue un caminante debe asignarse una mesa en la que no este ningun caminante con el mismo servidor que lo invito, tambien debe asignarse una habitacion de acuerdo a su edad.  los que tienen litera para los jovenes.  los que no tienen litera para los mas viejos. En caso de colchon para los servidores primero.
agregar una forma de administrar las tablas de la base de datos con solo permisos para el superadmin.
manejo de inventario.  importar y export excel o csv.  Debe tener un ratio con respecto al numero de caminantes de las unidades por defecto y alertar si sobrepasa.  ej si 10 caminante y ratio 1 entonces debe tener al menos 10 unidades. Si 10 caminantes y ratio 0.5 entonces debe tener al menos 5 unidades.
llevar tambien el registro de las camisetas y chaquetas que necesitan los servidores.




agregar un menu para los participantes borrados
crear un formulario en el que le diga los campos que puede modificar y los campos a mostrar


This will use Turborepo to run the `dev` script in both `apps/api` and `apps/web`.

-   The API will be available at `http://localhost:3001`.
-   The Web app will be available at `http://localhost:5173`.