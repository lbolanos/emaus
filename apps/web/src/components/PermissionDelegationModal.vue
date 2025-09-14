<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[600px]">
      <DialogHeader>
        <DialogTitle>Delegar Permisos</DialogTitle>
        <DialogDescription>
          Otorga permisos temporales a otro usuario para este retiro
        </DialogDescription>
      </DialogHeader>
      
      <form @submit.prevent="submitForm" class="space-y-4">
        <!-- From User (Current User) -->
        <div class="space-y-2">
          <Label>Delegando desde</Label>
          <div class="p-3 bg-blue-50 rounded-md border border-blue-200">
            <div class="flex items-center gap-3">
              <Avatar>
                <AvatarImage :src="currentUser?.photo" />
                <AvatarFallback>{{ getInitials(currentUser?.displayName || '') }}</AvatarFallback>
              </Avatar>
              <div>
                <div class="font-medium">{{ currentUser?.displayName }}</div>
                <div class="text-sm text-blue-600">{{ currentUser?.email }}</div>
                <Badge variant="secondary" class="mt-1">
                  {{ currentUserRole }}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        <!-- To User Selection -->
        <div class="space-y-2">
          <Label for="toUser">Delegar a</Label>
          <Select v-model="form.toUserId" required>
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar usuario" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem 
                v-for="user in availableUsers" 
                :key="user.userId" 
                :value="user.userId"
              >
                <div class="flex items-center gap-3">
                  <Avatar class="h-6 w-6">
                    <AvatarImage :src="user.user?.photo" />
                    <AvatarFallback class="text-xs">{{ getInitials(user.user?.displayName || '') }}</AvatarFallback>
                  </Avatar>
                  <div>
                    <div class="font-medium text-sm">{{ user.user?.displayName }}</div>
                    <div class="text-xs text-gray-500">{{ user.user?.email }}</div>
                  </div>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- Available Permissions -->
        <div class="space-y-2">
          <Label>Permisos a Delegar</Label>
          <div class="border rounded-md p-3 max-h-48 overflow-y-auto">
            <div class="space-y-2">
              <div v-for="category in permissionCategories" :key="category.name">
                <div class="font-medium text-sm text-gray-700 mb-1">{{ category.name }}</div>
                <div class="grid grid-cols-2 gap-2 ml-2">
                  <label 
                    v-for="permission in category.permissions" 
                    :key="permission"
                    class="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-1 rounded"
                  >
                    <input
                      type="checkbox"
                      :value="permission"
                      v-model="form.permissions"
                      class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span class="text-sm">{{ formatPermissionName(permission) }}</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
          <p class="text-xs text-gray-500">
            Selecciona los permisos que deseas delegar temporalmente
          </p>
        </div>

        <!-- Selected Permissions Preview -->
        <div v-if="form.permissions.length > 0" class="space-y-2">
          <Label>Permisos Seleccionados</Label>
          <div class="flex flex-wrap gap-1">
            <Badge 
              v-for="permission in form.permissions" 
              :key="permission" 
              variant="secondary" 
              class="text-xs"
            >
              {{ formatPermissionName(permission) }}
            </Badge>
          </div>
        </div>

        <!-- Expiration Date -->
        <div class="space-y-2">
          <Label for="expiresAt">Fecha de Expiración</Label>
          <Input
            id="expiresAt"
            v-model="form.expiresAt"
            type="datetime-local"
            :min="minDateTime"
            required
          />
          <p class="text-xs text-gray-500">
            Los permisos se revocarán automáticamente en esta fecha
          </p>
        </div>

        <!-- Reason -->
        <div class="space-y-2">
          <Label for="reason">Motivo de la Delegación</Label>
          <Textarea
            id="reason"
            v-model="form.reason"
            placeholder="Explica por qué necesitas delegar estos permisos..."
            rows="3"
            required
          />
        </div>

        <!-- Warning -->
        <div class="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
          <div class="flex items-start gap-2">
            <AlertTriangle class="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
            <div class="text-sm text-yellow-800">
              <strong>Importante:</strong> El usuario seleccionado tendrá estos permisos hasta la fecha de expiración. 
              Podrás revocar la delegación en cualquier momento desde la gestión de usuarios.
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" @click="emit('update:open', false)">
            Cancelar
          </Button>
          <Button 
            type="submit" 
            :disabled="loading || !form.toUserId || form.permissions.length === 0"
          >
            <Loader2 v-if="loading" class="w-4 h-4 mr-2 animate-spin" />
            Delegar Permisos
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useToast } from '@repo/ui'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Label, Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Input, Textarea, Button, Avatar, AvatarImage, AvatarFallback, Badge
} from '@repo/ui'
import { AlertTriangle, Loader2 } from 'lucide-vue-next'
import { 
  delegatePermissions, 
  getRetreatUsersWithFilters,
  getAvailablePermissions
} from '@/services/api'
import type { UserRetreat, Permission, User } from '@repo/types'

