import { Router } from 'express';
import {
	listTasks,
	createTask,
	updateTask,
	setTaskStatus,
	deleteTask,
	materialize,
	addMissing,
} from '../controllers/retreatPreRetreatTaskController';
import { isAuthenticated } from '../middleware/isAuthenticated';
import { requirePermission, requireRetreatAccess } from '../middleware/authorization';
import { validateRequest } from '../middleware/validateRequest';
import {
	CreateRetreatPreRetreatTaskSchema,
	UpdateRetreatPreRetreatTaskSchema,
	SetPreRetreatTaskStatusSchema,
	MaterializePreRetreatTasksSchema,
} from '@repo/types';

const router = Router();

router.use(isAuthenticated);

// Rutas por retiro — el acceso al retiro lo valida el middleware por parámetro.
router.get(
	'/retreats/:retreatId/tasks',
	requirePermission('preRetreatTask:read'),
	requireRetreatAccess('retreatId'),
	listTasks,
);
router.post(
	'/retreats/:retreatId/tasks',
	validateRequest(CreateRetreatPreRetreatTaskSchema),
	requirePermission('preRetreatTask:manage'),
	requireRetreatAccess('retreatId'),
	createTask,
);
router.post(
	'/retreats/:retreatId/materialize',
	validateRequest(MaterializePreRetreatTasksSchema),
	requirePermission('preRetreatTask:manage'),
	requireRetreatAccess('retreatId'),
	materialize,
);
router.post(
	'/retreats/:retreatId/add-missing',
	validateRequest(MaterializePreRetreatTasksSchema),
	requirePermission('preRetreatTask:manage'),
	requireRetreatAccess('retreatId'),
	addMissing,
);

// Rutas item-level — el acceso al retiro dueño lo valida el controller
// cargando la tarea (guard anti-IDOR; el middleware por parámetro no aplica).
router.patch(
	'/tasks/:id',
	validateRequest(UpdateRetreatPreRetreatTaskSchema),
	requirePermission('preRetreatTask:manage'),
	updateTask,
);
router.post(
	'/tasks/:id/status',
	validateRequest(SetPreRetreatTaskStatusSchema),
	requirePermission('preRetreatTask:manage'),
	setTaskStatus,
);
router.delete('/tasks/:id', requirePermission('preRetreatTask:manage'), deleteTask);

export default router;
