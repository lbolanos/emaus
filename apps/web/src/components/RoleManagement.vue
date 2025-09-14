<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex justify-between items-center">
      <div>
        <h2 class="text-2xl font-bold text-gray-900">Gestión de Roles</h2>
        <p class="text-gray-600">Administra roles y permisos para el retiro</p>
      </div>
      <div class="flex gap-2">
        <Button @click="showAddUserModal = true" variant="default">
          <UserPlus class="w-4 h-4 mr-2" />
          Agregar Usuario
        </Button>
        <Button @click="showPermissionDelegationModal = true" variant="outline">
          <Share2 class="w-4 h-4 mr-2" />
          Delegar Permisos
        </Button>
        <Button @click="showAuditModal = true" variant="outline">
          <FileText class="w-4 h-4 mr-2" />
          Ver Auditoría
        </Button>
      </div>
    </div>

    <!-- Filters -->
    <Card>
      <CardHeader>
        <CardTitle class="text-lg">Filtros</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <Label for="roleFilter">Rol</Label>
            <Select v-model="filters.role" @update:model-value="applyFilters">
              <SelectTrigger>
                <SelectValue placeholder="Todos los roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todos los roles</SelectItem>
                <SelectItem v-for="role in availableRoles" :key="role.id" :value="role.name">
                  {{ role.name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label for="statusFilter">Estado</Label>
            <Select v-model="filters.status" @update:model-value="applyFilters">
              <SelectTrigger>
                <SelectValue placeholder="Todos los estados" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todos los estados</SelectItem>
                <SelectItem value="active">Activo</SelectItem>
                <SelectItem value="pending">Pendiente</SelectItem>
                <SelectItem value="revoked">Revocado</SelectItem>
                <SelectItem value="expired">Expirado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label for="searchFilter">Buscar</Label>
            <Input
              id="searchFilter"
              v-model="filters.search"
              placeholder="Nombre o email"
              @input="debouncedSearch"
            />
          </div>
          <div class="flex items-end">
            <Button @click="resetFilters" variant="outline" class="w-full">
              <RefreshCw class="w-4 h-4 mr-2" />
              Limpiar
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Users Table -->
    <Card>
      <CardHeader>
        <CardTitle class="text-lg flex justify-between items-center">
          <span>Usuarios del Retiro ({{ pagination.total }})</span>
          <div class="flex items-center gap-2 text-sm text-gray-500">
            <Users class="w-4 h-4" />
            {{ pagination.total }} usuarios
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div class="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuario</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Unido</TableHead>
                <TableHead>Expira</TableHead>
                <TableHead>Permisos</TableHead>
                <TableHead class="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="user in users" :key="user.id">
                <TableCell>
                  <div class="flex items-center gap-3">
                    <Avatar>
                      <AvatarImage :src="user.user?.photo" />
                      <AvatarFallback>{{ getInitials(user.user?.displayName || '') }}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div class="font-medium">{{ user.user?.displayName }}</div>
                      <div class="text-sm text-gray-500">{{ user.user?.email }}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <!-- Role info removed as User type doesn't have role property -->
                </TableCell>
                <TableCell>
                  <Badge :variant="getStatusVariant(user.status)">
                    {{ getStatusText(user.status) }}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div class="text-sm">
                    {{ formatDate(user.createdAt) }}
                  </div>
                </TableCell>
                <TableCell>
                  <div class="text-sm" v-if="user.expiresAt">
                    {{ formatDate(user.expiresAt) }}
                  </div>
                  <div class="text-sm text-gray-500" v-else>
                    Nunca
                  </div>
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    @click="viewPermissions(user)"
                  >
                    <Eye class="w-4 h-4" />
                  </Button>
                </TableCell>
                <TableCell class="text-right">
                  <div class="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      @click="editUser(user)"
                      v-if="canManageUsers"
                    >
                      <Edit class="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      @click="revokeUser(user)"
                      v-if="canManageUsers && user.status === 'active'"
                    >
                      <UserX class="w-4 h-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <!-- Pagination -->
        <div class="flex justify-between items-center mt-4">
          <div class="text-sm text-gray-500">
            Mostrando {{ users.length }} de {{ pagination.total }} usuarios
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
      </CardContent>
    </Card>

    <!-- Add User Modal -->
    <AddUserToRetreatModal
      v-model:open="showAddUserModal"
      :retreat-id="retreatId"
      @user-added="loadUsers"
    />

    <!-- Edit User Modal -->
    <EditRetreatUserModal
      v-model:open="showEditUserModal"
      :user="selectedUser"
      :retreat-id="retreatId"
      @user-updated="loadUsers"
    />

    <!-- Permission Delegation Modal -->
    <PermissionDelegationModal
      v-model:open="showPermissionDelegationModal"
      :retreat-id="retreatId"
      @delegation-created="loadUsers"
    />

    <!-- Audit Modal -->
    <AuditLogsModal
      v-model:open="showAuditModal"
      :retreat-id="retreatId"
    />

    <!-- User Permissions Modal -->
    <UserPermissionsModal
      v-model:open="showPermissionsModal"
      :user="selectedUser"
      :retreat-id="retreatId"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import { useToast } from '@repo/ui'
import {
  Card, CardHeader, CardTitle, CardContent,
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
  Badge, Button, Label, Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Input, Avatar, AvatarImage, AvatarFallback
} from '@repo/ui'
import {
  UserPlus, Share2, FileText, RefreshCw, Users, Eye, Edit, UserX,
  ChevronLeft, ChevronRight
} from 'lucide-vue-next'
import {
  getRetreatUsersWithFilters, getAvailableRoles
} from '@/services/api'
import type { UserRetreat, User } from '@repo/types'
import AddUserToRetreatModal from './AddUserToRetreatModal.vue'
import EditRetreatUserModal from './EditRetreatUserModal.vue'
import PermissionDelegationModal from './PermissionDelegationModal.vue'
import AuditLogsModal from './AuditLogsModal.vue'
import UserPermissionsModal from './UserPermissionsModal.vue'

interface Props {
  retreatId: string
}

const props = defineProps<Props>()

const { toast } = useToast()

// State
const users = ref<(UserRetreat & { user?: User })[]>([])
const availableRoles = ref<any[]>([])
const loading = ref(false)
const selectedUser = ref<(UserRetreat & { user?: User }) | null>(null)

// Modals
const showAddUserModal = ref(false)
const showEditUserModal = ref(false)
const showPermissionDelegationModal = ref(false)
const showAuditModal = ref(false)
const showPermissionsModal = ref(false)

// Filters
const filters = reactive({
  role: '',
  status: '',
  search: ''
})

// Pagination
const pagination = reactive({
  total: 0,
  offset: 0,
  limit: 20,
  hasMore: false
})

// Permissions
const canManageUsers = computed(() => {
  // This would come from your auth store
  return true // Placeholder
})

// Debounced search
let searchTimeout: NodeJS.Timeout
const debouncedSearch = () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    pagination.offset = 0
    loadUsers()
  }, 300)
}

