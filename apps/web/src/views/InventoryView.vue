<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex justify-between items-center">
      <div>
        <h1 class="text-3xl font-bold">Gestión de Inventario</h1>
        <p class="text-gray-600">Administra los suministros para el retiro</p>
      </div>
      <div class="flex gap-2">
        <Button @click="calculateQuantities" :disabled="loading">
          <Calculator class="w-4 h-4 mr-2" />
          Calcular Cantidades
        </Button>
        <Button @click="showImportDialog = true" variant="outline">
          <Upload class="w-4 h-4 mr-2" />
          Importar
        </Button>
        <Button @click="exportInventory" variant="outline">
          <Download class="w-4 h-4 mr-2" />
          Exportar
        </Button>
      </div>
    </div>

    <!-- Search Input -->
    <div class="mb-6">
      <div class="relative max-w-md">
        <Search class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <Input
          v-model="searchQuery"
          placeholder="Buscar artículos por nombre, equipo o categoría..."
          class="pl-10 pr-10"
        />
        <button
          v-if="searchQuery"
          @click="searchQuery = ''"
          class="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- Inventory Alerts -->
    <Card v-if="inventoryAlerts.length > 0" class="border-red-200 bg-red-50">
      <CardHeader>
        <CardTitle class="text-red-800 flex items-center">
          <AlertTriangle class="w-5 h-5 mr-2" />
          Alertas de Inventario
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div v-for="alert in inventoryAlerts.slice(0, 4)" :key="alert.id" class="bg-white p-4 rounded-lg border border-red-200">
            <div class="font-medium text-red-800">{{ alert.itemName }}</div>
            <div class="text-sm text-gray-600">{{ alert.categoryName }} - {{ alert.teamName }}</div>
            <div class="text-sm font-medium text-red-600">
              Faltan: {{ alert.deficit }} {{ alert.unit }}
            </div>
            <div class="text-xs text-gray-500">
              Requerido: {{ alert.requiredQuantity }} | Actual: {{ alert.currentQuantity }}
            </div>
          </div>
        </div>
        <div v-if="inventoryAlerts.length > 4" class="mt-3 text-center">
          <Button variant="outline" size="sm" @click="showAllAlerts = true">
            Ver todas las {{ inventoryAlerts.length }} alertas
          </Button>
        </div>
      </CardContent>
    </Card>

    <!-- Loading State -->
    <Card v-if="loading">
      <CardContent class="text-center py-8">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
        <h3 class="text-lg font-medium text-gray-900 mb-2">Cargando inventario...</h3>
      </CardContent>
    </Card>

    <!-- Inventory by Category -->
    <div v-for="(categoryItems, category) in filteredRetreatInventoryByCategory" :key="category" class="space-y-4" v-if="!loading && Object.keys(filteredRetreatInventoryByCategory).length > 0">
      <Card>
        <CardHeader>
          <CardTitle>{{ category }}</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead>
                <tr class="border-b">
                  <th class="text-left py-3 px-4">Artículo</th>
                  <th class="text-left py-3 px-4">Equipo</th>
                  <th class="text-center py-3 px-4">Ratio</th>
                  <th class="text-center py-3 px-4">Requerido</th>
                  <th class="text-center py-3 px-4">Actual</th>
                  <th class="text-center py-3 px-4">Estado</th>
                  <th class="text-left py-3 px-4">Notas</th>
                  <th class="text-center py-3 px-4">Acciones</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in categoryItems" :key="item.id" class="border-b hover:bg-gray-50">
                  <td class="py-3 px-4">
                    <div>
                      <div class="font-medium">{{ item.inventoryItem?.name || 'Sin nombre' }}</div>
                      <div class="text-sm text-gray-500">{{ item.inventoryItem?.description || '' }}</div>
                    </div>
                  </td>
                  <td class="py-3 px-4">{{ item.inventoryItem?.team?.name || 'Sin equipo' }}</td>
                  <td class="text-center py-3 px-4">{{ item.inventoryItem?.ratio || 0 }}</td>
                  <td class="text-center py-3 px-4">{{ item.requiredQuantity }} {{ item.inventoryItem?.unit || '' }}</td>
                  <td class="text-center py-3 px-4">
                    <input
                      v-model.number="item.currentQuantity"
                      type="number"
                      step="0.01"
                      class="w-20 px-2 py-1 border rounded text-center"
                      @change="updateInventory(item)"
                    />
                  </td>
                  <td class="text-center py-3 px-4">
                    <Badge :variant="item.isSufficient ? 'default' : 'destructive'">
                      {{ item.isSufficient ? 'Suficiente' : 'Insuficiente' }}
                    </Badge>
                  </td>
                  <td class="py-3 px-4">
                    <input
                      v-model="item.notes"
                      type="text"
                      class="w-full px-2 py-1 border rounded"
                      @change="updateInventory(item)"
                      placeholder="Notas..."
                    />
                  </td>
                  <td class="text-center py-3 px-4">
                    <Button
                      @click="openEditDialog(item)"
                      variant="outline"
                      size="sm"
                    >
                      <Pencil class="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Empty State -->
    <Card v-if="Object.keys(filteredRetreatInventoryByCategory).length === 0">
      <CardContent class="text-center py-8">
        <Package class="w-12 h-12 mx-auto text-gray-400 mb-4" />
        <h3 v-if="searchQuery" class="text-lg font-medium text-gray-900 mb-2">No se encontraron resultados</h3>
        <h3 v-else class="text-lg font-medium text-gray-900 mb-2">No hay inventario configurado</h3>
        <p v-if="searchQuery" class="text-gray-500 mb-4">No hay artículos que coincidan con "{{ searchQuery }}"</p>
        <p v-else class="text-gray-500 mb-4">Configura los artículos de inventario para este retiro</p>
        <Button v-if="!searchQuery" @click="calculateQuantities">Calcular Cantidades</Button>
      </CardContent>
    </Card>

    <!-- Import Dialog -->
    <Dialog v-model:open="showImportDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importar Inventario</DialogTitle>
          <DialogDescription>
            Importa datos de inventario desde un archivo Excel o CSV
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-4">
          <div class="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
            <Upload class="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <p class="text-gray-600 mb-4">Arrastra un archivo aquí o haz clic para seleccionar</p>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              @change="handleFileUpload"
              class="hidden"
              ref="fileInput"
            />
            <Button @click="fileInput?.click()">Seleccionar Archivo</Button>
          </div>
          <div v-if="importResults" class="space-y-2">
            <div class="text-green-600">
              ✓ {{ importResults.success.length }} items importados correctamente
            </div>
            <div v-if="importResults.errors.length > 0" class="text-red-600">
              ✗ {{ importResults.errors.length }} errores encontrados
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="showImportDialog = false">Cancelar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Edit Dialog -->
    <Dialog v-model:open="showEditDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar Inventario</DialogTitle>
          <DialogDescription>
            Actualiza la información del artículo de inventario
          </DialogDescription>
        </DialogHeader>
        <div v-if="editingItem" class="space-y-4">
          <div>
            <Label>Artículo</Label>
            <Input :value="editingItem.inventoryItem.name" disabled />
          </div>
          <div>
            <Label>Cantidad Actual</Label>
            <Input
              v-model.number="editingItem.currentQuantity"
              type="number"
              step="0.01"
            />
          </div>
          <div>
            <Label>Notas</Label>
            <Textarea v-model="editingItem.notes" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="showEditDialog = false">Cancelar</Button>
          <Button @click="saveEdit">Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- All Alerts Dialog -->
    <Dialog v-model:open="showAllAlerts">
      <DialogContent class="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle class="flex items-center">
            <AlertTriangle class="w-5 h-5 mr-2 text-red-600" />
            Todas las Alertas de Inventario
          </DialogTitle>
        </DialogHeader>
        <div class="space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div v-for="alert in inventoryAlerts" :key="alert.id" class="bg-white p-4 rounded-lg border border-red-200">
              <div class="font-medium text-red-800">{{ alert.itemName }}</div>
              <div class="text-sm text-gray-600">{{ alert.categoryName }} - {{ alert.teamName }}</div>
              <div class="text-sm font-medium text-red-600">
                Faltan: {{ alert.deficit }} {{ alert.unit }}
              </div>
              <div class="text-xs text-gray-500">
                Requerido: {{ alert.requiredQuantity }} | Actual: {{ alert.currentQuantity }}
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="showAllAlerts = false">Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';
import { useInventoryStore } from '@/stores/inventoryStore';
import { useToast } from '@repo/ui';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@repo/ui';
import { Button } from '@repo/ui';
import { Badge } from '@repo/ui';
import { Input } from '@repo/ui';
import { Label } from '@repo/ui';
import { Textarea } from '@repo/ui';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@repo/ui';
import {
  Calculator,
  Upload,
  Download,
  AlertTriangle,
  Package,
  Pencil,
  Search,
  X,
} from 'lucide-vue-next';
import ExcelJS from 'exceljs';

