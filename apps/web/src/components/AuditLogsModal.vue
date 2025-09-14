<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[800px] max-h-[80vh] overflow-hidden">
      <DialogHeader>
        <DialogTitle>Registro de Auditoría</DialogTitle>
        <DialogDescription>
          Historial de cambios y acciones en el retiro
        </DialogDescription>
      </DialogHeader>

      <div class="flex flex-col h-[60vh]">
        <!-- Filters -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 border-b">
          <div>
            <Label for="actionFilter" class="text-sm">Acción</Label>
            <Select v-model="filters.actionType" @update:model-value="loadLogs">
              <SelectTrigger class="h-8">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todas</SelectItem>
                <SelectItem value="role_assigned">Rol Asignado</SelectItem>
                <SelectItem value="role_removed">Rol Removido</SelectItem>
                <SelectItem value="permission_delegated">Permiso Delegado</SelectItem>
                <SelectItem value="permission_revoked">Permiso Revocado</SelectItem>
                <SelectItem value="user_created">Usuario Creado</SelectItem>
                <SelectItem value="permission_override">Permiso Sobrescrito</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label for="resourceFilter" class="text-sm">Recurso</Label>
            <Select v-model="filters.resourceType" @update:model-value="loadLogs">
              <SelectTrigger class="h-8">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todos</SelectItem>
                <SelectItem value="user_retreat">Usuario-Retiro</SelectItem>
                <SelectItem value="permission_delegation">Delegación</SelectItem>
                <SelectItem value="permission_override">Sobrescritura</SelectItem>
                <SelectItem value="user">Usuario</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label for="dateFromFilter" class="text-sm">Desde</Label>
            <Input
              id="dateFromFilter"
              v-model="filters.startDate"
              type="date"
              class="h-8"
              @change="loadLogs"
            />
          </div>
          <div>
            <Label for="dateToFilter" class="text-sm">Hasta</Label>
            <Input
              id="dateToFilter"
              v-model="filters.endDate"
              type="date"
              class="h-8"
              @change="loadLogs"
            />
          </div>
        </div>

        <!-- Stats Summary -->
        <div class="p-4 bg-gray-50 border-b">
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div class="text-2xl font-bold text-blue-600">{{ stats.totalActions }}</div>
              <div class="text-xs text-gray-500">Total Acciones</div>
            </div>
            <div>
              <div class="text-2xl font-bold text-green-600">{{ stats.todayActions }}</div>
              <div class="text-xs text-gray-500">Hoy</div>
            </div>
            <div>
              <div class="text-2xl font-bold text-orange-600">{{ stats.uniqueUsers }}</div>
              <div class="text-xs text-gray-500">Usuarios Únicos</div>
            </div>
            <div>
              <div class="text-2xl font-bold text-purple-600">{{ stats.roleChanges }}</div>
              <div class="text-xs text-gray-500">Cambios de Rol</div>
            </div>
          </div>
        </div>

        <!-- Logs List -->
        <div class="flex-1 overflow-y-auto">
          <div v-if="loading" class="flex items-center justify-center h-full">
            <Loader2 class="w-8 h-8 animate-spin text-gray-400" />
          </div>
          
          <div v-else-if="logs.length === 0" class="flex items-center justify-center h-full text-gray-500">
            No se encontraron registros de auditoría
          </div>
          
          <div v-else class="divide-y">
            <div
              v-for="log in logs"
              :key="log.id"
              class="p-4 hover:bg-gray-50 transition-colors"
            >
              <div class="flex items-start gap-3">
                <!-- Action Icon -->
                <div class="flex-shrink-0">
                  <div :class="getActionIconClass(log.actionType)">
                    <component :is="getActionIcon(log.actionType)" class="w-5 h-5" />
                  </div>
                </div>

                <!-- Content -->
                <div class="flex-1 min-w-0">
                  <!-- Header -->
                  <div class="flex items-center justify-between mb-1">
                    <div class="flex items-center gap-2">
                      <span class="font-medium text-gray-900">{{ log.user?.displayName || 'Sistema' }}</span>
                      <Badge :variant="getActionVariant(log.actionType)" class="text-xs">
                        {{ getActionText(log.actionType) }}
                      </Badge>
                    </div>
                    <span class="text-xs text-gray-500">
                      {{ formatDateTime(log.timestamp) }}
                    </span>
                  </div>

                  <!-- Description -->
                  <p class="text-sm text-gray-600 mb-2">
                    {{ getActionDescription(log) }}
                  </p>

                  <!-- Details -->
                  <div v-if="log.details" class="bg-gray-50 rounded-md p-2 text-xs">
                    <div class="font-medium mb-1">Detalles:</div>
                    <div class="space-y-1">
                      <div v-if="log.details.retreatId" class="flex">
                        <span class="text-gray-500 w-20">Retiro:</span>
                        <code class="bg-gray-100 px-1 rounded">{{ log.details.retreatId }}</code>
                      </div>
                      <div v-if="log.details.oldRole !== undefined" class="flex">
                        <span class="text-gray-500 w-20">Rol Anterior:</span>
                        <Badge variant="outline" class="text-xs">{{ log.details.oldRole || 'Ninguno' }}</Badge>
                      </div>
                      <div v-if="log.details.newRole" class="flex">
                        <span class="text-gray-500 w-20">Nuevo Rol:</span>
                        <Badge variant="default" class="text-xs">{{ log.details.newRole }}</Badge>
                      </div>
                      <div v-if="log.details.targetUserId" class="flex">
                        <span class="text-gray-500 w-20">Usuario:</span>
                        <span>{{ log.targetUser?.displayName || log.details.targetUserId }}</span>
                      </div>
                      <div v-if="log.details.permissions" class="flex">
                        <span class="text-gray-500 w-20">Permisos:</span>
                        <div class="flex gap-1 flex-wrap">
                          <Badge 
                            v-for="permission in log.details.permissions" 
                            :key="permission" 
                            variant="outline" 
                            class="text-xs"
                          >
                            {{ permission }}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Metadata -->
                  <div class="flex items-center gap-4 mt-2 text-xs text-gray-400">
                    <span v-if="log.ipAddress">
                      <Computer class="w-3 h-3 inline mr-1" />
                      {{ log.ipAddress }}
                    </span>
                    <span v-if="log.userAgent">
                      {{ getUserAgent(log.userAgent) }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Pagination -->
        <div class="flex items-center justify-between p-4 border-t">
          <div class="text-sm text-gray-500">
            Mostrando {{ logs.length }} de {{ pagination.total }} registros
          </div>
          <div class="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              @click="previousPage"
              :disabled="pagination.offset === 0"
            >
              <ChevronLeft class="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              @click="nextPage"
              :disabled="!pagination.hasMore"
            >
              <ChevronRight class="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="exportLogs">
          <Download class="w-4 h-4 mr-2" />
          Exportar
        </Button>
        <Button @click="emit('update:open', false)">
          Cerrar
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, watch } from 'vue'
import { useToast } from '@repo/ui';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Label, Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Input, Button, Badge
} from '@repo/ui';
import {
  Loader2, ChevronLeft, ChevronRight, Download, Computer,
  UserPlus, UserX, Share2, Shield, FileText, Users, Settings
} from 'lucide-vue-next'
import { 
  getAuditLogs, 
  getAuditStats
} from '@/services/api'

