import { Request, Response, NextFunction } from "express";
import * as participantService from "../services/participantService";
import { RecaptchaService } from "../services/recaptchaService";
import { participantSchema } from "@repo/types";
import { z } from "zod";
import { authorizationService } from "../middleware/authorization";

const recaptchaService = new RecaptchaService();

/**
 * Returns true when the request user can read participant.scholarshipAmount.
 * Permission: participant:viewScholarshipAmount (granted to admin and treasurer).
 * If the request has no authenticated user, access is denied.
 */
async function canViewScholarshipAmount(req: Request): Promise<boolean> {
	const userId = (req as any).user?.id;
	if (!userId) return false;
	try {
		return await authorizationService.hasPermission(
			userId,
			"participant:viewScholarshipAmount",
		);
	} catch {
		return false;
	}
}

/**
 * Strip scholarshipAmount from a participant payload (or array) before sending
 * it to a client that lacks viewScholarshipAmount permission.
 * Mutates plain objects; for entity instances calls toJSON() first.
 */
function stripScholarshipAmount<T>(data: T): T {
	if (data == null) return data;
	if (Array.isArray(data)) {
		return data.map((item) => stripScholarshipAmount(item)) as any;
	}
	if (typeof data === "object") {
		const obj: any =
			typeof (data as any).toJSON === "function" ? (data as any).toJSON() : { ...data };
		if ("scholarshipAmount" in obj) {
			delete obj.scholarshipAmount;
		}
		return obj;
	}
	return data;
}

export const getAllParticipants = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const {
      retreatId,
      type,
      isCancelled: isCancelled,
      includePayments,
      tagIds,
    } = req.query;

    // Parse tagIds from query if present
    let parsedTagIds: string[] | undefined;
    if (tagIds) {
      if (Array.isArray(tagIds)) {
        parsedTagIds = tagIds as string[];
      } else if (typeof tagIds === "string") {
        parsedTagIds = tagIds.split(",").filter(Boolean);
      }
    }

    const participants = await participantService.findAllParticipants(
      retreatId as string | undefined,
      type as "walker" | "server" | "waiting" | undefined,
      isCancelled === "true",
      ["tableMesa", "retreatBed"], // Include table and bed relations
      includePayments === "true", // Include payment details when requested
      parsedTagIds,
    );
    const canSee = await canViewScholarshipAmount(req);
    res.json(canSee ? participants : stripScholarshipAmount(participants));
  } catch (error) {
    next(error);
  }
};

export const getParticipantById = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { includePayments, retreatId } = req.query;
    const participant = await participantService.findParticipantById(
      req.params.id,
      includePayments === "true",
      typeof retreatId === "string" ? retreatId : undefined,
    );
    if (participant) {
      const canSee = await canViewScholarshipAmount(req);
      res.json(canSee ? participant : stripScholarshipAmount(participant));
    } else {
      res.status(404).json({ message: "Participant not found" });
    }
  } catch (error) {
    next(error);
  }
};

export const createParticipant = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { recaptchaToken, dryRun, ...participantData } = req.body;

    // Verify reCAPTCHA token for public registration
    const recaptchaResult = await recaptchaService.verifyToken(recaptchaToken, {
      minScore: 0.5,
    });

    if (!recaptchaResult.valid) {
      return res
        .status(400)
        .json({
          message: recaptchaResult.error || "reCAPTCHA verification failed",
        });
    }

    // Validate request body with Zod schema
    // For non-walker types, emergency contact fields are optional
    let bodySchema = participantSchema.omit({
      id: true,
      lastUpdatedDate: true,
      registrationDate: true,
    });
    if (participantData.type && participantData.type !== "walker") {
      bodySchema = bodySchema.extend({
        emergencyContact1Name: z.string().optional(),
        emergencyContact1Relation: z.string().optional(),
        emergencyContact1CellPhone: z.string().optional(),
      });
    }
    const zodResult = bodySchema.safeParse(participantData);
    if (!zodResult.success) {
      const errors = zodResult.error.errors.map(
        (e) => `${e.path.join(".")}: ${e.message}`,
      );
      return res.status(400).json({ message: "Validation failed", errors });
    }
    const validatedData = zodResult.data;

    // Dry-run mode: validate only, no DB writes
    if (dryRun === true) {
      const result =
        await participantService.validateParticipant(validatedData);
      return res.status(200).json(result);
    }

    const newParticipant =
      await participantService.createParticipant(validatedData);
    res.status(201).json(newParticipant);
  } catch (error) {
    if (error instanceof Error) {
      const code = (error as Error & { code?: string }).code;
      if (
        code === "ALREADY_REGISTERED_IN_RETREAT" ||
        error.message.includes("already exists")
      ) {
        return res.status(409).json({ message: error.message });
      }
      if (
        code === "RETREAT_CLOSED" ||
        code === "RETREAT_NOT_PUBLIC" ||
        code === "RETREAT_NOT_FOUND"
      ) {
        return res.status(400).json({ message: error.message, code });
      }
    }
    next(error);
  }
};

// Safe fields that a regular_server can update on their own participant record
const SELF_UPDATE_ALLOWED_FIELDS = [
  "phone",
  "emergencyContactName",
  "emergencyContactPhone",
  "medicalConditions",
  "allergies",
  "specialNeeds",
  "address",
  "city",
  "state",
  "zipCode",
  "country",
  "notes",
  "disability",
  "disabilityDetails",
  "snoring",
  "snoringIntensity",
];

