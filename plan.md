Objective: Generate the complete monorepo structure and foundational code for the "Retreat Logistics Management System" as defined in the GEMINI.md context.

Follow the established protocols strictly. For each of the following phases, you will first generate a detailed PLAN. After I approve each plan, you will proceed with the IMPLEMENTATION for that phase.

Phase 1: Foundation Scaffolding

PLAN:
Generate a plan to create the core monorepo configuration files and directory structure. This includes:

The root package.json with workspace scripts (dev, build, lint) and dependencies (typescript, prettier, eslint, turbo).

The root tsconfig.json.

The pnpm-workspace.yaml file defining the workspace paths.

The turbo.json file with the pipeline configuration for dev, build, lint, and test tasks.

The empty directory structure: apps/api, apps/web, and packages/config, packages/tsconfig, packages/types, packages/ui.

User waits for plan, then types "Approved."
IMPLEMENT:
Execute the approved plan for Phase 1.

Phase 2: Shared Packages

PLAN:
Generate a plan to populate the shared packages.

packages/config: Create an eslint-preset.js file with a shared ESLint configuration (including TypeScript and Prettier plugins).

packages/tsconfig: Create a base.json file with a strict, shared TypeScript configuration that other projects in the monorepo will extend.

packages/types: This is the most critical step. Create an index.ts file. In this file, generate the Zod schemas for ALL data models defined in <PROJECT:DATA_MODELS> (Participant, Retreat, House, Room, Table, PalancaLog, InventoryItem). For each schema, also export an inferred TypeScript type using z.infer<typeof schemaName>. Include schemas for API request bodies (e.g., createParticipantSchema).

User waits for plan, then types "Approved."
IMPLEMENT:
Execute the approved plan for Phase 2.

Phase 3: Backend (api) Generation

PLAN:
Generate a plan to scaffold the complete backend Express.js application.

Create the package.json for apps/api with dependencies: express, typeorm, sqlite3, zod, cors, and dev dependencies: @types/express, vite-node, etc. It should reference the shared tsconfig and types packages.

Create the vite.config.ts for backend development with vite-node.

Create the main apps/api/src/index.ts to initialize and run the Express server.

Create the apps/api/src/data-source.ts to configure the TypeORM SQLite connection.

Generate all TypeORM entity files in apps/api/src/entities/ based on the schemas in packages/types.

Create the generic Zod validation middleware in apps/api/src/middleware/validateRequest.ts.

To serve as a template, generate the full CRUD implementation for the Participant resource. This includes:

apps/api/src/routes/participantRoutes.ts

apps/api/src/controllers/participantController.ts

apps/api/src/services/participantService.ts

User waits for plan, then types "Approved."
IMPLEMENT:
Execute the approved plan for Phase 3.

Phase 4: Frontend (web) Generation

PLAN:
Generate a plan to scaffold the complete frontend Vue.js application.

Create the package.json for apps/web with dependencies: vue, pinia, tailwindcss, and dev dependencies: vite, @vitejs/plugin-vue, typescript, vue-tsc. It should reference shared packages.

Create the vite.config.ts including the @ path alias.

Create the tsconfig.json and tsconfig.app.json files, extending the base tsconfig and including the @ path alias.

Configure Tailwind CSS by creating tailwind.config.js and postcss.config.js, and setting up the main CSS file.

Initialize shadcn-vue by generating a components.json file.

Set up Pinia in apps/web/src/main.ts.

To serve as a template, generate the state management and UI for the Participant resource. This includes:

apps/web/src/stores/participantStore.ts (a Pinia store to manage participants).

apps/web/src/components/ParticipantList.vue (a component to display a list of participants).

apps/web/src/views/ParticipantsView.vue (a page component that uses the store and the list component).

Add a basic button component using the shadcn-vue style to the ParticipantList.vue component.

User waits for plan, then types "Approved."
IMPLEMENT:
Execute the approved plan for Phase 4.

Phase 5: Finalization

PLAN:
Generate a plan to create the final documentation.

Create a root README.md file that explains the project structure, the tech stack, and provides instructions on how to install dependencies (pnpm install) and run the development servers (pnpm dev).

User waits for plan, then types "Approved."
IMPLEMENT:
Execute the approved plan for Phase 5.