// Methods
const loadUsers = async () => {
  try {
    loading.value = true
    const response = await getRetreatUsersWithFilters(props.retreatId, {
      role: filters.role || undefined,
      status: filters.status || undefined,
      limit: pagination.limit,
      offset: pagination.offset
    })
    
    users.value = response.data.users
    pagination.total = response.data.total
    pagination.hasMore = response.data.hasMore
  } catch (error) {
    toast({
      title: 'Error',
      description: 'No se pudo cargar la lista de usuarios',
      variant: 'destructive'
    })
  } finally {
    loading.value = false
  }
}

const loadRoles = async () => {
  try {
    const response = await getAvailableRoles()
    availableRoles.value = response.data
  } catch (error) {
    toast({
      title: 'Error',
      description: 'No se pudo cargar la lista de roles',
      variant: 'destructive'
    })
  }
}

const applyFilters = () => {
  pagination.offset = 0
  loadUsers()
}

const resetFilters = () => {
  filters.role = ''
  filters.status = ''
  filters.search = ''
  pagination.offset = 0
  loadUsers()
}

const previousPage = () => {
  if (pagination.offset > 0) {
    pagination.offset -= pagination.limit
    loadUsers()
  }
}

const nextPage = () => {
  if (pagination.hasMore) {
    pagination.offset += pagination.limit
    loadUsers()
  }
}

const editUser = (user: UserRetreat) => {
  selectedUser.value = user as (UserRetreat & { user?: User })
  showEditUserModal.value = true
}

const revokeUser = async (user: UserRetreat) => {
  // This would open a confirmation dialog
  console.log('Revoke user:', user)
}

const viewPermissions = (user: UserRetreat) => {
  selectedUser.value = user as (UserRetreat & { user?: User })
  showPermissionsModal.value = true
}

const getInitials = (name: string) => {
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .substring(0, 2)
}

const formatDate = (date: string | Date) => {
  return new Date(date).toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

const getRoleVariant = (role: string) => {
  const variants: Record<string, any> = {
    'retreat_admin': 'default',
    'retreat_manager': 'secondary',
    'retreat_user': 'outline',
    'tesorero': 'destructive'
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

// Lifecycle
onMounted(() => {
  loadUsers()
  loadRoles()
})
</script>