export const updateSelfParticipant = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user as any;
    if (!user?.id) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const { retreatId, ...updateData } = req.body;

    // Find participant linked to this user
    const participant = await participantService.findAllParticipants(retreatId);
    const selfParticipant = participant.find((p: any) => p.userId === user.id);

    if (!selfParticipant) {
      return res
        .status(404)
        .json({ message: "No participant record found for your user account" });
    }

    // Filter to only allowed fields
    const safeData: Record<string, any> = {};
    for (const key of SELF_UPDATE_ALLOWED_FIELDS) {
      if (key in updateData) {
        safeData[key] = updateData[key];
      }
    }

    if (Object.keys(safeData).length === 0) {
      return res.status(400).json({ message: "No valid fields to update" });
    }

    const updatedParticipant = await participantService.updateParticipant(
      selfParticipant.id,
      safeData as any,
    );
    if (updatedParticipant) {
      res.json(updatedParticipant);
    } else {
      res.status(404).json({ message: "Participant not found" });
    }
  } catch (error) {
    next(error);
  }
};

export const updateParticipant = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const body = { ...req.body };
    const canSee = await canViewScholarshipAmount(req);
    if (!canSee && "scholarshipAmount" in body) {
      // User cannot read or write the field. Drop silently to avoid leaking
      // existence; alternative is 403 — chose strip-and-continue to match
      // how other gated fields are handled in this controller.
      delete body.scholarshipAmount;
    }
    const updatedParticipant = await participantService.updateParticipant(
      req.params.id,
      body,
    );
    if (updatedParticipant) {
      res.json(canSee ? updatedParticipant : stripScholarshipAmount(updatedParticipant));
    } else {
      res.status(404).json({ message: "Participant not found" });
    }
  } catch (error) {
    if (
      error instanceof Error &&
      (error as Error & { code?: string }).code === "SCHOLARSHIP_EXCEEDS_COST"
    ) {
      return res
        .status(400)
        .json({ message: error.message, code: "SCHOLARSHIP_EXCEEDS_COST" });
    }
    next(error);
  }
};

export const deleteParticipant = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    await participantService.deleteParticipant(req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const importParticipants = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { retreatId } = req.params;
    const { participants } = req.body;
    const user = req.user as any;

    const result = await participantService.importParticipants(
      retreatId,
      participants,
      user,
    );

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Confirm an existing participant's registration for a retreat (no form needed).
 * The participant's personal data stays unchanged — only retreatId + RetreatParticipant are set.
 */
export const confirmExistingParticipantEmail = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email, retreatId, type, recaptchaToken, shirtSizes } = req.body;

    if (!email || !retreatId) {
      return res
        .status(400)
        .json({ message: "Email and retreatId are required" });
    }

    // Verify reCAPTCHA token for public access
    const recaptchaResult = await recaptchaService.verifyToken(recaptchaToken, {
      minScore: 0.5,
    });

    if (!recaptchaResult.valid) {
      return res
        .status(400)
        .json({
          message: recaptchaResult.error || "reCAPTCHA verification failed",
        });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const result = await participantService.confirmExistingParticipant(
      normalizedEmail,
      retreatId,
      type || "server",
      Array.isArray(shirtSizes) ? shirtSizes : undefined,
    );
    res.json(result);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Participant not found") {
        return res.status(404).json({ message: "Participant not found" });
      }
      const code = (error as Error & { code?: string }).code;
      if (code === "ALREADY_REGISTERED_IN_RETREAT") {
        return res.status(409).json({ message: error.message });
      }
      if (
        code === "RETREAT_CLOSED" ||
        code === "RETREAT_NOT_PUBLIC" ||
        code === "RETREAT_NOT_FOUND"
      ) {
        return res.status(400).json({ message: error.message, code });
      }
    }
    next(error);
  }
};

export const checkInParticipant = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;
    const { retreatId, checkedIn } = req.body;
    if (!retreatId) {
      return res.status(400).json({ message: "retreatId is required" });
    }
    const result = await participantService.setParticipantCheckIn(
      id,
      retreatId,
      checkedIn === true || checkedIn === "true",
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const getReceptionStats = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { retreatId } = req.params;
    const stats = await participantService.getReceptionStats(retreatId);
    res.json(stats);
  } catch (error) {
    next(error);
  }
};

/**
 * Check if a participant exists by email (for server registration flow)
 * This endpoint allows checking if a participant already exists before registering
 */
export const checkParticipantEmail = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email } = req.params;
    const { recaptchaToken, retreatId } = req.query;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    // Verify reCAPTCHA token for public access
    const recaptchaResult = await recaptchaService.verifyToken(
      recaptchaToken as string,
      {
        minScore: 0.5,
      },
    );

    if (!recaptchaResult.valid) {
      return res
        .status(400)
        .json({
          message: recaptchaResult.error || "reCAPTCHA verification failed",
        });
    }

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const retreatIdParam =
      typeof retreatId === "string" && uuidRegex.test(retreatId)
        ? retreatId
        : undefined;

    const normalizedEmail = email.toLowerCase().trim();
    const result = await participantService.checkParticipantExists(
      normalizedEmail,
      retreatIdParam,
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
};

const isValidDeleteToken = (t: unknown): t is string =>
  typeof t === "string" && /^[a-f0-9]{48}$/i.test(t);

export const getParticipantByDeleteToken = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { token } = req.params;
    if (!isValidDeleteToken(token)) {
      return res.status(404).json({ message: "Token no válido" });
    }
    const info = await participantService.findParticipantByDeleteToken(token);
    if (!info) return res.status(404).json({ message: "Token no válido" });
    res.json(info);
  } catch (error) {
    next(error);
  }
};

export const deleteParticipantByDeleteToken = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { token } = req.params;
    if (!isValidDeleteToken(token)) {
      return res.status(404).json({ message: "Token no válido" });
    }
    const ok = await participantService.anonymizeParticipantByToken(token);
    if (!ok) return res.status(404).json({ message: "Token no válido" });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};
