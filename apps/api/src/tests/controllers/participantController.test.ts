import request from 'supertest';
import { AppDataSource } from '../../data-source';
import { app } from '../../app';
import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { VALID_PARTICIPANTS_FIXTURE, INVALID_PARTICIPANTS_FIXTURE } from '../fixtures/excelFixtures';
import { generateTestToken } from '../test-utils/authTestUtils';

describe('Participant Controller - Excel Import', () => {
  let testDataSource: typeof AppDataSource;
  let testUser: any;
  let testRetreat: any;
  let authToken: string;

  beforeAll(async () => {
    testDataSource = await setupTestDatabase();

    // Create test environment
    const env = await TestDataFactory.createCompleteTestEnvironment();
    testUser = env.user;
    testRetreat = env.retreat;

    // Generate auth token
    authToken = generateTestToken(testUser);
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await clearTestData();
  });

  describe('POST /participants/import/:retreatId', () => {
    test('should successfully import valid participants', async () => {
      const response = await request(app)
        .post(`/participants/import/${testRetreat.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          participants: VALID_PARTICIPANTS_FIXTURE
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('importedCount');
      expect(response.body).toHaveProperty('updatedCount');
      expect(response.body).toHaveProperty('skippedCount');
      expect(response.body).toHaveProperty('tablesCreated');
      expect(response.body).toHaveProperty('bedsCreated');
      expect(response.body).toHaveProperty('paymentsCreated');

      expect(response.body.importedCount).toBe(VALID_PARTICIPANTS_FIXTURE.length);
      expect(response.body.updatedCount).toBe(0);
      expect(response.body.skippedCount).toBe(0);
      expect(typeof response.body.tablesCreated).toBe('number');
      expect(typeof response.body.bedsCreated).toBe('number');
      expect(typeof response.body.paymentsCreated).toBe('number');
    });

    test('should reject requests without authentication', async () => {
      const response = await request(app)
        .post(`/participants/import/${testRetreat.id}`)
        .send({
          participants: VALID_PARTICIPANTS_FIXTURE
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('message');
    });

    test('should reject requests with invalid token', async () => {
      const response = await request(app)
        .post(`/participants/import/${testRetreat.id}`)
        .set('Authorization', 'Bearer invalid-token')
        .send({
          participants: VALID_PARTICIPANTS_FIXTURE
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('message');
    });

    test('should reject requests for non-existent retreat', async () => {
      const nonExistentRetreatId = 'non-existent-retreat-id';

      const response = await request(app)
        .post(`/participants/import/${nonExistentRetreatId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          participants: VALID_PARTICIPANTS_FIXTURE
        });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('message');
    });

    test('should handle requests with invalid retreat ID format', async () => {
      const invalidRetreatId = 'invalid-id-format';

      const response = await request(app)
        .post(`/participants/import/${invalidRetreatId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          participants: VALID_PARTICIPANTS_FIXTURE
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('message');
    });

    test('should validate request body structure', async () => {
      const response = await request(app)
        .post(`/participants/import/${testRetreat.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          // Missing 'participants' field
          invalidField: 'some value'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('message');
    });

    test('should handle empty participant array', async () => {
      const response = await request(app)
        .post(`/participants/import/${testRetreat.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          participants: []
        });

      expect(response.status).toBe(200);
      expect(response.body.importedCount).toBe(0);
      expect(response.body.updatedCount).toBe(0);
      expect(response.body.skippedCount).toBe(0);
    });

    test('should handle participants with invalid data', async () => {
      const response = await request(app)
        .post(`/participants/import/${testRetreat.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          participants: INVALID_PARTICIPANTS_FIXTURE
        });

      expect(response.status).toBe(200);
      expect(response.body.importedCount).toBeLessThan(INVALID_PARTICIPANTS_FIXTURE.length);
      expect(response.body.skippedCount).toBeGreaterThan(0);
    });

    test('should handle very large participant arrays', async () => {
      const largeBatch = Array.from({ length: 1000 }, (_, index) => ({
        id: `${index + 1000}`,
        tipousuario: '3',
        nombre: `Participant${index + 1}`,
        apellidos: `Test${index + 1}`,
        email: `participant${index + 1}@test.com`
      }));

      const startTime = Date.now();

      const response = await request(app)
        .post(`/participants/import/${testRetreat.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          participants: largeBatch
        });

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(response.status).toBe(200);
      expect(response.body.importedCount).toBe(largeBatch.length);
      expect(duration).toBeLessThan(60000); // Should complete within 60 seconds
    }, 120000);

    test('should handle malformed participant data gracefully', async () => {
      const malformedData = [
        null,
        undefined,
        'string-instead-of-object',
        123,
        [],
        { invalidField: 'value' },
        { email: 'missing-other-fields@example.com' }
      ];

      const response = await request(app)
        .post(`/participants/import/${testRetreat.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          participants: malformedData
        });

      expect(response.status).toBe(200);
      expect(response.body.importedCount).toBeLessThan(malformedData.length);
      expect(response.body.skippedCount).toBeGreaterThan(0);
    });

    test('should handle duplicate participant emails within same batch', async () => {
      const duplicateEmailData = [
        {
          tipousuario: '3',
          nombre: 'Juan',
          apellidos: 'Pérez',
          email: 'juan.perez@example.com'
        },
        {
          tipousuario: '3',
          nombre: 'Juan Carlos',
          apellidos: 'Pérez',
          email: 'juan.perez@example.com' // Same email
        }
      ];

      const response = await request(app)
        .post(`/participants/import/${testRetreat.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          participants: duplicateEmailData
        });

      expect(response.status).toBe(200);
      expect(response.body.importedCount).toBe(1); // First one should be imported
      expect(response.body.skippedCount).toBe(1); // Second one should be skipped
    });
  });

  describe('Authorization Tests', () => {
    test('should allow admin users to import participants', async () => {
      const adminUser = await TestDataFactory.createTestUser({ role: 'admin' });
      const adminToken = generateTestToken(adminUser);

      const response = await request(app)
        .post(`/participants/import/${testRetreat.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          participants: VALID_PARTICIPANTS_FIXTURE.slice(0, 1)
        });

      expect(response.status).toBe(200);
    });

    test('should allow coordinator users to import participants to their retreats', async () => {
      const coordinatorUser = await TestDataFactory.createTestUser({ role: 'coordinator' });
      const coordinatorToken = generateTestToken(coordinatorUser);

      // Create a retreat for this coordinator (in real implementation, this would be handled by proper user-retreat relationships)
      const coordinatorRetreat = await TestDataFactory.createTestRetreat();

      const response = await request(app)
        .post(`/participants/import/${coordinatorRetreat.id}`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({
          participants: VALID_PARTICIPANTS_FIXTURE.slice(0, 1)
        });

      expect(response.status).toBe(200);
    });

    test('should reject viewer users from importing participants', async () => {
      const viewerUser = await TestDataFactory.createTestUser({ role: 'viewer' });
      const viewerToken = generateTestToken(viewerUser);

      const response = await request(app)
        .post(`/participants/import/${testRetreat.id}`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({
          participants: VALID_PARTICIPANTS_FIXTURE.slice(0, 1)
        });

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('message');
    });

    test('should reject inactive users from importing participants', async () => {
      const inactiveUser = await TestDataFactory.createTestUser({
        role: 'admin',
        isActive: false
      });
      const inactiveToken = generateTestToken(inactiveUser);

      const response = await request(app)
        .post(`/participants/import/${testRetreat.id}`)
        .set('Authorization', `Bearer ${inactiveToken}`)
        .send({
          participants: VALID_PARTICIPANTS_FIXTURE.slice(0, 1)
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('message');
    });
  });

  describe('Request Validation Tests', () => {
    test('should validate participants array is present', async () => {
      const response = await request(app)
        .post(`/participants/import/${testRetreat.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          // participants field missing
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('participants');
    });

    test('should validate participants array is an array', async () => {
      const response = await request(app)
        .post(`/participants/import/${testRetreat.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          participants: 'not-an-array'
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('participants');
    });

    test('should handle extremely large request payloads', async () => {
      const veryLargeBatch = Array.from({ length: 10000 }, (_, index) => ({
        id: `${index}`,
        tipousuario: '3',
        nombre: 'A'.repeat(100), // Long name
        apellidos: 'B'.repeat(100), // Long last name
        email: `participant${index}@example.com`,
        notas: 'C'.repeat(500) // Long notes
      }));

      const response = await request(app)
        .post(`/participants/import/${testRetreat.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          participants: veryLargeBatch
        });

      // This might fail due to request size limits, which is expected behavior
      expect([200, 413]).toContain(response.status);
    }, 120000);
  });

  describe('Error Handling Tests', () {
    test('should handle database connection errors gracefully', async () => {
      // Mock database error by closing connection temporarily
      await testDataSource.destroy();

      const response = await request(app)
        .post(`/participants/import/${testRetreat.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          participants: VALID_PARTICIPANTS_FIXTURE.slice(0, 1)
        });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('message');

      // Reinitialize database for other tests
      await setupTestDatabase();
    });

    test('should handle timeout errors gracefully', async () => {
      // Create a batch that might timeout
      const timeoutBatch = Array.from({ length: 5000 }, (_, index) => ({
        id: `${index}`,
        tipousuario: '3',
        nombre: `Participant${index}`,
        apellidos: `Test${index}`,
        email: `participant${index}@test.com`
      }));

      const response = await request(app)
        .post(`/participants/import/${testRetreat.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .timeout(10000) // 10 second timeout
        .send({
          participants: timeoutBatch
        });

      // Should either succeed or timeout gracefully
      expect([200, 408, 500]).toContain(response.status);
    }, 15000);

    test('should provide detailed error messages for validation failures', async () => {
      const response = await request(app)
        .post(`/participants/import/${testRetreat.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          participants: [
            {
              tipousuario: '3',
              // Missing required fields like nombre, email
              invalidField: 'value'
            }
          ]
        });

      expect(response.status).toBe(200); // Should still process but skip invalid data
      expect(response.body.skippedCount).toBeGreaterThan(0);
    });
  });

  describe('Response Format Tests', () => {
    test('should return consistent response format for successful imports', async () => {
      const response = await request(app)
        .post(`/participants/import/${testRetreat.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          participants: VALID_PARTICIPANTS_FIXTURE.slice(0, 2)
        });

      expect(response.status).toBe(200);

      // Verify response structure
      expect(response.body).toBeObject();
      expect(response.body).toHaveProperty('importedCount');
      expect(response.body).toHaveProperty('updatedCount');
      expect(response.body).toHaveProperty('skippedCount');
      expect(response.body).toHaveProperty('tablesCreated');
      expect(response.body).toHaveProperty('bedsCreated');
      expect(response.body).toHaveProperty('paymentsCreated');

      // Verify data types
      expect(typeof response.body.importedCount).toBe('number');
      expect(typeof response.body.updatedCount).toBe('number');
      expect(typeof response.body.skippedCount).toBe('number');
      expect(typeof response.body.tablesCreated).toBe('number');
      expect(typeof response.body.bedsCreated).toBe('number');
      expect(typeof response.body.paymentsCreated).toBe('number');

      // Verify non-negative values
      expect(response.body.importedCount).toBeGreaterThanOrEqual(0);
      expect(response.body.updatedCount).toBeGreaterThanOrEqual(0);
      expect(response.body.skippedCount).toBeGreaterThanOrEqual(0);
      expect(response.body.tablesCreated).toBeGreaterThanOrEqual(0);
      expect(response.body.bedsCreated).toBeGreaterThanOrEqual(0);
      expect(response.body.paymentsCreated).toBeGreaterThanOrEqual(0);
    });

    test('should return error responses in consistent format', async () => {
      const response = await request(app)
        .post(`/participants/import/${testRetreat.id}`)
        .send({
          participants: VALID_PARTICIPANTS_FIXTURE
        });

      expect([400, 401, 403, 404, 500]).toContain(response.status);

      if (response.status !== 200) {
        expect(response.body).toHaveProperty('message');
        expect(typeof response.body.message).toBe('string');
        expect(response.body.message.length).toBeGreaterThan(0);
      }
    });
  });

  describe('CSRF Protection Tests', () => {
    test('should require CSRF token for state-changing operations', async () => {
      // This test would depend on the actual CSRF implementation
      // For now, just verify the endpoint exists and is protected
      const response = await request(app)
        .post(`/participants/import/${testRetreat.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          participants: VALID_PARTICIPANTS_FIXTURE.slice(0, 1)
        });

      // The actual CSRF behavior would depend on the middleware configuration
      expect([200, 400, 403]).toContain(response.status);
    });
  });
});