const route = useRoute();
const inventoryStore = useInventoryStore();
const { toast } = useToast();

const retreatId = route.params.id as string;
const showImportDialog = ref(false);
const showEditDialog = ref(false);
const showAllAlerts = ref(false);
const searchQuery = ref('');
const editingItem = ref<any>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const importResults = ref<any>(null);

// Access store properties
const loading = computed(() => inventoryStore.loading);
const inventoryAlerts = computed(() => inventoryStore.inventoryAlerts);
const retreatInventoryByCategory = computed(() => inventoryStore.retreatInventoryByCategory);

// Filter inventory items based on search query
const filteredRetreatInventoryByCategory = computed(() => {
  if (!searchQuery.value.trim()) {
    return retreatInventoryByCategory.value;
  }

  const query = searchQuery.value.toLowerCase().trim();
  const filtered: { [key: string]: any[] } = {};

  Object.entries(retreatInventoryByCategory.value).forEach(([category, items]) => {
    const filteredItems = items.filter((item: any) => {
      const itemName = item.inventoryItem?.name?.toLowerCase() || '';
      const teamName = item.inventoryItem?.team?.name?.toLowerCase() || '';
      const categoryName = category.toLowerCase();

      return itemName.includes(query) ||
             teamName.includes(query) ||
             categoryName.includes(query);
    });

    if (filteredItems.length > 0) {
      filtered[category] = filteredItems;
    }
  });

  return filtered;
});

