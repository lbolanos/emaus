import { Request, Response } from 'express';
import * as participantService from '../services/participantService';

export const getAllParticipants = async (req: Request, res: Response) => {
  try {
    const { retreatId } = req.query;
    const participants = await participantService.findAllParticipants(retreatId as string | undefined);
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

export const createWalker = async (req: Request, res: Response) => {
  try {
    const newWalker = await participantService.createWalker(req.body);
    res.status(201).json(newWalker);
  } catch (error) {
    res.status(500).json({ message: 'Error creating walker' });
  }
};

export const createServer = async (req: Request, res: Response) => {
  try {
    const newServer = await participantService.createServer(req.body);
    res.status(201).json(newServer);
  } catch (error) {
    res.status(500).json({ message: 'Error creating server' });
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