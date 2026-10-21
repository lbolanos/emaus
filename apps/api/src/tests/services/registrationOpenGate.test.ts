/**
 * Tests for the registrationOpen gate in participantService.
 *
 * A retreat can be visible on the landing ("Anunciado": isPublic=true,
 * registrationOpen=false) while registrations stay closed until it is
 * published. Covers the guard order inside assertRetreatAcceptsRegistrations:
 *
 *   RETREAT_NOT_FOUND → RETREAT_NOT_PUBLIC → RETREAT_REGISTRATION_NOT_OPEN
 *   → RETREAT_CLOSED
 *
 * and the back-compat rule: a payload without `registrationOpen` (old clients
 * / rows created before the column) must keep registering as before.
 *
 * Database-independent: uses Jest mocks only (same stack as
 * doubleRegistrationGuard.test.ts, which covers the neighboring guards).
 */

// ---- Mock repositories ----------------------------------------------------

const mockParticipantGetOne = jest.fn();
const mockParticipantCreateQueryBuilder = jest.fn().mockReturnValue({
	where: jest.fn().mockReturnThis(),
	orderBy: jest.fn().mockReturnThis(),
	getOne: mockParticipantGetOne,
});

const mockParticipantRepo = {
	createQueryBuilder: mockParticipantCreateQueryBuilder,
	save: jest.fn(),
};

const mockRpFindOne = jest.fn();
const mockRpSave = jest.fn();
const mockRpCreate = jest.fn((v: unknown) => v);
const mockRpQbGetRawOne = jest.fn().mockResolvedValue({ maxId: 5 });
const mockRpRepo = {
	findOne: mockRpFindOne,
	save: mockRpSave,
	create: mockRpCreate,
	createQueryBuilder: jest.fn().mockReturnValue({
		select: jest.fn().mockReturnThis(),
		where: jest.fn().mockReturnThis(),
		getRawOne: mockRpQbGetRawOne,
	}),
};

const FUTURE_YMD = "2099-12-31";

const mockRetreatRepo = {
	findOne: jest.fn(),
};

const makeTxManager = () => ({
	getRepository: jest.fn().mockImplementation((entity: any) => {
		const name = typeof entity === "function" ? entity.name : entity;
		if (name === "Participant") return mockParticipantRepo;
		if (name === "RetreatParticipant") return mockRpRepo;
		if (name === "Retreat") return mockRetreatRepo;
		return mockParticipantRepo;
	}),
});

// ---- Mock TypeORM + AppDataSource ----------------------------------------

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

// Avoid transitive imports that pull heavy dependencies.
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
	email: "juana@example.com",
	firstName: "Juana",
	lastName: "Pérez",
	retreatId: "retreat-1",
	type: "walker",
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
} as unknown as CreateParticipant;

const existingParticipant = {
	id: "p-1",
	email: "juana@example.com",
	firstName: "Juana",
	lastName: "Pérez",
	retreatId: "retreat-1",
	userId: null,
};

beforeEach(() => {
	jest.clearAllMocks();
	// Default: published retreat (public + open + future).
	mockRetreatRepo.findOne.mockResolvedValue({
		id: "retreat-1",
		isPublic: true,
		registrationOpen: true,
		endDate: FUTURE_YMD,
		max_walkers: 30,
		max_servers: 15,
	});
	mockRpQbGetRawOne.mockResolvedValue({ maxId: 5 });
});

describe("createParticipant — registrationOpen gate", () => {
	it("throws RETREAT_REGISTRATION_NOT_OPEN when the retreat is announced but not published", async () => {
		mockRetreatRepo.findOne.mockResolvedValueOnce({
			id: "retreat-1",
			isPublic: true,
			registrationOpen: false,
			endDate: FUTURE_YMD,
		});

		await expect(createParticipant(basePayload)).rejects.toMatchObject({
			code: "RETREAT_REGISTRATION_NOT_OPEN",
			message: "Las inscripciones de este retiro aún no están abiertas.",
		});

		expect(mockParticipantRepo.save).not.toHaveBeenCalled();
	});

	it("keeps RETREAT_NOT_PUBLIC ahead of registrationOpen", async () => {
		mockRetreatRepo.findOne.mockResolvedValueOnce({
			id: "retreat-1",
			isPublic: false,
			registrationOpen: false,
			endDate: FUTURE_YMD,
		});

		await expect(createParticipant(basePayload)).rejects.toMatchObject({
			code: "RETREAT_NOT_PUBLIC",
		});
	});

	it("fires before the past-endDate guard (announced + past → NOT_OPEN)", async () => {
		mockRetreatRepo.findOne.mockResolvedValueOnce({
			id: "retreat-1",
			isPublic: true,
			registrationOpen: false,
			endDate: "2000-01-01",
		});

		await expect(createParticipant(basePayload)).rejects.toMatchObject({
			code: "RETREAT_REGISTRATION_NOT_OPEN",
		});
	});

	it("lets a payload without registrationOpen through (legacy rows stay open)", async () => {
		mockRetreatRepo.findOne.mockResolvedValueOnce({
			id: "retreat-1",
			isPublic: true,
			// registrationOpen absent on purpose: pre-migration payload.
			endDate: FUTURE_YMD,
			max_walkers: 30,
			max_servers: 15,
		});

		const error = await createParticipant(basePayload).catch((e) => e);
		expect((error as any)?.code).not.toBe("RETREAT_REGISTRATION_NOT_OPEN");
	});

	it("lets registrationOpen: true through", async () => {
		mockRetreatRepo.findOne.mockResolvedValueOnce({
			id: "retreat-1",
			isPublic: true,
			registrationOpen: true,
			endDate: FUTURE_YMD,
			max_walkers: 30,
			max_servers: 15,
		});

		const error = await createParticipant(basePayload).catch((e) => e);
		expect((error as any)?.code).not.toBe("RETREAT_REGISTRATION_NOT_OPEN");
	});
});

describe("confirmExistingParticipant — registrationOpen gate", () => {
	it("throws RETREAT_REGISTRATION_NOT_OPEN when the retreat is announced but not published", async () => {
		mockParticipantGetOne.mockResolvedValue(existingParticipant);
		mockRetreatRepo.findOne.mockResolvedValueOnce({
			id: "retreat-1",
			isPublic: true,
			registrationOpen: false,
			endDate: FUTURE_YMD,
		});

		await expect(
			confirmExistingParticipant("juana@example.com", "retreat-1", "server"),
		).rejects.toMatchObject({
			code: "RETREAT_REGISTRATION_NOT_OPEN",
		});

		expect(mockParticipantRepo.save).not.toHaveBeenCalled();
	});
});
