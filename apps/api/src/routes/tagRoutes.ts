import { Router } from 'express';
import * as tagController from '../controllers/tagController';
import { isAuthenticated } from '../middleware/isAuthenticated';
import { requirePermission } from '../middleware/authorization';

const router = Router();

// All these routes should be protected
router.use(isAuthenticated);

// Tag CRUD routes
router.get('/', tagController.getAllTags); // All authenticated users can read tags
router.get('/:id', tagController.getTag); // All authenticated users can read tags
router.post('/', requirePermission('participant:update'), tagController.createTag); // Admin/coordinator only
router.put('/:id', requirePermission('participant:update'), tagController.updateTag); // Admin/coordinator only
router.delete('/:id', requirePermission('participant:update'), tagController.deleteTag); // Admin/coordinator only

// Participant tag assignment routes
router.get('/participant/:participantId', tagController.getParticipantTags); // All authenticated users can read
router.post(
	'/participant/:participantId/:tagId',
	requirePermission('participant:update'),
	tagController.assignTagToParticipant,
); // Admin/coordinator only
router.delete(
	'/participant/:participantId/:tagId',
	requirePermission('participant:update'),
	tagController.removeTagFromParticipant,
); // Admin/coordinator only

// Tag conflict checking route
router.post('/check-conflict', tagController.checkTagConflict);

export default router;
