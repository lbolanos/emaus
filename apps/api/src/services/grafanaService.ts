import axios from 'axios';
import { config } from '../config';

interface GrafanaConfig {
	url: string;
	apiKey: string;
}

interface GrafanaDashboard {
	uid?: string;
	title: string;
	tags: string[];
	timezone: string;
	panels: any[];
	templating: {
		list: any[];
	};
	time: {
		from: string;
		to: string;
	};
	refresh: string;
}

interface GrafanaDataSource {
	name: string;
	type: string;
	url: string;
	access: string;
	isDefault: boolean;
	database?: string;
	user?: string;
	password?: string;
}

export class GrafanaService {
	private config: GrafanaConfig;
	private apiClient: any;

	constructor() {
		this.config = {
			url: process.env.GRAFANA_URL || 'http://localhost:3000',
			apiKey: process.env.GRAFANA_API_KEY || '',
		};

		this.apiClient = axios.create({
			baseURL: `${this.config.url}/api`,
			headers: {
				Authorization: `Bearer ${this.config.apiKey}`,
				'Content-Type': 'application/json',
			},
		});
	}

	// Create InfluxDB data source if it doesn't exist
	async createInfluxDataSource(): Promise<void> {
		try {
			const dataSourceConfig: GrafanaDataSource = {
				name: 'Emaus InfluxDB',
				type: 'influxdb',
				url: process.env.INFLUXDB_URL || 'http://localhost:8086',
				access: 'proxy',
				isDefault: true,
				database: process.env.INFLUXDB_BUCKET || 'telemetry',
				user: process.env.INFLUXDB_ORG || 'emaus',
				password: process.env.INFLUXDB_TOKEN || '',
			};

			// Check if data source already exists
			const existingSources = await this.apiClient.get('/datasources');
			const existingSource = existingSources.data.find(
				(source: any) => source.name === dataSourceConfig.name,
			);

			if (!existingSource) {
				await this.apiClient.post('/datasources', dataSourceConfig);
				console.log('✅ Grafana InfluxDB data source created');
			} else {
				console.log('ℹ️ Grafana InfluxDB data source already exists');
			}
		} catch (error) {
			console.error('Failed to create Grafana data source:', error);
		}
	}

	// Create system performance dashboard
	async createSystemPerformanceDashboard(): Promise<void> {
		try {
			const dashboard: GrafanaDashboard = {
				title: 'Emaus - System Performance',
				tags: ['emaus', 'performance', 'system'],
				timezone: 'browser',
				time: { from: 'now-1h', to: 'now' },
				refresh: '30s',
				panels: [
					{
						id: 1,
						title: 'API Response Time',
						type: 'graph',
						gridPos: { h: 8, w: 12, x: 0, y: 0 },
						targets: [
							{
								query: `from(bucket: "${process.env.INFLUXDB_BUCKET || 'telemetry'}")
									|> range($range)
									|> filter(fn: (r) => r._measurement == "api_response_time")
									|> aggregateWindow(every: $interval, fn: mean, createEmpty: false)
									|> yield(name: "mean")`,
								refId: 'A',
							},
						],
					},
					{
						id: 2,
						title: 'Memory Usage',
						type: 'graph',
						gridPos: { h: 8, w: 12, x: 12, y: 0 },
						targets: [
							{
								query: `from(bucket: "${process.env.INFLUXDB_BUCKET || 'telemetry'}")
									|> range($range)
									|> filter(fn: (r) => r._measurement == "memory_usage")
									|> aggregateWindow(every: $interval, fn: mean, createEmpty: false)
									|> yield(name: "mean")`,
								refId: 'A',
							},
						],
					},
					{
						id: 3,
						title: 'Error Rate',
						type: 'stat',
						gridPos: { h: 8, w: 6, x: 0, y: 8 },
						targets: [
							{
								query: `from(bucket: "${process.env.INFLUXDB_BUCKET || 'telemetry'}")
									|> range($range)
									|> filter(fn: (r) => r._measurement == "error_rate")
									|> last()`,
								refId: 'A',
							},
						],
					},
					{
						id: 4,
						title: 'Cache Hit Rate',
						type: 'stat',
						gridPos: { h: 8, w: 6, x: 6, y: 8 },
						targets: [
							{
								query: `from(bucket: "${process.env.INFLUXDB_BUCKET || 'telemetry'}")
									|> range($range)
									|> filter(fn: (r) => r._measurement == "cache_hit_rate")
									|> last()`,
								refId: 'A',
							},
						],
					},
				],
				templating: {
					list: [
						{
							name: 'range',
							type: 'timerange',
							default: { from: 'now-1h', to: 'now' },
						},
						{
							name: 'interval',
							type: 'interval',
							default: '30s',
							options: ['30s', '1m', '5m', '15m', '30m', '1h'],
						},
					],
				},
			};

			await this.apiClient.post('/dashboards/db', { dashboard });
			console.log('✅ System performance dashboard created');
		} catch (error) {
			console.error('Failed to create system performance dashboard:', error);
		}
	}

