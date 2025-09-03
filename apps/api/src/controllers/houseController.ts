import { Request, Response } from 'express';
import * as houseService from '../services/houseService';

export const getAllHouses = async (req: Request, res: Response) => {
  try {
    const houses = await houseService.findAllHouses();
    res.json(houses);
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving houses' });
  }
};

export const getHouseById = async (req: Request, res: Response) => {
  try {
    const house = await houseService.findHouseById(req.params.id);
    if (house) {
      res.json(house);
    } else {
      res.status(404).json({ message: 'House not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving house' });
  }
};

export const createHouse = async (req: Request, res: Response) => {
  try {
    const newHouse = await houseService.createHouse(req.body);
    res.status(201).json(newHouse);
  } catch (error) {
    res.status(500).json({ message: 'Error creating house' });
  }
};

export const updateHouse = async (req: Request, res: Response) => {
  try {
    const updatedHouse = await houseService.updateHouse(
      req.params.id,
      req.body
    );
    if (updatedHouse) {
      res.json(updatedHouse);
    } else {
      res.status(404).json({ message: 'House not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error updating house' });
  }
};

export const deleteHouse = async (req: Request, res: Response) => {
  try {
    await houseService.deleteHouse(req.params.id);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ message: 'Error deleting house' });
  }
};