interface Props {
  open: boolean
  retreatId: string
}

interface Emits {
  'update:open': [value: boolean]
  'delegation-created': []
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const { toast } = useToast()

// State
const loading = ref(false)
const availableUsers = ref<(UserRetreat & { user?: User })[]>([])
const availablePermissions = ref<Permission[]>([])
const currentUser = ref<any>(null) // This would come from auth store
const currentUserRole = ref('retreat_admin') // This would come from auth store

// Form
const form = reactive({
  toUserId: '',
  permissions: [] as string[],
  expiresAt: '',
  reason: ''
})

// Computed
const minDateTime = computed(() => {
  const now = new Date()
  now.setHours(now.getHours() + 1) // Minimum 1 hour from now
  return now.toISOString().slice(0, 16)
})

const permissionCategories = computed(() => {
  const categories = {
    'Retiro': [],
    'Participantes': [],
    'Auditoría': [],
    'Permisos': []
  } as Record<string, string[]>

  availablePermissions.value.forEach((permission: any) => {
    const [resource] = permission.resource.split(':')
    
    if (resource === 'retreat') {
      categories['Retiro'].push(`${permission.resource}:${permission.operation}`)
    } else if (resource === 'participant') {
      categories['Participantes'].push(`${permission.resource}:${permission.operation}`)
    } else if (resource === 'audit') {
      categories['Auditoría'].push(`${permission.resource}:${permission.operation}`)
    } else if (resource === 'permission') {
      categories['Permisos'].push(`${permission.resource}:${permission.operation}`)
    }
  })

  return Object.entries(categories)
    .filter(([_, permissions]) => permissions.length > 0)
    .map(([name, permissions]) => ({ name, permissions }))
})

// Methods
const loadAvailableUsers = async () => {
  try {
    const response = await getRetreatUsersWithFilters(props.retreatId, {
      status: 'active',
      limit: 100
    })
    
    // Filter out current user
    availableUsers.value = response.data.users.filter(
      (user: any) => user.userId !== currentUser.value?.id
    )
  } catch (error) {
    toast({
      title: 'Error',
      description: 'No se pudo cargar la lista de usuarios',
      variant: 'destructive'
    })
  }
}

const loadAvailablePermissions = async () => {
  try {
    const response = await getAvailablePermissions()
    availablePermissions.value = response.data
  } catch (error) {
    toast({
      title: 'Error',
      description: 'No se pudo cargar la lista de permisos',
      variant: 'destructive'
    })
  }
}

const submitForm = async () => {
  if (!form.toUserId || form.permissions.length === 0 || !form.expiresAt) return

  try {
    loading.value = true

    await delegatePermissions({
      fromUserId: currentUser.value?.id || 'current-user-id',
      toUserId: form.toUserId,
      retreatId: props.retreatId,
      permissions: form.permissions,
      expiresAt: new Date(form.expiresAt)
    })

    toast({
      title: 'Permisos Delegados',
      description: 'Los permisos han sido delegados exitosamente'
    })

    // Reset form
    form.toUserId = ''
    form.permissions = []
    form.expiresAt = ''
    form.reason = ''

    emit('delegation-created')
    emit('update:open', false)
  } catch (error) {
    toast({
      title: 'Error',
      description: 'No se pudo delegar los permisos',
      variant: 'destructive'
    })
  } finally {
    loading.value = false
  }
}

const getInitials = (name: string) => {
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .substring(0, 2)
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
  if (newValue) {
    loadAvailableUsers()
    loadAvailablePermissions()
    
    // Set default expiration (7 days from now)
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)
    form.expiresAt = expiresAt.toISOString().slice(0, 16)
  } else {
    // Reset form
    form.toUserId = ''
    form.permissions = []
    form.expiresAt = ''
    form.reason = ''
  }
})
</script>