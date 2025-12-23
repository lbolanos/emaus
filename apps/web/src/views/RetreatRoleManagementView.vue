<template>
  <div class="p-4">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold">Gestión de Roles del Retiro</h1>
        <p class="text-gray-600">Administra roles, invitaciones y permisos personalizados</p>
        <p class="text-sm text-blue-600 mt-1">
          Retiro seleccionado: ID {{ retreatId }}
        </p>
      </div>
      <div class="flex gap-2">
        <Button @click="openInviteModal" :disabled="!isRetreatCreator">
          <UserPlus class="w-4 h-4 mr-2" />
          Invitar Usuario
        </Button>
        <Button @click="refreshData" variant="outline">
          <RefreshCw class="w-4 h-4 mr-2" />
          Actualizar
        </Button>
      </div>
    </div>

    <!-- Role Requests Section -->
    <Card class="mb-6">
      <CardHeader>
        <CardTitle class="flex items-center">
          <UserCheck class="w-5 h-5 mr-2" />
          Solicitudes de Rol
          <Badge v-if="pendingRequests.length > 0" variant="secondary" class="ml-2">
            {{ pendingRequests.length }} pendientes
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div v-if="pendingRequests.length === 0" class="text-center py-8 text-gray-500">
          No hay solicitudes de rol pendientes
        </div>
        <div v-else class="space-y-4">
          <div v-for="request in pendingRequests" :key="request.id" 
               class="border rounded-lg p-4 bg-gray-50">
            <div class="flex items-start justify-between">
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-2">
                  <span class="font-medium">Usuario ID: {{ request.userId }}</span>
                  <Badge variant="outline">{{ request.requestedRole }}</Badge>
                  <Badge variant="secondary">Pendiente</Badge>
                </div>
                <p v-if="request.message" class="text-sm text-gray-600 mb-2">
                  "{{ request.message }}"
                </p>
                <p class="text-xs text-gray-500">
                  Solicitado el {{ formatDate(request.requestedAt) }}
                </p>
              </div>
              <div class="flex gap-2">
                <Button size="sm" @click="approveRequest(request)" variant="default">
                  <Check class="w-4 h-4" />
                </Button>
                <Button size="sm" @click="rejectRequest(request)" variant="destructive">
                  <X class="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Current Users Section -->
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center">
          <Users class="w-5 h-5 mr-2" />
          Usuarios en el Retiro
        </CardTitle>
        <CardDescription>
          Lista de usuarios con acceso a este retiro y sus roles asignados
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div v-if="retreatUsers.length === 0" class="text-center py-8 text-gray-500">
          No hay usuarios asignados a este retiro
        </div>
        <div v-else class="space-y-4">
          <div v-for="user in retreatUsers" :key="user.userId" 
               class="border rounded-lg p-4">
            <div class="flex items-start justify-between">
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-2">
                  <span class="font-medium">Usuario ID: {{ user.userId }}</span>
                  <Badge :variant="getRoleBadgeVariant('default')">
                    Usuario
                  </Badge>
                  <Badge v-if="user.status !== 'active'" :variant="getStatusBadgeVariant(user.status)">
                    {{ getStatusText(user.status) }}
                  </Badge>
                  <Badge v-if="user.invitedBy" variant="outline" class="text-xs">
                    Invitado
                  </Badge>
                </div>
                <div v-if="user.expiresAt" class="text-sm text-amber-600 mb-2">
                  <Clock class="w-4 h-4 inline mr-1" />
                  Expira el {{ formatDate(user.expiresAt) }}
                </div>
                <div v-if="user.permissionsOverride" class="text-sm text-blue-600 mb-2">
                  <Shield class="w-4 h-4 inline mr-1" />
                  Tiene permisos personalizados
                </div>
                <p v-if="user.invitedBy" class="text-xs text-gray-500">
                  Invitado el {{ user.invitedAt ? formatDate(user.invitedAt) : 'Fecha desconocida' }}
                </p>
              </div>
              <div class="flex gap-2">
                <Button 
                  v-if="isRetreatCreator && user.userId !== currentUserId" 
                  size="sm" 
                  @click="openPermissionOverrides(user)"
                  variant="outline">
                  <Settings class="w-4 h-4" />
                </Button>
                <Button 
                  v-if="isRetreatCreator && user.userId !== currentUserId" 
                  size="sm" 
                  @click="removeUser(user)"
                  variant="destructive">
                  <UserMinus class="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Invite Users Modal -->
    <InviteUsersModal
      :is-open="showInviteModal"
      :retreat-id="retreatId"
      @close="showInviteModal = false"
    />

    <!-- Permission Overrides Modal -->
    <Dialog :open="showPermissionModal" @update:open="showPermissionModal = $event">
      <DialogContent class="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Permisos Personalizados</DialogTitle>
          <DialogDescription>
            Gestiona permisos personalizados para el usuario ID: {{ selectedUser?.userId }}
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium">Permisos Personalizados</span>
            <Button size="sm" @click="addPermissionOverride">
              <Plus class="w-4 h-4 mr-1" />
              Agregar Permiso
            </Button>
          </div>
          
          <div v-if="permissionOverrides.length === 0" class="text-center py-4 text-gray-500">
            No hay permisos personalizados configurados
          </div>
          
          <div v-else class="space-y-2">
            <div v-for="(override, index) in permissionOverrides" :key="index" 
                 class="flex items-center gap-2 p-3 border rounded">
              <Select v-model="override.resource" class="flex-1">
                <SelectTrigger>
                  <SelectValue placeholder="Recurso" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="resource in availableResources" :key="resource" :value="resource">
                    {{ resource }}
                  </SelectItem>
                </SelectContent>
              </Select>
              
              <Select v-model="override.operation" class="flex-1">
                <SelectTrigger>
                  <SelectValue placeholder="Operación" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="operation in availableOperations" :key="operation" :value="operation">
                    {{ operation }}
                  </SelectItem>
                </SelectContent>
              </Select>
              
              <Switch v-model:checked="override.granted" />
              <span class="text-sm">{{ override.granted ? 'Permitir' : 'Denegar' }}</span>
              
              <Button size="sm" variant="ghost" @click="removePermissionOverride(index)">
                <X class="w-4 h-4" />
              </Button>
            </div>
          </div>
          
          <div class="grid grid-cols-2 gap-4">
            <div>
              <Label for="expiresAt">Expira</Label>
              <Input id="expiresAt" v-model="overridesForm.expiresAt" type="datetime-local" />
            </div>
            <div>
              <Label for="reason">Razón</Label>
              <Input id="reason" v-model="overridesForm.reason" placeholder="Opcional" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="showPermissionModal = false">
            Cancelar
          </Button>
          <Button @click="savePermissionOverrides">
            Guardar Cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Request Action Modal -->
    <Dialog :open="showRequestModal" @update:open="showRequestModal = $event">
      <DialogContent class="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {{ requestAction === 'approve' ? 'Aprobar Solicitud' : 'Rechazar Solicitud' }}
          </DialogTitle>
          <DialogDescription>
            {{ requestAction === 'approve' 
              ? '¿Estás seguro de aprobar esta solicitud de rol?' 
              : 'Por favor, proporciona una razón para rechazar esta solicitud.' }}
          </DialogDescription>
        </DialogHeader>
        <form @submit.prevent="processRequestAction">
          <div v-if="requestAction === 'reject'" class="grid gap-4 py-4">
            <div class="grid grid-cols-4 items-center gap-4">
              <Label for="rejectionReason" class="text-right">Razón</Label>
              <Textarea id="rejectionReason" v-model="requestForm.rejectionReason" 
                        class="col-span-3" required placeholder="Explica por qué se rechaza la solicitud" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" @click="showRequestModal = false">
              Cancelar
            </Button>
            <Button :variant="requestAction === 'approve' ? 'default' : 'destructive'" 
                    type="submit" :disabled="requestAction === 'reject' && !requestForm.rejectionReason">
              {{ requestAction === 'approve' ? 'Aprobar' : 'Rechazar' }}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useToast } from '@repo/ui'
