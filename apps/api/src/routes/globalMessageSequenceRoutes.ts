import { Router } from 'express';
import { GlobalMessageSequenceController } from '../controllers/globalMessageSequenceController';
import { isAuthenticated } from '../middleware/isAuthenticated';
import { requirePermission } from '../middleware/authorization';

const router = Router();
const controller = new GlobalMessageSequenceController();

router.use(isAuthenticated);

// CRUD de plantillas globales de secuencias (gated por el permiso de plantillas
// globales — mismo nivel superadmin de "Configuración Global").
router.get('/', requirePermission('globalMessageTemplate:read'), controller.getAll);
router.get('/:id', requirePermission('globalMessageTemplate:read'), controller.getById);
router.post('/', requirePermission('globalMessageTemplate:create'), controller.create);
router.put('/:id', requirePermission('globalMessageTemplate:update'), controller.update);
router.delete('/:id', requirePermission('globalMessageTemplate:delete'), controller.delete);
router.post(
	'/:id/toggle-active',
	requirePermission('globalMessageTemplate:update'),
	controller.toggleActive,
);

// Importar a un retiro (crea una secuencia inactiva). Acceso al retiro destino
// verificado dentro del controller.
router.post(
	'/:id/copy-to-retreat',
	requirePermission('globalMessageTemplate:read'),
	controller.copyToRetreat,
);

export default router;
