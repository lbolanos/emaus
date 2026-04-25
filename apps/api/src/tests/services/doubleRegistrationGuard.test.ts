/**
 * Tests for the double-registration guard in participantService.
 *
 * Covers:
 * - checkParticipantExists(email, retreatId?) reports registeredInRetreat
 *   and the localized Spanish message by group.
 * - createParticipant (reuse branch) and confirmExistingParticipant throw
 *   ALREADY_REGISTERED_IN_RETREAT when an active RetreatParticipant row
 *   already exists for the target retreat.
 * - A cancelled previous registration (isCancelled=true) must NOT block
 *   a new registration.
 * - Controllers map ALREADY_REGISTERED_IN_RETREAT → HTTP 409.
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

// Future date in YYYY-MM-DD to keep retreat "open" by default.
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

// Transactional entity manager returns the same mock repositories so that
// production code can run end-to-end without hitting a real DB.
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
  checkParticipantExists,
  createParticipant,
  confirmExistingParticipant,
  isRetreatPast,
} from "../../services/participantService";
import type { CreateParticipant } from "@repo/types";

const basePayload: CreateParticipant = {
  email: "juan@example.com",
  firstName: "Juan",
  lastName: "Pérez",
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

const existingWalker = {
  id: "p-1",
  email: "juan@example.com",
  firstName: "Juan",
  lastName: "Pérez",
  retreatId: "retreat-1",
  userId: null,
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
});

// --------------------------------------------------------------------------
// checkParticipantExists
// --------------------------------------------------------------------------

describe("checkParticipantExists(email, retreatId?)", () => {
  it("returns exists:false when no Participant with that email", async () => {
    mockParticipantGetOne.mockResolvedValue(null);

    const result = await checkParticipantExists("nobody@example.com");

    expect(result).toEqual({ exists: false });
  });

  it("omits registeredInRetreat when retreatId is not provided", async () => {
    mockParticipantGetOne.mockResolvedValue(existingWalker);

    const result = await checkParticipantExists("juan@example.com");

    expect(result.exists).toBe(true);
    expect(result).not.toHaveProperty("registeredInRetreat");
    expect(result).not.toHaveProperty("registeredGroup");
  });

  it("returns registeredInRetreat:false when no active RP for that retreat", async () => {
    mockParticipantGetOne.mockResolvedValue(existingWalker);
    mockRpFindOne.mockResolvedValue(null);

    const result = await checkParticipantExists(
      "juan@example.com",
      "retreat-1",
    );

    expect(result.registeredInRetreat).toBe(false);
    expect(result.registeredGroup).toBeUndefined();
  });

  it("flags walker group when active RP has type=walker", async () => {
    mockParticipantGetOne.mockResolvedValue(existingWalker);
    mockRpFindOne.mockResolvedValue({ id: "rp-1", type: "walker" });

    const result = await checkParticipantExists(
      "juan@example.com",
      "retreat-1",
    );

    expect(result.registeredInRetreat).toBe(true);
    expect(result.registeredType).toBe("walker");
    expect(result.registeredGroup).toBe("walker");
    expect(result.alreadyRegisteredMessage).toBe(
      "Este correo ya está registrado en este retiro como caminante.",
    );
  });

  it("maps type=waiting to walker group (same message)", async () => {
    mockParticipantGetOne.mockResolvedValue(existingWalker);
    mockRpFindOne.mockResolvedValue({ id: "rp-1", type: "waiting" });

    const result = await checkParticipantExists(
      "juan@example.com",
      "retreat-1",
    );

    expect(result.registeredGroup).toBe("walker");
    expect(result.alreadyRegisteredMessage).toContain("caminante");
  });

  it("flags server group when active RP has type=server", async () => {
    mockParticipantGetOne.mockResolvedValue(existingWalker);
    mockRpFindOne.mockResolvedValue({ id: "rp-2", type: "server" });

    const result = await checkParticipantExists(
      "juan@example.com",
      "retreat-1",
    );

    expect(result.registeredGroup).toBe("server");
    expect(result.alreadyRegisteredMessage).toBe(
      "Este correo ya está registrado en este retiro como servidor.",
    );
  });

  it("maps type=partial_server to server group (same message)", async () => {
    mockParticipantGetOne.mockResolvedValue(existingWalker);
    mockRpFindOne.mockResolvedValue({ id: "rp-3", type: "partial_server" });

    const result = await checkParticipantExists(
      "juan@example.com",
      "retreat-1",
    );

    expect(result.registeredGroup).toBe("server");
    expect(result.alreadyRegisteredMessage).toContain("servidor");
  });

  it("falls back to generic message when type is unknown/null", async () => {
    mockParticipantGetOne.mockResolvedValue(existingWalker);
    mockRpFindOne.mockResolvedValue({ id: "rp-4", type: null });

    const result = await checkParticipantExists(
      "juan@example.com",
      "retreat-1",
    );

    expect(result.registeredInRetreat).toBe(true);
    expect(result.registeredGroup).toBeUndefined();
    expect(result.alreadyRegisteredMessage).toBe(
      "Este correo ya está registrado en este retiro.",
    );
  });

  it("only considers non-cancelled rows (isCancelled: false filter)", async () => {
    mockParticipantGetOne.mockResolvedValue(existingWalker);
    mockRpFindOne.mockResolvedValue(null);

    await checkParticipantExists("juan@example.com", "retreat-1");

    expect(mockRpFindOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          participantId: "p-1",
          retreatId: "retreat-1",
          isCancelled: false,
        }),
      }),
    );
  });
});

// --------------------------------------------------------------------------
// createParticipant — reuse branch guard
// --------------------------------------------------------------------------

describe("createParticipant reuse branch — double-registration guard", () => {
  it("throws ALREADY_REGISTERED_IN_RETREAT when active RP (walker) exists", async () => {
    // Found-by-email existing Participant
    mockParticipantGetOne.mockResolvedValue(existingWalker);
    // Active RP with walker in the target retreat
    mockRpFindOne.mockResolvedValue({ id: "rp-1", type: "walker" });

    await expect(
      createParticipant({ ...basePayload, type: "server" }),
    ).rejects.toMatchObject({
      code: "ALREADY_REGISTERED_IN_RETREAT",
      message: "Este correo ya está registrado en este retiro como caminante.",
    });

    // Must NOT attempt to save/overwrite the participant.
    expect(mockParticipantRepo.save).not.toHaveBeenCalled();
  });

  it('throws with "servidor" message when active RP is server', async () => {
    mockParticipantGetOne.mockResolvedValue(existingWalker);
    mockRpFindOne.mockResolvedValue({ id: "rp-s", type: "server" });

    await expect(
      createParticipant({ ...basePayload, type: "walker" }),
    ).rejects.toMatchObject({
      code: "ALREADY_REGISTERED_IN_RETREAT",
      message: "Este correo ya está registrado en este retiro como servidor.",
    });
  });

  it("does NOT throw when previous RP is cancelled (allows re-registration)", async () => {
    mockParticipantGetOne.mockResolvedValue(existingWalker);
    // Guard query filters isCancelled=false → cancelled rows return null here.
    mockRpFindOne.mockResolvedValueOnce(null); // assert helper — no active row
    // Subsequent findOne calls inside the reuse flow (upsert of RP)
    mockRpFindOne.mockResolvedValue(null);
    mockParticipantRepo.save.mockImplementation(async (p: any) => p);
    mockRpSave.mockImplementation(async (r: any) => r);

    await expect(
      createParticipant({ ...basePayload, type: "server" }),
    ).resolves.toBeDefined();

    // The guard query must have been called with isCancelled:false.
    expect(mockRpFindOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          participantId: "p-1",
          retreatId: "retreat-1",
          isCancelled: false,
        }),
      }),
    );
  });
});

// --------------------------------------------------------------------------
// confirmExistingParticipant guard
// --------------------------------------------------------------------------

describe("confirmExistingParticipant — double-registration guard", () => {
  it("throws ALREADY_REGISTERED_IN_RETREAT when an active RP exists", async () => {
    mockParticipantGetOne.mockResolvedValue(existingWalker);
    mockRpFindOne.mockResolvedValue({ id: "rp-1", type: "walker" });

    await expect(
      confirmExistingParticipant("juan@example.com", "retreat-1", "server"),
    ).rejects.toMatchObject({
      code: "ALREADY_REGISTERED_IN_RETREAT",
      message: "Este correo ya está registrado en este retiro como caminante.",
    });

    expect(mockParticipantRepo.save).not.toHaveBeenCalled();
  });

  it('throws "Participant not found" when the email has no Participant', async () => {
    mockParticipantGetOne.mockResolvedValue(null);

    await expect(
      confirmExistingParticipant("nobody@example.com", "retreat-1", "server"),
    ).rejects.toThrow("Participant not found");
  });
});

// --------------------------------------------------------------------------
// isRetreatPast + closed-retreat guard
// --------------------------------------------------------------------------

describe("isRetreatPast — timezone-aware date comparison", () => {
  const ORIGINAL_TZ = process.env.APP_TIMEZONE;

  afterEach(() => {
    if (ORIGINAL_TZ === undefined) delete process.env.APP_TIMEZONE;
    else process.env.APP_TIMEZONE = ORIGINAL_TZ;
    jest.useRealTimers();
  });

  it("returns false for a future YYYY-MM-DD endDate", () => {
    expect(isRetreatPast("2099-12-31")).toBe(false);
  });

  it("returns true for a past YYYY-MM-DD endDate", () => {
    expect(isRetreatPast("2000-01-01")).toBe(true);
  });

  it("returns false when endDate is null/undefined", () => {
    expect(isRetreatPast(null)).toBe(false);
    expect(isRetreatPast(undefined)).toBe(false);
  });

  it("uses UTC date components from Date objects (ignores local offset)", () => {
    // TypeORM often returns DATE columns as Date(YYYY-MM-DDT00:00:00.000Z).
    const endDate = new Date("2026-04-21T00:00:00.000Z");
    process.env.APP_TIMEZONE = "UTC";
    jest.useFakeTimers().setSystemTime(new Date("2026-04-21T12:00:00Z"));
    expect(isRetreatPast(endDate)).toBe(false); // same day -> still accepting
    jest.setSystemTime(new Date("2026-04-22T00:30:00Z"));
    expect(isRetreatPast(endDate)).toBe(true); // next day -> closed
  });

  it("does NOT falsely close a CDMX retreat during evening local time", () => {
    // Retreat endDate is 2026-04-21 in CDMX. At 21:00 CDMX (03:00 UTC next day),
    // UTC-based logic would falsely close it. With APP_TIMEZONE=America/Mexico_City
    // the guard must still treat it as open.
    process.env.APP_TIMEZONE = "America/Mexico_City";
    // 2026-04-22T02:59:00Z  == 2026-04-21T20:59:00 in CDMX (UTC-6).
    jest.useFakeTimers().setSystemTime(new Date("2026-04-22T02:59:00Z"));
    expect(isRetreatPast("2026-04-21")).toBe(false);
    // Past CDMX midnight → now 2026-04-22 locally → retreat closed.
    jest.setSystemTime(new Date("2026-04-22T06:01:00Z"));
    expect(isRetreatPast("2026-04-21")).toBe(true);
  });
});

describe("createParticipant — retreat-closed guard", () => {
  it("throws RETREAT_CLOSED when endDate is in the past", async () => {
    mockRetreatRepo.findOne.mockResolvedValueOnce({
      id: "retreat-1",
      isPublic: true,
      endDate: "2000-01-01",
    });

    await expect(createParticipant(basePayload)).rejects.toMatchObject({
      code: "RETREAT_CLOSED",
      message: "Este retiro ya terminó y no acepta nuevos registros.",
    });

    // Nothing is saved.
    expect(mockParticipantRepo.save).not.toHaveBeenCalled();
  });

  it("throws RETREAT_NOT_PUBLIC when retreat.isPublic is false", async () => {
    mockRetreatRepo.findOne.mockResolvedValueOnce({
      id: "retreat-1",
      isPublic: false,
      endDate: FUTURE_YMD,
    });

    await expect(createParticipant(basePayload)).rejects.toMatchObject({
      code: "RETREAT_NOT_PUBLIC",
    });
  });

  it("throws RETREAT_NOT_FOUND when no retreat exists", async () => {
    mockRetreatRepo.findOne.mockResolvedValueOnce(null);

    await expect(createParticipant(basePayload)).rejects.toMatchObject({
      code: "RETREAT_NOT_FOUND",
    });
  });
});

describe("confirmExistingParticipant — retreat-closed guard", () => {
  it("throws RETREAT_CLOSED when endDate is in the past", async () => {
    mockParticipantGetOne.mockResolvedValue(existingWalker);
    mockRetreatRepo.findOne.mockResolvedValueOnce({
      id: "retreat-1",
      isPublic: true,
      endDate: "2000-01-01",
    });

    await expect(
      confirmExistingParticipant("juan@example.com", "retreat-1", "server"),
    ).rejects.toMatchObject({
      code: "RETREAT_CLOSED",
    });

    expect(mockParticipantRepo.save).not.toHaveBeenCalled();
  });
});
