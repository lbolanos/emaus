import { Router } from 'express';
import { MessageSequenceController } from '../controllers/messageSequenceController';
import { isAuthenticated } from '../middleware/authentication';
import { requireRetreatAccess } from '../middleware/authorization';

const router = Router();
const controller = new MessageSequenceController();

router.use(isAuthenticated);

// Listado y bandeja por retiro (gated por acceso al retiro).
router.get('/retreat/:retreatId', requireRetreatAccess('retreatId'), controller.getRetreatSequences);
router.get('/retreat/:retreatId/queue', requireRetreatAccess('retreatId'), controller.getQueue);
router.post('/retreat/:retreatId/run', requireRetreatAccess('retreatId'), controller.runNow);

// Mutaciones: autorización por recurso dentro del controller.
router.post('/', controller.createSequence);
router.put('/:id', controller.updateSequence);
router.delete('/:id', controller.deleteSequence);
router.post('/scheduled/:id/dispatch', controller.markDispatched);

export default router;
