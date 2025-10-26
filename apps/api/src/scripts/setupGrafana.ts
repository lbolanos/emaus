import { AppDataSource } from '../data-source';
import { grafanaService } from '../services/grafanaService';
import { influxdbService } from '../services/influxdbService';

/**
 * Script to initialize Grafana dashboards and InfluxDB integration
 * This should be run after setting up InfluxDB and Grafana
 */
async function setupGrafana() {
	console.log('🚀 Setting up Grafana telemetry integration...');

	try {
		// Initialize database connection
		await AppDataSource.initialize();
		console.log('✅ Database connection established');

		// Test InfluxDB connection
		console.log('📊 Testing InfluxDB connection...');
		const influxdbConnected = await influxdbService.checkConnection();
		if (!influxdbConnected) {
			console.error('❌ InfluxDB connection failed. Please check your InfluxDB configuration.');
			process.exit(1);
		}
		console.log('✅ InfluxDB connection successful');

		// Test Grafana connection
		console.log('📈 Testing Grafana connection...');
		const grafanaConnected = await grafanaService.checkConnection();
		if (!grafanaConnected) {
			console.error('❌ Grafana connection failed. Please check your Grafana configuration.');
			process.exit(1);
		}
		console.log('✅ Grafana connection successful');

		// Initialize Grafana dashboards
		console.log('📊 Creating Grafana dashboards...');
		await grafanaService.initializeDashboards();
		console.log('✅ Grafana dashboards created successfully');

		// Send test data to verify integration
		console.log('🧪 Sending test telemetry data...');
		await sendTestData();
		console.log('✅ Test data sent successfully');

		console.log('🎉 Grafana setup completed successfully!');
		console.log('\nNext steps:');
		console.log('1. Open Grafana at', process.env.GRAFANA_URL || 'http://localhost:3000');
		console.log('2. Login with your admin credentials');
		console.log('3. Navigate to Dashboards to view the telemetry dashboards');
		console.log('4. The in-system dashboard is available at /telemetry for superadmins');

	} catch (error) {
		console.error('❌ Setup failed:', error);
		process.exit(1);
	} finally {
		// Close database connection
		if (AppDataSource.isInitialized) {
			await AppDataSource.destroy();
		}
	}
}

/**
 * Send test telemetry data to verify the integration works
 */
async function sendTestData() {
	const testMetrics = [
		{
			metricType: 'api_response_time',
			unit: 'ms',
			value: 150,
			tags: { endpoint: '/api/test', method: 'GET' },
			metadata: { test: true },
			component: 'api',
			createdAt: new Date(),
		},
		{
			metricType: 'memory_usage',
			unit: 'bytes',
			value: 512 * 1024 * 1024, // 512MB
			tags: { component: 'api' },
			metadata: { test: true },
			component: 'api',
			createdAt: new Date(),
		},
		{
			metricType: 'cache_hit_rate',
			unit: '%',
			value: 85.5,
			tags: { cacheType: 'redis' },
			metadata: { test: true },
			component: 'cache',
			createdAt: new Date(),
		},
	];

	const testEvents = [
		{
			eventType: 'user_login',
			severity: 'info',
			description: 'Test user login event',
			eventData: { test: true, userId: 'test-user' },
			component: 'auth',
			createdAt: new Date(),
		},
		{
			eventType: 'feature_usage',
			severity: 'info',
			description: 'Test feature usage event',
			eventData: { test: true, feature: 'telemetry-dashboard', action: 'view' },
			component: 'frontend',
			createdAt: new Date(),
		},
	];

	// Send test metrics
	await influxdbService.writeMetrics(testMetrics as any);

	// Send test events
	await influxdbService.writeEvents(testEvents as any);

	// Flush to ensure data is sent
	await influxdbService.flush();
}

// Run the setup if this script is executed directly
if (require.main === module) {
	setupGrafana();
}

export { setupGrafana };