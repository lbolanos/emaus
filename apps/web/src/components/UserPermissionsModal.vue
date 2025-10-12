<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[600px]">
      <DialogHeader>
        <DialogTitle>Permisos de Usuario</DialogTitle>
        <DialogDescription>
          Permisos y roles del usuario en este retiro
        </DialogDescription>
      </DialogHeader>

      <div v-if="user" class="space-y-6">
        <!-- User Info -->
        <div class="p-4 bg-gray-50 rounded-md">
          <div class="flex items-center gap-3">
            <Avatar>
              <AvatarImage :src="user?.user?.photo" />
              <AvatarFallback>{{ getInitials(user?.user?.displayName || '') }}</AvatarFallback>
            </Avatar>
            <div class="flex-1">
              <div class="font-medium text-lg">{{ user?.user?.displayName }}</div>
              <div class="text-sm text-gray-500">{{ user?.user?.email }}</div>
              <div class="flex items-center gap-2 mt-1">
                <Badge :variant="getStatusVariant(user?.status)">
                  {{ getStatusText(user?.status) }}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        <!-- Loading State -->
        <div v-if="loading" class="flex items-center justify-center py-8">
          <Loader2 class="w-8 h-8 animate-spin text-gray-400" />
        </div>

        <!-- Permissions Content -->
        <div v-else-if="permissionsData" class="space-y-6">
          <!-- Direct Permissions -->
          <div>
            <h3 class="text-lg font-semibold mb-3 flex items-center gap-2">
              <Shield class="w-5 h-5" />
              Permisos Directos
            </h3>
            <div v-if="permissionsData.permissions.length > 0" class="space-y-2">
              <div class="grid grid-cols-1 gap-2">
                <div
                  v-for="category in categorizedDirectPermissions"
                  :key="category.name"
                  class="border rounded-lg p-3"
                >
                  <div class="font-medium text-sm mb-2">{{ category.name }}</div>
                  <div class="flex flex-wrap gap-1">
                    <Badge 
                      v-for="permission in category.permissions" 
                      :key="permission"
                      variant="default" 
                      class="text-xs"
                    >
                      {{ formatPermissionName(permission) }}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
            <div v-else class="text-gray-500 text-center py-4">
              No hay permisos directos asignados
            </div>
          </div>

          <!-- Roles -->
          <div>
            <h3 class="text-lg font-semibold mb-3 flex items-center gap-2">
              <Users class="w-5 h-5" />
              Roles
            </h3>
            <div class="space-y-2">
              <div v-for="role in permissionsData.roles" :key="role" class="flex items-center gap-2">
                <Badge variant="secondary">{{ role }}</Badge>
              </div>
            </div>
          </div>

          <!-- Inherited Permissions -->
          <div v-if="permissionsData.inheritedPermissions?.length > 0">
            <h3 class="text-lg font-semibold mb-3 flex items-center gap-2">
              <Share2 class="w-5 h-5" />
              Permisos Heredados
            </h3>
            <div class="space-y-2">
              <div class="flex flex-wrap gap-1">
                <Badge 
                  v-for="permission in permissionsData.inheritedPermissions" 
                  :key="permission"
                  variant="outline" 
                  class="text-xs"
                >
                  {{ formatPermissionName(permission) }}
                </Badge>
              </div>
            </div>
          </div>

          <!-- Delegated Permissions -->
          <div v-if="permissionsData.delegatedPermissions?.length > 0">
            <h3 class="text-lg font-semibold mb-3 flex items-center gap-2">
              <HandMetal class="w-5 h-5" />
              Permisos Delegados
            </h3>
            <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div class="text-sm text-blue-800 mb-2">
                Este usuario tiene permisos temporales delegados por otros usuarios.
              </div>
              <div class="flex flex-wrap gap-1">
                <Badge 
                  v-for="permission in permissionsData.delegatedPermissions" 
                  :key="permission"
                  variant="secondary" 
                  class="text-xs bg-blue-100 text-blue-800"
                >
                  {{ formatPermissionName(permission) }}
                </Badge>
              </div>
            </div>
          </div>

          <!-- Retreat Access -->
          <div>
            <h3 class="text-lg font-semibold mb-3 flex items-center gap-2">
              <MapPin class="w-5 h-5" />
              Retiros con Acceso
            </h3>
            <div class="space-y-2">
              <div
                v-for="retreat in permissionsData.retreats"
                :key="retreat.retreatId"
                class="flex items-center justify-between p-3 border rounded-lg"
              >
                <div class="flex items-center gap-2">
                  <Building class="w-4 h-4 text-gray-400" />
                  <span class="font-medium">{{ retreat.retreatId }}</span>
                  <Badge variant="outline" class="text-xs">{{ retreat.role }}</Badge>
                </div>
                <CheckCircle 
                  v-if="retreat.retreatId === user.retreatId" 
                  class="w-5 h-5 text-green-500" 
                />
              </div>
            </div>
          </div>

          <!-- Permission Summary -->
          <div class="bg-gray-50 rounded-lg p-4">
            <h3 class="font-semibold mb-3">Resumen de Permisos</h3>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div class="text-2xl font-bold text-blue-600">
                  {{ permissionsData.permissions.length }}
                </div>
                <div class="text-xs text-gray-500">Directos</div>
              </div>
              <div>
                <div class="text-2xl font-bold text-green-600">
                  {{ permissionsData.inheritedPermissions?.length || 0 }}
                </div>
                <div class="text-xs text-gray-500">Heredados</div>
              </div>
              <div>
                <div class="text-2xl font-bold text-orange-600">
                  {{ permissionsData.delegatedPermissions?.length || 0 }}
                </div>
                <div class="text-xs text-gray-500">Delegados</div>
              </div>
              <div>
                <div class="text-2xl font-bold text-purple-600">
                  {{ permissionsData.retreats?.length || 0 }}
                </div>
                <div class="text-xs text-gray-500">Retiros</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Error State -->
        <div v-else-if="error" class="text-center py-8">
          <AlertTriangle class="w-12 h-12 text-red-500 mx-auto mb-2" />
          <p class="text-gray-500">{{ error }}</p>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="exportPermissions">
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
import { ref, computed, onMounted, watch } from 'vue'
import { useToast } from '@repo/ui'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Button, Avatar, AvatarImage, AvatarFallback, Badge
} from '@repo/ui'
import {
  Shield, Users, Share2, HandMetal, MapPin, Building, CheckCircle,
  Download, Loader2, AlertTriangle
} from 'lucide-vue-next'
import { getUserRetreatPermissions } from '@/services/api'
import type { UserRetreat, User } from '@repo/types'