interface Props {
  open: boolean
  retreatId: string
}

interface Emits {
  'update:open': [value: boolean]
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const { toast } = useToast()

// State
const loading = ref(false)
const logs = ref<any[]>([])
const stats = ref({
  totalActions: 0,
  todayActions: 0,
  uniqueUsers: 0,
  roleChanges: 0
})

// Filters
const filters = reactive({
  actionType: '',
  resourceType: '',
  startDate: '',
  endDate: ''
})

// Pagination
const pagination = reactive({
  total: 0,
  offset: 0,
  limit: 50,
  hasMore: false
})

// Methods
const loadLogs = async () => {
  try {
    loading.value = true
    const response = await getAuditLogs(props.retreatId, {
      ...filters,
      limit: pagination.limit,
      offset: pagination.offset
    })
    
    logs.value = response.data.logs
    pagination.total = response.data.total
    pagination.hasMore = response.data.hasMore
  } catch (error) {
    toast({
      title: 'Error',
      description: 'No se pudo cargar el registro de auditoría',
      variant: 'destructive'
    })
  } finally {
    loading.value = false
  }
}

const loadStats = async () => {
  try {
    const today = new Date().toISOString().split('T')[0]
    const response = await getAuditStats(props.retreatId, {
      startDate: today
    })
    
    const allStats = await getAuditStats(props.retreatId)
    
    stats.value = {
      totalActions: allStats.data.totalActions,
      todayActions: response.data.totalActions,
      uniqueUsers: new Set(logs.value.map(log => log.userId)).size,
      roleChanges: allStats.data.actionsByType?.role_assigned || 0
    }
  } catch (error) {
    console.error('Error loading audit stats:', error)
  }
}

const previousPage = () => {
  if (pagination.offset > 0) {
    pagination.offset -= pagination.limit
    loadLogs()
  }
}

const nextPage = () => {
  if (pagination.hasMore) {
    pagination.offset += pagination.limit
    loadLogs()
  }
}

const exportLogs = () => {
  // Create CSV content
  const headers = ['Fecha', 'Usuario', 'Acción', 'Recurso', 'Detalles']
  const rows = logs.value.map(log => [
    formatDateTime(log.timestamp),
    log.user?.displayName || 'Sistema',
    getActionText(log.actionType),
    log.resourceType,
    JSON.stringify(log.details || {})
  ])
  
  
  
  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${cell}"`).join(','))
    .join('\n')
  
  // Download file
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `auditoria-${props.retreatId}-${new Date().toISOString().split('T')[0]}.csv`
  a.click()
  window.URL.revokeObjectURL(url)
}

const getActionIcon = (actionType: string) => {
  const icons: Record<string, any> = {
    'role_assigned': UserPlus,
    'role_removed': UserX,
    'permission_delegated': Share2,
    'permission_revoked': Shield,
    'user_created': Users,
    'permission_override': Settings,
    'default': FileText
  }
  return icons[actionType] || icons.default
}

const getActionIconClass = (actionType: string) => {
  const classes: Record<string, string> = {
    'role_assigned': 'p-1 bg-green-100 text-green-600 rounded-full',
    'role_removed': 'p-1 bg-red-100 text-red-600 rounded-full',
    'permission_delegated': 'p-1 bg-blue-100 text-blue-600 rounded-full',
    'permission_revoked': 'p-1 bg-orange-100 text-orange-600 rounded-full',
    'user_created': 'p-1 bg-purple-100 text-purple-600 rounded-full',
    'permission_override': 'p-1 bg-yellow-100 text-yellow-600 rounded-full'
  }
  return classes[actionType] || 'p-1 bg-gray-100 text-gray-600 rounded-full'
}

const getActionVariant = (actionType: string) => {
  const variants: Record<string, any> = {
    'role_assigned': 'default',
    'role_removed': 'destructive',
    'permission_delegated': 'secondary',
    'permission_revoked': 'outline',
    'user_created': 'default',
    'permission_override': 'secondary'
  }
  return variants[actionType] || 'outline'
}

const getActionText = (actionType: string) => {
  const texts: Record<string, string> = {
    'role_assigned': 'Rol Asignado',
    'role_removed': 'Rol Removido',
    'permission_delegated': 'Permiso Delegado',
    'permission_revoked': 'Permiso Revocado',
    'user_created': 'Usuario Creado',
    'permission_override': 'Permiso Sobrescrito'
  }
  return texts[actionType] || actionType
}

const getActionDescription = (log: any) => {
  const descriptions: Record<string, string> = {
    'role_assigned': `Asignó el rol de ${log.details?.newRole} a ${log.targetUser?.displayName || 'usuario'}`,
    'role_removed': `Removió el rol de ${log.details?.oldRole} a ${log.targetUser?.displayName || 'usuario'}`,
    'permission_delegated': `Delegó permisos a ${log.targetUser?.displayName || 'usuario'}`,
    'permission_revoked': `Revocó permisos delegados a ${log.targetUser?.displayName || 'usuario'}`,
    'user_created': 'Creó un nuevo usuario',
    'permission_override': 'Modificó permisos manualmente'
  }
  return descriptions[log.actionType] || 'Realizó una acción'
}

const formatDateTime = (dateString: string) => {
  return new Date(dateString).toLocaleString('es-ES', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const formatCsvCell = (cell: any) => {
  return cell !== null && cell !== undefined ? String(cell) : ''
}

const getUserAgent = (userAgent: string) => {
  if (userAgent.includes('Chrome')) return 'Chrome'
  if (userAgent.includes('Firefox')) return 'Firefox'
  if (userAgent.includes('Safari')) return 'Safari'
  return userAgent.split(' ')[0] || 'Unknown'
}

// Watchers
watch(() => props.open, (newValue) => {
  if (newValue) {
    // Set default date range (last 30 days)
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 30)
    
    filters.startDate = startDate.toISOString().split('T')[0]
    filters.endDate = endDate.toISOString().split('T')[0]
    
    pagination.offset = 0
    loadLogs()
    loadStats()
  }
})
</script>