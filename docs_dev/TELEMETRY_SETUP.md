# Telemetry System Setup Guide

This guide explains how to set up the complete telemetry system for the Emaus retreat logistics management application.

## Quick Start for Production

### For InfluxDB Cloud Setup:

1. **Environment Setup**: Use Option A in Step 2 with `INFLUXDB_ORG=db502fe7945647c5`
2. **Get API Token**: Follow "Getting InfluxDB Cloud Token" section below
3. **Test Connection**: Run `pnpm run dev` and check API health endpoint
4. **Monitor Data**: Telemetry data will flow to your InfluxDB Cloud instance

## Overview

The telemetry system consists of:

- **InfluxDB**: Time-series database for storing metrics and events
- **Grafana**: Visualization platform for dashboards and analytics
- **In-system Dashboard**: Vue.js dashboard for superadmins
- **Automatic Collection**: Backend and frontend telemetry collection

## Prerequisites

- Node.js and pnpm installed
- Docker and Docker Compose (recommended for InfluxDB and Grafana)
- Admin access to the system

## Step 1: Set up InfluxDB

### Option A: Using Docker (Recommended)

1. Create a `docker-compose.yml` file for InfluxDB:

```yaml
version: '3.8'
services:
  influxdb:
    image: influxdb:2.7
    container_name: emaus-influxdb
    ports:
      - '8086:8086'
    environment:
      - DOCKER_INFLUXDB_INIT_MODE=setup
      - DOCKER_INFLUXDB_INIT_USERNAME=admin
      - DOCKER_INFLUXDB_INIT_PASSWORD=password123
      - DOCKER_INFLUXDB_INIT_ORG=emaus
      - DOCKER_INFLUXDB_INIT_BUCKET=telemetry
      - DOCKER_INFLUXDB_INIT_RETENTION=90d
    volumes:
      - influxdb_data:/var/lib/influxdb2
    networks:
      - telemetry

  grafana:
    image: grafana/grafana:10.2.0
    container_name: emaus-grafana
    ports:
      - '3000:3000'
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin123
      - GF_INSTALL_PLUGINS=grafana-clock-panel,grafana-simple-json-datasource
    volumes:
      - grafana_data:/var/lib/grafana
    networks:
      - telemetry

volumes:
  influxdb_data:
  grafana_data:

networks:
  telemetry:
    driver: bridge
```

2. Start the services:

```bash
docker-compose up -d
```

### Option B: Manual Installation

Install InfluxDB 2.x and Grafana manually following their official documentation.

## Step 2: Configure Environment Variables

### Option A: Cloud InfluxDB (Recommended for Production)

For production deployments using InfluxDB Cloud, add these environment variables to your `.env` file:

```env
# InfluxDB Cloud Configuration
INFLUXDB_URL=https://us-east-1-1.aws.cloud2.influxdata.com
INFLUXDB_TOKEN=your-influxdb-api-token-here
INFLUXDB_ORG=db502fe7945647c5
INFLUXDB_BUCKET=telemetry

# Grafana Cloud Configuration
GRAFANA_URL=https://leonardobolanos.grafana.net
GRAFANA_API_KEY=your-grafana-api-key-here
```

### Option B: Local Development

For local development with Docker, use these settings:

```env
# InfluxDB Local Configuration
INFLUXDB_URL=http://localhost:8086
INFLUXDB_TOKEN=your-influxdb-local-token-here
INFLUXDB_ORG=emaus
INFLUXDB_BUCKET=telemetry

# Grafana Configuration
GRAFANA_URL=http://localhost:3000
GRAFANA_API_KEY=your-grafana-api-key-here
```

### Getting InfluxDB Cloud Token

#### For InfluxDB Cloud Instance (https://us-east-1-1.aws.cloud2.influxdata.com/orgs/db502fe7945647c5)

1. **Access InfluxDB Cloud**:
   - Open: https://us-east-1-1.aws.cloud2.influxdata.com
   - Login to your InfluxDB Cloud account

2. **Navigate to Organization**:
   - Ensure you're in the correct org: `db502fe7945647c5`
   - You should see this in the URL and top navigation

