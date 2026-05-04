/**
 * Tests for the "angelito" (partial_server) automatic scholarship coercion.
 *
 * Business rule: participants registered as type='partial_server' (angelitos)
 * never pay. Backend must force isScholarship=true on every entry point
 * (public registration, admin creation, email-lookup confirmation) so they
 * show as 'paid' in PaymentsView regardless of what the caller sends.
 *
 * Also verifies regular servers are NOT auto-flagged as scholarship.
 *
 * Database-independent: uses Jest mocks only.
 */

// ---- Mock repositories ----------------------------------------------------

const mockParticipantGetOne = jest.fn();
const mockParticipantCreateQueryBuilder = jest.fn().mockReturnValue({
	where: jest.fn().mockReturnThis(),
	orderBy: jest.fn().mockReturnThis(),
	getOne: mockParticipantGetOne,
});

const mockParticipantSave = jest.fn();
const mockParticipantCreate = jest.fn((v: unknown) => v);
const mockParticipantRepo = {
	createQueryBuilder: mockParticipantCreateQueryBuilder,
	save: mockParticipantSave,
	create: mockParticipantCreate,
};

const mockRpFindOne = jest.fn();
const mockRpSave = jest.fn();
const mockRpCreate = jest.fn((v: unknown) => v);
const mockRpQbGetRawOne = jest.fn().mockResolvedValue({ maxId: 5 });
const mockRpRepo = {
	findOne: mockRpFindOne,
	save: mockRpSave,
	create: mockRpCreate,
	count: jest.fn().mockResolvedValue(0),
	createQueryBuilder: jest.fn().mockReturnValue({
		select: jest.fn().mockReturnThis(),
		where: jest.fn().mockReturnThis(),
		getRawOne: mockRpQbGetRawOne,
	}),
};

const FUTURE_YMD = "2099-12-31";

const mockRetreatRepo = {
	findOne: jest.fn().mockResolvedValue({
		id: "retreat-1",
		isPublic: true,
		endDate: FUTURE_YMD,
		max_walkers: 30,
		max_servers: 15,
	}),
};

const makeTxManager = () => ({
	getRepository: jest.fn().mockImplementation((entity: any) => {
		const name = typeof entity === "function" ? entity.name : entity;
		if (name === "Participant") return mockParticipantRepo;
		if (name === "RetreatParticipant") return mockRpRepo;
		if (name === "Retreat") return mockRetreatRepo;
		if (name === "User")
			return {
				createQueryBuilder: jest.fn().mockReturnValue({
					where: jest.fn().mockReturnThis(),
					getOne: jest.fn().mockResolvedValue(null),
					update: jest.fn().mockReturnThis(),
					set: jest.fn().mockReturnThis(),
					execute: jest.fn().mockResolvedValue({ affected: 0 }),
				}),
			};
		return mockParticipantRepo;
	}),
});

// ---- Mock TypeORM + AppDataSource -----------------------------------------

jest.mock("typeorm", () => {
	const actual = jest.requireActual("typeorm");
	return {
		...actual,
		DataSource: jest.fn().mockImplementation(() => ({
			getRepository: jest.fn(),
			initialize: jest.fn().mockResolvedValue(undefined),
			isInitialized: true,
			transaction: jest.fn(),
		})),
	};
});

jest.mock("../../data-source", () => ({
	AppDataSource: {
		getRepository: jest.fn().mockImplementation((entity: any) => {
			const name = typeof entity === "function" ? entity.name : entity;
			if (name === "Participant") return mockParticipantRepo;
			if (name === "RetreatParticipant") return mockRpRepo;
			if (name === "Retreat") return mockRetreatRepo;
			return {
				findOne: jest.fn(),
				find: jest.fn(),
				save: jest.fn(),
				create: jest.fn(),
			};
		}),
		transaction: jest.fn(async (cb: any) => cb(makeTxManager())),
		initialize: jest.fn().mockResolvedValue(undefined),
		isInitialized: true,
	},
}));

jest.mock("../../services/tableMesaService", () => ({
	rebalanceTablesForRetreat: jest.fn(),
	assignLeaderToTable: jest.fn(),
}));
jest.mock("../../services/emailService", () => ({
	EmailService: jest.fn().mockImplementation(() => ({ sendEmail: jest.fn() })),
}));
jest.mock("../../services/retreatParticipantService", () => ({
	createHistoryEntry: jest.fn(),
	autoSetPrimaryRetreat: jest.fn(),
	syncRetreatFields: jest.fn(),
}));
jest.mock("../../utils/bedQueryUtils", () => ({
	BedQueryUtils: jest.fn().mockImplementation(() => ({})),
}));

import {
	createParticipant,
	confirmExistingParticipant,
} from "../../services/participantService";
import type { CreateParticipant } from "@repo/types";

const basePayload: CreateParticipant = {
	email: "angel@example.com",
	firstName: "Angel",
	lastName: "Serafín",
	retreatId: "retreat-1",
	type: "server",
	birthDate: new Date("1990-01-15"),
	maritalStatus: "S",
	street: "Calle 1",
	houseNumber: "10",
	postalCode: "06600",
	neighborhood: "Centro",
	city: "CDMX",
	state: "CDMX",
	country: "MX",
	cellPhone: "5551234567",
	sacraments: ["baptism"],
	emergencyContact1Name: "María",
	emergencyContact1Relation: "Madre",
	emergencyContact1CellPhone: "5559876543",
};

const existingParticipant = {
	id: "p-1",
	email: "angel@example.com",
	firstName: "Angel",
	lastName: "Serafín",
	retreatId: "retreat-1",
	userId: null,
	isScholarship: false,
};

