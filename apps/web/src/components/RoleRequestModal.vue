<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle>Solicitar Acceso al Retiro</DialogTitle>
        <DialogDescription>
          Solicita acceso a este retiro con un rol específico
        </DialogDescription>
      </DialogHeader>
      <form @submit.prevent="submitRequest">
        <div class="grid gap-4 py-4">
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="role" class="text-right">Rol</Label>
            <Select v-model="form.role" required>
              <SelectTrigger class="col-span-3">
                <SelectValue placeholder="Seleccionar rol" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem v-for="role in availableRoles" :key="role" :value="role">
                    {{ role }}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div class="grid grid-cols-4 items-center gap-4">
            <Label for="message" class="text-right">Mensaje</Label>
            <Textarea id="message" v-model="form.message" class="col-span-3" 
                      placeholder="Explica por qué quieres acceder a este retiro (opcional)" />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" @click="emit('update:open', false)">
            Cancelar
          </Button>
          <Button type="submit" :disabled="!form.role">
            Enviar Solicitud
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useToast } from '@repo/ui'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Label, Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem,
  Textarea, Button
} from '@repo/ui'
import { createRoleRequest } from '@/services/api'

interface Props {
  open: boolean
  retreatId: string
}

interface Emits {
  'update:open': [value: boolean]
  'submitted': []
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const { toast } = useToast()

const form = ref({
  role: '',
  message: ''
})

const availableRoles = [
  'servidor', 'tesorero', 'logística', 'palancas'
]

const submitRequest = async () => {
  try {
    await createRoleRequest({
      retreatId: props.retreatId,
      requestedRole: form.value.role,
      message: form.value.message
    })
    
    toast({
      title: 'Solicitud enviada',
      description: 'Tu solicitud ha sido enviada para revisión'
    })
    
    form.value = { role: '', message: '' }
    emit('submitted')
    emit('update:open', false)
  } catch (error) {
    toast({
      title: 'Error',
      description: 'No se pudo enviar la solicitud',
      variant: 'destructive'
    })
  }
}
</script>