import { Router } from 'express';
import { AppDataSource } from '../data-source';
import { getTelemetryCollectionService } from '../services/telemetryCollectionService';
import { getTelemetryAggregationService } from '../services/telemetryAggregationService';
import { requirePermission } from '../middleware/authorization';
import { isAuthenticated } from '../middleware/isAuthenticated';
import { validateRequest, validateQuery, validateBody } from '../middleware/validateRequest';
import { TelemetrySession } from '../entities/telemetrySession.entity';
import { z } from 'zod';

const router = Router();

// Initialize services
const telemetryCollectionService = getTelemetryCollectionService(AppDataSource);
const telemetryAggregationService = getTelemetryAggregationService(AppDataSource);

// Validation schemas
export const collectMetricSchema = z.object({
	metricType: z.enum([
		'api_response_time',
		'database_query_time',
		'memory_usage',
		'cache_hit_rate',
		'error_rate',
		'participant_registration',
		'retreat_capacity_utilization',
		'payment_processing',
		'user_role_assignment',
		'page_view',
		'feature_usage',
		'session_duration',
		'user_interaction',
		'authentication_success',
		'authentication_failure',
		'permission_check',
		'system_error',
		'page_load_time',
	]),
	unit: z.enum(['ms', '%', 'count', 'bytes', 'eps']),
	value: z.number(),
	tags: z.record(z.string().max(200)).optional(),
	metadata: z
		.record(z.unknown())
		.refine((val) => JSON.stringify(val).length <= 5000, {
			message: 'metadata must be less than 5KB',
		})
		.optional(),
	userId: z.string().max(100).optional(),
	retreatId: z.string().max(100).optional(),
	endpoint: z.string().max(500).optional(),
	component: z.string().max(100).optional(),
});

export const collectEventSchema = z.object({
	eventType: z.enum([
		'user_login',
		'user_logout',
		'user_registration',
		'password_change',
		'role_change',
		'participant_created',
		'participant_updated',
		'participant_deleted',
		'retreat_created',
		'retreat_updated',
		'payment_processed',
		'payment_failed',
		'assignment_changed',
		'database_backup',
		'database_restore',
		'system_error',
		'performance_alert',
		'security_alert',
		'maintenance_mode',
		'file_uploaded',
		'file_downloaded',
		'report_generated',
		'data_exported',
		'data_imported',
		'page_view',
		'feature_usage',
		'user_interaction',
	]),
	severity: z.enum(['info', 'warning', 'error', 'critical']),
	description: z.string().max(500),
	resourceType: z.string().max(100).optional(),
	resourceId: z.string().max(100).optional(),
	eventData: z
		.record(z.unknown())
		.refine((val) => JSON.stringify(val).length <= 5000, {
			message: 'eventData must be less than 5KB',
		})
		.optional(),
	ipAddress: z.string().max(45).optional(),
	userAgent: z.string().max(500).optional(),
	userId: z.string().max(100).optional(),
	retreatId: z.string().max(100).optional(),
	endpoint: z.string().max(500).optional(),
	component: z.string().max(100).optional(),
});

const sessionSchema = z.object({
	sessionId: z.string(),
	userId: z.string(),
	ipAddress: z.string().optional(),
	userAgent: z.string().optional(),
	referrer: z.string().optional(),
	browserInfo: z
		.object({
			name: z.string(),
			version: z.string(),
			os: z.string(),
			device: z.string().optional(),
		})
		.optional(),
	geolocation: z
		.object({
			country: z.string().optional(),
			city: z.string().optional(),
			timezone: z.string().optional(),
		})
		.optional(),
	sessionData: z.record(z.any()).optional(),
});

const dateRangeSchema = z.object({
	startDate: z.string().datetime(),
	endDate: z.string().datetime(),
});

const metricsQuerySchema = z.object({
	startDate: z.string().datetime().optional(),
	endDate: z.string().datetime().optional(),
	metricType: z.string().optional(),
	interval: z.enum(['hour', 'day', 'week', 'month']).optional(),
});

