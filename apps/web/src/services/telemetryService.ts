import { api } from './api';

export interface TelemetryMetricData {
	metricType: string;
	unit: string;
	value: number;
	tags?: Record<string, string>;
	metadata?: Record<string, any>;
	userId?: string;
	retreatId?: string;
	endpoint?: string;
	component?: string;
}

export interface TelemetryEventData {
	eventType: string;
	severity: 'info' | 'warning' | 'error' | 'critical';
	description: string;
	resourceType?: string;
	resourceId?: string;
	eventData?: Record<string, any>;
	oldValues?: Record<string, any>;
	newValues?: Record<string, any>;
	ipAddress?: string;
	userAgent?: string;
	userId?: string;
	retreatId?: string;
	endpoint?: string;
	component?: string;
}

export interface TelemetrySessionData {
	sessionId: string;
	userId: string;
	ipAddress?: string;
	userAgent?: string;
	referrer?: string;
	browserInfo?: {
		name: string;
		version: string;
		os: string;
		device?: string;
	};
	geolocation?: {
		country?: string;
		city?: string;
		timezone?: string;
	};
	sessionData?: Record<string, any>;
}

class TelemetryService {
	private sessionId: string | null = null;
	private userId: string | null = null;
	private isActive = false;

	// Initialize telemetry service
	async initialize(userId: string): Promise<void> {
		this.userId = userId;
		this.sessionId = this.generateSessionId();
		this.isActive = true;

		try {
			// Start a telemetry session
			await this.startSession();
		} catch (error) {
			console.warn('Failed to initialize telemetry session:', error);
		}
	}

