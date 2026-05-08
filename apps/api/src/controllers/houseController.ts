import { Request, Response, NextFunction } from 'express';
import * as houseService from '../services/houseService';
import { inferTimezoneFromCoords } from '../utils/date.transformer';

export const getHouses = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const houses = await houseService.getHouses();
		res.json(houses);
	} catch (error) {
		next(error);
	}
};

export const getHouseById = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const house = await houseService.findById(req.params.id);
		if (house) {
			res.json(house);
		} else {
			res.status(404).json({ message: 'House not found' });
		}
	} catch (error) {
		next(error);
	}
};

export const createHouse = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const newHouse = await houseService.createHouse(req.body);
		res.status(201).json(newHouse);
	} catch (error: any) {
		next(error);
	}
};

export const updateHouse = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const updatedHouse = await houseService.updateHouse(req.params.id, req.body);
		if (updatedHouse) {
			res.json(updatedHouse);
		} else {
			res.status(404).json({ message: 'House not found' });
		}
	} catch (error: any) {
		next(error);
	}
};

/**
 * Devuelve la timezone IANA inferida a partir de coordenadas.
 * Si no se puede inferir (coords fuera de rango, mar abierto), responde con
 * `{ timezone: null }` y el cliente debe caer al default.
 */
export const getTimezoneFromCoords = async (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	try {
		const lat = parseFloat(String(req.query.lat ?? ''));
		const lon = parseFloat(String(req.query.lon ?? ''));
		const timezone = await inferTimezoneFromCoords(lat, lon);
		res.json({ timezone });
	} catch (error) {
		next(error);
	}
};

export const deleteHouse = async (req: Request, res: Response, next: NextFunction) => {
	try {
		await houseService.deleteHouse(req.params.id);
		res.status(204).send();
	} catch (error) {
		next(error);
	}
};
