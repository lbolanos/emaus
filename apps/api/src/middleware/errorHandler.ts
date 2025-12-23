import { Request, Response, NextFunction } from 'express';

export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
	// Check for validation errors (these should return 400 with the actual message)
	const validationErrorPatterns = [
		'No se puede asignar:',
		'ya existe un participante',
		'not found',
		'cannot assign',
		'invalid',
		'does not exist',
	];

	const isValidationError = validationErrorPatterns.some((pattern) =>
		err.message.toLowerCase().includes(pattern.toLowerCase())
	);

	if (isValidationError) {
		// For validation errors, log at warn level and return 400 with the actual message
		console.warn(`[VALIDATION ERROR] ${req.method} ${req.originalUrl}: ${err.message}`);
		if (res.headersSent) {
			return next(err);
		}
		return res.status(400).json({ message: err.message });
	}

	// For unexpected errors, log at error level and return 500
	console.error('---------------------');
	console.error('An unexpected error occurred:');
	console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
	console.error('Error:', err);
	console.error('Error stack:', err.stack);
	console.error('---------------------');

	if (res.headersSent) {
		return next(err);
	}

	res.status(500).json({ message: 'Internal Server Error' });
};
