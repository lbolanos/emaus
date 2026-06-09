import { Request, Response, NextFunction } from "express";
import {
  getRetreatsForUser,
  createRetreat as createRetreatService,
  findById,
  findBySlug,
  isSlugAvailable,
  update,
  refreshRetreatBedsFromHouse,
} from "../services/retreatService";
import { isRetreatPast } from "../services/participantService";
import { listShirtTypes } from "../services/shirtTypeService";
import { AuthenticatedRequest } from "../middleware/authorization";
import { AppDataSource } from "../data-source";
import { Retreat } from "../entities/retreat.entity";
import { Participant } from "../entities/participant.entity";
import { RetreatParticipant } from "../entities/retreatParticipant.entity";
import { retreatMemoryService } from "../services/retreatMemoryService";

export const getAllRetreats = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Only return retreats the user has access to
    const retreats = await getRetreatsForUser(userId);
    res.json(retreats);
  } catch (error) {
    next(error);
  }
};

export const getRetreatById = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const retreat = await findById(req.params.id);
    if (!retreat) {
      return res.status(404).json({ message: "Retreat not found" });
    }
    res.json(retreat);
  } catch (error) {
    next(error);
  }
};

export const getPublicRetreats = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    // Find all public retreats starting in the future
    const { findPublicRetreats } = await import("../services/retreatService");
    const retreats = await findPublicRetreats();
    res.json(retreats);
  } catch (error) {
    next(error);
  }
};

export const getActiveRetreats = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { findActiveRetreats } = await import("../services/retreatService");
    const retreats = await findActiveRetreats();
    res.json({ active: retreats.length > 0, retreats });
  } catch (error) {
    next(error);
  }
};

export const getRetreatByIdPublic = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const retreat = await findById(req.params.id);
    if (!retreat) {
      return res.status(404).json({ message: "Retreat not found" });
    }
    const shirtTypes = await listShirtTypes(retreat.id);
    // Return all flyer data needed for registration form
    res.json({
      id: retreat.id,
      parish: retreat.parish,
      isPublic: retreat.isPublic,
      startDate: retreat.startDate,
      endDate: retreat.endDate,
      isRegistrationClosed: isRetreatPast(retreat.endDate),
      flyer_options: retreat.flyer_options || {},
      slug: retreat.slug,
      country: retreat.house?.country ?? null,
      shirtTypes,
    });
  } catch (error) {
    next(error);
  }
};

export const getRetreatBySlugPublic = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const retreat = await findBySlug(req.params.slug);
    if (!retreat) {
      return res.status(404).json({ message: "Retreat not found" });
    }
    const shirtTypes = await listShirtTypes(retreat.id);
    res.json({
      id: retreat.id,
      parish: retreat.parish,
      isPublic: retreat.isPublic,
      startDate: retreat.startDate,
      endDate: retreat.endDate,
      isRegistrationClosed: isRetreatPast(retreat.endDate),
      flyer_options: retreat.flyer_options || {},
      slug: retreat.slug,
      country: retreat.house?.country ?? null,
      shirtTypes,
    });
  } catch (error) {
    next(error);
  }
};

export const checkSlugAvailability = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { slug } = req.params;
    const excludeId = req.query.excludeId as string | undefined;
    const available = await isSlugAvailable(slug, excludeId);
    res.json({ available });
  } catch (error) {
    next(error);
  }
};

export const updateRetreat = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const refreshBeds = req.query.refreshBeds === "true";
    const retreat = await update(req.params.id, req.body, refreshBeds);
    if (!retreat) {
      return res.status(404).json({ message: "Retreat not found" });
    }
    res.json(retreat);
  } catch (error: any) {
    if (error.statusCode === 409) {
      return res.status(409).json({ message: error.message });
    }
    next(error);
  }
};

