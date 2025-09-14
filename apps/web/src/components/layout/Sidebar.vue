<template>
  <aside
    class="bg-gray-800 text-white flex flex-col dark transition-all duration-300 ease-in-out"
    :class="isSidebarCollapsed ? 'w-20' : 'w-64'"
  >
    <div class="h-16 flex items-center justify-center relative">
      <span v-if="!isSidebarCollapsed" class="text-2xl font-bold">EMAUS</span>
       <!-- Show initials when collapsed -->
      <span v-else class="text-2xl font-bold">E</span>
      <button @click="uiStore.toggleSidebar" class="absolute right-0 top-1/2 transform -translate-y-1/2 translate-x-1/2 bg-gray-700 hover:bg-gray-600 rounded-full p-1 z-10">
        <ChevronLeft class="w-5 h-5 transition-transform duration-300" :class="{ 'rotate-180': isSidebarCollapsed }" />
      </button>
    </div>

    <div class="px-4 py-2 border-t border-b border-gray-700">
      <div v-if="auth.isAuthenticated && auth.user" class="flex items-center gap-4" :class="{ 'justify-center': isSidebarCollapsed }">
        <span v-if="!isSidebarCollapsed">{{ auth.user.displayName }}</span>
        <TooltipProvider :delay-duration="100">
          <Tooltip>
            <TooltipTrigger as-child>
              <Button @click="handleLogout" variant="ghost" size="icon">
                <LogOut class="w-5 h-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent v-if="isSidebarCollapsed" side="right">
              <p>{{ $t('sidebar.logout') }}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>

    <nav class="flex-1 px-2 py-4 space-y-1">
      <router-link
        v-if="retreatStore.selectedRetreatId"
        :to="{ name: 'retreat-dashboard', params: { id: retreatStore.selectedRetreatId } }"
        v-slot="{ href, navigate, isActive }"
        custom
      >
        <TooltipProvider :delay-duration="100">
          <Tooltip>
            <TooltipTrigger as-child>
              <a
                :href="href"
                @click="navigate"
                class="flex items-center px-2 py-2 text-sm font-medium rounded-md"
                :class="[
                  isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white',
                  { 'justify-center': isSidebarCollapsed }
                ]"
              >
                <LayoutDashboard class="w-6 h-6" :class="{ 'mr-3': !isSidebarCollapsed }" />
                <span v-if="!isSidebarCollapsed">{{ $t('sidebar.retreatDashboard') }}</span>
              </a>
            </TooltipTrigger>
            <TooltipContent v-if="isSidebarCollapsed" side="right">
              <p>{{ $t('sidebar.retreatDashboard') }}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </router-link>
      <router-link
        v-if="retreatStore.selectedRetreatId && can.read('participant')"
        :to="{ name: 'walkers' }"
        v-slot="{ href, navigate, isActive }"
        custom
      >
        <TooltipProvider :delay-duration="100">
          <Tooltip>
            <TooltipTrigger as-child>
              <a
                :href="href"
                @click="navigate"
                class="flex items-center px-2 py-2 text-sm font-medium rounded-md"
                :class="[
                  isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white',
                  { 'justify-center': isSidebarCollapsed }
                ]"
              >
                <Users class="w-6 h-6" :class="{ 'mr-3': !isSidebarCollapsed }" />
                <span v-if="!isSidebarCollapsed">{{ $t('sidebar.walkers') }}</span>
              </a>
            </TooltipTrigger>
            <TooltipContent v-if="isSidebarCollapsed" side="right">
              <p>{{ $t('sidebar.walkers') }}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </router-link>
      
      <router-link
        v-if="retreatStore.selectedRetreatId && can.read('participant')"
        :to="{ name: 'servers' }"
        v-slot="{ href, navigate, isActive }"
        custom
      >
        <TooltipProvider :delay-duration="100">
          <Tooltip>
            <TooltipTrigger as-child>
              <a
                :href="href"
                @click="navigate"
                class="flex items-center px-2 py-2 text-sm font-medium rounded-md"
                :class="[
                  isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white',
                  { 'justify-center': isSidebarCollapsed }
                ]"
              >
                <UtensilsCrossed class="w-6 h-6" :class="{ 'mr-3': !isSidebarCollapsed }" />
                <span v-if="!isSidebarCollapsed">{{ $t('sidebar.servers') }}</span>
              </a>
            </TooltipTrigger>
            <TooltipContent v-if="isSidebarCollapsed" side="right">
              <p>{{ $t('sidebar.servers') }}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </router-link>
      <router-link
        v-if="retreatStore.selectedRetreatId && can.read('table')"
        :to="{ name: 'tables' }"
        v-slot="{ href, navigate, isActive }"
        custom
      >
        <TooltipProvider :delay-duration="100">
          <Tooltip>
            <TooltipTrigger as-child>
              <a
                :href="href"
                @click="navigate"
                class="flex items-center px-2 py-2 text-sm font-medium rounded-md"
                :class="[
                  isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white',
                  { 'justify-center': isSidebarCollapsed }
                ]"
              >
                <Table class="w-6 h-6" :class="{ 'mr-3': !isSidebarCollapsed }" />
                <span v-if="!isSidebarCollapsed">{{ $t('sidebar.tables') }}</span>
              </a>
            </TooltipTrigger>
            <TooltipContent v-if="isSidebarCollapsed" side="right">
              <p>{{ $t('sidebar.tables') }}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </router-link>
      <router-link
        v-if="retreatStore.selectedRetreatId && can.read('charge')"
        :to="{ name: 'charges', params: { id: retreatStore.selectedRetreatId } }"
        v-slot="{ href, navigate, isActive }"
        custom
      >
        <TooltipProvider :delay-duration="100">
          <Tooltip>
            <TooltipTrigger as-child>
              <a
                :href="href"
                @click="navigate"
                class="flex items-center px-2 py-2 text-sm font-medium rounded-md"
                :class="[
                  isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white',
                  { 'justify-center': isSidebarCollapsed }
                ]"
              >
                <Briefcase class="w-6 h-6" :class="{ 'mr-3': !isSidebarCollapsed }" />
                <span v-if="!isSidebarCollapsed">{{ $t('sidebar.responsibilities') }}</span>
              </a>
            </TooltipTrigger>
            <TooltipContent v-if="isSidebarCollapsed" side="right">
              <p>{{ $t('sidebar.responsibilities') }}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </router-link>
      <router-link
        v-if="retreatStore.selectedRetreatId && can.read('inventoryItem')"
        :to="{ name: 'inventory', params: { id: retreatStore.selectedRetreatId } }"
        v-slot="{ href, navigate, isActive }"
        custom
      >
        <TooltipProvider :delay-duration="100">
          <Tooltip>
            <TooltipTrigger as-child>
              <a
                :href="href"
                @click="navigate"
                class="flex items-center px-2 py-2 text-sm font-medium rounded-md"
                :class="[
                  isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white',
                  { 'justify-center': isSidebarCollapsed }
                ]"
              >
                <Package class="w-6 h-6" :class="{ 'mr-3': !isSidebarCollapsed }" />
                <span v-if="!isSidebarCollapsed">Inventario</span>
              </a>
            </TooltipTrigger>
            <TooltipContent v-if="isSidebarCollapsed" side="right">
              <p>Inventario</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </router-link>
      <router-link
        v-if="retreatStore.selectedRetreatId"
        :to="{ name: 'palancas' }"
        v-slot="{ href, navigate, isActive }"
        custom
      >
        <TooltipProvider :delay-duration="100">
          <Tooltip>
            <TooltipTrigger as-child>
              <a
                :href="href"
                @click="navigate"
                class="flex items-center px-2 py-2 text-sm font-medium rounded-md"
                :class="[
                  isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white',
                  { 'justify-center': isSidebarCollapsed }
                ]"
              >
                <HandHeart class="w-6 h-6" :class="{ 'mr-3': !isSidebarCollapsed }" />
                <span v-if="!isSidebarCollapsed">{{ $t('sidebar.palancas') }}</span>
              </a>
            </TooltipTrigger>
            <TooltipContent v-if="isSidebarCollapsed" side="right">
              <p>{{ $t('sidebar.palancas') }}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </router-link>
      <router-link
        v-if="retreatStore.selectedRetreatId && can.read('payment')"
        :to="{ name: 'payments' }"
        v-slot="{ href, navigate, isActive }"
        custom
      >
        <TooltipProvider :delay-duration="100">
          <Tooltip>
            <TooltipTrigger as-child>
              <a
                :href="href"
                @click="navigate"
                class="flex items-center px-2 py-2 text-sm font-medium rounded-md"
                :class="[
                  isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white',
                  { 'justify-center': isSidebarCollapsed }
                ]"
              >
                <DollarSign class="w-6 h-6" :class="{ 'mr-3': !isSidebarCollapsed }" />
                <span v-if="!isSidebarCollapsed">{{ $t('sidebar.payments') }}</span>
              </a>
            </TooltipTrigger>
            <TooltipContent v-if="isSidebarCollapsed" side="right">
              <p>{{ $t('sidebar.payments') }}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </router-link>
      <router-link
        v-if="retreatStore.selectedRetreatId"
        :to="{ name: 'notes-and-meeting-points' }"
        v-slot="{ href, navigate, isActive }"
        custom
      >
        <TooltipProvider :delay-duration="100">
          <Tooltip>
            <TooltipTrigger as-child>
              <a
                :href="href"
                @click="navigate"
                class="flex items-center px-2 py-2 text-sm font-medium rounded-md"
                :class="[
                  isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white',
                  { 'justify-center': isSidebarCollapsed }
                ]"
              >
                <NotebookPen class="w-6 h-6" :class="{ 'mr-3': !isSidebarCollapsed }" />
                <span v-if="!isSidebarCollapsed">{{ $t('sidebar.notesAndMeetingPoints') }}</span>
              </a>
            </TooltipTrigger>
            <TooltipContent v-if="isSidebarCollapsed" side="right">
              <p>{{ $t('sidebar.notesAndMeetingPoints') }}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </router-link>
      <router-link
        v-if="retreatStore.selectedRetreatId && can.read('house')"
        :to="{ name: 'rooms' }"
        v-slot="{ href, navigate, isActive }"
        custom
      >
        <TooltipProvider :delay-duration="100">
          <Tooltip>
            <TooltipTrigger as-child>
              <a
                :href="href"
                @click="navigate"
                class="flex items-center px-2 py-2 text-sm font-medium rounded-md"
                :class="[
                  isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white',
                  { 'justify-center': isSidebarCollapsed }
                ]"
              >
                <Building class="w-6 h-6" :class="{ 'mr-3': !isSidebarCollapsed }" />
                <span v-if="!isSidebarCollapsed">{{ $t('sidebar.rooms') }}</span>
              </a>
            </TooltipTrigger>
            <TooltipContent v-if="isSidebarCollapsed" side="right">
              <p>{{ $t('sidebar.rooms') }}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </router-link>
      <router-link
        v-if="retreatStore.selectedRetreatId"
        :to="{ name: 'user-type-and-table' }"
        v-slot="{ href, navigate, isActive }"
        custom
      >
        <TooltipProvider :delay-duration="100">
          <Tooltip>
            <TooltipTrigger as-child>
              <a
                :href="href"
                @click="navigate"
                class="flex items-center px-2 py-2 text-sm font-medium rounded-md"
                :class="[
                  isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white',
                  { 'justify-center': isSidebarCollapsed }
                ]"
              >
                <UsersRound class="w-6 h-6" :class="{ 'mr-3': !isSidebarCollapsed }" />
                <span v-if="!isSidebarCollapsed">{{ $t('sidebar.userTypeAndTable') }}</span>
              </a>
            </TooltipTrigger>
            <TooltipContent v-if="isSidebarCollapsed" side="right">
              <p>{{ $t('sidebar.userTypeAndTable') }}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </router-link>
      <router-link
        v-if="retreatStore.selectedRetreatId"
        :to="{ name: 'food' }"
        v-slot="{ href, navigate, isActive }"
        custom
      >
        <TooltipProvider :delay-duration="100">
          <Tooltip>
            <TooltipTrigger as-child>
              <a
                :href="href"
                @click="navigate"
                class="flex items-center px-2 py-2 text-sm font-medium rounded-md"
                :class="[
                  isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white',
                  { 'justify-center': isSidebarCollapsed }
                ]"
              >
                <Salad class="w-6 h-6" :class="{ 'mr-3': !isSidebarCollapsed }" />
                <span v-if="!isSidebarCollapsed">{{ $t('sidebar.food') }}</span>
              </a>
            </TooltipTrigger>
            <TooltipContent v-if="isSidebarCollapsed" side="right">
              <p>{{ $t('sidebar.food') }}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </router-link>
      <router-link
        v-if="retreatStore.selectedRetreatId"
        :to="{ name: 'cancellation-and-notes' }"
        v-slot="{ href, navigate, isActive }"
        custom
      >
        <TooltipProvider :delay-duration="100">
          <Tooltip>
            <TooltipTrigger as-child>
              <a
                :href="href"
                @click="navigate"
                class="flex items-center px-2 py-2 text-sm font-medium rounded-md"
                :class="[
                  isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white',
                  { 'justify-center': isSidebarCollapsed }
                ]"
              >
                <FileX class="w-6 h-6" :class="{ 'mr-3': !isSidebarCollapsed }" />
                <span v-if="!isSidebarCollapsed">{{ $t('sidebar.cancellationAndNotes') }}</span>
              </a>
            </TooltipTrigger>
            <TooltipContent v-if="isSidebarCollapsed" side="right">
              <p>{{ $t('sidebar.cancellationAndNotes') }}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </router-link>
      <router-link
        v-if="retreatStore.selectedRetreatId"
        :to="{ name: 'waiting-list' }"
        v-slot="{ href, navigate, isActive }"
        custom
      >
        <TooltipProvider :delay-duration="100">
          <Tooltip>
            <TooltipTrigger as-child>
              <a
                :href="href"
                @click="navigate"
                class="flex items-center px-2 py-2 text-sm font-medium rounded-md"
                :class="[
                  isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white',
                  { 'justify-center': isSidebarCollapsed }
                ]"
              >
                <UserCheck class="w-6 h-6" :class="{ 'mr-3': !isSidebarCollapsed }" />
                <span v-if="!isSidebarCollapsed">{{ $t('sidebar.waitingList') }}</span>
              </a>
            </TooltipTrigger>
            <TooltipContent v-if="isSidebarCollapsed" side="right">
              <p>{{ $t('sidebar.waitingList') }}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </router-link>
      <router-link
        v-if="retreatStore.selectedRetreatId"
        :to="{ name: 'bags-report' }"
        v-slot="{ href, navigate, isActive }"
        custom
      >
        <TooltipProvider :delay-duration="100">
          <Tooltip>
            <TooltipTrigger as-child>
              <a
                :href="href"
                @click="navigate"
                class="flex items-center px-2 py-2 text-sm font-medium rounded-md"
                :class="[
                  isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white',
                  { 'justify-center': isSidebarCollapsed }
                ]"
              >
                <ShoppingBag class="w-6 h-6" :class="{ 'mr-3': !isSidebarCollapsed }" />
                <span v-if="!isSidebarCollapsed">{{ $t('sidebar.bagsReport') }}</span>
              </a>
            </TooltipTrigger>
            <TooltipContent v-if="isSidebarCollapsed" side="right">
              <p>{{ $t('sidebar.bagsReport') }}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </router-link>
      <router-link
        v-if="retreatStore.selectedRetreatId"
        :to="{ name: 'medicines-report' }"
        v-slot="{ href, navigate, isActive }"
        custom
      >
        <TooltipProvider :delay-duration="100">
          <Tooltip>
            <TooltipTrigger as-child>
              <a
                :href="href"
                @click="navigate"
                class="flex items-center px-2 py-2 text-sm font-medium rounded-md"
                :class="[
                  isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white',
                  { 'justify-center': isSidebarCollapsed }
                ]"
              >
                <Pill class="w-6 h-6" :class="{ 'mr-3': !isSidebarCollapsed }" />
                <span v-if="!isSidebarCollapsed">{{ $t('sidebar.medicinesReport') }}</span>
              </a>
            </TooltipTrigger>
            <TooltipContent v-if="isSidebarCollapsed" side="right">
              <p>{{ $t('sidebar.medicinesReport') }}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </router-link>
      <router-link
        v-if="retreatStore.selectedRetreatId"
        :to="{ name: 'bed-assignments', params: { id: retreatStore.selectedRetreatId } }"
        v-slot="{ href, navigate, isActive }"
        custom
      >
        <TooltipProvider :delay-duration="100">
          <Tooltip>
            <TooltipTrigger as-child>
              <a
                :href="href"
                @click="navigate"
                class="flex items-center px-2 py-2 text-sm font-medium rounded-md"
                :class="[
                  isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white',
                  { 'justify-center': isSidebarCollapsed }
                ]"
              >
                <Bed class="w-6 h-6" :class="{ 'mr-3': !isSidebarCollapsed }" />
                <span v-if="!isSidebarCollapsed">{{ $t('sidebar.bedAssignments') }}</span>
              </a>
            </TooltipTrigger>
            <TooltipContent v-if="isSidebarCollapsed" side="right">
              <p>{{ $t('sidebar.bedAssignments') }}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </router-link>
      <router-link
        v-if="retreatStore.selectedRetreatId"
        :to="{ name: 'canceled' }"
        v-slot="{ href, navigate, isActive }"
        custom
      >
        <TooltipProvider :delay-duration="100">
          <Tooltip>
            <TooltipTrigger as-child>
              <a
                :href="href"
                @click="navigate"
                class="flex items-center px-2 py-2 text-sm font-medium rounded-md"
                :class="[
                  isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white',
                  { 'justify-center': isSidebarCollapsed }
                ]"
              >
                <Ban class="w-6 h-6" :class="{ 'mr-3': !isSidebarCollapsed }" />
                <span v-if="!isSidebarCollapsed">{{ $t('sidebar.canceled') }}</span>
              </a>
            </TooltipTrigger>
            <TooltipContent v-if="isSidebarCollapsed" side="right">
              <p>{{ $t('sidebar.canceled') }}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </router-link>
      <router-link
        v-if="retreatStore.selectedRetreatId"
        :to="{ name: 'role-management', params: { id: retreatStore.selectedRetreatId } }"
        v-slot="{ href, navigate, isActive }"
        custom
      >
        <TooltipProvider :delay-duration="100">
          <Tooltip>
            <TooltipTrigger as-child>
              <a
                :href="href"
                @click="navigate"
                class="flex items-center px-2 py-2 text-sm font-medium rounded-md"
                :class="[
                  isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white',
                  { 'justify-center': isSidebarCollapsed }
                ]"
              >
                <UserCog class="w-6 h-6" :class="{ 'mr-3': !isSidebarCollapsed }" />
                <span v-if="!isSidebarCollapsed">Gestión de Roles</span>
              </a>
            </TooltipTrigger>
            <TooltipContent v-if="isSidebarCollapsed" side="right">
              <p>Gestión de Roles</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </router-link>
      

      <!-- Settings Section -->
      <div class="px-2 pt-4 pb-2">
        <h3 v-if="!isSidebarCollapsed" class="text-xs font-semibold text-gray-400 uppercase tracking-wider">{{ $t('sidebar.settings.title') }}</h3>
        <div v-else class="border-t border-gray-700 my-2"></div>
      </div>
      <router-link
        v-if="can.read('participant')"
        :to="{ name: 'message-templates' }"
        v-slot="{ href, navigate, isActive }"
        custom
      >
        <TooltipProvider :delay-duration="100">
          <Tooltip>
            <TooltipTrigger as-child>
              <a
                :href="href"
                @click="navigate"
                class="flex items-center px-2 py-2 text-sm font-medium rounded-md"
                :class="[
                  isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white',
                  { 'justify-center': isSidebarCollapsed }
                ]"
              >
                <Settings class="w-6 h-6" :class="{ 'mr-3': !isSidebarCollapsed }" />
                <span v-if="!isSidebarCollapsed">{{ $t('sidebar.settings.messageTemplates') }}</span>
              </a>
            </TooltipTrigger>
            <TooltipContent v-if="isSidebarCollapsed" side="right">
              <p>{{ $t('sidebar.settings.messageTemplates') }}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </router-link>
      <router-link
        v-if="auth.userProfile?.roles?.some(role => role.role.name === 'superadmin')"
        :to="{ name: 'global-message-templates' }"
        v-slot="{ href, navigate, isActive }"
        custom
      >
        <TooltipProvider :delay-duration="100">
          <Tooltip>
            <TooltipTrigger as-child>
              <a
                :href="href"
                @click="navigate"
                class="flex items-center px-2 py-2 text-sm font-medium rounded-md"
                :class="[
                  isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white',
                  { 'justify-center': isSidebarCollapsed }
                ]"
              >
                <Globe class="w-6 h-6" :class="{ 'mr-3': !isSidebarCollapsed }" />
                <span v-if="!isSidebarCollapsed">Plantillas Globales</span>
              </a>
            </TooltipTrigger>
            <TooltipContent v-if="isSidebarCollapsed" side="right">
              <p>Plantillas Globales</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </router-link>
      <router-link
        v-if="can.read('inventoryItem')"
        :to="{ name: 'inventory-items' }"
        v-slot="{ href, navigate, isActive }"
        custom
      >
        <TooltipProvider :delay-duration="100">
          <Tooltip>
            <TooltipTrigger as-child>
              <a
                :href="href"
                @click="navigate"
                class="flex items-center px-2 py-2 text-sm font-medium rounded-md"
                :class="[
                  isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white',
                  { 'justify-center': isSidebarCollapsed }
                ]"
              >
                <Package class="w-6 h-6" :class="{ 'mr-3': !isSidebarCollapsed }" />
                <span v-if="!isSidebarCollapsed">Artículos de Inventario</span>
              </a>
            </TooltipTrigger>
            <TooltipContent v-if="isSidebarCollapsed" side="right">
              <p>Artículos de Inventario</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </router-link>
      <router-link
        v-if="can.read('house')"
        :to="{ name: 'houses' }"
        v-slot="{ href, navigate, isActive }"
        custom
      >
        <TooltipProvider :delay-duration="100">
          <Tooltip>
            <TooltipTrigger as-child>
              <a
                :href="href"
                @click="navigate"
                class="flex items-center px-2 py-2 text-sm font-medium rounded-md"
                :class="[
                  isActive ? 'bg-gray-900 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white',
                  { 'justify-center': isSidebarCollapsed }
                ]"
              >
                <Home class="w-6 h-6" :class="{ 'mr-3': !isSidebarCollapsed }" />
                <span v-if="!isSidebarCollapsed">{{ $t('sidebar.houses') }}</span>
              </a>
            </TooltipTrigger>
            <TooltipContent v-if="isSidebarCollapsed" side="right">
              <p>{{ $t('sidebar.houses') }}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </router-link>

      <!-- Add other menu items here following the same pattern -->
    </nav>
  </aside>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { LogOut, Users, UtensilsCrossed, LayoutDashboard, ChevronLeft, Home, Ban, Bed, HandHeart, DollarSign, NotebookPen, Building, UsersRound, Salad, FileX, UserCheck, ShoppingBag, Pill, UserCog, Table, Settings, Package, Globe, Briefcase } from 'lucide-vue-next';
import { useAuthStore } from '@/stores/authStore';
import { useRouter } from 'vue-router';
import { Button } from '@repo/ui';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@repo/ui';
import { useRetreatStore } from '@/stores/retreatStore';
import { useUIStore } from '@/stores/ui';
import { useAuthPermissions } from '@/composables/useAuthPermissions';

const auth = useAuthStore();
const router = useRouter();
const retreatStore = useRetreatStore();
const uiStore = useUIStore();
const { isSidebarCollapsed } = storeToRefs(uiStore);
const { 
  can 
} = useAuthPermissions();

const handleLogout = async () => {
  await auth.logout();
  router.push('/login');
};
</script>