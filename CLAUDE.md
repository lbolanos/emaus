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

# Database seeding (required after initial setup)
pnpm --filter api db:seed

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

## Important Implementation Notes

- All UI text should be in Spanish
- Use existing WalkerView.vue as template for new list views
- Participants marked as 'waiting' when capacity exceeded
- Room assignments consider snoring compatibility
- Table assignments prevent family/friend conflicts
- Superadmin capabilities for database management