	// Generate a unique session ID using cryptographically secure random
	private generateSessionId(): string {
		if (typeof crypto !== 'undefined' && crypto.randomUUID) {
			return `session_${crypto.randomUUID()}`;
		}
		return `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
	}

	// Get browser information
	private getBrowserInfo() {
		const userAgent = navigator.userAgent;
		let browserName = 'unknown';
		let browserVersion = 'unknown';
		let os = 'unknown';
		let device = 'desktop';

		// Simple browser detection
		if (userAgent.includes('Firefox')) {
			browserName = 'Firefox';
			const match = userAgent.match(/Firefox\/(\d+)/);
			browserVersion = match ? match[1] : 'unknown';
		} else if (userAgent.includes('Chrome')) {
			browserName = 'Chrome';
			const match = userAgent.match(/Chrome\/(\d+)/);
			browserVersion = match ? match[1] : 'unknown';
		} else if (userAgent.includes('Safari')) {
			browserName = 'Safari';
			const match = userAgent.match(/Version\/(\d+)/);
			browserVersion = match ? match[1] : 'unknown';
		}

		// OS detection
		if (userAgent.includes('Windows')) os = 'Windows';
		else if (userAgent.includes('Mac')) os = 'macOS';
		else if (userAgent.includes('Linux')) os = 'Linux';
		else if (userAgent.includes('Android')) {
			os = 'Android';
			device = 'mobile';
		} else if (userAgent.includes('iOS')) {
			os = 'iOS';
			device = 'mobile';
		}

		return { name: browserName, version: browserVersion, os, device };
	}

	// Start a telemetry session (IP is captured server-side, not sent from client)
	private async startSession(): Promise<void> {
		if (!this.userId || !this.sessionId) return;

		try {
			const sessionData: TelemetrySessionData = {
				sessionId: this.sessionId,
				userId: this.userId,
				userAgent: navigator.userAgent,
				referrer: document.referrer,
				browserInfo: this.getBrowserInfo(),
				geolocation: {
					timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				},
			};

			await api.post('/telemetry/sessions', sessionData);
		} catch (error) {
			console.warn('Failed to start telemetry session:', error);
		}
	}

	// End the current session
	async endSession(): Promise<void> {
		if (!this.sessionId || !this.isActive) return;

		try {
			await api.post(`/telemetry/sessions/${this.sessionId}/end`);
			this.isActive = false;
		} catch (error) {
			console.warn('Failed to end telemetry session:', error);
		}
	}

	// Track a metric
	async trackMetric(data: TelemetryMetricData): Promise<void> {
		if (!this.isActive) return;

		try {
			await api.post('/telemetry/metrics', {
				...data,
				userId: this.userId,
				component: data.component || 'frontend',
			});
		} catch (error) {
			console.warn('Failed to track metric:', error);
		}
	}

	// Track an event
	async trackEvent(data: TelemetryEventData): Promise<void> {
		if (!this.isActive) return;

		try {
			await api.post('/telemetry/events', {
				...data,
				userId: this.userId,
				component: data.component || 'frontend',
			});
		} catch (error) {
			console.warn('Failed to track event:', error);
		}
	}

	// Track page view
	async trackPageView(page: string): Promise<void> {
		if (!this.isActive) return;

		try {
			await api.post('/telemetry/track/page-view', {
				userId: this.userId,
				sessionId: this.sessionId,
				page,
			});
		} catch (error) {
			console.warn('Failed to track page view:', error);
		}
	}

	// Track feature usage
	async trackFeatureUsage(
		feature: string,
		action: string,
		metadata?: Record<string, any>,
	): Promise<void> {
		if (!this.isActive) return;

		try {
			await api.post('/telemetry/track/feature-usage', {
				userId: this.userId,
				feature,
				action,
				metadata,
			});
		} catch (error) {
			console.warn('Failed to track feature usage:', error);
		}
	}

	// Track performance metrics
	async trackPageLoadTime(loadTime: number): Promise<void> {
		await this.trackMetric({
			metricType: 'page_load_time',
			unit: 'ms',
			value: loadTime,
			tags: { component: 'frontend' },
			component: 'frontend',
		});
	}

	async trackApiCallTime(endpoint: string, duration: number, success: boolean): Promise<void> {
		await this.trackMetric({
			metricType: 'api_response_time',
			unit: 'ms',
			value: duration,
			tags: {
				endpoint,
				status: success ? 'success' : 'error',
				component: 'frontend',
			},
			metadata: { endpoint, success },
			component: 'frontend',
		});
	}

	async trackUserInteraction(interaction: string, element?: string): Promise<void> {
		await this.trackEvent({
			eventType: 'user_interaction',
			severity: 'info',
			description: `User interaction: ${interaction}`,
			eventData: { interaction, element },
			component: 'frontend',
		});
	}

	// Track errors (no stack traces or PII sent to server)
	async trackError(error: Error, context?: string): Promise<void> {
		if (!this.isActive) return;
		await this.trackEvent({
			eventType: 'system_error',
			severity: 'error',
			description: error.name || 'Error',
			eventData: {
				errorName: error.name,
				context,
			},
			component: 'frontend',
		});
	}

	// Batch track multiple metrics
	async trackMetrics(metrics: TelemetryMetricData[]): Promise<void> {
		if (!this.isActive) return;

		try {
			await api.post('/telemetry/metrics/batch', {
				metrics: metrics.map((metric) => ({
					...metric,
					userId: this.userId,
					component: metric.component || 'frontend',
				})),
			});
		} catch (error) {
			console.warn('Failed to track metrics:', error);
		}
	}

	// Batch track multiple events
	async trackEvents(events: TelemetryEventData[]): Promise<void> {
		if (!this.isActive) return;

		try {
			await api.post('/telemetry/events/batch', {
				events: events.map((event) => ({
					...event,
					userId: this.userId,
					component: event.component || 'frontend',
				})),
			});
		} catch (error) {
			console.warn('Failed to track events:', error);
		}
	}

	// Get current session info
	getSessionInfo() {
		return {
			sessionId: this.sessionId,
			userId: this.userId,
			isActive: this.isActive,
		};
	}

	// Check if telemetry is active
	isTelemetryActive(): boolean {
		return this.isActive && !!this.sessionId && !!this.userId;
	}
}

// Export singleton instance
export const telemetryService = new TelemetryService();

// Export convenience functions for common telemetry tasks
export const trackPageView = (page: string) => telemetryService.trackPageView(page);
export const trackFeatureUsage = (
	feature: string,
	action: string,
	metadata?: Record<string, any>,
) => telemetryService.trackFeatureUsage(feature, action, metadata);
export const trackUserInteraction = (interaction: string, element?: string) =>
	telemetryService.trackUserInteraction(interaction, element);
export const trackError = (error: Error, context?: string) =>
	telemetryService.trackError(error, context);
export const trackPageLoadTime = (loadTime: number) => telemetryService.trackPageLoadTime(loadTime);
export const trackApiCallTime = (endpoint: string, duration: number, success: boolean) =>
	telemetryService.trackApiCallTime(endpoint, duration, success);
