import {
  setupTestDatabase,
  teardownTestDatabase,
  clearTestData
} from '../test-setup';
import { importParticipants } from '../../services/participantService';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { ExcelImportTestUtils } from '../test-utils/excelImportTestUtils';
import {
  VALID_PARTICIPANTS_FIXTURE,
  FAMILY_PARTICIPANTS_FIXTURE,
  INVALID_PARTICIPANTS_FIXTURE,
  EDGE_CASE_PARTICIPANTS_FIXTURE,
  LEADERSHIP_PARTICIPANTS_FIXTURE,
  CANCELLED_PARTICIPANTS_FIXTURE,
  COMPREHENSIVE_FIXTURE,
  LARGE_BATCH_FIXTURE
} from '../fixtures/excelFixtures';
import { Participant, TableMesa, RetreatBed } from '../../entities';

describe('ParticipantService - Excel Import', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await clearTestData();
  });

  describe('Happy Path Tests', () => {
    test('should import valid participants successfully', async () => {
      const result = await ExcelImportTestUtils.executeImport(VALID_PARTICIPANTS_FIXTURE);

      // Validate import result structure
      const validation = ExcelImportTestUtils.validateImportResult(result.result);
      expect(validation.isValid).toBe(true);
      if (!validation.isValid) {
        console.error('Validation errors:', validation.errors);
      }

      // Check that participants were imported
      expect(result.result.importedCount).toBe(VALID_PARTICIPANTS_FIXTURE.length);
      expect(result.result.updatedCount).toBe(0);
      expect(result.result.skippedCount).toBe(0);

      // Verify participant data
      const verification = await ExcelImportTestUtils.verifyParticipantImport(
        VALID_PARTICIPANTS_FIXTURE,
        result.participantsAfter,
        result.retreat.id
      );
      expect(verification.success).toBe(true);
      if (!verification.success) {
        console.error('Verification errors:', verification.errors);
      }

      // Verify table assignments
      const tableAssignments = VALID_PARTICIPANTS_FIXTURE
        .filter(p => p.mesa)
        .map(p => ({ email: p.email!, tableName: p.mesa! }));

      if (tableAssignments.length > 0) {
        const tableVerification = await ExcelImportTestUtils.verifyTableAssignments(
          result.participantsAfter,
          tableAssignments
        );
        expect(tableVerification.success).toBe(true);
      }

      // Verify bed assignments
      const bedAssignments = VALID_PARTICIPANTS_FIXTURE
        .filter(p => p.habitacion && p.tipousuario !== '4' && p.tipousuario !== '5')
        .map(p => ({ email: p.email!, roomNumber: p.habitacion! }));

      if (bedAssignments.length > 0) {
        const bedVerification = await ExcelImportTestUtils.verifyBedAssignments(
          result.participantsAfter,
          bedAssignments
        );
        expect(bedVerification.success).toBe(true);
      }
    }, 60000);

    test('should handle family color coding correctly', async () => {
      const result = await ExcelImportTestUtils.executeImport(FAMILY_PARTICIPANTS_FIXTURE);

      expect(result.result.importedCount).toBeGreaterThan(0);

      // Verify family color coding
      const familyGroups = [
        {
          emails: ['ana.martinez@example.com', 'luis.martinez@example.com'],
          shouldHaveSameColor: true
        },
        {
          emails: ['ana.martinez@example.com', 'sofia.lopez@example.com'],
          shouldHaveSameColor: true
        }
      ];

      const colorVerification = ExcelImportTestUtils.verifyFamilyColorCoding(
        result.participantsAfter,
        familyGroups
      );
      expect(colorVerification.success).toBe(true);
      if (!colorVerification.success) {
        console.error('Color coding errors:', colorVerification.errors);
      }
    }, 45000);

    test('should handle leadership assignments correctly', async () => {
      const result = await ExcelImportTestUtils.executeImport(LEADERSHIP_PARTICIPANTS_FIXTURE);

      expect(result.result.importedCount).toBe(LEADERSHIP_PARTICIPANTS_FIXTURE.length);

      // Verify leadership assignments
      const expectedLeadership = [
        {
          email: 'lider.principal@example.com',
          expectedRole: 'lider' as const,
          tableName: 'Table 5'
        },
        {
          email: 'colider.secundario@example.com',
          expectedRole: 'colider1' as const, // or colider2 depending on availability
          tableName: 'Table 5'
        },
        {
          email: 'servidor.sinmesa@example.com',
          tableName: 'Table 5' // Should not have leadership role
        }
      ];

      const leadershipVerification = await ExcelImportTestUtils.verifyLeadershipAssignments(
        result.participantsAfter,
        expectedLeadership
      );
      expect(leadershipVerification.success).toBe(true);
      if (!leadershipVerification.success) {
        console.error('Leadership errors:', leadershipVerification.errors);
      }
    }, 45000);
  });

  describe('Error Handling Tests', () => {
    test('should handle invalid data gracefully', async () => {
      const result = await ExcelImportTestUtils.executeImport(INVALID_PARTICIPANTS_FIXTURE);

      // Should skip invalid participants but not crash
      expect(result.result.skippedCount).toBeGreaterThan(0);
      expect(result.result.importedCount).toBeLessThan(INVALID_PARTICIPANTS_FIXTURE.length);

      // Verify that valid data still gets processed
      const validParticipants = INVALID_PARTICIPANTS_FIXTURE.filter(p => p.email && p.email.includes('@'));
      if (validParticipants.length > 0) {
        expect(result.result.importedCount + result.result.skippedCount).toBe(INVALID_PARTICIPANTS_FIXTURE.length);
      }
    }, 45000);

    test('should handle missing required fields', async () => {
      const participantsWithMissingFields = INVALID_PARTICIPANTS_FIXTURE.filter(p => !p.email || !p.nombre);

      if (participantsWithMissingFields.length > 0) {
        const result = await ExcelImportTestUtils.executeImport(participantsWithMissingFields);

        // All should be skipped due to missing required fields
        expect(result.result.importedCount).toBe(0);
        expect(result.result.skippedCount).toBe(participantsWithMissingFields.length);
      }
    }, 30000);

    test('should handle invalid email formats', async () => {
      const invalidEmailParticipants = INVALID_PARTICIPANTS_FIXTURE.filter(p =>
        p.email && !p.email.includes('@')
      );

      if (invalidEmailParticipants.length > 0) {
        const result = await ExcelImportTestUtils.executeImport(invalidEmailParticipants);

        // Should skip participants with invalid emails
        expect(result.result.skippedCount).toBeGreaterThan(0);
      }
    }, 30000);
  });

  describe('Edge Cases Tests', () => {
    test('should handle different participant types', async () => {
      const result = await ExcelImportTestUtils.executeImport(EDGE_CASE_PARTICIPANTS_FIXTURE);

      expect(result.result.importedCount).toBe(EDGE_CASE_PARTICIPANTS_FIXTURE.length);

      // Verify type mapping
      const participants = result.participantsAfter;

      const waitingListParticipant = participants.find(p => p.email === 'esperanza.lista@example.com');
      expect(waitingListParticipant?.type).toBe('waiting');

      const partialServerParticipant = participants.find(p => p.email === 'servicio.parcial@example.com');
      expect(partialServerParticipant?.type).toBe('partial_server');

      const walkerParticipant = participants.find(p => p.email === 'jubilado.anciano@example.com');
      expect(walkerParticipant?.type).toBe('walker');
    }, 45000);

    test('should handle cancelled participants', async () => {
      const result = await ExcelImportTestUtils.executeImport(CANCELLED_PARTICIPANTS_FIXTURE);

      expect(result.result.importedCount).toBe(CANCELLED_PARTICIPANTS_FIXTURE.length);

      // Verify cancellation status
      const cancelledParticipants = result.participantsAfter.filter(p => p.isCancelled);
      expect(cancelledParticipants.length).toBe(CANCELLED_PARTICIPANTS_FIXTURE.length);

      // Cancelled participants should not have table or bed assignments
      const cancelledWithAssignments = cancelledParticipants.filter(p => p.tableId || p.retreatBedId);
      expect(cancelledWithAssignments.length).toBe(0);
    }, 30000);

    test('should handle special medical and dietary requirements', async () => {
      const specialNeedsParticipants = EDGE_CASE_PARTICIPANTS_FIXTURE.filter(p =>
        p.medicinaespecial === 'S' || p.alimentosrestringidos === 'S'
      );

      if (specialNeedsParticipants.length > 0) {
        const result = await ExcelImportTestUtils.executeImport(specialNeedsParticipants);

        expect(result.result.importedCount).toBe(specialNeedsParticipants.length);

        // Verify medical information was imported
        const participants = result.participantsAfter;
        const participantWithMeds = participants.find(p => p.hasMedication);
        const participantWithDietaryRestrictions = participants.find(p => p.hasDietaryRestrictions);

        expect(participantWithMeds).toBeTruthy();
        expect(participantWithDietaryRestrictions).toBeTruthy();
      }
    }, 30000);
  });

  describe('Performance Tests', () => {
    test('should handle large batch imports efficiently', async () => {
      const startTime = Date.now();

      const result = await ExcelImportTestUtils.executeImport(LARGE_BATCH_FIXTURE);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time (adjust threshold as needed)
      expect(duration).toBeLessThan(30000); // 30 seconds

      expect(result.result.importedCount).toBe(LARGE_BATCH_FIXTURE.length);
      expect(result.result.skippedCount).toBe(0);

      // Verify all participants were created correctly
      const verification = await ExcelImportTestUtils.verifyParticipantImport(
        LARGE_BATCH_FIXTURE,
        result.participantsAfter,
        result.retreat.id
      );
      expect(verification.success).toBe(true);
    }, 60000);

    test('should handle concurrent imports gracefully', async () => {
      const batch1 = LARGE_BATCH_FIXTURE.slice(0, 25);
      const batch2 = LARGE_BATCH_FIXTURE.slice(25, 50);

      // Run imports concurrently
      const [result1, result2] = await Promise.all([
        ExcelImportTestUtils.executeImport(batch1),
        ExcelImportTestUtils.executeImport(batch2)
      ]);

      expect(result1.result.importedCount).toBe(batch1.length);
      expect(result2.result.importedCount).toBe(batch2.length);
    }, 60000);
  });

  describe('Transaction and Integrity Tests', () => {
    test('should maintain database integrity on errors', async () => {
      // Create a mix of valid and invalid participants
      const mixedData = [
        ...VALID_PARTICIPANTS_FIXTURE.slice(0, 1),
        ...INVALID_PARTICIPANTS_FIXTURE.slice(0, 2),
        ...VALID_PARTICIPANTS_FIXTURE.slice(1, 2)
      ];

      const result = await ExcelImportTestUtils.executeImport(mixedData);

      // Valid participants should be imported
      expect(result.result.importedCount).toBeGreaterThan(0);

      // Invalid participants should be skipped
      expect(result.result.skippedCount).toBeGreaterThan(0);

      // Total should equal input length
      expect(result.result.importedCount + result.result.skippedCount).toBe(mixedData.length);

      // Verify database consistency
      const verification = await ExcelImportTestUtils.verifyParticipantImport(
        VALID_PARTICIPANTS_FIXTURE.slice(0, 2),
        result.participantsAfter,
        result.retreat.id
      );
      expect(verification.success).toBe(true);
    }, 45000);

    test('should handle duplicate participants correctly', async () => {
      // Import same participants twice
      const firstResult = await ExcelImportTestUtils.executeImport(VALID_PARTICIPANTS_FIXTURE.slice(0, 2));
      const secondResult = await ExcelImportTestUtils.executeImport(VALID_PARTICIPANTS_FIXTURE.slice(0, 2), {}, firstResult.retreat);

      // Second import should update existing participants
      expect(firstResult.result.importedCount).toBe(2);
      expect(secondResult.result.updatedCount).toBe(2);
      expect(secondResult.result.importedCount).toBe(0);
    }, 45000);
  });

  describe('Table and Bed Assignment Tests', () => {
    test('should create tables when they do not exist', async () => {
      const participantsWithNewTables = VALID_PARTICIPANTS_FIXTURE.map(p => ({
        ...p,
        mesa: `New Table ${Math.random()}`
      }));

      const result = await ExcelImportTestUtils.executeImport(participantsWithNewTables);

      expect(result.result.tablesCreated).toBeGreaterThan(0);
      expect(result.result.importedCount).toBe(participantsWithNewTables.length);
    }, 45000);

    test('should reuse existing tables when they exist', async () => {
      // Create tables first
      const { retreat } = await TestDataFactory.createCompleteTestEnvironment();
      await TestDataFactory.createTestTables(retreat.id, 3);

      // Import participants with existing table names
      const participantsWithExistingTables = VALID_PARTICIPANTS_FIXTURE.map(p => ({
        ...p,
        mesa: `Table ${Math.floor(Math.random() * 3) + 1}`
      }));

      const result = await ExcelImportTestUtils.executeImport(participantsWithExistingTables, {}, retreat);

      expect(result.result.tablesCreated).toBe(0); // Should not create new tables
      expect(result.result.importedCount).toBe(participantsWithExistingTables.length);
    }, 45000);

    test('should handle bed assignments correctly', async () => {
      const result = await ExcelImportTestUtils.executeImport(VALID_PARTICIPANTS_FIXTURE);

      // Should create beds if they don't exist
      expect(result.result.bedsCreated).toBeGreaterThanOrEqual(0);

      // Participants with room assignments should have beds
      const participantsWithRoomAssignments = result.participantsAfter.filter(p => p.retreatBedId);
      const expectedBedAssignments = VALID_PARTICIPANTS_FIXTURE.filter(p =>
        p.habitacion && p.tipousuario !== '4' && p.tipousuario !== '5'
      ).length;

      expect(participantsWithRoomAssignments.length).toBe(expectedBedAssignments);
    }, 45000);
  });

  describe('Payment Integration Tests', () => {
    test('should create payment records when payment data is provided', async () => {
      const participantsWithPayments = VALID_PARTICIPANTS_FIXTURE.filter(p => p.montopago && p.fechapago);

      if (participantsWithPayments.length > 0) {
        const result = await ExcelImportTestUtils.executeImport(participantsWithPayments);

        expect(result.result.paymentsCreated).toBeGreaterThan(0);

        // Verify payment records were created
        const paymentRepository = TestDataFactory['testDataSource'].getRepository('Payment');
        const payments = await paymentRepository.find({
          where: { retreatId: result.retreat.id }
        });

        expect(payments.length).toBeGreaterThan(0);
      }
    }, 45000);

    test('should handle payment adjustments correctly', async () => {
      // Import participant with payment
      const participantWithPayment = VALID_PARTICIPANTS_FIXTURE.filter(p => p.montopago && p.fechapago).slice(0, 1);
      const firstResult = await ExcelImportTestUtils.executeImport(participantWithPayment);

      expect(firstResult.result.paymentsCreated).toBe(1);

      // Import same participant with different payment amount
      const adjustedPayment = {
        ...participantWithPayment[0],
        montopago: String(parseInt(participantWithPayment[0].montopago!) + 50)
      };

      const secondResult = await ExcelImportTestUtils.executeImport([adjustedPayment], {}, firstResult.retreat);

      expect(secondResult.result.paymentsCreated).toBe(1); // Should create adjustment payment
    }, 45000);
  });
});