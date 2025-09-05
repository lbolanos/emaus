import { Request, Response } from 'express';
import * as retreatChargeService from '../services/retreatChargeService';

export const getAllRetreatCharges = async (req: Request, res: Response) => {
  try {
    const { retreatId } = req.query;
    const charges = await retreatChargeService.findAllRetreatCharges(
      retreatId as string | undefined
    );
    res.json(charges);
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving retreat charges' });
  }
};

export const getRetreatChargeById = async (req: Request, res: Response) => {
  try {
    const charge = await retreatChargeService.findRetreatChargeById(req.params.id);
    if (charge) {
      res.json(charge);
    } else {
      res.status(404).json({ message: 'Retreat charge not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving retreat charge' });
  }
};

export const createRetreatCharge = async (req: Request, res: Response) => {
  try {
    const newCharge = await retreatChargeService.createRetreatCharge(req.body);
    res.status(201).json(newCharge);
  } catch (error) {
    res.status(500).json({ message: 'Error creating retreat charge' });
  }
};

export const updateRetreatCharge = async (req: Request, res: Response) => {
  try {
    const updatedCharge = await retreatChargeService.updateRetreatCharge(
      req.params.id,
      req.body
    );
    if (updatedCharge) {
      res.json(updatedCharge);
    } else {
      res.status(404).json({ message: 'Retreat charge not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error updating retreat charge' });
  }
};

export const deleteRetreatCharge = async (req: Request, res: Response) => {
  try {
    await retreatChargeService.deleteRetreatCharge(req.params.id);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ message: 'Error deleting retreat charge' });
  }
};

export const assignChargeToParticipant = async (req: Request, res: Response) => {
  try {
    const { chargeId, participantId } = req.params;
    const result = await retreatChargeService.assignChargeToParticipant(chargeId, participantId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error assigning charge to participant' });
  }
};

export const removeChargeFromParticipant = async (req: Request, res: Response) => {
  try {
    const { chargeId, participantId } = req.params;
    const result = await retreatChargeService.removeChargeFromParticipant(chargeId, participantId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error removing charge from participant' });
  }
};

export const getChargesForParticipant = async (req: Request, res: Response) => {
  try {
    const { participantId } = req.params;
    const charges = await retreatChargeService.getChargesForParticipant(participantId);
    res.json(charges);
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving charges for participant' });
  }
};

export const getParticipantsForCharge = async (req: Request, res: Response) => {
  try {
    const { chargeId } = req.params;
    const participants = await retreatChargeService.getParticipantsForCharge(chargeId);
    res.json(participants);
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving participants for charge' });
  }
};