	// Create business intelligence dashboard
	async createBusinessIntelligenceDashboard(): Promise<void> {
		try {
			const dashboard: GrafanaDashboard = {
				title: 'Emaus - Business Intelligence',
				tags: ['emaus', 'business', 'analytics'],
				timezone: 'browser',
				time: { from: 'now-24h', to: 'now' },
				refresh: '5m',
				panels: [
					{
						id: 1,
						title: 'Participant Registrations',
						type: 'graph',
						gridPos: { h: 8, w: 12, x: 0, y: 0 },
						targets: [
							{
								query: `from(bucket: "${process.env.INFLUXDB_BUCKET || 'telemetry'}")
									|> range($range)
									|> filter(fn: (r) => r._measurement == "participant_registration")
									|> count()`,
								refId: 'A',
							},
						],
					},
					{
						id: 2,
						title: 'Retreat Capacity Utilization',
						type: 'gauge',
						gridPos: { h: 8, w: 6, x: 12, y: 0 },
						targets: [
							{
								query: `from(bucket: "${process.env.INFLUXDB_BUCKET || 'telemetry'}")
									|> range($range)
									|> filter(fn: (r) => r._measurement == "retreat_capacity_utilization")
									|> last()`,
								refId: 'A',
							},
						],
					},
					{
						id: 3,
						title: 'Payment Processing Metrics',
						type: 'table',
						gridPos: { h: 8, w: 12, x: 0, y: 8 },
						targets: [
							{
								query: `from(bucket: "${process.env.INFLUXDB_BUCKET || 'telemetry'}")
									|> range($range)
									|> filter(fn: (r) => r._measurement == "payment_processing")
									|> group()`,
								refId: 'A',
							},
						],
					},
					{
						id: 4,
						title: 'User Role Assignments',
						type: 'piechart',
						gridPos: { h: 8, w: 6, x: 12, y: 8 },
						targets: [
							{
								query: `from(bucket: "${process.env.INFLUXDB_BUCKET || 'telemetry'}")
									|> range($range)
									|> filter(fn: (r) => r._measurement == "user_role_assignment")
									|> group(columns: ["role"])`,
								refId: 'A',
							},
						],
					},
				],
				templating: {
					list: [
						{
							name: 'range',
							type: 'timerange',
							default: { from: 'now-24h', to: 'now' },
						},
						{
							name: 'retreatId',
							type: 'query',
							datasource: 'Emaus InfluxDB',
							query: `from(bucket: "${process.env.INFLUXDB_BUCKET || 'telemetry'}")
								|> range($range)
								|> group(columns: ["retreatId"])
								|> distinct(column: "retreatId")`,
						},
					],
				},
			};

			await this.apiClient.post('/dashboards/db', { dashboard });
			console.log('✅ Business intelligence dashboard created');
		} catch (error) {
			console.error('Failed to create business intelligence dashboard:', error);
		}
	}

	// Create user analytics dashboard
	async createUserAnalyticsDashboard(): Promise<void> {
		try {
			const dashboard: GrafanaDashboard = {
				title: 'Emaus - User Analytics',
				tags: ['emaus', 'users', 'behavior'],
				timezone: 'browser',
				time: { from: 'now-7d', to: 'now' },
				refresh: '1h',
				panels: [
					{
						id: 1,
						title: 'Active Sessions',
						type: 'graph',
						gridPos: { h: 8, w: 12, x: 0, y: 0 },
						targets: [
							{
								query: `from(bucket: "${process.env.INFLUXDB_BUCKET || 'telemetry'}")
									|> range($range)
									|> filter(fn: (r) => r._measurement == "user_login")
									|> count()`,
								refId: 'A',
							},
						],
					},
					{
						id: 2,
						title: 'Page Views',
						type: 'heatmap',
						gridPos: { h: 8, w: 12, x: 12, y: 0 },
						targets: [
							{
								query: `from(bucket: "${process.env.INFLUXDB_BUCKET || 'telemetry'}")
									|> range($range)
									|> filter(fn: (r) => r._measurement == "page_view")
									|> group(columns: ["component"])`,
								refId: 'A',
							},
						],
					},
					{
						id: 3,
						title: 'Feature Usage',
						type: 'table',
						gridPos: { h: 8, w: 12, x: 0, y: 8 },
						targets: [
							{
								query: `from(bucket: "${process.env.INFLUXDB_BUCKET || 'telemetry'}")
									|> range($range)
									|> filter(fn: (r) => r._measurement == "feature_usage")
									|> group(columns: ["component", "feature"])`,
								refId: 'A',
							},
						],
					},
					{
						id: 4,
						title: 'Session Duration',
						type: 'histogram',
						gridPos: { h: 8, w: 12, x: 12, y: 8 },
						targets: [
							{
								query: `from(bucket: "${process.env.INFLUXDB_BUCKET || 'telemetry'}")
									|> range($range)
									|> filter(fn: (r) => r._measurement == "session_duration")`,
								refId: 'A',
							},
						],
					},
				],
				templating: {
					list: [
						{
							name: 'range',
							type: 'timerange',
							default: { from: 'now-7d', to: 'now' },
						},
					],
				},
			};

			await this.apiClient.post('/dashboards/db', { dashboard });
			console.log('✅ User analytics dashboard created');
		} catch (error) {
			console.error('Failed to create user analytics dashboard:', error);
		}
	}

	// Initialize all Grafana dashboards
	async initializeDashboards(): Promise<void> {
		console.log('🚀 Initializing Grafana dashboards...');

		await this.createInfluxDataSource();
		await this.createSystemPerformanceDashboard();
		await this.createBusinessIntelligenceDashboard();
		await this.createUserAnalyticsDashboard();

		console.log('✅ Grafana dashboards initialized successfully');
	}

	// Health check method
	async checkConnection(): Promise<boolean> {
		try {
			const response = await this.apiClient.get('/health');
			return response.status === 200;
		} catch (error) {
			console.error('Grafana connection check failed:', error);
			return false;
		}
	}
}

// Export singleton instance
export const grafanaService = new GrafanaService();
