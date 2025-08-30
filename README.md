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

This will use Turborepo to run the `dev` script in both `apps/api` and `apps/web`.

-   The API will be available at `http://localhost:3001`.
-   The Web app will be available at `http://localhost:5173`.