import { Router } from 'express';
import { CrmController } from '../controllers/crmController';
import { isAuthenticated } from '../middleware/authentication';
import { requireRetreatAccess } from '../middleware/authorization';

const router = Router();
const controller = new CrmController();

router.use(isAuthenticated);

// Listados por retiro (gated por acceso al retiro).
router.get('/retreat/:retreatId/follow-ups', requireRetreatAccess('retreatId'), controller.listFollowUps);
router.get('/retreat/:retreatId/tasks', requireRetreatAccess('retreatId'), controller.listTasks);
router.post(
	'/retreat/:retreatId/participants/:participantId/do-not-contact',
	requireRetreatAccess('retreatId'),
	controller.setDoNotContact,
);

// Mutaciones: autorización por recurso dentro del controller.
router.post('/follow-ups', controller.upsertFollowUp);
router.post('/tasks', controller.createTask);
router.put('/tasks/:id', controller.updateTask);
router.delete('/tasks/:id', controller.deleteTask);

export default router;