export const createRetreat = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Add creator to the retreat data
    const retreatData = {
      ...req.body,
      createdBy: userId,
    };

    const newRetreat = await createRetreatService(retreatData);

    // Automatically assign admin role to the creator for this retreat
    // Note: Temporarily disabled to isolate 500 error
    // try {
    // 	await retreatRoleService.inviteUserToRetreat(newRetreat.id, req.user!.email, 'admin', userId);
    // } catch (roleError) {
    // 	console.error('Error assigning admin role to retreat creator:', roleError);
    // 	// Don't fail the retreat creation if role assignment fails
    // }

    res.status(201).json(newRetreat);
  } catch (error: any) {
    if (error.statusCode === 409) {
      return res.status(409).json({ message: error.message });
    }
    next(error);
  }
};

export const exportRoomLabelsToDocx = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id: retreatId } = req.params;

    // Validate retreatId is a valid UUID
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        retreatId,
      )
    ) {
      return res.status(400).json({ message: "Invalid retreat ID" });
    }

    // Import the service function to avoid circular dependencies
    const { exportRoomLabelsToDocx } = await import("../services/roomService");
    const buffer = await exportRoomLabelsToDocx(retreatId);

    // Set headers for file download
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="etiquetas-habitaciones-${retreatId}.docx"`,
    );
    res.setHeader("Content-Length", buffer.length);

    // Send the file
    res.send(buffer);
  } catch (error: any) {
    console.error("Error exporting room labels to DOCX:", error);
    next(error);
  }
};

export const exportBadgesToDocx = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id: retreatId } = req.params;

    // Validate retreatId is a valid UUID
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        retreatId,
      )
    ) {
      return res.status(400).json({ message: "Invalid retreat ID" });
    }

    // Import the service function to avoid circular dependencies
    const { exportBadgesToDocx } = await import("../services/badgeService");
    const buffer = await exportBadgesToDocx(retreatId);

    if (!buffer) {
      return res.status(404).json({
        message:
          "No se pudieron generar los gafetes. Verifica que hay participantes asignados.",
      });
    }

    // Set headers for file download
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="gafetes-participantes-${retreatId}.docx"`,
    );
    res.setHeader("Content-Length", buffer.length);

    // Send the file
    res.send(buffer);
  } catch (error: any) {
    console.error("Error exporting badges to DOCX:", error);
    next(error);
  }
};

// ---------------------------------------------------------------------------
// Legacy single-value endpoints (kept for cached clients). They now delegate
// to the gallery service so the new child tables stay the source of truth.
// ---------------------------------------------------------------------------

export const uploadRetreatMemoryPhoto = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id: retreatId } = req.params;
    const { photoData } = req.body;

    if (!photoData) {
      return res.status(400).json({ message: "photoData is required" });
    }

    const retreat = await findById(retreatId);
    if (!retreat) {
      return res.status(404).json({ message: "Retreat not found" });
    }

    const photo = await retreatMemoryService.addPhoto(retreatId, photoData);
    res.json({ memoryPhotoUrl: photo.url });
  } catch (error) {
    next(error);
  }
};

export const updateRetreatMemory = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id: retreatId } = req.params;
    const { musicPlaylistUrl } = req.body;

    const retreat = await findById(retreatId);
    if (!retreat) {
      return res.status(404).json({ message: "Retreat not found" });
    }

    if (musicPlaylistUrl) {
      await retreatMemoryService.addSong(retreatId, { url: musicPlaylistUrl });
    }

    const refreshed = await findById(retreatId);
    res.json({
      musicPlaylistUrl: refreshed?.musicPlaylistUrl,
      memoryPhotoUrl: refreshed?.memoryPhotoUrl,
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// Gallery endpoints (multiple photos + songs, with a designated primary).
// ---------------------------------------------------------------------------

export const getRetreatMemories = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id: retreatId } = req.params;
    const memories = await retreatMemoryService.listMemories(retreatId);
    res.json(memories);
  } catch (error) {
    next(error);
  }
};

export const addRetreatMemoryPhoto = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id: retreatId } = req.params;
    const { photoData } = req.body;
    if (!photoData) {
      return res.status(400).json({ message: "photoData is required" });
    }
    const photo = await retreatMemoryService.addPhoto(retreatId, photoData);
    res.status(201).json(photo);
  } catch (error) {
    next(error);
  }
};