import {
  Card, CardHeader, CardTitle, CardDescription, CardContent,
  Button, Badge, Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter, Label, Input, Select, SelectTrigger,
  SelectValue, SelectContent, SelectGroup, SelectItem, Textarea, Switch
} from '@repo/ui'
import {
  UserPlus, RefreshCw, UserCheck, Users, Check, X, Clock, Shield,
  Settings, UserMinus, Plus
} from 'lucide-vue-next'
import InviteUsersModal from '@/components/InviteUsersModal.vue'
import { useAuthStore } from '@/stores/authStore'
import api from '@/services/api'
import type {
  RoleRequest,
  UserRetreat,
  PermissionOverride,
  User
} from '@repo/types'
import { formatDate } from '@repo/utils'

const route = useRoute()
const { toast } = useToast()
const authStore = useAuthStore()

const retreatId = route.params.id as string
const currentUserId = computed(() => authStore.user?.id || '')

// State
const retreatUsers = ref<UserRetreat[]>([])
const pendingRequests = ref<RoleRequest[]>([])
const showInviteModal = ref(false)
const showPermissionModal = ref(false)
const showRequestModal = ref(false)
const selectedUser = ref<UserRetreat | null>(null)
const selectedRequest = ref<RoleRequest | null>(null)
const requestAction = ref<'approve' | 'reject'>('approve')

// Forms

const requestForm = ref({
  rejectionReason: ''
})

const overridesForm = ref({
  expiresAt: '',
  reason: ''
})

