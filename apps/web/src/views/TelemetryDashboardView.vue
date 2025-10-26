<template>
  <div class="p-4 max-w-7xl mx-auto">
    <div v-if="isLoading" class="flex items-center justify-center p-8">
      <Loader2 class="w-8 h-8 animate-spin mr-2" />
      <span>Cargando métricas de telemetría...</span>
    </div>

    <div v-else-if="error" class="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
      <p class="text-red-800">{{ error }}</p>
    </div>

    <div v-else>
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-3xl font-bold flex items-center gap-2">
          <Activity class="w-8 h-8" />
          Panel de Telemetría
        </h1>
        <div class="flex items-center gap-4">
          <!-- Date Range Selector -->
          <div class="flex items-center gap-2">
            <Calendar class="w-4 h-4" />
            <select v-model="selectedRange" @change="loadMetrics" class="border rounded px-3 py-1">
              <option value="1h">Última hora</option>
              <option value="24h">Últimas 24 horas</option>
              <option value="7d">Últimos 7 días</option>
              <option value="30d">Últimos 30 días</option>
            </select>
          </div>
          <!-- Refresh Button -->
          <Button @click="loadMetrics" variant="outline" size="sm">
            <RefreshCw class="w-4 h-4 mr-2" />
            Actualizar
          </Button>
          <!-- Grafana Link -->
          <Button @click="openGrafana" variant="outline" size="sm">
            <BarChart3 class="w-4 h-4 mr-2" />
            Ver en Grafana
          </Button>
        </div>
      </div>

      <!-- Health Status -->
      <Card class="mb-6">
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <Heart class="w-5 h-5" />
            Estado del Sistema
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="flex items-center gap-2">
              <div :class="`w-3 h-3 rounded-full ${healthStatus.database ? 'bg-green-500' : 'bg-red-500'}`"></div>
              <span class="text-sm">Base de Datos: {{ healthStatus.database ? 'Conectada' : 'Error' }}</span>
            </div>
            <div class="flex items-center gap-2">
              <div :class="`w-3 h-3 rounded-full ${healthStatus.influxdb ? 'bg-green-500' : 'bg-red-500'}`"></div>
              <span class="text-sm">InfluxDB: {{ healthStatus.influxdb ? 'Conectado' : 'Error' }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-sm text-gray-600">Última actualización: {{ lastUpdated }}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Performance Metrics -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <!-- System Performance -->
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Cpu class="w-5 h-5" />
              Rendimiento del Sistema
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div class="space-y-4">
              <div class="flex justify-between items-center">
                <span class="text-sm font-medium">Tiempo de Respuesta API</span>
                <span class="text-sm font-bold">{{ performanceMetrics.averageResponseTime?.toFixed(2) || 0 }}ms</span>
              </div>
              <Progress :value="Math.min((performanceMetrics.averageResponseTime || 0) / 10, 100)" class="h-2" />

              <div class="flex justify-between items-center">
                <span class="text-sm font-medium">Tasa de Error</span>
                <span class="text-sm font-bold">{{ performanceMetrics.errorRate?.toFixed(2) || 0 }}%</span>
              </div>
              <Progress :value="performanceMetrics.errorRate || 0" class="h-2" />

              <div class="flex justify-between items-center">
                <span class="text-sm font-medium">Uso de Memoria</span>
                <span class="text-sm font-bold">{{ formatBytes(performanceMetrics.memoryUsage || 0) }}</span>
              </div>
              <Progress :value="Math.min(((performanceMetrics.memoryUsage || 0) / (1024 * 1024 * 1024)) * 100, 100)" class="h-2" />

              <div class="flex justify-between items-center">
                <span class="text-sm font-medium">Cache Hit Rate</span>
                <span class="text-sm font-bold">{{ performanceMetrics.cacheHitRate?.toFixed(1) || 0 }}%</span>
              </div>
              <Progress :value="performanceMetrics.cacheHitRate || 0" class="h-2" />
            </div>
          </CardContent>
        </Card>

        <!-- Business Metrics -->
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <TrendingUp class="w-5 h-5" />
              Métricas de Negocio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div class="space-y-4">
              <div class="flex justify-between items-center">
                <span class="text-sm font-medium">Registros de Participantes</span>
                <span class="text-sm font-bold">{{ businessMetrics.participantRegistrations || 0 }}</span>
              </div>

              <div class="flex justify-between items-center">
                <span class="text-sm font-medium">Tasa de Éxito de Pagos</span>
                <span class="text-sm font-bold">{{ businessMetrics.paymentSuccessRate?.toFixed(1) || 0 }}%</span>
              </div>
              <Progress :value="businessMetrics.paymentSuccessRate || 0" class="h-2" />

              <div class="flex justify-between items-center">
                <span class="text-sm font-medium">Utilización de Capacidad</span>
                <span class="text-sm font-bold">{{ businessMetrics.retreatCapacityUtilization?.toFixed(1) || 0 }}%</span>
              </div>
              <Progress :value="businessMetrics.retreatCapacityUtilization || 0" class="h-2" />

              <div class="flex justify-between items-center">
                <span class="text-sm font-medium">Cambios de Rol</span>
                <span class="text-sm font-bold">{{ businessMetrics.userRoleChanges || 0 }}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- User Behavior Analytics -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <!-- Page Views & Sessions -->
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Users class="w-5 h-5" />
            </CardTitle>
            <CardTitle>Comportamiento de Usuarios</CardTitle>
          </CardHeader>
          <CardContent>
            <div class="space-y-4">
              <div class="flex justify-between items-center">
                <span class="text-sm font-medium">Vistas de Página</span>
                <span class="text-sm font-bold">{{ userBehaviorMetrics.totalPageViews || 0 }}</span>
              </div>

              <div class="flex justify-between items-center">
                <span class="text-sm font-medium">Duración Promedio de Sesión</span>
                <span class="text-sm font-bold">{{ formatDuration(userBehaviorMetrics.averageSessionDuration || 0) }}</span>
              </div>

              <div>
                <h4 class="text-sm font-medium mb-2">Páginas Más Visitadas</h4>
                <div class="space-y-1">
                  <div v-for="page in (userBehaviorMetrics.mostVisitedPages || []).slice(0, 3)" :key="page.page" class="flex justify-between text-sm">
                    <span class="truncate">{{ page.page }}</span>
                    <span class="font-medium">{{ page.views }}</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- System Health -->
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Shield class="w-5 h-5" />
            </CardTitle>
            <CardTitle>Salud del Sistema</CardTitle>
          </CardHeader>
          <CardContent>
            <div class="space-y-4">
              <div class="flex justify-between items-center">
                <span class="text-sm font-medium">Tasa de Autenticación Exitosa</span>
                <span class="text-sm font-bold">{{ systemHealthMetrics.authenticationSuccessRate?.toFixed(1) || 0 }}%</span>
              </div>
              <Progress :value="systemHealthMetrics.authenticationSuccessRate || 0" class="h-2" />

              <div class="flex justify-between items-center">
                <span class="text-sm font-medium">Errores del Sistema</span>
                <span class="text-sm font-bold text-red-600">{{ systemHealthMetrics.systemErrors || 0 }}</span>
              </div>

              <div class="flex justify-between items-center">
                <span class="text-sm font-medium">Verificaciones de Permiso</span>
                <span class="text-sm font-bold">{{ systemHealthMetrics.permissionChecks || 0 }}</span>
              </div>

              <div class="flex justify-between items-center">
                <span class="text-sm font-medium">Consultas a Base de Datos</span>
                <span class="text-sm font-bold">{{ systemHealthMetrics.databaseQueries || 0 }}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- Quick Actions -->
      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <Settings class="w-5 h-5" />
            Acciones Rápidas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div class="flex flex-wrap gap-4">
            <Button @click="cleanupOldData" variant="outline" size="sm">
              <Trash2 class="w-4 h-4 mr-2" />
              Limpiar Datos Antiguos
            </Button>
            <Button @click="exportMetrics" variant="outline" size="sm">
              <Download class="w-4 h-4 mr-2" />
              Exportar Métricas
            </Button>
            <Button @click="testTelemetry" variant="outline" size="sm">
              <TestTube class="w-4 h-4 mr-2" />
              Probar Telemetría
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { Button } from '@repo/ui';
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui';
import { Progress } from '@repo/ui';
import { Badge } from '@repo/ui';
import { useToast } from '@repo/ui';
import {
  Loader2,
  Activity,
  Calendar,
  RefreshCw,
  BarChart3,
  Heart,
  Cpu,
  TrendingUp,
  Users,
  Shield,
  Settings,
  Trash2,
  Download,
  TestTube,
} from 'lucide-vue-next';
import {
  getTelemetryHealth,
  getAggregatedMetrics,
  getBusinessMetrics,
  getUserBehaviorMetrics,
  getSystemHealthMetrics,
  cleanupTelemetryData,
} from '@/services/api';
import { telemetryService } from '@/services/telemetryService';

// Reactive state
const isLoading = ref(true);
const error = ref<string | null>(null);
const lastUpdated = ref<string>('');
const selectedRange = ref('24h');

// Health status
const healthStatus = ref({
  database: false,
  influxdb: false,
});

// Metrics data
const performanceMetrics = ref({
  totalRequests: 0,
  averageResponseTime: 0,
  errorRate: 0,
  memoryUsage: 0,
  cacheHitRate: 0,
  activeUsers: 0,
});

const businessMetrics = ref({
  participantRegistrations: 0,
  paymentSuccessRate: 0,
  retreatCapacityUtilization: 0,
  userRoleChanges: 0,
});

const userBehaviorMetrics = ref({
  totalPageViews: 0,
  averageSessionDuration: 0,
  mostVisitedPages: [] as Array<{ page: string; views: number }>,
  mostUsedFeatures: [] as Array<{ feature: string; usage: number }>,
});

const systemHealthMetrics = ref({
  authenticationSuccessRate: 0,
  systemErrors: 0,
  permissionChecks: 0,
  databaseQueries: 0,
});

const { toast } = useToast();

// Auto-refresh interval
let refreshInterval: NodeJS.Timeout | null = null;

// Get date range based on selected range
const getDateRange = () => {
  const now = new Date();
  let startDate: Date;

  switch (selectedRange.value) {
    case '1h':
      startDate = new Date(now.getTime() - 60 * 60 * 1000);
      break;
    case '24h':
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case '7d':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }

  return {
    startDate: startDate.toISOString(),
    endDate: now.toISOString(),
  };
};

// Load all metrics
const loadMetrics = async () => {
  try {
    isLoading.value = true;
    error.value = null;

    const { startDate, endDate } = getDateRange();

    // Load health status
    const health = await getTelemetryHealth();
    healthStatus.value = health.health;

    // Load metrics in parallel
    const [perfMetrics, busMetrics, userMetrics, sysMetrics] = await Promise.all([
      getAggregatedMetrics(startDate, endDate),
      getBusinessMetrics(startDate, endDate),
      getUserBehaviorMetrics(startDate, endDate),
      getSystemHealthMetrics(startDate, endDate),
    ]);

    performanceMetrics.value = perfMetrics;
    businessMetrics.value = busMetrics;
    userBehaviorMetrics.value = userMetrics;
    systemHealthMetrics.value = sysMetrics;

    lastUpdated.value = new Date().toLocaleTimeString();

  } catch (err) {
    console.error('Failed to load telemetry metrics:', err);
    error.value = 'Error al cargar las métricas de telemetría';
    toast({
      title: 'Error',
      description: 'No se pudieron cargar las métricas de telemetría',
      variant: 'destructive',
    });
  } finally {
    isLoading.value = false;
  }
};

// Format bytes to human readable format
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Format duration in seconds to human readable format
const formatDuration = (seconds: number): string => {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
};

// Open Grafana dashboard
const openGrafana = () => {
  const grafanaUrl = process.env.VITE_GRAFANA_URL || 'http://localhost:3000';
  window.open(grafanaUrl, '_blank');
};

// Clean up old data
const cleanupOldData = async () => {
  try {
    await cleanupTelemetryData(90); // Clean up data older than 90 days
    toast({
      title: 'Limpieza Completada',
      description: 'Se han eliminado los datos de telemetría antiguos',
    });
    await loadMetrics(); // Reload metrics
  } catch (err) {
    console.error('Failed to cleanup old data:', err);
    toast({
      title: 'Error',
      description: 'No se pudieron limpiar los datos antiguos',
      variant: 'destructive',
    });
  }
};

// Export metrics (placeholder)
const exportMetrics = () => {
  toast({
    title: 'Exportar Métricas',
    description: 'Función de exportación próximamente disponible',
  });
};

// Test telemetry (placeholder)
const testTelemetry = async () => {
  try {
    if (telemetryService.isTelemetryActive()) {
      await telemetryService.trackFeatureUsage('telemetry', 'test');
      toast({
        title: 'Prueba Exitosa',
        description: 'Se ha enviado un evento de prueba de telemetría',
      });
    } else {
      toast({
        title: 'Telemetría Inactiva',
        description: 'La telemetría no está activa en este momento',
        variant: 'destructive',
      });
    }
  } catch (err) {
    console.error('Failed to test telemetry:', err);
    toast({
      title: 'Error en Prueba',
      description: 'No se pudo realizar la prueba de telemetría',
      variant: 'destructive',
    });
  }
};

// Initialize
onMounted(async () => {
  await loadMetrics();

  // Set up auto-refresh every 30 seconds
  refreshInterval = setInterval(loadMetrics, 30000);
});

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
});
</script>

<style scoped>
/* Custom styles for better visual hierarchy */
.grid {
  display: grid;
  gap: 1.5rem;
}

.grid-cols-1 {
  grid-template-columns: repeat(1, minmax(0, 1fr));
}

@media (min-width: 1024px) {
  .lg\:grid-cols-2 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1280px) {
  .max-w-7xl {
    max-width: 80rem;
  }
}

.space-y-4 > * + * {
  margin-top: 1rem;
}

.space-y-2 > * + * {
  margin-top: 0.5rem;
}

.flex-wrap {
  flex-wrap: wrap;
}
</style>