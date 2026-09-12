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
router.get(
	'/retreat/:retreatId/scheduled',
	requireRetreatAccess('retreatId'),
	controller.getScheduled,
);
router.get('/retreat/:retreatId/stats', requireRetreatAccess('retreatId'), controller.getStats);
router.post('/retreat/:retreatId/run', requireRetreatAccess('retreatId'), controller.runNow);
router.post(
	'/retreat/:retreatId/regenerate-queue',
	requireRetreatAccess('retreatId'),
	controller.regenerateQueue,
);
router.post(
	'/retreat/:retreatId/issues/bulk',
	requireRetreatAccess('retreatId'),
	controller.bulkIssues,
);

// Mutaciones: autorización por recurso dentro del controller.
router.post('/', controller.createSequence);
router.put('/:id', controller.updateSequence);
router.delete('/:id', controller.deleteSequence);
router.get('/scheduled/:id/detail', controller.getQueueItemDetail);
// Vista previa de un paso: autoriza por retiro dentro del controller.
router.post('/preview', controller.previewStep);
// Fechas TZ de los pasos para un participante real (timeline del editor).
router.post('/schedule-preview', controller.schedulePreview);
// Reprogramar/encolar-ya un paso materializado: autoriza por retiro del paso.
router.post('/steps/:stepId/reschedule', controller.rescheduleStep);
router.post('/scheduled/:id/dispatch', controller.markDispatched);
router.post('/scheduled/:id/open', controller.markOpened);
router.post('/scheduled/:id/assign', controller.assign);
router.post('/scheduled/:id/skip', controller.markSkipped);
router.post('/scheduled/:id/retry', controller.retry);
router.post('/scheduled/:id/discard', controller.discard);

export default router;
