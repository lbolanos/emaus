import { Request, Response, NextFunction } from "express";
import * as participantService from "../services/participantService";
import { RecaptchaService } from "../services/recaptchaService";
import { participantSchema } from "@repo/types";
import { z } from "zod";

const recaptchaService = new RecaptchaService();

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
    res.json(participants);
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
    const { includePayments } = req.query;
    const participant = await participantService.findParticipantById(
      req.params.id,
      includePayments === "true",
    );
    if (participant) {
      res.json(participant);
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
    const updatedParticipant = await participantService.updateParticipant(
      req.params.id,
      req.body,
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
    const { email, retreatId, type, recaptchaToken } = req.body;

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
