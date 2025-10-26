# Excel Import Testing System

This directory contains a comprehensive testing system for the Excel import functionality of the retreat management system. The testing framework covers service layer tests, controller tests, data mapping validation, and integration tests.

## 📁 Test Structure

```
src/tests/
├── README.md                           # This file
├── test-setup.ts                       # Test database and environment setup
├── run-tests.ts                        # Original RBAC test runner
├── run-excel-import-tests.ts           # Excel import test runner
├── test-utils/
│   ├── testDataFactory.ts              # Factory for creating test data
│   ├── excelImportTestUtils.ts         # Utilities for Excel import testing
│   └── authTestUtils.ts                # Authentication testing utilities
├── fixtures/
│   └── excelFixtures.ts                # Test data fixtures for Excel import
├── services/
│   ├── participantService.test.ts      # Service layer tests
│   └── fieldMapping.test.ts            # Field mapping validation tests
└── controllers/
    └── participantController.test.ts   # Controller/API tests
```

## 🚀 Quick Start

### Running All Excel Import Tests
```bash
# From the monorepo root
pnpm --filter api test

# Or from the API directory
pnpm test:excel

# Run with coverage reporting
pnpm test:excel:coverage
```

### Running Specific Test Categories

#### Service Layer Tests
```bash
pnpm test:excel:services
```
Tests the `importParticipants` service function including:
- Happy path scenarios
- Error handling and validation
- Business logic (table/bed assignments, color coding)
- Transaction integrity
- Performance testing

#### Controller Tests
```bash
pnpm test:excel:controllers
```
Tests the API endpoints including:
- Request/response validation
- Authentication and authorization
- Error handling
- Rate limiting
- CSRF protection

#### Field Mapping Tests
```bash
pnpm test:excel:field-mapping
```
Tests Spanish-to-English field mapping including:
- All field mappings
- Data type conversions
- Edge cases and special characters
- Boolean field handling
- Date validation

#### Integration Tests
```bash
pnpm test:excel:integration
```
End-to-end testing of the complete import flow including:
- File processing simulation
- Database consistency
- Complex business scenarios
- Error recovery

## 📊 Test Categories

### 1. Service Layer Tests (`participantService.test.ts`)

**Coverage Areas:**
- ✅ **Happy Path Tests**: Valid participant import scenarios
- ✅ **Error Handling**: Invalid data, missing fields, validation errors
- ✅ **Edge Cases**: Different participant types, cancellations, special needs
- ✅ **Performance Tests**: Large batch imports, concurrent operations
- ✅ **Transaction Integrity**: Database consistency, rollback scenarios
- ✅ **Business Logic**: Table assignments, bed assignments, family color coding
- ✅ **Payment Integration**: Payment creation and adjustments

**Key Test Scenarios:**
```typescript
// Valid participants with table and bed assignments
test('should import valid participants successfully', async () => {
  const result = await ExcelImportTestUtils.executeImport(VALID_PARTICIPANTS_FIXTURE);
  expect(result.result.importedCount).toBe(VALID_PARTICIPANTS_FIXTURE.length);
});

// Family color coding
test('should handle family color coding correctly', async () => {
  // Tests that family members get the same color
});

// Leadership assignments
test('should handle leadership assignments correctly', async () => {
  // Tests lider, colider1, colider2 assignments
});
```

### 2. Field Mapping Tests (`fieldMapping.test.ts`)

**Coverage Areas:**
- ✅ **Basic Field Mapping**: Personal information, addresses, phone numbers
- ✅ **Type Mapping**: `tipousuario` to participant type conversion
- ✅ **Boolean Fields**: Spanish 'S'/'N' to boolean conversion
- ✅ **Date Validation**: Birth date component validation
- ✅ **Sacraments**: Array of sacraments from individual fields
- ✅ **Emergency Contacts**: Both primary and secondary contacts
- ✅ **Special Characters**: Accents, special characters, long strings

**Key Test Scenarios:**
```typescript
// Basic field mapping
test('should map basic personal information correctly', () => {
  const spanishData = {
    nombre: 'Juan Carlos',
    apellidos: 'Pérez García',
    email: 'juan.perez@example.com'
  };
  const mappedData = mapToEnglishKeys(spanishData);
  expect(mappedData.firstName).toBe('Juan Carlos');
});

// Type mapping
test('should map tipousuario values correctly', () => {
  const testCases = [
    { tipousuario: '3', expectedType: 'walker' },
    { tipousuario: '0', expectedType: 'server' },
    { tipousuario: '4', expectedType: 'waiting' }
  ];
});
```

### 3. Controller Tests (`participantController.test.ts`)

**Coverage Areas:**
- ✅ **Authentication**: Token validation, user verification
- ✅ **Authorization**: Role-based access control
- ✅ **Request Validation**: Body structure, parameter validation
- ✅ **Error Handling**: HTTP status codes, error messages
- ✅ **Response Format**: Consistent API responses
- ✅ **CSRF Protection**: Security middleware testing

**Key Test Scenarios:**
```typescript
// Successful import
test('should successfully import valid participants', async () => {
  const response = await request(app)
    .post(`/participants/import/${testRetreat.id}`)
    .set('Authorization', `Bearer ${authToken}`)
    .send({ participants: VALID_PARTICIPANTS_FIXTURE });

  expect(response.status).toBe(200);
  expect(response.body).toHaveProperty('importedCount');
});

// Authentication
test('should reject requests without authentication', async () => {
  const response = await request(app)
    .post(`/participants/import/${testRetreat.id}`)
    .send({ participants: VALID_PARTICIPANTS_FIXTURE });

  expect(response.status).toBe(401);
});
```

## 🎯 Test Fixtures

