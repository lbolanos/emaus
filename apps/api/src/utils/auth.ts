import { Request } from 'express';
import { User } from '../entities/user.entity';
import { AppDataSource } from '../data-source';

const userRepository = AppDataSource.getRepository(User);

// Simple session-based authentication - this is a placeholder
// In production, this would verify JWT tokens and session validity
export const getUserFromRequest = (req: Request): User | null => {
	// The actual user should be attached to the request by authentication middleware
	// For now, we'll check if there's a user attached to the request
	return (req as any).user || null;
};

export const getAuthenticatedUser = async (userId: string): Promise<User | null> => {
	return await userRepository.findOne({
		where: { id: userId },
		select: ['id', 'email', 'displayName', 'photo', 'participantId'],
	});
};
