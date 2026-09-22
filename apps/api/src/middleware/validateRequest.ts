import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';

export const validateRequest =
	(
		schema: AnyZodObject,
		options: { assignParsedBody?: boolean } = {},
	) =>
	(req: Request, res: Response, next: NextFunction) => {
		// Try the wrapped {body, query, params} format first (standard for schemas with body/params)
		const wrappedResult = schema.safeParse({
			body: req.body,
			query: req.query,
			params: req.params,
		});

		if (wrappedResult.success) {
			// Zod drops every key the schema doesn't declare (that's how an update
			// schema's .omit takes a field out of circulation) — but only in the
			// PARSED output. By default we only validate: the raw body keeps
			// carrying the omitted keys to the controller. For schemas whose omit
			// is a security boundary (community update vs its dedicated flyer
			// endpoints), pass assignParsedBody so the stripped body is what the
			// controller sees. The 2026-09-21 flyer-identity bypass survived its
			// own schema fix exactly this way — caught by
			// communityUpdateRoutes.simple.test.ts.
			if (options.assignParsedBody && wrappedResult.data.body !== undefined) {
				req.body = wrappedResult.data.body;
			}
			return next();
		}

		// Fall back to parsing req.body directly (simple body-only schemas)
		const bodyResult = schema.safeParse(req.body);

		if (bodyResult.success) {
			return next();
		}

		// Both failed — return the more useful error.
		// If the wrapped error has field-level issues inside body (e.g. body.firstName),
		// that's more useful than "body is required".
		const wrappedErrors = wrappedResult.error.errors;
		const hasDeepBodyErrors = wrappedErrors.some(
			(e) => e.path.length > 1 && e.path[0] === 'body',
		);

		return res.status(400).json({
			message: 'Validation error',
			errors: hasDeepBodyErrors ? wrappedErrors : bodyResult.error.errors,
		});
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
