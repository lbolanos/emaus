import { Router } from 'express';
import { letterWebhookLimiter } from '../middleware/rateLimiting';
import { receiveLetterWebhook } from '../controllers/letterWebhookController';

/**
 * Webhook de entrada del Worker de Cloudflare (Email Routing → Worker → aquí).
 * Ruta PÚBLICA: la autenticación es el header X-Emaus-Letter-Secret comparado
 * constant-time (fail-closed sin env — specs/letters-email D12). Va exenta de
 * CSRF y montada ANTES de letterRoutes (patrón '/letters/webhook' en la lista
 * de applyCsrfProtectionExcept de routes/index.ts). El parser JSON de 16 MB
 * específico para este prefijo vive en apps/api/src/index.ts.
 */
const router = Router();

router.post('/letters/webhook', letterWebhookLimiter, receiveLetterWebhook);

export default router;