const permissionOverrides = ref<PermissionOverride[]>([])

// Computed
const isRetreatCreator = computed(() => {
  // This should be determined by checking if the current user created the retreat
  return true // Simplified for now
})


const availableResources = Object.values([
  'house', 'inventoryItem', 'retreat', 'participant', 'user', 'table', 'payment'
])

const availableOperations = ['create', 'read', 'update', 'delete', 'list']

// Methods
const loadData = async () => {
  try {
    const [usersResponse, requestsResponse] = await Promise.all([
      api.get(`/retreat-roles/retreat/${retreatId}/users`),
      api.get(`/role-requests/retreat/${retreatId}`)
    ])

    retreatUsers.value = usersResponse.data
    pendingRequests.value = requestsResponse.data.filter((r: any) => r.status === 'pending')
  } catch (error) {
    toast({
      title: 'Error',
      description: 'No se pudo cargar la información del retiro',
      variant: 'destructive'
    })
  }
}

const refreshData = () => {
  loadData()
}

const openInviteModal = () => {
  showInviteModal.value = true
}


const approveRequest = async (request: RoleRequest) => {
  selectedRequest.value = request
  requestAction.value = 'approve'
  showRequestModal.value = true
}

const rejectRequest = async (request: RoleRequest) => {
  selectedRequest.value = request
  requestAction.value = 'reject'
  requestForm.value.rejectionReason = ''
  showRequestModal.value = true
}

const processRequestAction = async () => {
  if (!selectedRequest.value) return

  try {
    await api.put(`/role-requests/${selectedRequest.value.id}`, {
      status: requestAction.value,
      rejectionReason: requestForm.value.rejectionReason
    })

    toast({
      title: 'Solicitud procesada',
      description: `La solicitud ha sido ${requestAction.value === 'approve' ? 'aprobada' : 'rechazada'}`
    })

    showRequestModal.value = false
    loadData()
  } catch (error) {
    toast({
      title: 'Error',
      description: 'No se pudo procesar la solicitud',
      variant: 'destructive'
    })
  }
}

const openPermissionOverrides = async (user: UserRetreat) => {
  selectedUser.value = user
  showPermissionModal.value = true

  try {
    const response = await api.get(`/permission-overrides/retreats/${retreatId}/users/${user.userId}/overrides`)
    permissionOverrides.value = response.data
  } catch (error) {
    permissionOverrides.value = []
  }
}

const addPermissionOverride = () => {
  permissionOverrides.value.push({
    resource: '',
    operation: '',
    granted: true
  })
}

const removePermissionOverride = (index: number) => {
  permissionOverrides.value.splice(index, 1)
}

const savePermissionOverrides = async () => {
  if (!selectedUser.value) return

  try {
    await api.post(`/permission-overrides/retreats/${retreatId}/users/${selectedUser.value.userId}/overrides`, {
      overrides: permissionOverrides.value,
      reason: overridesForm.value.reason
    })

    toast({
      title: 'Permisos actualizados',
      description: 'Los permisos personalizados han sido guardados'
    })

    showPermissionModal.value = false
    loadData()
  } catch (error) {
    toast({
      title: 'Error',
      description: 'No se pudieron guardar los permisos',
      variant: 'destructive'
    })
  }
}

const removeUser = async (user: UserRetreat) => {
  if (!confirm(`¿Estás seguro de que quieres eliminar al usuario ID: ${user.userId} del retiro ID: ${retreatId}?`)) {
    return
  }

  try {
    await api.delete(`/retreat-roles/${retreatId}/users/${user.userId}`)

    toast({
      title: 'Usuario eliminado',
      description: `Usuario ID: ${user.userId} ha sido eliminado del retiro ID: ${retreatId}`
    })

    loadData()
  } catch (error) {
    console.error('Error removing user:', error)
    toast({
      title: 'Error',
      description: 'No se pudo eliminar al usuario del retiro seleccionado',
      variant: 'destructive'
    })
  }
}

const getRoleBadgeVariant = (role: any) => {
  const variants: Record<string, any> = {
    'admin': 'default',
    'regular_server': 'secondary',
    'treasurer': 'outline',
    'logistics': 'secondary',
    'communications': 'outline'
  }
  return variants[role] || 'outline'
}

const getStatusBadgeVariant = (status: string) => {
  const variants: Record<string, any> = {
    'pending': 'secondary',
    'active': 'default',
    'expired': 'destructive',
    'revoked': 'destructive'
  }
  return variants[status] || 'outline'
}

const getStatusText = (status: string) => {
  const texts: Record<string, string> = {
    'pending': 'Pendiente',
    'active': 'Activo',
    'expired': 'Expirado',
    'revoked': 'Revocado'
  }
  return texts[status] || status
}

onMounted(() => {
  loadData()
})
</script>
