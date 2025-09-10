<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex justify-between items-center">
      <div>
        <h1 class="text-3xl font-bold">Artículos de Inventario</h1>
        <p class="text-gray-600">Gestiona los artículos disponibles para los retiros</p>
      </div>
      <Button @click="showCreateDialog = true">
        <Plus class="w-4 h-4 mr-2" />
        Nuevo Artículo
      </Button>
    </div>

    <!-- Filters -->
    <Card>
      <CardContent class="pt-6">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>Categoría</Label>
            <Select v-model="selectedCategory">
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las categorías</SelectItem>
                <SelectItem v-for="category in categories" :key="category.id" :value="category.id">
                  {{ category.name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Equipo</Label>
            <Select v-model="selectedTeam">
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar equipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los equipos</SelectItem>
                <SelectItem v-for="team in teams" :key="team.id" :value="team.id">
                  {{ team.name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Buscar</Label>
            <Input
              v-model="searchQuery"
              placeholder="Buscar artículos..."
            />
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Items Table -->
    <Card>
      <CardHeader>
        <CardTitle>Artículos</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="border-b">
                <th class="text-left py-3 px-4">Artículo</th>
                <th class="text-left py-3 px-4">Categoría</th>
                <th class="text-left py-3 px-4">Equipo</th>
                <th class="text-center py-3 px-4">Ratio</th>
                <th class="text-center py-3 px-4">Cantidad Fija</th>
                <th class="text-center py-3 px-4">Unidad</th>
                <th class="text-center py-3 px-4">Estado</th>
                <th class="text-center py-3 px-4">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in filteredItems" :key="item.id" class="border-b hover:bg-gray-50">
                <td class="py-3 px-4">
                  <div>
                    <div class="font-medium">{{ item.name }}</div>
                    <div class="text-sm text-gray-500">{{ item.description }}</div>
                  </div>
                </td>
                <td class="py-3 px-4">{{ item.category.name }}</td>
                <td class="py-3 px-4">{{ item.team.name }}</td>
                <td class="text-center py-3 px-4">{{ item.ratio }}</td>
                <td class="text-center py-3 px-4">{{ item.requiredQuantity || '-' }}</td>
                <td class="text-center py-3 px-4">{{ item.unit }}</td>
                <td class="text-center py-3 px-4">
                  <Badge :variant="item.isActive ? 'default' : 'secondary'">
                    {{ item.isActive ? 'Activo' : 'Inactivo' }}
                  </Badge>
                </td>
                <td class="text-center py-3 px-4">
                  <div class="flex justify-center gap-2">
                    <Button
                      @click="openEditDialog(item)"
                      variant="outline"
                      size="sm"
                    >
                      <Pencil class="w-4 h-4" />
                    </Button>
                    <Button
                      @click="toggleItemStatus(item)"
                      variant="outline"
                      size="sm"
                    >
                      <Power class="w-4 h-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>

    <!-- Create Dialog -->
    <Dialog v-model:open="showCreateDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crear Nuevo Artículo</DialogTitle>
          <DialogDescription>
            Agrega un nuevo artículo al inventario
          </DialogDescription>
        </DialogHeader>
        <form @submit.prevent="createItem" class="space-y-4">
          <div>
            <Label for="name">Nombre</Label>
            <Input
              id="name"
              v-model="newItem.name"
              required
              placeholder="Nombre del artículo"
            />
          </div>
          <div>
            <Label for="description">Descripción</Label>
            <Textarea
              id="description"
              v-model="newItem.description"
              placeholder="Descripción del artículo"
            />
          </div>
          <div>
            <Label for="category">Categoría</Label>
            <Select v-model="newItem.categoryId" required>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="category in categories" :key="category.id" :value="category.id">
                  {{ category.name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label for="team">Equipo</Label>
            <Select v-model="newItem.teamId" required>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar equipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="team in teams" :key="team.id" :value="team.id">
                  {{ team.name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label for="ratio">Ratio por Caminante</Label>
            <Input
              id="ratio"
              v-model.number="newItem.ratio"
              type="number"
              step="0.01"
              required
              placeholder="1.0"
            />
            <p class="text-sm text-gray-500 mt-1">
              Deja en blanco o usa 0 si usarás cantidad fija
            </p>
          </div>
          <div>
            <Label for="requiredQuantity">Cantidad Fija (opcional)</Label>
            <Input
              id="requiredQuantity"
              v-model.number="newItem.requiredQuantity"
              type="number"
              step="0.01"
              placeholder="Cantidad fija no dependiente de caminantes"
            />
            <p class="text-sm text-gray-500 mt-1">
              Si especificas cantidad fija, el ratio no se usará
            </p>
          </div>
          <div>
            <Label for="unit">Unidad</Label>
            <Input
              id="unit"
              v-model="newItem.unit"
              required
              placeholder="unidades, cajas, litros, etc."
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" @click="showCreateDialog = false">Cancelar</Button>
            <Button type="submit">Crear</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <!-- Edit Dialog -->
    <Dialog v-model:open="showEditDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar Artículo</DialogTitle>
          <DialogDescription>
            Actualiza la información del artículo
          </DialogDescription>
        </DialogHeader>
        <form @submit.prevent="updateItem" class="space-y-4">
          <div>
            <Label for="edit-name">Nombre</Label>
            <Input
              id="edit-name"
              v-model="editingItem.name"
              required
              placeholder="Nombre del artículo"
            />
          </div>
          <div>
            <Label for="edit-description">Descripción</Label>
            <Textarea
              id="edit-description"
              v-model="editingItem.description"
              placeholder="Descripción del artículo"
            />
          </div>
          <div>
            <Label for="edit-category">Categoría</Label>
            <Select v-model="editingItem.categoryId" required>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="category in categories" :key="category.id" :value="category.id">
                  {{ category.name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label for="edit-team">Equipo</Label>
            <Select v-model="editingItem.teamId" required>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar equipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="team in teams" :key="team.id" :value="team.id">
                  {{ team.name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label for="edit-ratio">Ratio por Caminante</Label>
            <Input
              id="edit-ratio"
              v-model.number="editingItem.ratio"
              type="number"
              step="0.01"
              required
              placeholder="1.0"
            />
            <p class="text-sm text-gray-500 mt-1">
              Deja en blanco o usa 0 si usarás cantidad fija
            </p>
          </div>
          <div>
            <Label for="edit-requiredQuantity">Cantidad Fija (opcional)</Label>
            <Input
              id="edit-requiredQuantity"
              v-model.number="editingItem.requiredQuantity"
              type="number"
              step="0.01"
              placeholder="Cantidad fija no dependiente de caminantes"
            />
            <p class="text-sm text-gray-500 mt-1">
              Si especificas cantidad fija, el ratio no se usará
            </p>
          </div>
          <div>
            <Label for="edit-unit">Unidad</Label>
            <Input
              id="edit-unit"
              v-model="editingItem.unit"
              required
              placeholder="unidades, cajas, litros, etc."
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" @click="showEditDialog = false">Cancelar</Button>
            <Button type="submit">Actualizar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useInventoryStore } from '@/stores/inventoryStore';
import { useToast } from '@repo/ui/components/ui/toast/use-toast';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@repo/ui/components/ui/card';
import { Button } from '@repo/ui/components/ui/button';
import { Badge } from '@repo/ui/components/ui/badge';
import { Input } from '@repo/ui/components/ui/input';
import { Label } from '@repo/ui/components/ui/label';
import { Textarea } from '@repo/ui/components/ui/textarea';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@repo/ui/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@repo/ui/components/ui/dialog';
import {
  Plus,
  Pencil,
  Power,
} from 'lucide-vue-next';

const inventoryStore = useInventoryStore();
const { toast } = useToast();

const showCreateDialog = ref(false);
const showEditDialog = ref(false);
const editingItem = ref<any>(null);
const selectedCategory = ref('');
const selectedTeam = ref('');
const searchQuery = ref('');

const newItem = ref({
  name: '',
  description: '',
  categoryId: '',
  teamId: '',
  ratio: 1.0,
  requiredQuantity: null,
  unit: '',
});

const categories = computed(() => inventoryStore.categories);
const teams = computed(() => inventoryStore.teams);
const items = computed(() => inventoryStore.items);

const filteredItems = computed(() => {
  return items.value.filter(item => {
    const matchesCategory = !selectedCategory.value || selectedCategory.value === 'all' || item.categoryId === selectedCategory.value;
    const matchesTeam = !selectedTeam.value || selectedTeam.value === 'all' || item.teamId === selectedTeam.value;
    const matchesSearch = !searchQuery.value || 
      item.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      item.description?.toLowerCase().includes(searchQuery.value.toLowerCase());
    
    return matchesCategory && matchesTeam && matchesSearch;
  });
});

onMounted(async () => {
  await inventoryStore.initializeInventoryData();
});

function openEditDialog(item: any) {
  editingItem.value = { ...item };
  showEditDialog.value = true;
}

async function createItem() {
  try {
    await inventoryStore.createItem(newItem.value);
    showCreateDialog.value = false;
    newItem.value = {
      name: '',
      description: '',
      categoryId: '',
      teamId: '',
      ratio: 1.0,
      requiredQuantity: null,
      unit: '',
    };
    toast({
      title: 'Éxito',
      description: 'Artículo creado correctamente',
    });
  } catch (error) {
    toast({
      title: 'Error',
      description: 'No se pudo crear el artículo',
      variant: 'destructive',
    });
  }
}

async function updateItem() {
  try {
    await inventoryStore.updateItem(editingItem.value.id, editingItem.value);
    showEditDialog.value = false;
    editingItem.value = null;
    toast({
      title: 'Éxito',
      description: 'Artículo actualizado correctamente',
    });
  } catch (error) {
    toast({
      title: 'Error',
      description: 'No se pudo actualizar el artículo',
      variant: 'destructive',
    });
  }
}

async function toggleItemStatus(item: any) {
  try {
    await inventoryStore.updateItem(item.id, { isActive: !item.isActive });
    toast({
      title: 'Éxito',
      description: `Artículo ${item.isActive ? 'desactivado' : 'activado'} correctamente`,
    });
  } catch (error) {
    toast({
      title: 'Error',
      description: 'No se pudo cambiar el estado del artículo',
      variant: 'destructive',
    });
  }
}
</script>