The `excelFixtures.ts` file contains comprehensive test data for various scenarios:

### Valid Participants
- Basic participant data with all required fields
- Table and bed assignments
- Payment information
- Emergency contacts

### Family Relationships
- Participants with same last names (family)
- Participants invited by same person
- Color coding scenarios

### Invalid Data
- Missing required fields
- Invalid email formats
- Invalid date components
- Malformed data structures

### Edge Cases
- Different participant types (walker, server, waiting, partial_server)
- Cancelled participants
- Participants with special medical/dietary needs
- Leadership assignments

### Large Batch
- 100+ participants for performance testing
- Randomized data for stress testing

## 🛠️ Test Utilities

### TestDataFactory
Creates test entities and environments:
```typescript
// Create complete test environment
const env = await TestDataFactory.createCompleteTestEnvironment();

// Create specific entities
const user = await TestDataFactory.createTestUser({ role: 'admin' });
const retreat = await TestDataFactory.createTestRetreat();
```

### ExcelImportTestUtils
Utilities for testing Excel import functionality:
```typescript
// Execute complete import
const result = await ExcelImportTestUtils.executeImport(participantData);

// Verify import results
const verification = await ExcelImportTestUtils.verifyParticipantImport(
  expectedData, actualParticipants, retreatId
);

// Verify table assignments
const tableVerification = await ExcelImportTestUtils.verifyTableAssignments(
  participants, expectedAssignments
);
```

### AuthTestUtils
Authentication testing utilities:
```typescript
// Generate test tokens
const token = generateTestToken(user);
const expiredToken = generateExpiredToken(user);

// Test authentication scenarios
authTestScenarios.withValidToken(user, requestFn);
authTestScenarios.withInvalidToken(requestFn);
```

## 📈 Test Reports

The testing system generates comprehensive reports:

### Console Output
- Real-time test execution progress
- Success/failure summary
- Detailed error messages
- Performance metrics

### Coverage Reports
- Text coverage summary
- HTML coverage report (interactive)
- LCOV format for CI integration

### Detailed Markdown Report
- Test execution summary
- Individual test suite results
- Raw test output
- Generated at `excel-import-test-report.md`

## 🔄 Continuous Integration

### GitHub Actions Integration
```yaml
- name: Run Excel Import Tests
  run: pnpm --filter api test:excel:coverage

- name: Upload Coverage Reports
  uses: codecov/codecov-action@v3
  with:
    file: ./apps/api/coverage/excel-import/lcov.info
```

### Pre-commit Hooks
```json
{
  "pre-commit": [
    "pnpm --filter api test:excel:field-mapping",
    "pnpm --filter api lint"
  ]
}
```

## 🐛 Debugging Tests

### Common Issues

1. **Database Connection Errors**
   ```bash
   # Ensure test database is properly initialized
   pnpm --filter api migration:run:sqlite
   ```

2. **Timeout Errors**
   ```typescript
   // Increase timeout for complex operations
   test('should handle large imports', async () => {
     // ... test code
   }, 120000); // 2 minutes
   ```

3. **Memory Leaks**
   ```bash
   # Run with garbage collection
   node --expose-gc --max-old-space-size=4096 node_modules/.bin/jest
   ```

### Debug Mode
```bash
# Run tests in debug mode
node --inspect-brk node_modules/.bin/jest --runInBand

# Run specific test file
pnpm --filter api test services/participantService.test.ts
```

## 📝 Writing New Tests

### Test Structure
```typescript
describe('Feature Description', () => {
  beforeEach(async () => {
    await clearTestData();
    // Setup test data
  });

  test('should do something specific', async () => {
    // Arrange
    const testData = createTestData();

    // Act
    const result = await functionUnderTest(testData);

    // Assert
    expect(result.success).toBe(true);
  });
});
```

### Best Practices
1. **Use Test Factories**: Leverage `TestDataFactory` for consistent test data
2. **Clean Test Data**: Always clean up in `beforeEach`
3. **Test Edge Cases**: Include both happy path and error scenarios
4. **Descriptive Names**: Use clear test descriptions
5. **Assertion Libraries**: Use appropriate matchers and custom assertions
6. **Mock External Dependencies**: Use mocks for external services

## 🔧 Configuration

### Jest Configuration
```json
{
  "testEnvironment": "node",
  "transform": { "^.+\\.ts$": "ts-jest" },
  "testMatch": ["**/tests/**/*.test.ts"],
  "setupFilesAfterEnv": ["<rootDir>/src/tests/test-setup.ts"],
  "testTimeout": 60000
}
```

### Environment Variables
```bash
NODE_ENV=test
DB_TYPE=sqlite
DB_DATABASE=:memory:
JWT_SECRET=test-secret-key
```

## 📊 Coverage Goals

- **Service Layer**: 95%+ coverage
- **Field Mapping**: 100% coverage (critical for data integrity)
- **Controller Layer**: 90%+ coverage
- **Error Scenarios**: 100% coverage of error paths
- **Business Logic**: 95%+ coverage

## 🚨 Important Notes

1. **Database Isolation**: Each test runs against an in-memory SQLite database
2. **Transaction Safety**: Tests verify transaction rollback and data consistency
3. **Performance Impact**: Large batch tests may take longer to execute
4. **Resource Cleanup**: Tests automatically clean up data to prevent interference
5. **Authentication**: Tests use mock JWT tokens for authentication scenarios

## 📚 Additional Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [TypeORM Testing Guide](https://typeorm.io/testing)
- [ExcelJS Documentation](https://github.com/exceljs/exceljs)

---

This testing system provides comprehensive coverage of the Excel import functionality, ensuring reliability, data integrity, and performance of the import process.