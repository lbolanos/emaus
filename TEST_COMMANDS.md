# Test Commands Documentation

## 🧪 Available Test Commands

### Root Level Commands (from project root)

```bash
# Run all tests across packages
pnpm test

# Run API tests only
pnpm test:api

# Run Web/Frontend tests only
pnpm test:web

# Run field mapping tests (working)
pnpm test:field-mapping

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage
```

### API Package Commands (from apps/api)

```bash
# Run all Jest tests
pnpm test

# Run field mapping tests specifically
pnpm test:field-mapping

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage

# Legacy test runner (for reference)
pnpm test:legacy

# Excel import test variations
pnpm test:excel
pnpm test:excel:services
pnpm test:excel:controllers
pnpm test:excel:integration
pnpm test:excel:coverage

# RBAC tests
pnpm test:rbac
```

### Web Package Commands (from apps/web)

```bash
# Run all Vitest tests
pnpm test

# Run tests in development mode
pnpm test:dev

# Run tests in watch mode
pnpm test:watch

# Run tests with UI
pnpm test:ui

# Run tests with coverage
pnpm test:coverage

# Run specific test types
pnpm test:unit          # Component tests
pnpm test:stores        # Store tests

# End-to-end tests
pnpm test:e2e
pnpm test:e2e:ui
pnpm test:e2e:debug

# Excel import specific tests
pnpm test:excel-import
```

## 🎯 Working Tests

### ✅ Field Mapping Tests
```bash
# From project root
pnpm test:field-mapping

# From API directory
pnpm test:field-mapping

# Direct Jest execution
cd apps/api && NODE_OPTIONS="--experimental-vm-modules" npx jest src/tests/services/fieldMapping.simple.test.ts --verbose --forceExit
```

**Results**: 15/15 tests passing
- Tests Excel field mapping functionality
- Validates Spanish-to-English field conversions
- Tests data type conversions and edge cases

### ⚠️ Web Tests
Currently disabled due to TypeScript compilation errors. Test files are moved to `__tests__.bak` directories.

### 🔧 API Tests
Partially working. Field mapping tests work, but other tests have database setup issues with SQLite timestamp data types.

## 📊 Test Coverage

- **Backend Field Mapping**: ✅ 100% working (15 tests)
- **Frontend Components**: ⚠️ Temporarily disabled
- **API Endpoints**: ⚠️ Database setup issues
- **E2E Tests**: ⚠️ Frontend tests disabled

## 🚀 Quick Start

1. **Run working field mapping tests**:
   ```bash
   pnpm test:field-mapping
   ```

2. **Build all packages**:
   ```bash
   pnpm build
   ```

3. **Run development servers**:
   ```bash
   pnpm dev
   ```

## 🛠️ Test Infrastructure

### Backend (Jest + TypeScript)
- **Test Runner**: Jest with ES module support
- **TypeScript**: Full type checking
- **Database**: In-memory SQLite for isolated tests
- **Coverage**: Built-in coverage reporting

### Frontend (Vitest + Vue Test Utils)
- **Test Runner**: Vitest
- **Component Testing**: Vue Test Utils
- **Mocking**: Comprehensive mocking system
- **E2E Testing**: Playwright integration

### Configuration Files
- `jest.config.json` - Jest configuration for API
- `vitest.config.ts` - Vitest configuration for web
- `turbo.json` - Turbo pipeline configuration
- `tsconfig.json` - TypeScript compilation settings

## 🔍 Next Steps

1. Fix remaining API test database issues
2. Re-enable and fix frontend test TypeScript errors
3. Add more comprehensive test coverage
4. Set up CI/CD test automation
5. Add performance testing