export const deleteRetreatMemoryPhoto = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id: retreatId, photoId } = req.params;
    await retreatMemoryService.deletePhoto(retreatId, photoId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const setPrimaryRetreatMemoryPhoto = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id: retreatId, photoId } = req.params;
    await retreatMemoryService.setPrimaryPhoto(retreatId, photoId);
    const memories = await retreatMemoryService.listMemories(retreatId);
    res.json(memories);
  } catch (error) {
    next(error);
  }
};

export const addRetreatMemorySong = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id: retreatId } = req.params;
    const { url, title } = req.body;
    const song = await retreatMemoryService.addSong(retreatId, { url, title });
    res.status(201).json(song);
  } catch (error) {
    next(error);
  }
};

export const updateRetreatMemorySong = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id: retreatId, songId } = req.params;
    const { url, title } = req.body;
    const song = await retreatMemoryService.updateSong(retreatId, songId, { url, title });
    res.json(song);
  } catch (error) {
    next(error);
  }
};

export const deleteRetreatMemorySong = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id: retreatId, songId } = req.params;
    await retreatMemoryService.deleteSong(retreatId, songId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const setPrimaryRetreatMemorySong = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id: retreatId, songId } = req.params;
    await retreatMemoryService.setPrimarySong(retreatId, songId);
    const memories = await retreatMemoryService.listMemories(retreatId);
    res.json(memories);
  } catch (error) {
    next(error);
  }
};

// Import every minute-by-minute item's music into the gallery. Only allowed
// once the retreat has ended.
export const importRetreatMemorySongsFromMam = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id: retreatId } = req.params;
    const retreat = await findById(retreatId);
    if (!retreat) {
      return res.status(404).json({ message: "Retreat not found" });
    }
    if (!isRetreatPast(retreat.endDate)) {
      return res
        .status(400)
        .json({ message: "El retiro aún no ha terminado." });
    }

    const { imported, skipped } =
      await retreatMemoryService.importSongsFromMam(retreatId);
    const memories = await retreatMemoryService.listMemories(retreatId);
    res.json({ imported, skipped, songs: memories.songs });
  } catch (error) {
    next(error);
  }
};

export const getAttendedRetreats = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const participantRepo = AppDataSource.getRepository(Participant);
    const retreatParticipantRepo =
      AppDataSource.getRepository(RetreatParticipant);

    // Source 1: legacy/per-retreat participants table linked by userId
    const participants = await participantRepo.find({
      where: { userId },
      relations: ["retreat", "retreat.memoryPhotos", "retreat.memorySongs"],
    });

    // Source 2: retreat_participants junction (a single participant may
    // attend multiple retreats via this table)
    const retreatParticipations = await retreatParticipantRepo.find({
      where: { userId },
      relations: ["retreat", "retreat.memoryPhotos", "retreat.memorySongs"],
    });

    const retreatsById = new Map<string, Retreat>();
    for (const p of participants) {
      if (p.retreat) retreatsById.set(p.retreat.id, p.retreat);
    }
    for (const rp of retreatParticipations) {
      if (rp.retreat) retreatsById.set(rp.retreat.id, rp.retreat);
    }

    res.json(Array.from(retreatsById.values()));
  } catch (error) {
    next(error);
  }
};

export const refreshRetreatBeds = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id } = req.params;
    const retreat = await findById(id);
    if (!retreat) {
      return res.status(404).json({ message: "Retreat not found" });
    }
    if (!retreat.houseId) {
      return res.status(400).json({ message: "Retreat has no house assigned" });
    }
    await refreshRetreatBedsFromHouse(id, retreat.houseId);
    const { autoAssignBedsForRetreat } = await import(
      "../services/participantService"
    );
    await autoAssignBedsForRetreat(id);
    res.json({ message: "Retreat beds refreshed successfully" });
  } catch (error) {
    next(error);
  }
};
