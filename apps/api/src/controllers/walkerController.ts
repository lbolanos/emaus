import { Request, Response } from 'express';
import * as walkerService from '../services/walkerService';

export const getAllWalkers = async (req: Request, res: Response) => {
  try {
    const { retreatId } = req.query;
    const walkers = await walkerService.findAllWalkers(retreatId as string | undefined);
    res.json(walkers);
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving walkers' });
  }
};

export const getWalkerById = async (req: Request, res: Response) => {
  try {
    const walker = await walkerService.findWalkerById(req.params.id);
    if (walker) {
      res.json(walker);
    } else {
      res.status(404).json({ message: 'Walker not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving walker' });
  }
};

export const createWalker = async (req: Request, res: Response) => {
  try {
    const newWalker = await walkerService.createWalker(req.body);
    res.status(201).json(newWalker);
  } catch (error) {
    res.status(500).json({ message: 'Error creating walker' });
  }
};

export const updateWalker = async (req: Request, res: Response) => {
  try {
    const updatedWalker = await walkerService.updateWalker(
      req.params.id,
      req.body
    );
    if (updatedWalker) {
      res.json(updatedWalker);
    } else {
      res.status(404).json({ message: 'Walker not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error updating walker' });
  }
};

export const deleteWalker = async (req: Request, res: Response) => {
  try {
    await walkerService.deleteWalker(req.params.id);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ message: 'Error deleting walker' });
  }
};