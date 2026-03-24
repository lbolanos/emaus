import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';

export const validateRequest =
	(schema: AnyZodObject) => (req: Request, res: Response, next: NextFunction) => {
		try {
			// First try parsing req.body directly (most common case for POST/PUT/PATCH)
			schema.parse(req.body);
			next();
		} catch (bodyError) {
			if (bodyError instanceof ZodError) {
				// If body parse fails, try the wrapped {body, query, params} format
				try {
					schema.parse({
						body: req.body,
						query: req.query,
						params: req.params,
					});
					next();
				} catch (wrappedError) {
					// Return the body error since it's the most useful for callers
					return res.status(400).json({
						message: 'Validation error',
						errors: bodyError.errors,
					});
				}
			} else {
				next(bodyError);
			}
		}
	};

// Specialized validators for specific use cases
export const validateQuery =
	(schema: AnyZodObject) => (req: Request, res: Response, next: NextFunction) => {
		try {
			schema.parse(req.query);
			next();
		} catch (error) {
			if (error instanceof ZodError) {
				return res.status(400).json({
					message: 'Query validation error',
					errors: error.errors,
				});
			}
			next(error);
		}
	};

export const validateBody =
	(schema: AnyZodObject) => (req: Request, res: Response, next: NextFunction) => {
		try {
			schema.parse(req.body);
			next();
		} catch (error) {
			if (error instanceof ZodError) {
				return res.status(400).json({
					message: 'Body validation error',
					errors: error.errors,
				});
			}
			next(error);
		}
	};
