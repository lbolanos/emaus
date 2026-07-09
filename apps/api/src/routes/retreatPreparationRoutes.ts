import { Router } from 'express';
import {
	listPreparations,
	generatePreparations,
	createPreparation,
	updatePreparation,
	deletePreparation,
	skipPreparation,
	uploadPreparationDocument,
	createPreparationMarkdown,
	updatePreparationMarkdown,
	deletePreparationDocument,
	publicGetPreparations,
} from '../controllers/retreatPreparationController';
import { isAuthenticated } from '../middleware/isAuthenticated';
import { requirePermission, requireRetreatAccess } from '../middleware/authorization';
import { validateRequest } from '../middleware/validateRequest';
import {
	CreateRetreatPreparationSchema,
	UpdateRetreatPreparationSchema,
	GenerateRetreatPreparationsSchema,
	SkipRetreatPreparationSchema,
	UploadRetreatPreparationDocumentSchema,
	CreateRetreatPreparationMarkdownSchema,
	UpdateRetreatPreparationMarkdownSchema,
} from '@repo/types';

const router = Router();

// -- Public routes (no auth): calendario y documentos son públicos --
router.get('/public/:slug', publicGetPreparations);

// -- Authenticated routes --
router.use(isAuthenticated);

// Rutas por retiro — validación de acceso vía middleware por parámetro
router.get(
	'/retreats/:retreatId',
	requirePermission('retreatPreparation:read'),
	requireRetreatAccess('retreatId'),
	listPreparations,
);
router.post(
	'/retreats/:retreatId/generate',
	validateRequest(GenerateRetreatPreparationsSchema),
	requirePermission('retreatPreparation:manage'),
	requireRetreatAccess('retreatId'),
	generatePreparations,
);
router.post(
	'/retreats/:retreatId',
	validateRequest(CreateRetreatPreparationSchema),
	requirePermission('retreatPreparation:manage'),
	requireRetreatAccess('retreatId'),
	createPreparation,
);

// Rutas item-level — anti-IDOR en el controller (carga entidad + valida retiro)
router.patch(
	'/:id',
	validateRequest(UpdateRetreatPreparationSchema),
	requirePermission('retreatPreparation:manage'),
	updatePreparation,
);
router.delete('/:id', requirePermission('retreatPreparation:manage'), deletePreparation);
router.post(
	'/:id/skip',
	validateRequest(SkipRetreatPreparationSchema),
	requirePermission('retreatPreparation:manage'),
	skipPreparation,
);
router.post(
	'/:id/documents',
	validateRequest(UploadRetreatPreparationDocumentSchema),
	requirePermission('retreatPreparation:manage'),
	uploadPreparationDocument,
);
router.post(
	'/:id/documents/markdown',
	validateRequest(CreateRetreatPreparationMarkdownSchema),
	requirePermission('retreatPreparation:manage'),
	createPreparationMarkdown,
);
router.patch(
	'/documents/:docId',
	validateRequest(UpdateRetreatPreparationMarkdownSchema),
	requirePermission('retreatPreparation:manage'),
	updatePreparationMarkdown,
);
router.delete(
	'/documents/:docId',
	requirePermission('retreatPreparation:manage'),
	deletePreparationDocument,
);

export default router;
