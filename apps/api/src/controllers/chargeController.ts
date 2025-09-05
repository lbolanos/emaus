import { Request, Response, NextFunction } from 'express';
import {
  findAllCharges,
  findChargeById,
  createCharge as createChargeService,
  updateCharge as updateChargeService,
  deleteCharge as deleteChargeService,
  assignChargeToParticipant as assignChargeToParticipantService,
  removeChargeFromParticipant as removeChargeFromParticipantService,
} from '../services/chargeService';

export const getAllCharges = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { retreatId } = req.query;
    const charges = await findAllCharges(retreatId as string | undefined);
    res.json(charges);
  } catch (error) {
    next(error);
  }
};

export const getChargeById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const charge = await findChargeById(req.params.id);
    if (charge) {
      res.json(charge);
    } else {
      res.status(404).json({ message: 'Retreat charge not found' });
    }
  } catch (error) {
    next(error);
  }
};

export const createCharge = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const newCharge = await createChargeService(req.body);
    res.status(201).json(newCharge);
  } catch (error) {
    next(error);
  }
};

export const updateCharge = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updatedCharge = await updateChargeService(req.params.id, req.body);
    if (updatedCharge) {
      res.json(updatedCharge);
    } else {
      res.status(404).json({ message: 'Retreat charge not found' });
    }
  } catch (error) {
    next(error);
  }
};

export const deleteCharge = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await deleteChargeService(req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const assignCharge = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { participantId } = req.body;
    if (!participantId) {
      return res.status(400).json({ message: 'Participant ID is required' });
    }
    const charge = await assignChargeToParticipantService(id, participantId);
    if (!charge) {
      return res.status(404).json({ message: 'Charge or participant not found' });
    }
    res.status(200).json(charge);
  } catch (error) {
    next(error);
  }
};

export const removeCharge = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, participantId } = req.params;
    const charge = await removeChargeFromParticipantService(id, participantId);
    if (!charge) {
      return res.status(404).json({ message: 'Charge or participant not found, or participant not assigned to this charge' });
    }
    res.status(200).json(charge);
  } catch (error) {
    next(error);
  }
};
