<template>
  <div class="p-4 max-w-6xl mx-auto space-y-6">
    <!-- Loading State -->
    <div v-if="isLoading" class="flex items-center justify-center p-8">
      <Loader2 class="w-8 h-8 animate-spin mr-2" />
      <span>Cargando...</span>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="bg-red-50 border border-red-200 rounded-lg p-4">
      <p class="text-red-800">{{ error }}</p>
    </div>

    <div v-else-if="!selectedRetreat">
      <p>{{ $t('retreatDashboard.noRetreatSelected') }}</p>
    </div>

    <template v-else>
      <!-- Hero Header -->
      <Card class="overflow-hidden border-0 shadow-md">
        <div class="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 class="text-2xl sm:text-3xl font-bold tracking-tight">
                {{ selectedRetreat.parish }}
              </h1>
              <div class="flex flex-wrap items-center gap-2 mt-2">
                <div class="flex items-center gap-1.5 text-muted-foreground">
                  <CalendarDays class="w-4 h-4" />
                  <span class="text-sm font-medium">{{ formatDate(selectedRetreat.startDate) }}</span>
                </div>
                <Badge v-if="daysUntilRetreat !== null" :variant="daysUntilRetreat > 0 ? 'default' : daysUntilRetreat === 0 ? 'success' : 'secondary'">
                  <template v-if="daysUntilRetreat > 0">{{ daysUntilRetreat }} {{ $t('retreatDashboard.daysUntilRetreat') }}</template>
                  <template v-else-if="daysUntilRetreat === 0">{{ $t('retreatDashboard.today') }}</template>
                  <template v-else>{{ Math.abs(daysUntilRetreat) }} {{ $t('retreatDashboard.daysAgoRetreat') }}</template>
                </Badge>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <Button @click="showInviteModal = true" variant="outline" size="sm">
                <Mail class="w-4 h-4 mr-1.5" />
                {{ $t('retreatDashboard.inviteSomeone') }}
              </Button>
              <Button @click="openFlyer" variant="outline" size="sm">
                <FileText class="w-4 h-4 mr-1.5" />
                {{ $t('retreatDashboard.viewFlyer') }}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <!-- Stat Cards Grid -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <!-- Walkers -->
        <Card class="overflow-hidden group hover:shadow-lg transition-all duration-300">
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium text-muted-foreground">
              {{ $t('retreatDashboard.walkersCount') }}
            </CardTitle>
            <div class="rounded-full p-2 bg-blue-500/10 text-blue-600 group-hover:bg-blue-500 group-hover:text-white transition-colors">
              <Users class="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div class="text-3xl font-bold">{{ walkersCount }}</div>
            <div class="flex items-center gap-2 mt-2">
              <Badge :variant="walkersStatus === 'full' ? 'destructive' : walkersStatus === 'warning' ? 'warning' : 'success'" class="text-xs">
                {{ walkersCount }}/{{ selectedRetreat.max_walkers || '∞' }}
              </Badge>
            </div>
            <Progress v-if="selectedRetreat.max_walkers" :value="walkersPercentage" class="h-1.5 mt-2" />
            <p v-if="selectedRetreat.max_walkers" class="text-xs text-muted-foreground mt-1">{{ Math.round(walkersPercentage) }}% {{ $t('retreatDashboard.capacity') }}</p>
          </CardContent>
        </Card>

        <!-- Servers -->
        <Card class="overflow-hidden group hover:shadow-lg transition-all duration-300">
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium text-muted-foreground">
              {{ $t('retreatDashboard.serversCount') }}
            </CardTitle>
            <div class="rounded-full p-2 bg-green-500/10 text-green-600 group-hover:bg-green-500 group-hover:text-white transition-colors">
              <UserPlus class="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div class="text-3xl font-bold">{{ serversCount }}</div>
            <div class="flex items-center gap-2 mt-2">
              <Badge :variant="serversStatus === 'full' ? 'destructive' : serversStatus === 'warning' ? 'warning' : 'success'" class="text-xs">
                {{ serversCount }}/{{ selectedRetreat.max_servers || '∞' }}
              </Badge>
            </div>
            <Progress v-if="selectedRetreat.max_servers" :value="serversPercentage" class="h-1.5 mt-2" />
            <p v-if="selectedRetreat.max_servers" class="text-xs text-muted-foreground mt-1">{{ Math.round(serversPercentage) }}% {{ $t('retreatDashboard.capacity') }}</p>
          </CardContent>
        </Card>

        <!-- Waiting -->
        <Card class="overflow-hidden group hover:shadow-lg transition-all duration-300">
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium text-muted-foreground">
              {{ $t('retreatDashboard.waitingCount') }}
            </CardTitle>
            <div class="rounded-full p-2 bg-amber-500/10 text-amber-600 group-hover:bg-amber-500 group-hover:text-white transition-colors">
              <Clock class="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div class="text-3xl font-bold">{{ waitingCount }}</div>
            <p class="text-xs text-muted-foreground mt-2">{{ $t('retreatDashboard.onWaitingList') }}</p>
          </CardContent>
        </Card>

        <!-- Partial Servers -->
        <Card class="overflow-hidden group hover:shadow-lg transition-all duration-300">
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium text-muted-foreground">
              {{ $t('sidebar.partialServers') }}
            </CardTitle>
            <div class="rounded-full p-2 bg-purple-500/10 text-purple-600 group-hover:bg-purple-500 group-hover:text-white transition-colors">
              <UserPlus class="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div class="text-3xl font-bold">{{ angelitosCount }}</div>
            <p class="text-xs text-muted-foreground mt-2">{{ $t('retreatDashboard.partialServersDescription') }}</p>
          </CardContent>
        </Card>
      </div>

      <!-- Assignment Stats Grid -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <!-- Total Participants -->
        <Card class="overflow-hidden group hover:shadow-lg transition-all duration-300">
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium text-muted-foreground">
              {{ $t('retreatDashboard.totalParticipants') }}
            </CardTitle>
            <div class="rounded-full p-2 bg-indigo-500/10 text-indigo-600 group-hover:bg-indigo-500 group-hover:text-white transition-colors">
              <Users class="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div class="text-3xl font-bold">{{ totalParticipantsCount }}</div>
          </CardContent>
        </Card>

        <!-- Assigned Beds -->
        <Card class="overflow-hidden group hover:shadow-lg transition-all duration-300 cursor-pointer" @click="goToBedAssignments">
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium text-muted-foreground">
              {{ $t('retreatDashboard.assignedBeds') }}
            </CardTitle>
            <div class="rounded-full p-2 bg-teal-500/10 text-teal-600 group-hover:bg-teal-500 group-hover:text-white transition-colors">
              <BedDouble class="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div class="text-3xl font-bold">{{ assignedBedsCount }} / {{ totalBedsCount }}</div>
            <Progress v-if="totalBedsCount" :value="bedsPercentage" class="h-1.5 mt-2" />
          </CardContent>
        </Card>

        <!-- Unassigned Participants -->
        <Card class="overflow-hidden group hover:shadow-lg transition-all duration-300 cursor-pointer" @click="goToBedAssignments">
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium text-muted-foreground">
              {{ $t('retreatDashboard.unassignedParticipants') }}
            </CardTitle>
            <div class="rounded-full p-2 bg-orange-500/10 text-orange-600 group-hover:bg-orange-500 group-hover:text-white transition-colors">
              <UserMinus class="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div class="text-3xl font-bold">{{ unassignedParticipantsCount }}</div>
          </CardContent>
        </Card>

        <!-- Floors Used -->
        <Card class="overflow-hidden group hover:shadow-lg transition-all duration-300">
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium text-muted-foreground">
              {{ $t('retreatDashboard.floorsUsed') }}
            </CardTitle>
            <div class="rounded-full p-2 bg-pink-500/10 text-pink-600 group-hover:bg-pink-500 group-hover:text-white transition-colors">
              <Layers class="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div class="text-3xl font-bold">{{ floorsUsedCount }}</div>
          </CardContent>
        </Card>
      </div>

      <!-- Table Assignments Stats -->
      <Card class="group hover:shadow-md transition-all duration-300 cursor-pointer" @click="goToTableAssignments">
        <CardHeader class="pb-3">
          <CardTitle class="text-lg flex items-center gap-2">
            <LayoutGrid class="w-5 h-5 text-primary" />
            {{ $t('retreatDashboard.tableAssignments') }}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p class="text-xs uppercase tracking-wider text-muted-foreground">{{ $t('retreatDashboard.tablesCount') }}</p>
              <p class="text-2xl font-bold mt-1">{{ tables.length }}</p>
            </div>
            <div>
              <p class="text-xs uppercase tracking-wider text-muted-foreground">{{ $t('retreatDashboard.leadersAssigned') }}</p>
              <p class="text-2xl font-bold mt-1">{{ leadersAssignedCount }} / {{ tables.length * 3 }}</p>
            </div>
            <div>
              <p class="text-xs uppercase tracking-wider text-muted-foreground">{{ $t('retreatDashboard.walkersInTables') }}</p>
              <p class="text-2xl font-bold mt-1">{{ walkersInTablesCount }} / {{ walkersCount }}</p>
            </div>
            <div>
              <p class="text-xs uppercase tracking-wider text-muted-foreground">{{ $t('retreatDashboard.walkersWithoutTable') }}</p>
              <p class="text-2xl font-bold mt-1">{{ walkersWithoutTableCount }}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Responsibilities -->
      <Card class="group hover:shadow-md transition-all duration-300 cursor-pointer" @click="goToResponsibilities">
        <CardHeader class="pb-3">
          <CardTitle class="text-lg flex items-center gap-2">
            <ClipboardList class="w-5 h-5 text-primary" />
            {{ $t('retreatDashboard.responsibilities') }}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <p class="text-xs uppercase tracking-wider text-muted-foreground">{{ $t('retreatDashboard.totalResponsibilities') }}</p>
              <p class="text-2xl font-bold mt-1">{{ totalResponsibilitiesCount }}</p>
            </div>
            <div>
              <p class="text-xs uppercase tracking-wider text-muted-foreground">{{ $t('retreatDashboard.assignedResponsibilities') }}</p>
              <p class="text-2xl font-bold mt-1">{{ totalResponsibilitiesCount - unassignedResponsibilitiesCount }} / {{ totalResponsibilitiesCount }}</p>
            </div>
            <div>
              <p class="text-xs uppercase tracking-wider text-muted-foreground">{{ $t('retreatDashboard.unassignedResponsibilities') }}</p>
              <p class="text-2xl font-bold mt-1" :class="unassignedResponsibilitiesCount > 0 ? 'text-amber-600' : ''">{{ unassignedResponsibilitiesCount }}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Palancas -->
      <Card class="group hover:shadow-md transition-all duration-300 cursor-pointer" @click="goToPalancas">
        <CardHeader class="pb-3">
          <CardTitle class="text-lg flex items-center gap-2">
            <Heart class="w-5 h-5 text-primary" />
            {{ $t('retreatDashboard.palancas') }}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p class="text-xs uppercase tracking-wider text-muted-foreground">{{ $t('retreatDashboard.totalWalkers') }}</p>
              <p class="text-2xl font-bold mt-1">{{ activeWalkers.length }}</p>
            </div>
            <div>
              <p class="text-xs uppercase tracking-wider text-muted-foreground">{{ $t('retreatDashboard.palancasRequested') }}</p>
              <p class="text-2xl font-bold mt-1">{{ walkersWithPalancasRequestedCount }}</p>
            </div>
            <div>
              <p class="text-xs uppercase tracking-wider text-muted-foreground">{{ $t('retreatDashboard.palancasReceived') }}</p>
              <p class="text-2xl font-bold mt-1 text-green-600">{{ walkersWithPalancasReceivedCount }}</p>
            </div>
            <div>
              <p class="text-xs uppercase tracking-wider text-muted-foreground">{{ $t('retreatDashboard.walkersWithoutPalancas') }}</p>
              <p class="text-2xl font-bold mt-1" :class="walkersWithoutPalancasCount > 0 ? 'text-amber-600' : ''">{{ walkersWithoutPalancasCount }}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Registration Links -->
      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <Link class="w-5 h-5" />
            {{ $t('retreatDashboard.registrationLinks') }}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TooltipProvider>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <!-- Walker Registration -->
              <div class="space-y-3">
                <div class="flex items-center gap-2">
                  <Users class="w-4 h-4 text-blue-600" />
                  <label class="text-sm font-medium">{{ $t('retreatDashboard.walkerRegistrationLink') }}</label>
                </div>
                <code class="block text-xs bg-muted px-3 py-2 rounded-md truncate text-muted-foreground">
                  {{ walkerRegistrationLink }}
                </code>
                <div class="flex items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <Button size="sm" @click="copyLink(walkerRegistrationLink)" variant="outline">
                        <Copy class="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{{ $t('retreatDashboard.copyLink') }}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <Button size="sm" @click="openLink(walkerRegistrationLink)" variant="outline">
                        <ExternalLink class="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{{ $t('retreatDashboard.openLink') }}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <Button size="sm" @click="showQrCode(walkerRegistrationLink)" variant="outline">
                        <QrCode class="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{{ $t('retreatDashboard.showQr') }}</TooltipContent>
                  </Tooltip>
                </div>
              </div>

              <!-- Server Registration -->
              <div class="space-y-3">
                <div class="flex items-center gap-2">
                  <UserPlus class="w-4 h-4 text-green-600" />
                  <label class="text-sm font-medium">{{ $t('retreatDashboard.serverRegistrationLink') }}</label>
                </div>
                <code class="block text-xs bg-muted px-3 py-2 rounded-md truncate text-muted-foreground">
                  {{ serverRegistrationLink }}
                </code>
                <div class="flex items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <Button size="sm" @click="copyLink(serverRegistrationLink)" variant="outline">
                        <Copy class="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{{ $t('retreatDashboard.copyLink') }}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <Button size="sm" @click="openLink(serverRegistrationLink)" variant="outline">
                        <ExternalLink class="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{{ $t('retreatDashboard.openLink') }}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <Button size="sm" @click="showQrCode(serverRegistrationLink)" variant="outline">
                        <QrCode class="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{{ $t('retreatDashboard.showQr') }}</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </div>
          </TooltipProvider>
        </CardContent>
      </Card>

      <!-- Additional Information Section -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- Opening Notes -->
        <Card v-if="selectedRetreat.openingNotes" class="group hover:shadow-md transition-all duration-300">
          <CardHeader class="pb-3">
            <CardTitle class="text-lg flex items-center gap-2">
              <BookOpen class="w-4 h-4 text-primary" />
              {{ $t('retreatDashboard.openingNotes') }}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p class="text-sm text-muted-foreground leading-relaxed">{{ selectedRetreat.openingNotes }}</p>
          </CardContent>
        </Card>

        <!-- Closing Notes -->
        <Card v-if="selectedRetreat.closingNotes" class="group hover:shadow-md transition-all duration-300">
          <CardHeader class="pb-3">
            <CardTitle class="text-lg flex items-center gap-2">
              <BookOpen class="w-4 h-4 text-primary" />
              {{ $t('retreatDashboard.closingNotes') }}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p class="text-sm text-muted-foreground leading-relaxed">{{ selectedRetreat.closingNotes }}</p>
          </CardContent>
        </Card>

        <!-- Things to Bring -->
        <Card v-if="selectedRetreat.thingsToBringNotes" class="group hover:shadow-md transition-all duration-300">
          <CardHeader class="pb-3">
            <CardTitle class="text-lg flex items-center gap-2">
              <Package class="w-4 h-4 text-primary" />
              {{ $t('retreatDashboard.thingsToBringNotes') }}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p class="text-sm text-muted-foreground leading-relaxed">{{ selectedRetreat.thingsToBringNotes }}</p>
          </CardContent>
        </Card>

        <!-- Payment Information -->
        <Card v-if="selectedRetreat.cost || selectedRetreat.paymentInfo || selectedRetreat.paymentMethods" class="group hover:shadow-md transition-all duration-300">
          <CardHeader class="pb-3">
            <CardTitle class="text-lg flex items-center gap-2">
              <DollarSign class="w-4 h-4 text-primary" />
              {{ $t('retreatDashboard.paymentInformation') }}
            </CardTitle>
          </CardHeader>
          <CardContent class="space-y-3">
            <div v-if="selectedRetreat.cost">
              <h4 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ $t('retreatDashboard.cost') }}</h4>
              <p class="text-sm mt-0.5">{{ selectedRetreat.cost }}</p>
            </div>
            <div v-if="selectedRetreat.paymentInfo">
              <h4 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ $t('retreatDashboard.paymentInfo') }}</h4>
              <p class="text-sm mt-0.5">{{ selectedRetreat.paymentInfo }}</p>
            </div>
            <div v-if="selectedRetreat.paymentMethods">
              <h4 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{{ $t('retreatDashboard.paymentMethods') }}</h4>
              <p class="text-sm mt-0.5">{{ selectedRetreat.paymentMethods }}</p>
            </div>
          </CardContent>
        </Card>

        <!-- Memory Section -->
        <Card v-if="selectedRetreat.memoryPhotoUrl || selectedRetreat.musicPlaylistUrl" class="md:col-span-2 group hover:shadow-md transition-all duration-300">
          <CardHeader class="pb-3">
            <CardTitle class="text-lg flex items-center gap-2">
              <Camera class="w-4 h-4 text-primary" />
              {{ $t('retreatDashboard.retreatMemories') }}
            </CardTitle>
          </CardHeader>
          <CardContent class="space-y-4">
            <div v-if="selectedRetreat.memoryPhotoUrl">
              <img
                :src="selectedRetreat.memoryPhotoUrl"
                alt="Foto del recuerdo"
                class="w-full h-64 object-cover rounded-lg shadow-sm"
              />
            </div>
            <div v-if="selectedRetreat.musicPlaylistUrl">
              <a
                :href="selectedRetreat.musicPlaylistUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors text-sm font-medium"
              >
                <Music class="w-4 h-4" />
                <span>{{ $t('retreatDashboard.listenMusic') }}</span>
                <ExternalLink class="w-3.5 h-3.5 text-muted-foreground" />
              </a>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- Inventory Alerts (secondary section) -->
      <Card v-if="can.read('retreatInventory') && inventoryAlerts.length > 0" class="border-dashed">
        <CardHeader class="pb-3">
          <div class="flex items-center justify-between">
            <CardTitle class="text-base flex items-center gap-2 text-muted-foreground">
              <AlertTriangle class="w-4 h-4 text-amber-500" />
              {{ $t('retreatDashboard.inventoryAlerts') }}
              <Badge variant="secondary" class="text-xs">{{ inventoryAlerts.length }}</Badge>
            </CardTitle>
            <Button variant="ghost" size="sm" @click="$router.push({ name: 'inventory', params: { id: selectedRetreat.id } })">
              {{ $t('retreatDashboard.viewAllAlerts', { count: inventoryAlerts.length }) }}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            <div
              v-for="alert in inventoryAlerts.slice(0, 6)"
              :key="alert.id"
              class="flex items-center justify-between gap-2 px-3 py-2 rounded-md bg-muted/50 text-sm"
            >
              <span class="truncate">{{ alert.itemName }}</span>
              <Badge variant="secondary" class="text-xs shrink-0">
                -{{ alert.deficit }} {{ alert.unit }}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </template>

    <!-- QR Code Dialog -->
    <Dialog :open="isQrCodeVisible" @update:open="isQrCodeVisible = $event">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ $t('retreatDashboard.qrCodeTitle') }}</DialogTitle>
        </DialogHeader>
        <div class="flex justify-center p-4">
          <QrcodeVue :value="qrCodeUrl" :size="300" level="H" />
        </div>
      </DialogContent>
    </Dialog>

    <!-- Invite Modal -->
    <InviteUsersModal
      :is-open="showInviteModal"
      :retreat-id="selectedRetreat?.id || ''"
      @close="showInviteModal = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useRetreatStore } from '@/stores/retreatStore';
