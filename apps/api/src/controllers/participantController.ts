import { Request, Response } from 'express';
import * as participantService from '../services/participantService';

export const getAllParticipants = async (req: Request, res: Response) => {
  try {
    const { retreatId, type } = req.query;
    const participants = await participantService.findAllParticipants(retreatId as string | undefined, type as 'walker' | 'server' | undefined);
    res.json(participants);
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving participants' });
  }
};

export const getParticipantById = async (req: Request, res: Response) => {
  try {
    const participant = await participantService.findParticipantById(req.params.id);
    if (participant) {
      res.json(participant);
    } else {
      res.status(404).json({ message: 'Participant not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving participant' });
  }
};

export const createParticipant = async (req: Request, res: Response) => {
  try {
    const newParticipant = await participantService.createParticipant(req.body);
    res.status(201).json(newParticipant);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('already exists')) {
        return res.status(409).json({ message: error.message });
      }
    }
    res.status(500).json({ message: 'Error creating Participant' });
  }
};


export const updateParticipant = async (req: Request, res: Response) => {
  try {
    const updatedParticipant = await participantService.updateParticipant(
      req.params.id,
      req.body
    );
    if (updatedParticipant) {
      res.json(updatedParticipant);
    } else {
      res.status(404).json({ message: 'Participant not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error updating participant' });
  }
};

export const deleteParticipant = async (req: Request, res: Response) => {
  try {
    await participantService.deleteParticipant(req.params.id);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ message: 'Error deleting participant' });
  }
};

export const importParticipants = async (req: Request, res: Response) => {
  try {
    const { retreatId } = req.params;
    const { participants } = req.body;

    const result = await participantService.importParticipants(retreatId, participants);

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error importing participants' });
  }
};
