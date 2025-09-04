import { Request, Response } from 'express';
import { getRetreats, createRetreat as createRetreatService, findById, update } from '../services/retreatService';

export const getAllRetreats = async (req: Request, res: Response) => {
  try {
    const retreats = await getRetreats();
    res.json(retreats);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching retreats', error });
  }
};

export const getRetreatById = async (req: Request, res: Response) => {
  try {
    const retreat = await findById(req.params.id);
    if (!retreat) {
      return res.status(404).json({ message: 'Retreat not found' });
    }
    res.json(retreat);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching retreat', error });
  }
}

export const updateRetreat = async (req: Request, res: Response) => {
  try {
    const retreat = await update(req.params.id, req.body);
    if (!retreat) {
      return res.status(404).json({ message: 'Retreat not found' });
    }
    res.json(retreat);
  } catch (error) {
    res.status(500).json({ message: 'Error updating retreat', error });
  }
}

export const createRetreat = async (req: Request, res: Response) => {
  try {
    const newRetreat = await createRetreatService(req.body);
    res.status(201).json(newRetreat);
  } catch (error) {
    res.status(500).json({ message: 'Error creating retreat', error });
  }
};
