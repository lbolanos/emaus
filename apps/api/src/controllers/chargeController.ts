import { Request, Response, NextFunction } from 'express';
import * as chargeService from '../services/chargeService';

export const getAllCharges = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { retreatId } = req.query;
    const charges = await chargeService.findAllCharges(
      retreatId as string | undefined
    );
    res.json(charges);
  } catch (error) {
    next(error);
  }
};

export const getChargeById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const charge = await chargeService.findChargeById(req.params.id);
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
    const newCharge = await chargeService.createCharge(req.body);
    res.status(201).json(newCharge);
  } catch (error) {
    next(error);
  }
};

export const updateCharge = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updatedCharge = await chargeService.updateCharge(
      req.params.id,
      req.body
    );
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
    await chargeService.deleteCharge(req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const assignChargeToParticipant = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { chargeId, participantId } = req.params;
    const result = await chargeService.assignChargeToParticipant(chargeId, participantId);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const removeChargeFromParticipant = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { chargeId, participantId } = req.params;
    const result = await chargeService.removeChargeFromParticipant(chargeId, participantId);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const getChargesForParticipant = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { participantId } = req.params;
    const charges = await chargeService.getChargesForParticipant(participantId);
    res.json(charges);
  } catch (error) {
    next(error);
  }
};

export const getParticipantsForCharge = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { chargeId } = req.params;
    const participants = await chargeService.getParticipantsForCharge(chargeId);
    res.json(participants);
  } catch (error) {
    next(error);
  }
};