beforeEach(() => {
	jest.clearAllMocks();
	mockRetreatRepo.findOne.mockResolvedValue({
		id: "retreat-1",
		isPublic: true,
		endDate: FUTURE_YMD,
		max_walkers: 30,
		max_servers: 15,
	});
	mockRpQbGetRawOne.mockResolvedValue({ maxId: 5 });
	mockRpRepo.count.mockResolvedValue(0);
	// Default: no existing RP (no double-registration block)
	mockRpFindOne.mockResolvedValue(null);
	// Default: echo back saved entity
	mockParticipantSave.mockImplementation(async (p: any) => ({
		id: p.id ?? "new-participant-1",
		...p,
	}));
	mockRpSave.mockImplementation(async (r: any) => r);
});

// --------------------------------------------------------------------------
// createParticipant — new creation (no existing email)
// --------------------------------------------------------------------------

describe("createParticipant — angelito scholarship coercion (new participant)", () => {
	it("forces isScholarship=true when type='partial_server' even if caller sent false", async () => {
		mockParticipantGetOne.mockResolvedValue(null); // no existing by email

		await createParticipant({
			...basePayload,
			type: "partial_server",
			isScholarship: false,
		});

		const savedArgs = mockParticipantSave.mock.calls.map((c) => c[0]);
		expect(savedArgs.length).toBeGreaterThan(0);
		// Every save call on Participant must have isScholarship=true
		expect(savedArgs[0].isScholarship).toBe(true);
	});

	it("forces isScholarship=true when isScholarship is omitted", async () => {
		mockParticipantGetOne.mockResolvedValue(null);

		const payload = { ...basePayload, type: "partial_server" as const };
		delete (payload as any).isScholarship;
		await createParticipant(payload);

		const savedArgs = mockParticipantSave.mock.calls.map((c) => c[0]);
		expect(savedArgs[0].isScholarship).toBe(true);
	});

	it("does NOT auto-flag isScholarship for regular servers", async () => {
		mockParticipantGetOne.mockResolvedValue(null);

		// assignRelationships=false skips bed/table assignment (not the subject of this test)
		await createParticipant(
			{ ...basePayload, type: "server", isScholarship: false },
			false,
		);

		const savedArgs = mockParticipantSave.mock.calls.map((c) => c[0]);
		// First Participant.save should preserve the caller-provided value
		expect(savedArgs[0].isScholarship).toBe(false);
	});
});

// --------------------------------------------------------------------------
// createParticipant — reuse branch (existing participant by email)
// --------------------------------------------------------------------------

describe("createParticipant — angelito coercion (email reuse branch)", () => {
	it("forces isScholarship=true when reusing a Participant as partial_server", async () => {
		mockParticipantGetOne.mockResolvedValue({
			...existingParticipant,
			retreatId: "retreat-OLD",
			registrationDate: new Date("2024-01-01"),
		});

		await createParticipant({
			...basePayload,
			type: "partial_server",
			isScholarship: false,
		});

		const savedArgs = mockParticipantSave.mock.calls.map((c) => c[0]);
		expect(savedArgs.length).toBeGreaterThan(0);
		// The reused participant saved with isScholarship=true
		expect(savedArgs[0].isScholarship).toBe(true);
	});
});

// --------------------------------------------------------------------------
// confirmExistingParticipant — email-lookup flow
// --------------------------------------------------------------------------

describe("confirmExistingParticipant — angelito coercion", () => {
	it("sets isScholarship=true on the existing Participant when type='partial_server'", async () => {
		mockParticipantGetOne.mockResolvedValue({
			...existingParticipant,
			isScholarship: false,
		});

		await confirmExistingParticipant(
			"angel@example.com",
			"retreat-1",
			"partial_server",
		);

		expect(mockParticipantSave).toHaveBeenCalled();
		const savedParticipant = mockParticipantSave.mock.calls[0][0];
		expect(savedParticipant.isScholarship).toBe(true);
	});

	it("does NOT flip isScholarship when type='server'", async () => {
		mockParticipantGetOne.mockResolvedValue({
			...existingParticipant,
			isScholarship: false,
		});

		await confirmExistingParticipant(
			"angel@example.com",
			"retreat-1",
			"server",
		);

		expect(mockParticipantSave).toHaveBeenCalled();
		const savedParticipant = mockParticipantSave.mock.calls[0][0];
		expect(savedParticipant.isScholarship).toBe(false);
	});

	it("preserves isScholarship=true if the participant was already a scholar as 'server'", async () => {
		// If someone was already marked as scholar (manual admin setting),
		// confirming as a regular server should not clear it.
		mockParticipantGetOne.mockResolvedValue({
			...existingParticipant,
			isScholarship: true,
		});

		await confirmExistingParticipant(
			"angel@example.com",
			"retreat-1",
			"server",
		);

		const savedParticipant = mockParticipantSave.mock.calls[0][0];
		expect(savedParticipant.isScholarship).toBe(true);
	});
});

// --------------------------------------------------------------------------
// RetreatParticipant history has correct type for angelitos
// --------------------------------------------------------------------------

describe("confirmExistingParticipant — RetreatParticipant history.type", () => {
	it("creates RetreatParticipant with type='partial_server' for angelitos", async () => {
		mockParticipantGetOne.mockResolvedValue({
			...existingParticipant,
			isScholarship: false,
		});
		mockRpFindOne.mockResolvedValue(null); // no existing RP

		await confirmExistingParticipant(
			"angel@example.com",
			"retreat-1",
			"partial_server",
		);

		expect(mockRpCreate).toHaveBeenCalled();
		const rpArg = mockRpCreate.mock.calls[0][0] as any;
		expect(rpArg.type).toBe("partial_server");
		// roleInRetreat bucket is "server" for both server and partial_server
		expect(rpArg.roleInRetreat).toBe("server");
	});
});