onMounted(async () => {
  await loadInventoryData();
});

async function loadInventoryData() {
  await Promise.all([
    inventoryStore.fetchRetreatInventoryByCategory(retreatId),
    inventoryStore.fetchInventoryAlerts(retreatId),
  ]);
}

async function calculateQuantities() {
  await inventoryStore.calculateRequiredQuantities(retreatId);
  await loadInventoryData();
}

async function updateInventory(item: any) {
  await inventoryStore.updateRetreatInventory(retreatId, item.inventoryItemId, {
    currentQuantity: item.currentQuantity,
    notes: item.notes,
  });
  await loadInventoryData();
}

function openEditDialog(item: any) {
  editingItem.value = { ...item };
  showEditDialog.value = true;
}

async function saveEdit() {
  if (!editingItem.value) return;
  
  await inventoryStore.updateRetreatInventory(retreatId, editingItem.value.inventoryItemId, {
    currentQuantity: editingItem.value.currentQuantity,
    notes: editingItem.value.notes,
  });
  
  showEditDialog.value = false;
  editingItem.value = null;
  await loadInventoryData();
}

async function exportInventory() {
  try {
    const data = await inventoryStore.exportInventory(retreatId);
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Inventario');

    // Agregar encabezados
    if (data.length > 0) {
      const headers = Object.keys(data[0]);
      worksheet.addRow(headers);

      // Agregar datos
      data.forEach((row: any) => {
        worksheet.addRow(Object.values(row));
      });
    }

    // Configurar estilo para encabezados
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    // Generar archivo
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventario_retiro_${retreatId}.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);

    toast({
      title: 'Exportación Exitosa',
      description: 'El inventario se ha exportado correctamente',
    });
  } catch (error) {
    toast({
      title: 'Error',
      description: 'No se pudo exportar el inventario',
      variant: 'destructive',
    });
  }
}

async function handleFileUpload(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  try {
    const data = await file.arrayBuffer();
    const buffer = Buffer.from(data);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const worksheet = workbook.getWorksheet(1);

    if (!worksheet) {
      throw new Error('No se encontró ninguna hoja de cálculo');
    }

    const jsonData: any[] = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) { // Skip header row
        const rowData: any = {};
        row.eachCell((cell, colNumber) => {
          const header = worksheet.getRow(1).getCell(colNumber).value?.toString() || `column${colNumber}`;
          rowData[header] = cell.value;
        });
        jsonData.push(rowData);
      }
    });

    const results = await inventoryStore.importInventory(retreatId, jsonData);
    importResults.value = results;
    
    if (results.errors.length === 0) {
      showImportDialog.value = false;
    }
    
    await loadInventoryData();
  } catch (error) {
    toast({
      title: 'Error',
      description: 'No se pudo procesar el archivo',
      variant: 'destructive',
    });
  }
}
</script>