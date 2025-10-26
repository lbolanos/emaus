import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';

export const validateRequest =
	(schema: AnyZodObject) => (req: Request, res: Response, next: NextFunction) => {
		try {
			// Try to validate all parts - if schema is shape-specific (like query-only), it will work
			// If schema expects fields that span multiple parts, it will validate fine
			const validationData = {
				body: req.body,
				query: req.query,
				params: req.params,
			};

			// Attempt full validation first
			schema.parse(validationData);
			next();
		} catch (error) {
			if (error instanceof ZodError) {
				// If full validation fails, try individual parts
				const parts = [
					{ name: 'body', data: req.body },
					{ name: 'query', data: req.query },
					{ name: 'params', data: req.params }
				];

				for (const part of parts) {
					try {
						schema.parse(part.data);
						return next(); // If any part validates, continue
					} catch (partError) {
						// Continue trying other parts
						continue;
					}
				}

				// If no individual part worked, return the original error
				return res.status(400).json({
					message: 'Validation error',
					errors: error.errors,
				});
			}
			next(error);
		}
	};

// Specialized validators for specific use cases
export const validateQuery = (schema: AnyZodObject) => (req: Request, res: Response, next: NextFunction) => {
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

export const validateBody = (schema: AnyZodObject) => (req: Request, res: Response, next: NextFunction) => {
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
