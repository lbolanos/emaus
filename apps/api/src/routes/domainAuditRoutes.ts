import { Router } from 'express';
import { getDomainAuditLogs } from '../controllers/domainAuditController';
import { isAuthenticated } from '../middleware/authentication';

const router = Router();

// Todas las rutas de auditoría de dominio requieren autenticación.
router.use(isAuthenticated);

// Logs de dominio de un retiro (filtros: action, resourceType, resourceId, actorUserId, fechas).
router.get('/retreat/:retreatId', (req: any, res: any) => getDomainAuditLogs(req, res));

export default router;