3. **Create the Telemetry Bucket** (if it doesn't exist):
   - Click on "Data" in the left sidebar → "Buckets"
   - Click "Create Bucket"
   - **Bucket Name**: `telemetry`
   - **Retention Period**: Set to your preference (default 30 days, can be changed later)

4. **Create API Token**:
   - Click on "Data" in the left sidebar → "Tokens"
   - Click "Generate API Token" → "Custom API Token"
   - **Token Name**: `telemetry-service` (recommended)
   - **Permissions**: Grant these permissions:
     - ✅ Write to `telemetry` bucket in `db502fe7945647c5` organization
     - ✅ Read from `telemetry` bucket in `db502fe7945647c5` organization

5. **Generate and Copy Token**:
   - Click "Generate" to create the token
   - **IMPORTANT**: Copy the token immediately - you won't see it again!
   - Store it securely in your `.env` file

### Getting InfluxDB Local Token

#### For Local Docker Setup

1. Open InfluxDB UI: http://localhost:8086
2. Login with admin/password123
3. Go to Data → Tokens → Generate Token
4. Create a token with read/write permissions for the telemetry bucket
5. Copy the token to your `.env` file

### Getting Grafana API Key

#### For Grafana Cloud (https://leonardobolanos.grafana.net)

1. **Access Grafana Cloud**:
   - Open: https://leonardobolanos.grafana.net
   - Login to your Grafana Cloud account

2. **Create Service Account Token**:
   - Click on your profile (bottom left) → "My Account" → "API Keys"
   - Click "Add API Key"
   - **Name**: `emaus-telemetry-service` (recommended)
   - **Role**: `Admin` (full access needed for dashboard creation)
   - **TTL (Time To Live)**: Set to no expiration or a long period

3. **Generate and Copy Token**:
   - Click "Create Key" to generate the token
   - **IMPORTANT**: Copy the token immediately - you won't see it again!
   - Store it securely in your `.env` file as `GRAFANA_API_KEY`

#### For Local Docker Setup

1. Open Grafana: http://localhost:3000
2. Login with admin/admin123
3. Go to Configuration → API Keys
4. Create a new API key with Admin role
5. Copy the key to your `.env` file

## Step 3: Initialize the Telemetry System

1. Run the database migrations:

```bash
pnpm --filter api migration:run
```

2. Run the Grafana setup script:

```bash
pnpm --filter api ts-node src/scripts/setupGrafana.ts
```

This will:

- Test InfluxDB and Grafana connections
- Create pre-built dashboards in Grafana
- Send test data to verify integration
- Set up the data source

## Step 4: Verify the Setup

### In-System Dashboard

1. Start the application:

```bash
pnpm dev
```

2. Login as a superadmin user
3. Navigate to `/telemetry` in the application
4. You should see the telemetry dashboard with real-time metrics

### Grafana Dashboards

1. Open Grafana: http://localhost:3000
2. Login with admin/admin123
3. Go to Dashboards
4. You should see these dashboards:
   - **Emaus - System Performance**: API response times, memory usage, error rates
   - **Emaus - Business Intelligence**: Participant registrations, payment metrics, capacity utilization
   - **Emaus - User Analytics**: Page views, sessions, feature usage

## Step 5: Advanced Setup Options

### Grafana Cloud OpenTelemetry (OTLP)

For advanced observability, you can send OpenTelemetry data directly to Grafana Cloud. This complements your existing telemetry system.

#### Option A: Quickstart Setup (Direct OTLP)

1. **Get OTLP Endpoint and Token**:
   - Go to https://leonardobolanos.grafana.net → Administration → Data Sources → OpenTelemetry
   - Copy the **Endpoint URL** and **Instance ID** (these will be different)

2. **Install OpenTelemetry Packages**:

```bash
pnpm add @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/exporter-otlp-proto @opentelemetry/auto-instrumentations-node
```

3. **Create OTLP Configuration** (`apps/api/src/config/opentelemetry.ts`):

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-otlp-proto';

const traceExporter = new OTLPTraceExporter({
	url: 'https://otlp-gateway-prod-us-east-0.grafana.net/otlp', // Replace with your endpoint
	headers: {
		Authorization: `Basic ${Buffer.from('your-instance-id:your-api-token').toString('base64')}`,
	},
});

export const otelSDK = new NodeSDK({
	serviceName: 'emaus-retreat-api',
	serviceVersion: '1.0.0',
	traceExporter,
	instrumentations: [getNodeAutoInstrumentations()],
});
```

4. **Initialize OpenTelemetry** (`apps/api/src/index.ts`):
   Add this at the top of your main application file:

```typescript
import { otelSDK } from './config/opentelemetry';

// Initialize OpenTelemetry
otelSDK.start();
```

5. **Configure Environment Variables**:

```env
# OpenTelemetry
OTEL_SERVICE_NAME=emaus-retreat-api
OTEL_TRACES_EXPORTER=otlp-proto
OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp-gateway-prod-us-east-0.grafana.net/otlp
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic your-encoded-credentials
```

#### Option B: Production Setup (Via Collector)

For production environments, use the OpenTelemetry Collector:

1. **Download and Configure Collector**:

```yaml
# otel-collector-config.yaml
receivers:
  otlp:
    protocols:
      grpc:
      http:

exporters:
  otlp/grafana:
    endpoint: 'https://otlp-gateway-prod-us-east-0.grafana.net/otlp'
    headers:
      Authorization: 'Basic <base64-encoded-credentials>'

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: []
      exporters: [otlp/grafana]
```

2. **Run Collector**:

```bash
docker run -v $(pwd)/otel-collector-config.yaml:/etc/otelcol/config.yaml \
  otel/opentelemetry-collector:latest
```

3. **Configure App to Send to Collector**:

```env
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

### Testing Telemetry Collection

#### Backend Telemetry

The system automatically collects:

- API response times
- Database query performance
- Memory usage
- Error rates
- Authentication events

#### Frontend Telemetry

To enable frontend telemetry, add this to your main app initialization:

```typescript
import { telemetryService } from '@/services/telemetryService';

// Initialize telemetry when user logs in
const authStore = useAuthStore();
watch(
	() => authStore.user,
	async (user) => {
		if (user) {
			await telemetryService.initialize(user.id);
		}
	},
);
```

The frontend automatically tracks:

- Page load times
- API call performance
- User interactions
- Feature usage
- Errors

## Step 6: Customize and Extend

### Adding New Metrics

1. **Backend**: Use the telemetry service

```typescript
import { getTelemetryCollectionService } from './services/telemetryCollectionService';

const telemetryService = getTelemetryCollectionService(AppDataSource);
await telemetryService.trackMetric({
	metricType: 'custom_metric',
	unit: 'count',
	value: 42,
	tags: { category: 'custom' },
});
```

2. **Frontend**: Use the telemetry service

```typescript
import { telemetryService } from '@/services/telemetryService';

await telemetryService.trackFeatureUsage('custom-feature', 'action', { metadata: 'value' });
```

### Creating Custom Dashboards

1. **In-System**: Extend the TelemetryDashboardView.vue component
2. **Grafana**: Create new dashboards using the Grafana UI with the InfluxDB data source

### Setting Up Alerts

1. In Grafana, go to Alerting → Notification channels
2. Configure your preferred notification method (email, Slack, etc.)
3. Create alert rules on your dashboards
4. Example alerts:
   - High error rate (>5%)
   - Slow API response times (>2000ms)
   - Low cache hit rate (<80%)
   - High memory usage (>90%)

## Troubleshooting

### Common Issues

1. **Bucket "telemetry" Not Found Error**
   - **Cause**: The telemetry bucket hasn't been created in InfluxDB Cloud yet
   - **Solution**: Follow Step 2 in "Getting InfluxDB Cloud Token" to create the bucket first
   - **Quick Fix**: Go to https://us-east-1-1.aws.cloud2.influxdata.com → Data → Buckets → Create Bucket named "telemetry"

2. **InfluxDB Connection Failed**
   - Check that InfluxDB is running on port 8086
   - Verify the token and organization settings
   - Ensure the bucket exists

3. **Grafana Connection Failed**
   - Check that Grafana is running on port 3000
   - Verify the API key has admin permissions
   - Check network connectivity between services

4. **No Data in Dashboards**
   - Verify data is being sent to InfluxDB
   - Check the time range in Grafana dashboards
   - Ensure the data source is properly configured

5. **Frontend Telemetry Not Working**
   - Check that telemetryService.initialize() is called
   - Verify user authentication
   - Check browser console for errors

### Debug Mode

Enable debug logging by setting:

```env
NODE_ENV=development
```

This will provide detailed logs about telemetry operations.

## Performance Considerations

- **Retention**: Default data retention is 90 days. Adjust based on your needs.
- **Sampling**: The system samples memory usage and other metrics to avoid performance impact.
- **Batch Processing**: Metrics are sent in batches to reduce overhead.
- **Cleanup**: Use the cleanup API endpoint to remove old data:
  ```bash
  POST /api/telemetry/cleanup
  { "retentionDays": 90 }
  ```

## Security Notes

- Telemetry data may contain sensitive information
- InfluxDB and Grafana should be secured in production
- Use HTTPS for all communications
- Regularly rotate API keys and tokens
- Implement proper access controls

## Support

For issues with the telemetry system:

1. Check the application logs for error messages
2. Verify InfluxDB and Grafana are running and accessible
3. Test the API endpoints directly
4. Check browser console for frontend errors

The telemetry system is designed to be fault-tolerant and won't impact the main application functionality if there are issues with data collection.