// GET /api/telemetry/health - Health check for telemetry services (public endpoint)
router.get('/health', async (req, res) => {
	try {
		const health = await telemetryCollectionService.checkHealth();
		res.json({
			status: 'ok',
			health,
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		console.error('Telemetry health check failed:', error);
		res.status(500).json({
			status: 'error',
			message: 'Telemetry services unavailable',
			timestamp: new Date().toISOString(),
		});
	}
});

// All telemetry write/read endpoints require authentication
router.use(isAuthenticated);

// Prevent userId spoofing: always use the authenticated user's ID
const enforceAuthenticatedUserId = (req: any, _res: any, next: any) => {
	if (req.user?.id) {
		if (req.body && typeof req.body === 'object') {
			req.body.userId = req.user.id;
		}
	}
	next();
};
router.use(enforceAuthenticatedUserId);

// POST /api/telemetry/metrics - Collect a single metric
router.post('/metrics', validateRequest(collectMetricSchema), async (req, res) => {
	try {
		await telemetryCollectionService.collectMetric(req.body);
		res.status(201).json({ message: 'Metric collected successfully' });
	} catch (error) {
		console.error('Failed to collect metric:', error);
		res.status(500).json({ message: 'Failed to collect metric' });
	}
});

// POST /api/telemetry/metrics/batch - Collect multiple metrics
router.post(
	'/metrics/batch',
	validateRequest(z.object({ metrics: z.array(collectMetricSchema).max(50) })),
	async (req, res) => {
		try {
			await telemetryCollectionService.collectMetrics(req.body.metrics);
			res.status(201).json({ message: 'Metrics collected successfully' });
		} catch (error) {
			console.error('Failed to collect metrics:', error);
			res.status(500).json({ message: 'Failed to collect metrics' });
		}
	},
);

// POST /api/telemetry/events - Collect a single event
router.post('/events', validateRequest(collectEventSchema), async (req, res) => {
	try {
		await telemetryCollectionService.collectEvent(req.body);
		res.status(201).json({ message: 'Event collected successfully' });
	} catch (error) {
		console.error('Failed to collect event:', error);
		res.status(500).json({ message: 'Failed to collect event' });
	}
});

// POST /api/telemetry/events/batch - Collect multiple events
router.post(
	'/events/batch',
	validateRequest(z.object({ events: z.array(collectEventSchema).max(50) })),
	async (req, res) => {
		try {
			await telemetryCollectionService.collectEvents(req.body.events);
			res.status(201).json({ message: 'Events collected successfully' });
		} catch (error) {
			console.error('Failed to collect events:', error);
			res.status(500).json({ message: 'Failed to collect events' });
		}
	},
);

// POST /api/telemetry/sessions - Start a new session
router.post('/sessions', validateRequest(sessionSchema), async (req, res) => {
	try {
		// Capture IP server-side instead of trusting client
		const sessionData = {
			...req.body,
			ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
			userAgent: req.get('User-Agent') || req.body.userAgent,
		};
		const session = await telemetryCollectionService.startSession(sessionData);
		res.status(201).json(session);
	} catch (error) {
		console.error('Failed to start session:', error);
		res.status(500).json({ message: 'Failed to start session' });
	}
});

// Verify session ownership before allowing updates
const verifySessionOwnership = async (req: any, res: any, next: any) => {
	try {
		const sessionRepo = AppDataSource.getRepository(TelemetrySession);
		const session = await sessionRepo.findOne({ where: { id: req.params.sessionId } });
		if (!session) {
			return res.status(404).json({ message: 'Session not found' });
		}
		if (session.userId !== req.user?.id) {
			return res.status(403).json({ message: 'Forbidden' });
		}
		next();
	} catch (error) {
		res.status(500).json({ message: 'Failed to verify session ownership' });
	}
};

// PUT /api/telemetry/sessions/:sessionId - Update a session
router.put(
	'/sessions/:sessionId',
	verifySessionOwnership,
	validateRequest(
		z.object({
			pageViews: z.number().optional(),
			interactions: z.number().optional(),
			errors: z.number().optional(),
			duration: z.number().optional(),
		}),
	),
	async (req, res) => {
		try {
			await telemetryCollectionService.updateSession(req.params.sessionId, req.body);
			res.json({ message: 'Session updated successfully' });
		} catch (error) {
			console.error('Failed to update session:', error);
			res.status(500).json({ message: 'Failed to update session' });
		}
	},
);

// POST /api/telemetry/sessions/:sessionId/end - End a session
router.post('/sessions/:sessionId/end', verifySessionOwnership, async (req, res) => {
	try {
		await telemetryCollectionService.endSession(req.params.sessionId);
		res.json({ message: 'Session ended successfully' });
	} catch (error) {
		console.error('Failed to end session:', error);
		res.status(500).json({ message: 'Failed to end session' });
	}
});

// GET /api/telemetry/metrics/aggregated - Get aggregated metrics
router.get('/metrics/aggregated', requirePermission('telemetry:read'), validateQuery(dateRangeSchema), async (req, res) => {
	try {
		const startDate = new Date(req.query.startDate as string);
		const endDate = new Date(req.query.endDate as string);
		const metrics = await telemetryAggregationService.getAggregatedMetrics(startDate, endDate);
		res.json(metrics);
	} catch (error) {
		console.error('Failed to get aggregated metrics:', error);
		res.status(500).json({ message: 'Failed to get aggregated metrics' });
	}
});

// GET /api/telemetry/business - Get business metrics
router.get(
	'/business',
	requirePermission('telemetry:read'),
	validateQuery(dateRangeSchema),
	async (req, res) => {
		try {
			const startDate = new Date(req.query.startDate as string);
			const endDate = new Date(req.query.endDate as string);
			const metrics = await telemetryAggregationService.getBusinessMetrics(startDate, endDate);
			res.json(metrics);
		} catch (error) {
			console.error('Failed to get business metrics:', error);
			res.status(500).json({ message: 'Failed to get business metrics' });
		}
	},
);

// GET /api/telemetry/user-behavior - Get user behavior metrics
router.get(
	'/user-behavior',
	requirePermission('telemetry:read'),
	validateQuery(dateRangeSchema),
	async (req, res) => {
		try {
			const startDate = new Date(req.query.startDate as string);
			const endDate = new Date(req.query.endDate as string);
			const metrics = await telemetryAggregationService.getUserBehaviorMetrics(startDate, endDate);
			res.json(metrics);
		} catch (error) {
			console.error('Failed to get user behavior metrics:', error);
			res.status(500).json({ message: 'Failed to get user behavior metrics' });
		}
	},
);

// GET /api/telemetry/system-health - Get system health metrics
router.get(
	'/system-health',
	requirePermission('telemetry:read'),
	validateQuery(dateRangeSchema),
	async (req, res) => {
		try {
			const startDate = new Date(req.query.startDate as string);
			const endDate = new Date(req.query.endDate as string);
			const metrics = await telemetryAggregationService.getSystemHealthMetrics(startDate, endDate);
			res.json(metrics);
		} catch (error) {
			console.error('Failed to get system health metrics:', error);
			res.status(500).json({ message: 'Failed to get system health metrics' });
		}
	},
);

// GET /api/telemetry/metrics/timeseries - Get time series data for charts
router.get(
	'/metrics/timeseries',
	requirePermission('telemetry:read'),
	validateQuery(
		z.object({
			metricType: z.string(),
			startDate: z.string().datetime(),
			endDate: z.string().datetime(),
			interval: z.enum(['hour', 'day', 'week', 'month']).default('hour'),
		}),
	),
	async (req, res) => {
		try {
			const metricType = req.query.metricType as any;
			const startDate = new Date(req.query.startDate as string);
			const endDate = new Date(req.query.endDate as string);
			const interval = req.query.interval as any;

			const data = await telemetryAggregationService.getMetricsByInterval(
				metricType,
				startDate,
				endDate,
				interval,
			);
			res.json(data);
		} catch (error) {
			console.error('Failed to get time series metrics:', error);
			res.status(500).json({ message: 'Failed to get time series metrics' });
		}
	},
);

// POST /api/telemetry/cleanup - Clean up old telemetry data (superadmin only)
router.post(
	'/cleanup',
	requirePermission('system:admin'),
	validateRequest(
		z.object({
			retentionDays: z.number().min(1).max(365).default(90),
		}),
	),
	async (req, res) => {
		try {
			await telemetryAggregationService.cleanupOldData(req.body.retentionDays);
			res.json({ message: `Cleaned up data older than ${req.body.retentionDays} days` });
		} catch (error) {
			console.error('Failed to cleanup old data:', error);
			res.status(500).json({ message: 'Failed to cleanup old data' });
		}
	},
);

// Convenience endpoints for common telemetry events

// POST /api/telemetry/track/login - Track user login
router.post(
	'/track/login',
	validateRequest(
		z.object({
			userId: z.string(),
			sessionId: z.string(),
			ipAddress: z.string().optional(),
			userAgent: z.string().optional(),
		}),
	),
	async (req, res) => {
		try {
			await telemetryCollectionService.trackUserLogin(
				req.body.userId,
				req.body.sessionId,
				req.body.ipAddress,
				req.body.userAgent,
			);
			res.status(201).json({ message: 'Login tracked successfully' });
		} catch (error) {
			console.error('Failed to track login:', error);
			res.status(500).json({ message: 'Failed to track login' });
		}
	},
);

// POST /api/telemetry/track/logout - Track user logout
router.post(
	'/track/logout',
	validateRequest(
		z.object({
			userId: z.string(),
			sessionId: z.string().optional(),
		}),
	),
	async (req, res) => {
		try {
			await telemetryCollectionService.trackUserLogout(req.body.userId, req.body.sessionId);
			res.status(201).json({ message: 'Logout tracked successfully' });
		} catch (error) {
			console.error('Failed to track logout:', error);
			res.status(500).json({ message: 'Failed to track logout' });
		}
	},
);

// POST /api/telemetry/track/participant-registration - Track participant registration
router.post(
	'/track/participant-registration',
	validateRequest(
		z.object({
			userId: z.string(),
			retreatId: z.string(),
			participantId: z.string(),
		}),
	),
	async (req, res) => {
		try {
			await telemetryCollectionService.trackParticipantRegistration(
				req.body.userId,
				req.body.retreatId,
				req.body.participantId,
			);
			res.status(201).json({ message: 'Participant registration tracked successfully' });
		} catch (error) {
			console.error('Failed to track participant registration:', error);
			res.status(500).json({ message: 'Failed to track participant registration' });
		}
	},
);

// POST /api/telemetry/track/payment - Track payment processing
router.post(
	'/track/payment',
	validateRequest(
		z.object({
			userId: z.string(),
			retreatId: z.string(),
			paymentId: z.string(),
			amount: z.number(),
			status: z.string(),
		}),
	),
	async (req, res) => {
		try {
			await telemetryCollectionService.trackPaymentProcessing(
				req.body.userId,
				req.body.retreatId,
				req.body.paymentId,
				req.body.amount,
				req.body.status,
			);
			res.status(201).json({ message: 'Payment tracked successfully' });
		} catch (error) {
			console.error('Failed to track payment:', error);
			res.status(500).json({ message: 'Failed to track payment' });
		}
	},
);

// POST /api/telemetry/track/page-view - Track page view
router.post(
	'/track/page-view',
	validateRequest(
		z.object({
			userId: z.string(),
			sessionId: z.string(),
			page: z.string(),
			ipAddress: z.string().optional(),
		}),
	),
	async (req, res) => {
		try {
			await telemetryCollectionService.trackPageView(
				req.body.userId,
				req.body.sessionId,
				req.body.page,
				req.body.ipAddress,
			);
			res.status(201).json({ message: 'Page view tracked successfully' });
		} catch (error) {
			console.error('Failed to track page view:', error);
			res.status(500).json({ message: 'Failed to track page view' });
		}
	},
);

// POST /api/telemetry/track/feature-usage - Track feature usage
router.post(
	'/track/feature-usage',
	validateRequest(
		z.object({
			userId: z.string(),
			feature: z.string(),
			action: z.string(),
			metadata: z.record(z.any()).optional(),
		}),
	),
	async (req, res) => {
		try {
			await telemetryCollectionService.trackFeatureUsage(
				req.body.userId,
				req.body.feature,
				req.body.action,
				req.body.metadata,
			);
			res.status(201).json({ message: 'Feature usage tracked successfully' });
		} catch (error) {
			console.error('Failed to track feature usage:', error);
			res.status(500).json({ message: 'Failed to track feature usage' });
		}
	},
);

export default router;
