import { Request, Response, NextFunction } from 'express';
import * as tableMesaService from '../services/tableMesaService';

export const getTablesForRetreat = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { retreatId } = req.params;
    const tables = await tableMesaService.findTablesByRetreatId(retreatId);
    res.json(tables);
  } catch (error: any) {
    next(error);
  }
};

export const rebalanceTables = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { retreatId } = req.params;
    await tableMesaService.rebalanceTablesForRetreat(retreatId);
    res.status(200).json({ message: 'Tables rebalanced successfully' });
  } catch (error: any) {
    next(error);
  }
};

export const getTable = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const table = await tableMesaService.findTableById(req.params.id);
    if (!table) {
      return res.status(404).json({ message: 'Table not found' });
    }
    res.json(table);
  } catch (error: any) {
    next(error);
  }
};

export const createTable = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const newTable = await tableMesaService.createTable(req.body);
    res.status(201).json(newTable);
  } catch (error: any) {
    next(error);
  }
};

export const updateTable = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updatedTable = await tableMesaService.updateTable(req.params.id, req.body);
    if (!updatedTable) {
      return res.status(404).json({ message: 'Table not found' });
    }
    res.json(updatedTable);
  } catch (error: any) {
    next(error);
  }
};

export const deleteTable = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await tableMesaService.deleteTable(req.params.id);
    res.status(204).send();
  } catch (error: any) {
    next(error);
  }
};