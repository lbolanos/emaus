# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Architecture

This is a retreat logistics management system built as a monorepo using pnpm workspaces and Turborepo. The system manages religious retreats with features for participant management, housing assignments, table assignments, and various administrative tasks.

### Monorepo Structure

- **apps/api**: Express.js backend with TypeORM and SQLite
- **apps/web**: Vue.js 3 frontend with Composition API, Vite, and Pinia
- **packages/config**: Shared ESLint configurations
- **packages/tsconfig**: Shared TypeScript configurations
- **packages/types**: Shared Zod schemas and TypeScript types
- **packages/ui**: Shared Vue components

### Core Development Commands

```bash
# Install dependencies
pnpm install

# Run all pending migrations
pnpm --filter api migration:run

# Development (runs both API and web)
pnpm dev

# Build all applications
pnpm build

# Lint all applications
pnpm lint

# Format code
pnpm format
```

### Development Environment

- API runs on `http://localhost:3001`
- Web app runs on `http://localhost:5173`

## Key Business Concepts

### Participants

- Two main types: 'walkers' (caminantes) and 'servers' (servidores)
- Participants are never deleted - marked as 'deleted' instead
- Can be imported/exported via Excel/CSV
- Family/friend relationships are tracked with color coding
- Age-based room assignments (younger participants get bunk beds, older get regular beds on lower floors)

### Retreats

- Each retreat has a house with specific room/bed configurations
- Room assignments consider age, snoring habits, and bed types (normal, bunk, mattress)
- Table assignments with leaders (lider, colider1, colider2) and walkers
- Maximum limits for walkers and servers based on house capacity

### Houses

- Track rooms with beds (identified by room number + bed number)
- Bed types: normal, bunk, mattress
- Default usage: walker or server
- Google Maps integration and notes about facilities

### Data Management

- Import/export functionality for participants, inventory, payments
- Excel/CSV support with column selection
- Real-time validation and error handling
- Soft delete pattern for data integrity

## Current Implementation Status

The codebase has extensive Spanish documentation and requirements. Key features being implemented:

- Participant filtering and column selection
- Family/friend color coding system
- Drag-and-drop table assignments
- Room assignment algorithms
- Inventory management with walker-to-item ratios
- Payment tracking and scholarship management
- WhatsApp message templates

## Database Schema

The system uses TypeORM with SQLite. Key entities include:

- Participant (with family_friend_color, snoring info)
- Retreat (with house, capacity limits, notes)
- House (with rooms and beds)
- RoomBed (retreat-specific bed assignments)
- Table (with leader assignments)
- Various assignment and tracking entities

## Authentication and Authorization

### User Roles and Permissions

The system implements role-based access control (RBAC) with the following roles:

- **Superadmin**: Complete system access, including database management and user administration
- **Admin**: Full access to retreat management features, user management within their scope
- **Coordinator**: Retreat-specific access, can manage participants and assignments for assigned retreats
- **Viewer**: Read-only access to retreat information and participant lists

### Authentication System

- JWT-based authentication with refresh tokens
- Session management with configurable expiration
- Password encryption using bcrypt
- Account lockout after failed login attempts
- Email verification for new user registration

### Security Measures

#### Cross-Site Request Forgery (CSRF) Protection

- CSRF tokens for all state-changing operations
- SameSite cookie settings
- Origin header validation
- Token refresh mechanism with secure handling

#### Data Security

- Input validation using Zod schemas
- SQL injection prevention through TypeORM parameterized queries
- XSS protection through proper output encoding
- Secure file upload handling with validation
- Rate limiting on authentication endpoints

#### API Security

- HTTPS enforcement in production
- CORS configuration with allowed origins
- API key management for third-party integrations
- Request logging for security auditing
- Error handling that doesn't expose sensitive information

### Database Migration System

#### Migration Management

- TypeORM migration system for database schema changes
- Automated migration generation with `pnpm --filter api migration:generate`
- Manual migration files in `apps/api/src/migrations/sqlite/`
- Migration rollback capabilities with `pnpm --filter api migration:revert`
- Database seeding with `SEED_FORCE=true pnpm --filter api migration:run`

#### Migration Best Practices

- All schema changes must go through migrations
- Migrations should be reversible
- Test migrations in development before production deployment
- Include data transformation logic when changing existing schemas
- Document breaking changes in migration files

### RBAC Implementation

#### Permission Structure

- Role-based permissions defined in database
- Fine-grained permissions for specific actions
- Hierarchical role inheritance
- Dynamic permission checking in middleware

#### Authorization Middleware

- Route-level protection using decorators
- Resource-based authorization checks
- Permission caching for performance
- Audit logging for sensitive operations

### Important Implementation Notes

- All UI text should be in Spanish
- Use existing WalkerView.vue as template for new list views
- Participants marked as 'waiting' when capacity exceeded
- Room assignments consider snoring compatibility
- Table assignments prevent family/friend conflicts
- Superadmin capabilities for database management
- Always validate user permissions before data access
- Implement proper error handling for unauthorized access
- Use secure HTTP headers in all API responses

### API Integration

**Always use the centralized API service** - never direct fetch calls.

```typescript
// ✅ CORRECT
import { getSmtpConfig } from '@/services/api';
const config = await getSmtpConfig();

// ❌ INCORRECT
const response = await fetch('/api/endpoint', {
	headers: await setupCsrfHeaders(),
	credentials: 'include',
});
```

**Benefits**: Built-in CSRF protection, error handling, authentication, and consistent configuration. Add new functions to `/apps/web/src/services/api.ts`.
