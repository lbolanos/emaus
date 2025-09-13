import { Request, RequestHandler } from 'express';

export interface AuthenticatedRequest extends Request {
	user?: any;
	userPermissions?: string[];
	userRoles?: string[];
	userRetreats?: Array<{
		retreatId: string;
		role: string;
	}>;
}

// Permission middleware - for use with exported const functions
export function requirePermission(permission: string): RequestHandler {
	return (req: AuthenticatedRequest, res, next) => {
		if (!req.user) {
			return res.status(401).json({ message: 'Unauthorized' });
		}

		if (!req.userPermissions?.includes(permission)) {
			return res.status(403).json({ message: 'Forbidden' });
		}

		next();
	};
}

export function requireRole(role: string): RequestHandler {
	return (req: AuthenticatedRequest, res, next) => {
		if (!req.user) {
			return res.status(401).json({ message: 'Unauthorized' });
		}

		if (!req.userRoles?.includes(role)) {
			return res.status(403).json({ message: 'Forbidden' });
		}

		next();
	};
}

export function requireRetreatAccess(retreatIdParam: string = 'retreatId'): RequestHandler {
	return (req: AuthenticatedRequest, res, next) => {
		if (!req.user) {
			return res.status(401).json({ message: 'Unauthorized' });
		}

		const retreatId = req.params[retreatIdParam];
		if (!retreatId) {
			return res.status(400).json({ message: 'Retreat ID is required' });
		}

		const hasAccess = req.userRetreats?.some((r: any) => r.retreatId === retreatId);
		if (!hasAccess) {
			return res.status(403).json({ message: 'Forbidden' });
		}

		next();
	};
}

export function requireRetreatRole(
	role: string,
	retreatIdParam: string = 'retreatId',
): RequestHandler {
	return (req: AuthenticatedRequest, res, next) => {
		if (!req.user) {
			return res.status(401).json({ message: 'Unauthorized' });
		}

		const retreatId = req.params[retreatIdParam];
		if (!retreatId) {
			return res.status(400).json({ message: 'Retreat ID is required' });
		}

		const hasRole = req.userRetreats?.some(
			(r: any) => r.retreatId === retreatId && r.role === role,
		);
		if (!hasRole) {
			return res.status(403).json({ message: 'Forbidden' });
		}

		next();
	};
}

// GlobalScope decorator for class methods (not used with exported const functions)
export function GlobalScope(scope: string): MethodDecorator {
	return function (target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
		const [resource, operation] = scope.split(':');

		if (!resource || !operation) {
			throw new Error('Invalid scope format. Use "resource:operation" format');
		}

		// Get the original method
		const originalMethod = descriptor.value;

		// Replace with wrapped method that includes authorization
		descriptor.value = async function (...args: any[]) {
			const [req, res, next] = args;

			// Check if user is authenticated
			if (!req.user) {
				return res.status(401).json({ message: 'Unauthorized' });
			}

			// Check permissions
			if (!req.userPermissions?.includes(scope)) {
				return res.status(403).json({ message: 'Forbidden' });
			}

			// Call original method
			return originalMethod.apply(this, args);
		};

		return descriptor;
	};
}
