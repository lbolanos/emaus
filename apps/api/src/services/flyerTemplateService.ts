import { In } from 'typeorm';
import type { CreateFlyerTemplate, UpdateFlyerTemplate } from '@repo/types';
import { AppDataSource } from '../data-source';
import { FlyerTemplate } from '../entities/flyerTemplate.entity';
import { CommunityAdmin } from '../entities/communityAdmin.entity';
import { authorizationService } from '../middleware/authorization';

export class FlyerTemplateNotFoundError extends Error {}
export class FlyerTemplateForbiddenError extends Error {}
export class FlyerTemplateValidationError extends Error {}

const repo = () => AppDataSource.getRepository(FlyerTemplate);

/** Communities where the user is an active admin. */
async function adminCommunityIds(userId: string): Promise<string[]> {
	const records = await AppDataSource.getRepository(CommunityAdmin).find({
		where: { userId, status: 'active' },
		select: ['communityId'],
	});
	return records.map((r) => r.communityId);
}

async function isSuperadmin(userId: string): Promise<boolean> {
	return authorizationService.hasRole(userId, 'superadmin');
}

/**
 * Templates the user can see: their own, plus those shared with any community they
 * administer. Superadmins see everything, matching getCommunities.
 */
export async function listForUser(userId: string): Promise<FlyerTemplate[]> {
	if (await isSuperadmin(userId)) {
		return repo().find({ order: { updatedAt: 'DESC' } });
	}

	const communityIds = await adminCommunityIds(userId);
	const own = await repo().find({ where: { createdBy: userId }, order: { updatedAt: 'DESC' } });
	if (communityIds.length === 0) return own;

	const shared = await repo().find({
		where: { scope: 'community', communityId: In(communityIds) },
		order: { updatedAt: 'DESC' },
	});

	// A user's own community template shows up in both queries.
	const byId = new Map(own.map((t) => [t.id, t]));
	for (const template of shared) byId.set(template.id, template);
	return [...byId.values()].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

async function canManage(template: FlyerTemplate, userId: string): Promise<boolean> {
	if (template.createdBy === userId) return true;
	if (await isSuperadmin(userId)) return true;
	if (template.scope === 'community' && template.communityId) {
		const communityIds = await adminCommunityIds(userId);
		return communityIds.includes(template.communityId);
	}
	return false;
}

async function loadManageable(id: string, userId: string): Promise<FlyerTemplate> {
	const template = await repo().findOne({ where: { id } });
	if (!template) throw new FlyerTemplateNotFoundError('Plantilla no encontrada');
	if (!(await canManage(template, userId))) {
		throw new FlyerTemplateForbiddenError('No tienes acceso a esta plantilla');
	}
	return template;
}

export async function create(userId: string, data: CreateFlyerTemplate): Promise<FlyerTemplate> {
	if (data.scope === 'community') {
		if (!data.communityId) {
			throw new FlyerTemplateValidationError('Elige la comunidad con la que se comparte');
		}
		const allowed = (await isSuperadmin(userId))
			? true
			: (await adminCommunityIds(userId)).includes(data.communityId);
		if (!allowed) {
			throw new FlyerTemplateForbiddenError('No administras esa comunidad');
		}
	}

	const template = repo().create({
		name: data.name,
		scope: data.scope,
		communityId: data.scope === 'community' ? (data.communityId ?? undefined) : undefined,
		createdBy: userId,
		layout: data.layout as Record<string, any>,
	});
	return repo().save(template);
}

export async function update(
	id: string,
	userId: string,
	data: UpdateFlyerTemplate,
): Promise<FlyerTemplate> {
	const template = await loadManageable(id, userId);

	if (data.name !== undefined) template.name = data.name;
	if (data.layout !== undefined) template.layout = data.layout as Record<string, any>;

	return repo().save(template);
}

export async function remove(id: string, userId: string): Promise<void> {
	const template = await loadManageable(id, userId);
	await repo().remove(template);
}
