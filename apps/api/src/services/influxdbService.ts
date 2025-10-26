import { InfluxDB, Point, WriteApi } from '@influxdata/influxdb-client';
import { config } from '../config';
import { TelemetryMetric } from '../entities/telemetryMetric.entity';
import { TelemetryEvent } from '../entities/telemetryEvent.entity';

interface InfluxConfig {
	url: string;
	token: string;
	org: string;
	bucket: string;
}

export class InfluxdbService {
	private influxDB: InfluxDB | null;
	private writeApi: WriteApi | null;
	private config: InfluxConfig;

	constructor() {
		this.config = {
			url: process.env.INFLUXDB_URL || 'http://localhost:8086',
			token: process.env.INFLUXDB_TOKEN || '',
			org: process.env.INFLUXDB_ORG || 'emaus',
			bucket: process.env.INFLUXDB_BUCKET || 'telemetry',
		};

		// Only initialize InfluxDB if properly configured
		if (this.config.token && this.config.url) {
			try {
				this.influxDB = new InfluxDB({
					url: this.config.url,
					token: this.config.token,
				});

				this.writeApi = this.influxDB.getWriteApi(
					this.config.org,
					this.config.bucket,
					'ms', // precision
				);

				// Setup error handling if available
				if (this.writeApi.onWriteFailed) {
					this.writeApi.onWriteFailed((error, point) => {
						console.error(`InfluxDB write failed: ${error}`, point);
					});
				}

				if (this.writeApi.onWriteSuccess) {
					this.writeApi.onWriteSuccess((point) => {
						// Silent success - only log for debugging
						if (process.env.NODE_ENV === 'development') {
							console.debug(`InfluxDB write success: ${point.measurement}`);
						}
					});
				}
			} catch (error) {
				console.warn('Failed to initialize InfluxDB client:', error);
				this.writeApi = null;
				this.influxDB = null;
			}
		} else {
			console.warn('InfluxDB not configured - telemetry data will only be stored in local database');
			this.writeApi = null;
			this.influxDB = null;
		}
	}

	async writeMetric(metric: TelemetryMetric): Promise<void> {
		if (!this.writeApi) {
			return; // Skip InfluxDB write if not configured
		}

		try {
			const point = new Point(metric.metricType)
				.floatField('value', parseFloat(metric.value.toString()))
				.tag('unit', metric.unit)
				.timestamp(metric.createdAt);

			// Add user context if available
			if (metric.userId) {
				point.tag('userId', metric.userId);
			}

			// Add retreat context if available
			if (metric.retreatId) {
				point.tag('retreatId', metric.retreatId);
			}

			// Add endpoint if available
			if (metric.endpoint) {
				point.tag('endpoint', metric.endpoint);
			}

			// Add component if available
			if (metric.component) {
				point.tag('component', metric.component);
			}

			// Add custom tags
			if (metric.tags) {
				Object.entries(metric.tags).forEach(([key, value]) => {
					point.tag(key, value);
				});
			}

			// Add metadata as fields
			if (metric.metadata) {
				Object.entries(metric.metadata).forEach(([key, value]) => {
					if (typeof value === 'number') {
						point.floatField(`metadata_${key}`, value);
					} else if (typeof value === 'boolean') {
						point.booleanField(`metadata_${key}`, value);
					} else if (typeof value === 'string') {
						point.stringField(`metadata_${key}`, value);
					}
				});
			}

			this.writeApi.writePoint(point);
		} catch (error) {
			console.error('Failed to write metric to InfluxDB:', error);
			// Don't throw - telemetry shouldn't break the main application
		}
	}

	async writeEvent(event: TelemetryEvent): Promise<void> {
		if (!this.writeApi) {
			return; // Skip InfluxDB write if not configured
		}

		try {
			const point = new Point(event.eventType)
				.tag('severity', event.severity)
				.stringField('description', event.description)
				.timestamp(event.createdAt);

			// Add user context if available
			if (event.userId) {
				point.tag('userId', event.userId);
			}

			// Add retreat context if available
			if (event.retreatId) {
				point.tag('retreatId', event.retreatId);
			}

			// Add resource context if available
			if (event.resourceType) {
				point.tag('resourceType', event.resourceType);
			}
			if (event.resourceId) {
				point.tag('resourceId', event.resourceId);
			}

			// Add endpoint if available
			if (event.endpoint) {
				point.tag('endpoint', event.endpoint);
			}

			// Add component if available
			if (event.component) {
				point.tag('component', event.component);
			}

			// Add IP address and user agent for context
			if (event.ipAddress) {
				point.tag('ipAddress', event.ipAddress);
			}
			if (event.userAgent) {
				point.tag('userAgent', event.userAgent);
			}

			// Add event data as fields
			if (event.eventData) {
				Object.entries(event.eventData).forEach(([key, value]) => {
					if (typeof value === 'number') {
						point.floatField(`data_${key}`, value);
					} else if (typeof value === 'boolean') {
						point.booleanField(`data_${key}`, value);
					} else if (typeof value === 'string') {
						point.stringField(`data_${key}`, value);
					}
				});
			}

			this.writeApi.writePoint(point);
		} catch (error) {
			console.error('Failed to write event to InfluxDB:', error);
			// Don't throw - telemetry shouldn't break the main application
		}
	}

	async flush(): Promise<void> {
		if (!this.writeApi) {
			return;
		}

		try {
			await this.writeApi.flush();
		} catch (error) {
			console.error('Failed to flush InfluxDB writes:', error);
		}
	}

	async close(): Promise<void> {
		if (!this.writeApi) {
			return;
		}

		try {
			await this.writeApi.close();
		} catch (error) {
			console.error('Failed to close InfluxDB write API:', error);
		}
	}

	// Health check method
	async checkConnection(): Promise<boolean> {
		if (!this.writeApi) {
			return false;
		}

		try {
			// Create a simple test point
			const testPoint = new Point('health_check')
				.floatField('test', 1)
				.timestamp(new Date());

			this.writeApi.writePoint(testPoint);
			await this.writeApi.flush();

			return true;
		} catch (error) {
			console.error('InfluxDB connection check failed:', error);
			return false;
		}
	}

	// Batch write multiple metrics
	async writeMetrics(metrics: TelemetryMetric[]): Promise<void> {
		for (const metric of metrics) {
			await this.writeMetric(metric);
		}
	}

	// Batch write multiple events
	async writeEvents(events: TelemetryEvent[]): Promise<void> {
		for (const event of events) {
			await this.writeEvent(event);
		}
	}
}

// Export singleton instance
export const influxdbService = new InfluxdbService();