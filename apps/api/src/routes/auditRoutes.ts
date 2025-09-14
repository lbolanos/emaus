import { Router } from 'express';
import { getAuditLogs, getUserAuditLogs, getAuditLogStats } from '../controllers/auditController';
import { isAuthenticated } from '../middleware/authentication';

const router = Router();

// All audit routes require authentication
router.use(isAuthenticated);

// Get audit logs for a retreat
router.get('/retreat/:retreatId', (req: any, res: any) => getAuditLogs(req, res));

// Get audit logs for a specific user
router.get('/user/:userId', (req: any, res: any) => getUserAuditLogs(req, res));

// Get audit log statistics for a retreat
router.get('/retreat/:retreatId/stats', (req: any, res: any) => getAuditLogStats(req, res));

export default router;