interface Props {
  open: boolean
  user: (UserRetreat & { user?: User }) | null
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
const error = ref<string | null>(null)
const permissionsData = ref<any>(null)

// Computed
const categorizedDirectPermissions = computed(() => {
  if (!permissionsData.value?.permissions) return []

  const categories = {
    'Retiro': [],
    'Participantes': [],
    'Auditoría': [],
    'Permisos': [],
    'Usuarios': [],
    'Sistema': []
  } as Record<string, string[]>

  permissionsData.value.permissions.forEach((permission: string) => {
    const [resource, operation] = permission.split(':')
    
    if (resource === 'retreat') {
      categories['Retiro'].push(permission)
    } else if (resource === 'participant') {
      categories['Participantes'].push(permission)
    } else if (resource === 'audit') {
      categories['Auditoría'].push(permission)
    } else if (resource === 'permission') {
      categories['Permisos'].push(permission)
    } else if (resource === 'users') {
      categories['Usuarios'].push(permission)
    } else {
      categories['Sistema'].push(permission)
    }
  })

  return Object.entries(categories)
    .filter(([_, permissions]) => permissions.length > 0)
    .map(([name, permissions]) => ({ name, permissions }))
})

// Methods
const loadPermissions = async () => {
  if (!props.user) return

  try {
    loading.value = true
    error.value = null
    
    const response = await getUserRetreatPermissions(props.retreatId, props.user.userId)
    permissionsData.value = response.data
  } catch (err) {
    error.value = 'No se pudo cargar la información de permisos'
    console.error('Error loading permissions:', err)
  } finally {
    loading.value = false
  }
}

const exportPermissions = () => {
  if (!permissionsData.value) return

  const data = {
    user: {
      id: props.user?.userId,
      name: props.user?.user?.displayName,
      email: props.user?.user?.email,
      status: props.user?.status
    },
    permissions: permissionsData.value
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `permisos-${props.user?.user?.displayName || 'usuario'}-${new Date().toISOString().split('T')[0]}.json`
  a.click()
  window.URL.revokeObjectURL(url)
}

const getInitials = (name: string) => {
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .substring(0, 2)
}

const getRoleVariant = (role: string) => {
  const variants: Record<string, any> = {
    'retreat_admin': 'default',
    'retreat_manager': 'secondary',
    'retreat_user': 'outline',
    'treasurer': 'destructive'
  }
  return variants[role] || 'outline'
}

const getStatusVariant = (status: string) => {
  const variants: Record<string, any> = {
    'active': 'default',
    'pending': 'secondary',
    'revoked': 'destructive',
    'expired': 'outline'
  }
  return variants[status] || 'outline'
}

const getStatusText = (status: string) => {
  const texts: Record<string, string> = {
    'active': 'Activo',
    'pending': 'Pendiente',
    'revoked': 'Revocado',
    'expired': 'Expirado'
  }
  return texts[status] || status
}

const formatPermissionName = (permission: string) => {
  const [resource, operation] = permission.split(':')
  const resourceMap: Record<string, string> = {
    'retreat': 'Retiro',
    'participant': 'Participante',
    'audit': 'Auditoría',
    'permission': 'Permisos',
    'users': 'Usuarios',
    'roles': 'Roles'
  }
  
  const operationMap: Record<string, string> = {
    'create': 'Crear',
    'read': 'Leer',
    'update': 'Actualizar',
    'delete': 'Eliminar',
    'manage': 'Gestionar',
    'delegate': 'Delegar',
    'override': 'Sobrescribir'
  }
  
  const resourceText = resourceMap[resource] || resource
  const operationText = operationMap[operation] || operation
  
  return `${resourceText}: ${operationText}`
}

// Watchers
watch(() => props.open, (newValue) => {
  if (newValue && props.user) {
    loadPermissions()
  } else {
    // Reset state when modal closes
    permissionsData.value = null
    error.value = null
  }
})

watch(() => props.user, (newUser) => {
  if (newUser && props.open) {
    loadPermissions()
  }
})
</script>