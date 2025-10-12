<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[500px]">
      <DialogHeader>
        <DialogTitle>Editar Usuario del Retiro</DialogTitle>
        <DialogDescription>
          Modifica el rol y permisos del usuario en este retiro
        </DialogDescription>
      </DialogHeader>
      
      <form @submit.prevent="submitForm" class="space-y-4" v-if="user">
        <!-- User Info -->
        <div class="p-3 bg-gray-50 rounded-md">
          <div class="flex items-center gap-3">
            <Avatar>
              <AvatarImage :src="user?.user?.photo" />
              <AvatarFallback>{{ getInitials(user?.user?.displayName || '') }}</AvatarFallback>
            </Avatar>
            <div>
              <div class="font-medium">{{ user?.user?.displayName }}</div>
              <div class="text-sm text-gray-500">{{ user?.user?.email }}</div>
              <Badge :variant="getStatusVariant(user?.status)" class="mt-1">
                {{ getStatusText(user?.status) }}
              </Badge>
            </div>
          </div>
        </div>

        <!-- Role Selection -->
        <div class="space-y-2">
          <Label for="role">Rol</Label>
          <Select v-model="form.roleId" required>
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar rol" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="role in availableRoles" :key="role.id || role" :value="role.id || role">
                <div class="flex items-center gap-2">
                  <Badge :variant="getRoleVariant(role.name || role)" class="text-xs">
                    {{ role.name || role }}
                  </Badge>
                  <span v-if="role.description" class="text-sm">{{ role.description }}</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- Status Selection -->
        <div class="space-y-2">
          <Label for="status">Estado</Label>
          <Select v-model="form.status" required>
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">
                <div class="flex items-center gap-2">
                  <div class="w-2 h-2 bg-green-500 rounded-full"></div>
                  Activo
                </div>
              </SelectItem>
              <SelectItem value="pending">
                <div class="flex items-center gap-2">
                  <div class="w-2 h-2 bg-yellow-500 rounded-full"></div>
                  Pendiente
                </div>
              </SelectItem>
              <SelectItem value="revoked">
                <div class="flex items-center gap-2">
                  <div class="w-2 h-2 bg-red-500 rounded-full"></div>
                  Revocado
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- Expiration Date -->
        <div class="space-y-2">
          <Label for="expiresAt">Fecha de Expiración</Label>
          <Input
            id="expiresAt"
            v-model="form.expiresAt"
            type="date"
            :min="minDate"
          />
          <p class="text-xs text-gray-500">
            Deja vacío para acceso permanente
          </p>
        </div>

        <!-- Reason for Change -->
        <div class="space-y-2">
          <Label for="reason">Motivo del Cambio</Label>
          <Textarea
            id="reason"
            v-model="form.reason"
            placeholder="Explica el motivo de este cambio..."
            rows="3"
          />
        </div>

        <!-- Current Permissions Preview -->
        <div class="space-y-2">
          <Label>Permisos Actuales</Label>
          <div class="p-3 bg-gray-50 rounded-md">
            <div v-if="permissions.length > 0" class="space-y-1">
              <Badge 
                v-for="permission in permissions" 
                :key="permission" 
                variant="outline" 
                class="mr-1 mb-1 text-xs"
              >
                {{ permission }}
              </Badge>
            </div>
            <div v-else class="text-gray-500 text-sm">
              No hay permisos asignados
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" @click="emit('update:open', false)">
            Cancelar
          </Button>
          <Button 
            type="submit" 
            variant="default"
            :disabled="loading || !form.roleId"
          >
            <Loader2 v-if="loading" class="w-4 h-4 mr-2 animate-spin" />
            Guardar Cambios
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useToast } from '@repo/ui';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Label, Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Input, Textarea, Button, Avatar, AvatarImage, AvatarFallback, Badge
} from '@repo/ui';
import { Loader2 } from 'lucide-vue-next'
import { 
  updateUserRetreatRole, 
  getAvailableRoles, 
  getUserRetreatPermissions
} from '@/services/api'
import type { UserRetreat, User } from '@repo/types'

interface Props {
  open: boolean
  user: (UserRetreat & { user?: User }) | null
  retreatId: string
}

interface Emits {
  'update:open': [value: boolean]
  'user-updated': []
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const { toast } = useToast()

// State
const loading = ref(false)
const availableRoles = ref<any[]>([])
const permissions = ref<string[]>([])

// Form
const form = reactive({
  roleId: '',
  status: 'active',
  expiresAt: '',
  reason: ''
})

// Computed
const minDate = computed(() => {
  return new Date().toISOString().split('T')[0]
})

// Methods
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

const loadUserPermissions = async () => {
  if (!props.user) return

  try {
    const response = await getUserRetreatPermissions(props.retreatId, props.user.userId)
    permissions.value = response.data.permissions || []
  } catch (error) {
    console.error('Error loading user permissions:', error)
  }
}

const submitForm = async () => {
  if (!props.user || !form.roleId) return

  try {
    loading.value = true

    await updateUserRetreatRole(props.retreatId, props.user.userId, {
      roleId: parseInt(form.roleId),
      expiresAt: form.expiresAt ? new Date(form.expiresAt) : undefined
    })

    toast({
      title: 'Usuario Actualizado',
      description: `El rol de ${props.user?.user?.displayName} ha sido actualizado`
    })

    emit('user-updated')
    emit('update:open', false)
  } catch (error) {
    toast({
      title: 'Error',
      description: 'No se pudo actualizar el usuario',
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

// Watchers
watch(() => props.open, (newValue) => {
  if (newValue && props.user) {
    // Initialize form with user data
    form.roleId = props.user?.roleId?.toString() || ''
    form.status = props.user.status || 'active'
    form.expiresAt = props.user.expiresAt ? 
      new Date(props.user.expiresAt).toISOString().split('T')[0] : ''
    form.reason = ''
    
    loadRoles()
    loadUserPermissions()
  }
})

watch(() => props.user, (newUser) => {
  if (newUser) {
    form.roleId = newUser?.roleId?.toString() || ''
    form.status = newUser.status || 'active'
    form.expiresAt = newUser.expiresAt ? 
      new Date(newUser.expiresAt).toISOString().split('T')[0] : ''
    form.reason = ''
    loadUserPermissions()
  }
})
</script>