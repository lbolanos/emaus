import { Request, Response } from 'express';
import { getRetreats, createRetreat as createRetreatService } from '../services/retreatService';

export const getAllRetreats = async (req: Request, res: Response) => {
  try {
    const retreats = await getRetreats();
    res.json(retreats);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching retreats', error });
  }
};

export const createRetreat = async (req: Request, res: Response) => {
  try {
    const newRetreat = await createRetreatService(req.body);
    res.status(201).json(newRetreat);
  } catch (error) {
    res.status(500).json({ message: 'Error creating retreat', error });
  }
};
