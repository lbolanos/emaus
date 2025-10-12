<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[500px]">
      <DialogHeader>
        <DialogTitle>Agregar Usuario al Retiro</DialogTitle>
        <DialogDescription>
          Asigna un usuario existente a un rol en este retiro
        </DialogDescription>
      </DialogHeader>
      
      <form @submit.prevent="submitForm" class="space-y-4">
        <!-- User Search -->
        <div class="space-y-2">
          <Label for="userSearch">Buscar Usuario</Label>
          <div class="relative">
            <Input
              id="userSearch"
              v-model="searchQuery"
              placeholder="Buscar por nombre o email..."
              @input="searchUsers"
              class="pr-10"
            />
            <Search class="absolute right-3 top-2.5 h-4 w-4 text-gray-400" />
          </div>
          
          <!-- User Results -->
          <div v-if="showUserResults" class="border rounded-md max-h-60 overflow-y-auto">
            <div
              v-for="user in searchResults"
              :key="user.id"
              class="p-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
              @click="selectUser(user)"
            >
              <div class="flex items-center gap-3">
                <Avatar>
                  <AvatarImage :src="user.photo" />
                  <AvatarFallback>{{ getInitials(user.displayName) }}</AvatarFallback>
                </Avatar>
                <div class="flex-1">
                  <div class="font-medium">{{ user.displayName }}</div>
                  <div class="text-sm text-gray-500">{{ user.email }}</div>
                </div>
              </div>
            </div>
            <div v-if="searchResults.length === 0 && searchQuery" class="p-3 text-gray-500 text-center">
              No se encontraron usuarios
            </div>
          </div>
        </div>

        <!-- Selected User -->
        <div v-if="selectedUser" class="p-3 bg-gray-50 rounded-md">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <Avatar>
                <AvatarImage :src="selectedUser.photo" />
                <AvatarFallback>{{ getInitials(selectedUser.displayName) }}</AvatarFallback>
              </Avatar>
              <div>
                <div class="font-medium">{{ selectedUser.displayName }}</div>
                <div class="text-sm text-gray-500">{{ selectedUser.email }}</div>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              @click="clearSelectedUser"
            >
              <X class="w-4 h-4" />
            </Button>
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

        <!-- Expiration Date -->
        <div class="space-y-2">
          <Label for="expiresAt">Fecha de Expiración (opcional)</Label>
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

        <!-- Message -->
        <div class="space-y-2">
          <Label for="message">Mensaje (opcional)</Label>
          <Textarea
            id="message"
            v-model="form.message"
            placeholder="Mensaje de bienvenida o instrucciones..."
            rows="3"
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" @click="emit('update:open', false)">
            Cancelar
          </Button>
          <Button 
            type="submit" 
            :disabled="!selectedUser || !form.roleId || loading"
          >
            <Loader2 v-if="loading" class="w-4 h-4 mr-2 animate-spin" />
            Agregar Usuario
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
import { Search, X, Loader2 } from 'lucide-vue-next'
import { 
  assignRetreatRole, 
  getAvailableRoles, 
  getRetreatUsers,
} from '@/services/api'
import type { User } from '@repo/types'

interface Props {
  open: boolean
  retreatId: string
}

interface Emits {
  'update:open': [value: boolean]
  'user-added': []
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const { toast } = useToast()

// State
const loading = ref(false)
const availableRoles = ref<any[]>([])
const searchResults = ref<User[]>([])
const selectedUser = ref<User | null>(null)

// Form
const form = reactive({
  roleId: '',
  expiresAt: '',
  message: ''
})

// Search
const searchQuery = ref('')
const showUserResults = ref(false)
const searchTimeout = ref<NodeJS.Timeout>()

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

const searchUsers = async () => {
  clearTimeout(searchTimeout.value)
  
  if (!searchQuery.value.trim()) {
    searchResults.value = []
    showUserResults.value = false
    return
  }

  searchTimeout.value = setTimeout(async () => {
    try {
      // This would be a new API endpoint to search users
      // For now, we'll use a mock implementation
      searchResults.value = [] // Replace with actual search
      showUserResults.value = true
    } catch (error) {
      console.error('Error searching users:', error)
    }
  }, 300)
}

const selectUser = (user: User) => {
  selectedUser.value = user
  searchQuery.value = ''
  searchResults.value = []
  showUserResults.value = false
}

const clearSelectedUser = () => {
  selectedUser.value = null
}

const submitForm = async () => {
  if (!selectedUser.value || !form.roleId) return

  try {
    loading.value = true

    await assignRetreatRole({
      userId: selectedUser.value.id,
      retreatId: props.retreatId,
      roleId: parseInt(form.roleId),
      invitedBy: 'current-user-id', // This would come from auth store
      expiresAt: form.expiresAt ? new Date(form.expiresAt) : undefined
    })

    toast({
      title: 'Usuario Agregado',
      description: `${selectedUser.value.displayName} ha sido agregado al retiro`
    })

    // Reset form
    selectedUser.value = null
    form.roleId = ''
    form.expiresAt = ''
    form.message = ''

    emit('user-added')
    emit('update:open', false)
  } catch (error) {
    toast({
      title: 'Error',
      description: 'No se pudo agregar el usuario al retiro',
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

// Watchers
watch(() => props.open, (newValue) => {
  if (newValue) {
    loadRoles()
  } else {
    // Reset form when modal closes
    selectedUser.value = null
    searchQuery.value = ''
    searchResults.value = []
    showUserResults.value = false
    form.roleId = ''
    form.expiresAt = ''
    form.message = ''
  }
})

// Lifecycle
onMounted(() => {
  loadRoles()
})
</script>