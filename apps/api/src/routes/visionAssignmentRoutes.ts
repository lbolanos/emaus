import { Router } from 'express';
import { analyze, execute, analyzeTable } from '../controllers/visionAssignmentController';
import { isAuthenticated } from '../middleware/isAuthenticated';
import { requirePermission } from '../middleware/authorization';

const router = Router();

router.use(isAuthenticated);
router.post('/analyze', requirePermission('table:update'), analyze);
router.post('/execute', requirePermission('table:update'), execute);
router.post('/analyze-table', requirePermission('table:update'), analyzeTable);

export default router;
