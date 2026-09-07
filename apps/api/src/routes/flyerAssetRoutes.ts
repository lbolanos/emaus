import { Router } from 'express';
import { uploadFlyerAssetSchema } from '@repo/types';
import { uploadFlyerAsset } from '../controllers/flyerAssetController';
import { isAuthenticated } from '../middleware/isAuthenticated';
import { validateRequest } from '../middleware/validateRequest';
import { requirePermission } from '../middleware/authorization';

const router = Router();

router.use(isAuthenticated);

// Designing a flyer is part of managing a retreat, so it rides on the same permission.
router.post(
	'/',
	validateRequest(uploadFlyerAssetSchema),
	requirePermission('retreat:update'),
	uploadFlyerAsset,
);

export default router;
