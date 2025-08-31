import { Request, Response } from 'express';
import { getHouses } from '../services/houseService';

export const getAllHouses = async (req: Request, res: Response) => {
  try {
    const houses = await getHouses();
    res.json(houses);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching houses', error });
  }
};