import { useParticipantStore } from '@/stores/participantStore';
import { useInventoryStore } from '@/stores/inventoryStore';
import { useTableMesaStore } from '@/stores/tableMesaStore';
import { useResponsabilityStore } from '@/stores/responsabilityStore';
import { api } from '@/services/api';
import type { RetreatBed } from '@repo/types';
import { Button } from '@repo/ui';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@repo/ui';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@repo/ui';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@repo/ui';
import { useToast } from '@repo/ui';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import QrcodeVue from 'qrcode.vue';
import { Badge } from '@repo/ui';
import { Progress } from '@repo/ui';
import InviteUsersModal from '@/components/InviteUsersModal.vue';
import {
  AlertTriangle,
  BedDouble,
  BookOpen,
  ClipboardList,
  Heart,
  CalendarDays,
  Camera,
  Clock,
  Copy,
  DollarSign,
  ExternalLink,
  FileText,
  Layers,
  LayoutGrid,
  Link,
  Loader2,
  Mail,
  Music,
  Package,
  QrCode,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-vue-next';
import { formatDate } from '@repo/utils';
import { useAuthPermissions } from '@/composables/useAuthPermissions';

const { t } = useI18n();
const { can } = useAuthPermissions();
const route = useRoute();
const router = useRouter();
const retreatStore = useRetreatStore();
const { selectedRetreat, walkerRegistrationLink, serverRegistrationLink } = storeToRefs(retreatStore);
const { toast } = useToast();
const participantStore = useParticipantStore();
const { participants } = storeToRefs(participantStore);
const inventoryStore = useInventoryStore();
const { inventoryAlerts } = storeToRefs(inventoryStore);
const tableMesaStore = useTableMesaStore();
const { tables } = storeToRefs(tableMesaStore);
const responsabilityStore = useResponsabilityStore();
const { responsibilities } = storeToRefs(responsabilityStore);

const beds = ref<RetreatBed[]>([]);

const isQrCodeVisible = ref(false);
const qrCodeUrl = ref('');
const showInviteModal = ref(false);
const isLoading = ref(false);
const error = ref('');

const walkersCount = computed(() => (participants.value || []).filter(p => p.type === 'walker' && !p.isCancelled).length);
const serversCount = computed(() => (participants.value || []).filter(p => p.type === 'server' && !p.isCancelled).length);
const waitingCount = computed(() => (participants.value || []).filter(p => p.type === 'waiting' && !p.isCancelled).length);
const angelitosCount = computed(() => (participants.value || []).filter(p => p.type === 'partial_server' && !p.isCancelled).length);

const daysUntilRetreat = computed(() => {
  if (!selectedRetreat.value?.startDate) return null;
  const start = new Date(selectedRetreat.value.startDate);
  const today = new Date();
  start.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.round((start.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
});

const walkersPercentage = computed(() => {
  if (!selectedRetreat.value?.max_walkers) return 0;
  return Math.min((walkersCount.value / selectedRetreat.value.max_walkers) * 100, 100);
});

const serversPercentage = computed(() => {
  if (!selectedRetreat.value?.max_servers) return 0;
  return Math.min((serversCount.value / selectedRetreat.value.max_servers) * 100, 100);
});

const getCapacityStatus = (current: number, max: number | undefined) => {
  if (!max) return 'unknown';
  const percentage = (current / max) * 100;
  if (percentage >= 100) return 'full';
  if (percentage >= 80) return 'warning';
  return 'available';
};

const walkersStatus = computed(() => getCapacityStatus(walkersCount.value, selectedRetreat.value?.max_walkers));
const serversStatus = computed(() => getCapacityStatus(serversCount.value, selectedRetreat.value?.max_servers));

const totalParticipantsCount = computed(() =>
  (participants.value || []).filter(p => !p.isCancelled && p.type !== 'waiting').length
);

const activeBeds = computed(() => beds.value.filter(b => b.isActive !== false));
const totalBedsCount = computed(() => activeBeds.value.length);
const assignedBedsCount = computed(() => activeBeds.value.filter(b => b.participantId).length);
const bedsPercentage = computed(() => totalBedsCount.value ? (assignedBedsCount.value / totalBedsCount.value) * 100 : 0);

const unassignedParticipantsCount = computed(() => {
  const assignedIds = new Set(beds.value.map(b => b.participantId).filter(Boolean));
  return (participants.value || []).filter(p =>
    !assignedIds.has(p.id) && !p.isCancelled && p.type !== 'waiting'
  ).length;
});

const floorsUsedCount = computed(() => {
  const floors = new Set<number>();
  for (const b of activeBeds.value) {
    if (b.participantId) floors.add(b.floor || 0);
  }
  return floors.size;
});

const leadersAssignedCount = computed(() =>
  (tables.value || []).reduce((acc, t) => acc + (t.lider ? 1 : 0) + (t.colider1 ? 1 : 0) + (t.colider2 ? 1 : 0), 0)
);
const walkersInTablesCount = computed(() =>
  (tables.value || []).reduce((acc, t) => acc + (t.walkers?.length || 0), 0)
);
const walkersWithoutTableCount = computed(() => Math.max(walkersCount.value - walkersInTablesCount.value, 0));

const totalResponsibilitiesCount = computed(() => (responsibilities.value || []).length);
const unassignedResponsibilitiesCount = computed(() =>
  (responsibilities.value || []).filter(r => !r.participantId).length
);

const activeWalkers = computed(() =>
  (participants.value || []).filter(p => p.type === 'walker' && !p.isCancelled)
);
const walkersWithPalancasRequestedCount = computed(() =>
  activeWalkers.value.filter((p: any) => p.palancasRequested === true).length
);
const walkersWithPalancasReceivedCount = computed(() =>
  activeWalkers.value.filter((p: any) => !!p.palancasReceived && String(p.palancasReceived).trim() !== '').length
);
const walkersWithoutPalancasCount = computed(() =>
  activeWalkers.value.filter((p: any) =>
    !p.palancasRequested && (!p.palancasReceived || String(p.palancasReceived).trim() === '')
  ).length
);

const goToBedAssignments = () => {
  if (selectedRetreat.value?.id) {
    router.push({ name: 'bed-assignments', params: { id: selectedRetreat.value.id } });
  }
};

const goToTableAssignments = () => {
  router.push({ name: 'tables' });
};

const goToResponsibilities = () => {
  if (selectedRetreat.value?.id) {
    router.push({ name: 'responsibilities', params: { id: selectedRetreat.value.id } });
  }
};

const goToPalancas = () => {
  router.push({ name: 'palancas' });
};

const copyLink = async (link: string) => {
  try {
    await navigator.clipboard.writeText(link);
    toast({
      title: t('retreatDashboard.linkCopied'),
    });
  } catch (err) {
    toast({
      title: 'Error al copiar el enlace',
      variant: 'destructive',
    });
  }
};

const openLink = (link: string) => {
  window.open(link, '_blank');
};

const showQrCode = (url: string) => {
  qrCodeUrl.value = url;
  isQrCodeVisible.value = true;
};

const openFlyer = () => {
  if (selectedRetreat.value?.id) {
    router.push({ name: 'retreat-flyer', params: { id: selectedRetreat.value.id } });
  }
};

const fetchBeds = async (retreatId: string) => {
  try {
    const response = await api.get(`/retreats/${retreatId}/beds`);
    beds.value = response.data;
  } catch (err) {
    console.error('Error fetching beds:', err);
    beds.value = [];
  }
};

let loadedRetreatId: string | null = null;

const loadRetreatData = async (retreatId: string) => {
  if (loadedRetreatId === retreatId) return;
  loadedRetreatId = retreatId;
  isLoading.value = true;
  error.value = '';

  try {
    await retreatStore.fetchRetreat(retreatId);
    participantStore.filters.retreatId = retreatId;

    const fetches: Promise<any>[] = [
      participantStore.fetchParticipants(),
      tableMesaStore.fetchTables(),
      fetchBeds(retreatId),
      responsabilityStore.fetchResponsibilities(retreatId, { silent: true }),
    ];
    if (can.read('retreatInventory')) {
      fetches.push(inventoryStore.fetchInventoryAlerts(retreatId));
    }
    await Promise.all(fetches);
  } catch (err) {
    error.value = 'Error al cargar los datos del retiro';
    console.error('Error loading retreat data:', err);
    loadedRetreatId = null;
  } finally {
    isLoading.value = false;
  }
};

watch(
  () => route.params.id,
  (newRetreatId, oldRetreatId) => {
    if (newRetreatId && newRetreatId !== oldRetreatId) {
      loadRetreatData(newRetreatId as string);
    }
  },
  { immediate: true }
);

// When the user picks a different retreat from the sidebar, navigate to it
// instead of loading data directly — this avoids a reactive ping-pong loop
// between route.params.id and selectedRetreatId.
watch(
  () => retreatStore.selectedRetreatId,
  (newRetreatId, oldRetreatId) => {
    if (newRetreatId && newRetreatId !== oldRetreatId && newRetreatId !== route.params.id) {
      router.replace({ name: 'retreat-dashboard', params: { id: newRetreatId } });
    }
  }
);

// NOTE: Do NOT add an onMounted that calls loadRetreatData here.
// The immediate watcher on route.params.id already handles the initial load.
// Adding one caused a ping-pong loop between two retreat IDs when
// selectedRetreatId (from localStorage) differed from route.params.id.
</script>
