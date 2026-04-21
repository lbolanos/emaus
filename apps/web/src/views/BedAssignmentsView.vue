<template>
  <div>
    <!-- Sticky Top: Header + Search + Unassigned -->
    <div class="sticky top-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
      <!-- Progress bar -->
      <div class="h-1 bg-gray-200 dark:bg-gray-700 overflow-hidden">
        <div
          class="h-full transition-all duration-300"
          :class="progressColor"
          :style="{ width: progressPct + '%' }"
        ></div>
      </div>
      <!-- Desktop header row (hidden on mobile) -->
      <div class="hidden sm:block px-2 sm:px-4 lg:px-6 pt-2 sm:pt-3">
        <div class="flex items-center justify-between gap-2">
          <div class="min-w-0 flex-1">
            <h1 class="text-base sm:text-xl font-bold text-gray-900 dark:text-white truncate">{{ $t('bedAssignments.title') }}</h1>
            <div class="mt-1 flex items-center gap-3 text-xs">
              <span class="flex items-center"><span class="w-2 h-2 bg-red-500 rounded-full mr-1"></span>{{ $t('bedAssignments.snores') }}</span>
              <span class="flex items-center"><span class="w-2 h-2 bg-green-500 rounded-full mr-1"></span>{{ $t('bedAssignments.doesNotSnore') }}</span>
              <span class="text-gray-500 dark:text-gray-400">{{ assignedBeds }}/{{ totalBeds }} {{ $t('bedAssignments.beds') }} · {{ unassignedWalkers.length + unassignedServers.length }} {{ $t('bedAssignments.unassignedParticipants').toLowerCase() }}</span>
            </div>
          </div>
          <div class="flex items-center gap-1 flex-shrink-0">
            <Button @click="toggleViewMode" variant="outline" size="sm" class="h-8 px-2 text-xs">
              <Layers v-if="viewMode === 'individual'" class="w-3.5 h-3.5 mr-1" />
              <BedDouble v-else class="w-3.5 h-3.5 mr-1" />
              <span>{{ viewMode === 'individual' ? $t('bedAssignments.groupByRoom') : $t('bedAssignments.individualBeds') }}</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button variant="outline" size="sm" class="h-8 w-8 p-0">
                  <MoreVertical class="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    {{ $t('bedAssignments.sortBy') }}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuLabel>{{ $t('bedAssignments.sortBy') }}</DropdownMenuLabel>
                    <DropdownMenuRadioGroup v-model="unassignedSort">
                      <DropdownMenuRadioItem value="idOnRetreat">{{ $t('bedAssignments.sort.idOnRetreat') }}</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="name">{{ $t('bedAssignments.sort.name') }}</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="age">{{ $t('bedAssignments.sort.age') }}</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="snores">{{ $t('bedAssignments.sort.snores') }}</DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem @click="isAutoAssignDialogOpen = true">
                  {{ $t('bedAssignments.autoAssign') }}
                </DropdownMenuItem>
                <DropdownMenuItem @click="exportAssignments">
                  {{ $t('bedAssignments.export') }}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem @click="isClearAssignmentsDialogOpen = true" class="text-red-600">
                  {{ $t('bedAssignments.clearAll') }}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <!-- Sticky Unassigned Panel -->
      <div class="px-2 sm:px-4 lg:px-6 py-1.5 sm:pb-2 sm:pt-0">
        <!-- Participant search (above unassigned lists) -->
        <div class="mb-1 relative">
          <Search class="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 w-3 h-3" />
          <input
            v-model="unassignedSearch"
            type="text"
            :placeholder="$t('bedAssignments.searchParticipant')"
            class="w-full pl-7 pr-6 py-1 text-xs sm:text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-primary dark:bg-gray-700 dark:text-white"
          />
          <button
            v-if="unassignedSearch"
            @click="unassignedSearch = ''"
            class="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X class="w-3 h-3" />
          </button>
        </div>
        <!-- Mobile: compact row with tabs + actions (single line) -->
        <div class="flex items-center gap-1 mb-1 md:hidden">
          <button
            @click="unassignedTab = 'server'"
            class="flex-1 min-w-0 px-2 py-1 rounded-full text-xs font-medium transition-colors truncate"
            :class="unassignedTab === 'server'
              ? 'bg-blue-600 text-white'
              : 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'"
          >
            {{ $t('bedAssignments.servers') }} ({{ unassignedServers.length }})
          </button>
          <button
            @click="unassignedTab = 'walker'"
            class="flex-1 min-w-0 px-2 py-1 rounded-full text-xs font-medium transition-colors truncate"
            :class="unassignedTab === 'walker'
              ? 'bg-green-600 text-white'
              : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'"
          >
            {{ $t('bedAssignments.walkers') }} ({{ unassignedWalkers.length }})
          </button>
          <Button @click="toggleViewMode" variant="outline" size="sm" class="h-7 w-7 p-0 flex-shrink-0">
            <Layers v-if="viewMode === 'individual'" class="w-3.5 h-3.5" />
            <BedDouble v-else class="w-3.5 h-3.5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="outline" size="sm" class="h-7 w-7 p-0 flex-shrink-0">
                <MoreVertical class="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>{{ $t('bedAssignments.sortBy') }}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuLabel>{{ $t('bedAssignments.sortBy') }}</DropdownMenuLabel>
                  <DropdownMenuRadioGroup v-model="unassignedSort">
                    <DropdownMenuRadioItem value="idOnRetreat">{{ $t('bedAssignments.sort.idOnRetreat') }}</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="name">{{ $t('bedAssignments.sort.name') }}</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="age">{{ $t('bedAssignments.sort.age') }}</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="snores">{{ $t('bedAssignments.sort.snores') }}</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem @click="isAutoAssignDialogOpen = true">{{ $t('bedAssignments.autoAssign') }}</DropdownMenuItem>
              <DropdownMenuItem @click="exportAssignments">{{ $t('bedAssignments.export') }}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem @click="isClearAssignmentsDialogOpen = true" class="text-red-600">{{ $t('bedAssignments.clearAll') }}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <!-- Desktop: side-by-side lists (hidden on mobile) -->
        <div class="hidden md:block">
        <div class="grid md:grid-cols-2 gap-2">
          <!-- Servers -->
          <div>
            <h3 class="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 truncate">{{ $t('bedAssignments.servers') }} ({{ unassignedServers.length }})</h3>
            <div
              @drop="onDropToUnassigned($event, 'server')"
              @dragover.prevent="onDragOverUnassigned($event, 'server')"
              @dragenter.prevent
              @dragleave="onDragLeaveUnassigned($event, 'server')"
              class="p-1.5 bg-gray-50 dark:bg-gray-800 rounded border min-h-[40px] max-h-28 overflow-y-auto flex flex-wrap items-start gap-1 transition-colors"
              :class="{ 'border-primary bg-primary/10 border-dashed border-2': isOverUnassignedServer }"
            >
              <span
                v-for="server in unassignedServers"
                :key="server.id"
                draggable="true"
                @dragstart="startDrag($event, server)"
                @dragend="handleDragEnd"
                @touchstart.passive="tapTouchStart($event); onPillPressStart(server)"
                @touchend="tapTouchEnd($event, server); onPillPressEnd()"
                @touchcancel="onPillPressCancel"
                @click="onPillClickWithLongPress(server, $event)"
                :title="`${server.firstName} ${server.lastName} (${calculateAge(server.birthDate)})`"
                class="px-2 py-0.5 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded-full text-xs font-medium cursor-pointer transition-all"
                :class="{ 'ring-2 ring-blue-500 ring-offset-1 scale-110': isTapSelected(server.id) }"
              >
                <span class="inline-block w-1.5 h-1.5 rounded-full align-middle mr-1" :class="server.snores ? 'bg-red-500' : 'bg-green-500'"></span>{{ server.firstName.split(' ')[0] }} {{ server.lastName.charAt(0) }}.
              </span>
              <span v-if="unassignedServers.length === 0" class="text-gray-500 text-xs italic w-full text-center py-2">
                {{ $t('bedAssignments.allServersAssigned') }}
              </span>
            </div>
          </div>
          <!-- Walkers -->
          <div>
            <h3 class="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 truncate">{{ $t('bedAssignments.walkers') }} ({{ unassignedWalkers.length }})</h3>
            <div
              @drop="onDropToUnassigned($event, 'walker')"
              @dragover.prevent="onDragOverUnassigned($event, 'walker')"
              @dragenter.prevent
              @dragleave="onDragLeaveUnassigned($event, 'walker')"
              class="p-1.5 bg-gray-50 dark:bg-gray-800 rounded border min-h-[40px] max-h-28 overflow-y-auto flex flex-wrap items-start gap-1 transition-colors"
              :class="{ 'border-primary bg-primary/10 border-dashed border-2': isOverUnassignedWalker }"
            >
              <span
                v-for="walker in unassignedWalkers"
                :key="walker.id"
                draggable="true"
                @dragstart="startDrag($event, walker)"
                @dragend="handleDragEnd"
                @touchstart.passive="tapTouchStart($event); onPillPressStart(walker)"
                @touchend="tapTouchEnd($event, walker); onPillPressEnd()"
                @touchcancel="onPillPressCancel"
                @click="onPillClickWithLongPress(walker, $event)"
                :title="`${walker.firstName} ${walker.lastName} (${calculateAge(walker.birthDate)})`"
                class="px-2 py-0.5 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded-full text-xs font-medium cursor-pointer transition-all"
                :class="{ 'ring-2 ring-green-500 ring-offset-1 scale-110': isTapSelected(walker.id) }"
              >
                <span class="inline-block w-1.5 h-1.5 rounded-full align-middle mr-1" :class="walker.snores ? 'bg-red-500' : 'bg-green-500'"></span><span class="font-bold px-1 rounded" :style="walker.family_friend_color ? { backgroundColor: walker.family_friend_color, color: '#000' } : {}">{{ walker.id_on_retreat || '' }}</span> {{ walker.firstName.split(' ')[0] }} {{ walker.lastName.charAt(0) }}.
              </span>
              <span v-if="unassignedWalkers.length === 0" class="text-gray-500 text-xs italic w-full text-center py-2">
                {{ $t('bedAssignments.allWalkersAssigned') }}
              </span>
            </div>
          </div>
        </div>
        </div>

        <!-- Mobile: tab content (hidden on md+) -->
        <div class="md:hidden">
          <div v-show="unassignedTab === 'server'">
            <div class="p-1.5 bg-gray-50 dark:bg-gray-800 rounded border min-h-[40px] max-h-32 overflow-y-auto flex flex-wrap items-start gap-1">
              <span
                v-for="server in unassignedServers"
                :key="server.id"
                @touchstart.passive="tapTouchStart($event); onPillPressStart(server)"
                @touchend="tapTouchEnd($event, server); onPillPressEnd()"
                @touchcancel="onPillPressCancel"
                @click="onPillClickWithLongPress(server, $event)"
                class="px-2 py-0.5 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded-full text-xs font-medium cursor-pointer transition-all"
                :class="{ 'ring-2 ring-blue-500 ring-offset-1 scale-110': isTapSelected(server.id) }"
              >
                <span class="inline-block w-1.5 h-1.5 rounded-full align-middle mr-1" :class="server.snores ? 'bg-red-500' : 'bg-green-500'"></span>{{ server.firstName.split(' ')[0] }} {{ server.lastName.charAt(0) }}.
              </span>
              <span v-if="unassignedServers.length === 0" class="text-gray-500 text-xs italic w-full text-center py-2">
                {{ $t('bedAssignments.allServersAssigned') }}
              </span>
            </div>
          </div>
          <div v-show="unassignedTab === 'walker'">
            <div class="p-1.5 bg-gray-50 dark:bg-gray-800 rounded border min-h-[40px] max-h-32 overflow-y-auto flex flex-wrap items-start gap-1">
              <span
                v-for="walker in unassignedWalkers"
                :key="walker.id"
                @touchstart.passive="tapTouchStart($event); onPillPressStart(walker)"
                @touchend="tapTouchEnd($event, walker); onPillPressEnd()"
                @touchcancel="onPillPressCancel"
                @click="onPillClickWithLongPress(walker, $event)"
                class="px-2 py-0.5 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded-full text-xs font-medium cursor-pointer transition-all"
                :class="{ 'ring-2 ring-green-500 ring-offset-1 scale-110': isTapSelected(walker.id) }"
              >
                <span class="inline-block w-1.5 h-1.5 rounded-full align-middle mr-1" :class="walker.snores ? 'bg-red-500' : 'bg-green-500'"></span><span class="font-bold px-1 rounded" :style="walker.family_friend_color ? { backgroundColor: walker.family_friend_color, color: '#000' } : {}">{{ walker.id_on_retreat || '' }}</span> {{ walker.firstName.split(' ')[0] }} {{ walker.lastName.charAt(0) }}.
              </span>
              <span v-if="unassignedWalkers.length === 0" class="text-gray-500 text-xs italic w-full text-center py-2">
                {{ $t('bedAssignments.allWalkersAssigned') }}
              </span>
            </div>
          </div>
        </div>

        <!-- Beds search (below unassigned lists) -->
        <div class="mt-1 flex items-center gap-1">
          <div class="relative flex-1 min-w-0">
            <BedDouble class="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 w-3 h-3" />
            <input
              v-model="searchQuery"
              type="text"
              :placeholder="$t('bedAssignments.searchPlaceholder')"
              class="w-full pl-7 pr-6 py-1 text-xs sm:text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-primary dark:bg-gray-700 dark:text-white"
            />
            <button
              v-if="searchQuery"
              @click="searchQuery = ''"
              class="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X class="w-3 h-3" />
            </button>
          </div>
          <select
            v-model="participantFilter"
            class="px-2 py-1 text-xs sm:text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-primary dark:bg-gray-700 dark:text-white max-w-[110px] sm:max-w-[140px]"
          >
            <option value="all">{{ $t('bedAssignments.participantFilter.all') }}</option>
            <option value="walkers">{{ $t('bedAssignments.participantFilter.walkers') }}</option>
            <option value="servers">{{ $t('bedAssignments.participantFilter.servers') }}</option>
            <option value="snores">{{ $t('bedAssignments.participantFilter.snores') }}</option>
            <option value="nonSnores">{{ $t('bedAssignments.participantFilter.nonSnores') }}</option>
            <option value="free">{{ $t('bedAssignments.participantFilter.free') }}</option>
          </select>
        </div>
      </div>

      <!-- Floor navigation chips -->
      <div v-if="sortedFilteredFloors.length > 1" class="px-2 sm:px-4 lg:px-6 pb-1.5 flex gap-1 overflow-x-auto scrollbar-none">
        <button
          v-for="floor in sortedFilteredFloors"
          :key="floor"
          @click="scrollToFloor(floor)"
          class="flex-shrink-0 px-2 py-0.5 text-[11px] rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
        >
          {{ floor.split('||')[0] === '0' ? $t('bedAssignments.unassignedFloor') : `${$t('bedAssignments.floor')} ${floor.split('||')[0]}` }}
          <span v-if="floor.split('||')[1]" class="opacity-70">· {{ floor.split('||')[1] }}</span>
          <span class="ml-1 opacity-70">{{ groupedFilteredBeds[floor]?.filter(b => b.participant).length || 0 }}/{{ groupedFilteredBeds[floor]?.length || 0 }}</span>
        </button>
      </div>
    </div>

    <!-- Beds area (page-level scroll; content pasa bajo el sticky con efecto glass) -->
    <div class="px-2 sm:px-4 lg:px-6 py-3 pb-24 md:pb-6">
    <!-- Beds by Floor -->
    <div v-if="retreatStore.selectedRetreatId">
      <div v-if="loading" class="mt-8 text-center">
        <Loader2 class="w-8 h-8 animate-spin mx-auto" />
        <p class="mt-2">{{ $t('common.loading') }}</p>
      </div>
      <div v-else-if="error" class="mt-8 text-center text-red-500">
        <p>{{ error }}</p>
      </div>
      <div v-else-if="beds.length === 0" class="mt-8 text-center">
        <Home class="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p class="text-gray-600">{{ $t('bedAssignments.noBedsFound') }}</p>
      </div>
      <div v-else class="mt-8 space-y-8">
        <!-- No search results -->
        <div v-if="filteredBeds.length === 0 && (searchQuery || participantFilter !== 'all' || ageFilter !== 'all')" class="text-center py-12">
          <Search class="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
            {{ $t('bedAssignments.noSearchResults') }}
          </h3>
          <p class="text-gray-600 dark:text-gray-400">
            {{ $t('bedAssignments.noSearchResultsDesc') }}
          </p>
          <Button @click="clearSearch" class="mt-4">
            {{ $t('bedAssignments.clearSearch') }}
          </Button>
        </div>

        <!-- Search results or all beds -->
        <div v-else>
          <!-- Individual bed view -->
          <div v-if="viewMode === 'individual'">
            <div v-for="floor in sortedFilteredFloors" :key="floor" :id="`floor-${floor}`" class="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden scroll-mt-44 sm:scroll-mt-48">
              <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                <div class="flex items-center justify-between">
                  <h2 class="text-xl font-bold text-gray-900 dark:text-white">
                    {{ floor.split('||')[0] === '0' ? $t('bedAssignments.unassignedFloor') : `${$t('bedAssignments.floor')} ${floor.split('||')[0]}` }}
                    <span v-if="floor.split('||')[1]" class="text-muted-foreground font-normal text-base"> — {{ floor.split('||')[1] }}</span>
                  </h2>
                  <div class="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                    <span>{{ groupedFilteredBeds[floor].length }} {{ $t('bedAssignments.beds') }}</span>
                    <span>{{ groupedFilteredBeds[floor].filter(b => b.participant).length }} {{ $t('bedAssignments.occupied') }}</span>
                  </div>
                </div>
              </div>
              <div class="p-6">
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  <BedCard
                    v-for="bed in groupedFilteredBeds[floor]"
                    :key="bed.id"
                    :bed="bed"
                    :is-over="isOverBed === bed.id"
                    :highlighted="shouldHighlightBed(bed)"
                    :has-selection="!!tappedParticipant"
                    :incompatible="incompatibleBedIds.has(bed.id)"
                    @drop="onDropToBed"
                    @dragover="onDragOverBed"
                    @dragleave="onDragLeaveBed"
                    @assign="assignParticipant"
                    @unassign="unassignParticipant"
                    @toggle="toggleBedActive"
                    @tap="onBedTap"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- Grouped room view -->
          <div v-else>
            <div v-for="floor in sortedFilteredFloors" :key="floor" :id="`floor-${floor}`" class="space-y-6 scroll-mt-44 sm:scroll-mt-48">
              <div v-if="Object.keys(groupedFilteredBedsByRoomAndFloor[floor] || {}).length > 0">
                <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-4">
                  {{ floor.split('||')[0] === '0' ? $t('bedAssignments.unassignedFloor') : `${$t('bedAssignments.floor')} ${floor.split('||')[0]}` }}
                  <span v-if="floor.split('||')[1]" class="text-muted-foreground font-normal text-base"> — {{ floor.split('||')[1] }}</span>
                </h2>
                <div class="space-y-6">
                  <RoomCard
                    v-for="(roomBeds, roomNumber) in groupedFilteredBedsByRoomAndFloor[floor]"
                    :key="roomNumber"
                    :room-number="roomNumber"
                    :beds="roomBeds"
                    :is-over-bed="isOverBed"
                    :search-query="searchQuery"
                    :has-selection="!!tappedParticipant"
                    :incompatible-bed-ids="incompatibleBedIds"
                    @drop="onDropToBed"
                    @dragover="onDragOverBed"
                    @dragleave="onDragLeaveBed"
                    @assign="assignParticipant"
                    @unassign="unassignParticipant"
                    @toggle="toggleBedActive"
                    @tap="onBedTap"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="mt-8 text-center">
      <Home class="w-12 h-12 text-gray-400 mx-auto mb-4" />
      <p class="text-gray-600">{{ $t('participants.selectRetreatPrompt') }}</p>
    </div>
    </div>
    <!-- end scrollable beds area -->

    <!-- Long-press preview dialog -->
    <Dialog :open="!!previewParticipant" @update:open="(v: boolean) => { if (!v) closePreview() }">
      <DialogContent class="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {{ previewParticipant?.firstName }} {{ previewParticipant?.lastName }}
          </DialogTitle>
        </DialogHeader>
        <div v-if="previewParticipant" class="space-y-2 text-sm">
          <div class="flex items-center gap-2">
            <span
              class="inline-block w-2.5 h-2.5 rounded-full"
              :class="previewParticipant.snores ? 'bg-red-500' : 'bg-green-500'"
            ></span>
            <span>{{ previewParticipant.snores ? $t('bedAssignments.snores') : $t('bedAssignments.doesNotSnore') }}</span>
          </div>
          <div class="grid grid-cols-2 gap-2 text-xs">
            <div>
              <div class="text-gray-500">{{ $t('bedAssignments.age') }}</div>
              <div class="font-medium">{{ calculateAge(previewParticipant.birthDate) }} {{ $t('bedAssignments.yearsOld') }}</div>
            </div>
            <div v-if="previewParticipant.id_on_retreat">
              <div class="text-gray-500">{{ $t('bedAssignments.idOnRetreat') }}</div>
              <div class="font-medium">#{{ previewParticipant.id_on_retreat }}</div>
            </div>
            <div v-if="(previewParticipant as any).type">
              <div class="text-gray-500">Tipo</div>
              <div class="font-medium capitalize">{{ (previewParticipant as any).type }}</div>
            </div>
            <div v-if="(previewParticipant as any).family_friend_color">
              <div class="text-gray-500">Familia</div>
              <div class="flex items-center gap-1 font-medium">
                <span class="w-3 h-3 rounded" :style="{ background: (previewParticipant as any).family_friend_color }"></span>
                <span class="text-[10px]">{{ (previewParticipant as any).family_friend_color }}</span>
              </div>
            </div>
          </div>
          <div v-if="(previewParticipant as any).requestsSingleRoom" class="text-xs bg-yellow-50 dark:bg-yellow-900/30 rounded p-2">
            ⚠️ Solicita cuarto individual
          </div>
          <div v-if="(previewParticipant as any).hasMedication || (previewParticipant as any).medicationDetails" class="text-xs bg-blue-50 dark:bg-blue-900/30 rounded p-2">
            💊 Toma medicación<span v-if="(previewParticipant as any).medicationDetails">: {{ (previewParticipant as any).medicationDetails }}</span>
          </div>
          <div v-if="(previewParticipant as any).hasDietaryRestrictions" class="text-xs bg-orange-50 dark:bg-orange-900/30 rounded p-2">
            🍽️ Restricciones alimentarias<span v-if="(previewParticipant as any).dietaryRestrictionsDetails">: {{ (previewParticipant as any).dietaryRestrictionsDetails }}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="closePreview">{{ $t('common.close') || 'Cerrar' }}</Button>
          <Button
            v-if="previewParticipant"
            @click="tappedParticipant = { ...previewParticipant } as any; closePreview()"
          >
            {{ $t('bedAssignments.select') || 'Seleccionar' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Floating Undo banner -->
    <Transition
      enter-active-class="transition ease-out duration-150"
      enter-from-class="translate-y-4 opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition ease-in duration-100"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="translate-y-4 opacity-0"
    >
      <div
        v-if="undoState && !tappedParticipant"
        class="fixed inset-x-2 bottom-2 sm:inset-x-auto sm:left-4 sm:bottom-4 sm:max-w-sm z-50 bg-gray-900 text-white rounded-lg shadow-xl p-3 flex items-center gap-3"
      >
        <div class="flex-1 min-w-0 text-sm">
          <span class="font-medium truncate">{{ undoState.participantName }}</span>
          <span class="opacity-75"> → {{ undoState.bedLabel }}</span>
        </div>
        <button
          @click="performUndo"
          class="flex-shrink-0 px-3 py-1 rounded-md bg-white/10 hover:bg-white/20 text-sm font-semibold transition-colors"
        >
          {{ $t('bedAssignments.undo') }}
        </button>
      </div>
    </Transition>

    <!-- Floating selection banner (mobile priority) -->
    <Transition
      enter-active-class="transition ease-out duration-150"
      enter-from-class="translate-y-4 opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition ease-in duration-100"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="translate-y-4 opacity-0"
    >
      <div
        v-if="tappedParticipant"
        class="fixed inset-x-2 bottom-2 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:max-w-sm z-50 bg-primary text-primary-foreground rounded-lg shadow-xl p-3 flex items-center gap-2"
      >
        <div class="flex-1 min-w-0">
          <div class="text-[10px] uppercase opacity-80 font-semibold">{{ $t('bedAssignments.selected') }}</div>
          <div class="text-sm font-medium truncate">
            {{ tappedParticipant.firstName }} {{ tappedParticipant.lastName }}
          </div>
          <div class="text-[11px] opacity-90">{{ $t('bedAssignments.tapToAssign') }}</div>
        </div>
        <button
          @click="clearTap"
          class="flex-shrink-0 p-1.5 rounded-full bg-primary-foreground/10 hover:bg-primary-foreground/20 transition-colors"
          :title="$t('bedAssignments.cancelSelection')"
        >
          <X class="w-4 h-4" />
        </button>
      </div>
    </Transition>

    <!-- Auto-Assign Confirmation Dialog -->
    <Dialog :open="isAutoAssignDialogOpen" @update:open="isAutoAssignDialogOpen = $event">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ $t('bedAssignments.autoAssignConfirmation.title') }}</DialogTitle>
          <DialogDescription>{{ $t('bedAssignments.autoAssignConfirmation.description') }}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="isAutoAssignDialogOpen = false">{{ $t('common.cancel') }}</Button>
          <Button @click="confirmAutoAssign" :disabled="isAutoAssigning">
            <Loader2 v-if="isAutoAssigning" class="w-4 h-4 mr-2 animate-spin" />
            {{ isAutoAssigning ? $t('bedAssignments.autoAssignConfirmation.autoAssigning') : $t('bedAssignments.autoAssignConfirmation.confirm') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Clear Assignments Confirmation Dialog -->
    <Dialog :open="isClearAssignmentsDialogOpen" @update:open="isClearAssignmentsDialogOpen = $event">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ $t('bedAssignments.clearAssignmentsConfirmation.title') }}</DialogTitle>
          <DialogDescription>{{ $t('bedAssignments.clearAssignmentsConfirmation.description') }}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="isClearAssignmentsDialogOpen = false">{{ $t('common.cancel') }}</Button>
          <Button variant="destructive" @click="confirmClearAssignments" :disabled="isClearing">
            <Loader2 v-if="isClearing" class="w-4 h-4 mr-2 animate-spin" />
            {{ $t('common.confirm') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { useRetreatStore } from '@/stores/retreatStore';
import { useParticipantStore } from '@/stores/participantStore';
import { useToast } from '@repo/ui';
import { api } from '@/services/api';
import { Button } from '@repo/ui';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@repo/ui';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@repo/ui';
import { Loader2 } from 'lucide-vue-next';
import { BedDouble, Home, Search, X, Layers, MoreVertical } from 'lucide-vue-next';
import type { RetreatBed, Participant } from '@repo/types';
import { useI18n } from 'vue-i18n';
import { useTapAssign } from '@/composables/useTapAssign';
import { useDragState } from '@/composables/useDragState';
import {
  sortUnassigned as sortUnassignedUtil,
  filterUnassignedBySearch as filterUnassignedBySearchUtil,
  computeIncompatibleBedIds as computeIncompatibleBedIdsUtil,
  getProgressColor as getProgressColorUtil,
  type UnassignedSort,
} from '@/utils/bedAssignmentUtils';
import BedCard from './BedCard.vue';
import RoomCard from './RoomCard.vue';

const props = defineProps<{ id: string }>();
const retreatStore = useRetreatStore();
const participantStore = useParticipantStore();
const { toast } = useToast();
const { t } = useI18n();

const {
  tappedParticipant,
  onTouchStart: tapTouchStart,
  onTouchEnd: tapTouchEnd,
  isSelected: isTapSelected,
  clearSelection: clearTap,
} = useTapAssign();

const { draggedParticipantType, startDrag: startDragState, endDrag } = useDragState();

const beds = ref<RetreatBed[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

// Dialog states
const isAutoAssignDialogOpen = ref(false);
const isClearAssignmentsDialogOpen = ref(false);
const isAutoAssigning = ref(false);
const isClearing = ref(false);

// Drag and drop states
const isOverUnassignedServer = ref(false);
const isOverUnassignedWalker = ref(false);
const isOverBed = ref<string | null>(null);

// View mode state
const viewMode = ref<'individual' | 'grouped'>('individual');

// Mobile tab state for unassigned panel
const unassignedTab = ref<'server' | 'walker'>('walker');

// Quick search for unassigned pills
const unassignedSearch = ref('');

// Scroll progress bar
const progressPct = ref(0);
// Use scroll progress for width; use primary color by default.
// Could switch to occupancy-based color via `getProgressColorUtil(progressPct.value)`.
const progressColor = computed(() => 'bg-primary');
// Silence unused import warning (kept for future toggle to occupancy-colored bar)
void getProgressColorUtil;

let scrollEl: HTMLElement | Window | null = null;
const computeScrollProgress = () => {
  if (!scrollEl) return;
  let scrollTop: number, max: number;
  if (scrollEl === window) {
    scrollTop = window.scrollY;
    max = document.documentElement.scrollHeight - window.innerHeight;
  } else {
    const el = scrollEl as HTMLElement;
    scrollTop = el.scrollTop;
    max = el.scrollHeight - el.clientHeight;
  }
  progressPct.value = max > 0 ? Math.min(100, Math.round((scrollTop / max) * 100)) : 0;
};

// Scroll to a floor heading
const scrollToFloor = (floor: string) => {
  const el = document.getElementById(`floor-${floor}`);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// Undo last assignment
type UndoState = {
  bedId: string;
  prevParticipantId: string | null;
  participantName: string;
  bedLabel: string;
};
const undoState = ref<UndoState | null>(null);
let undoTimer: number | null = null;

const scheduleUndoClear = () => {
  if (undoTimer !== null) window.clearTimeout(undoTimer);
  undoTimer = window.setTimeout(() => {
    undoState.value = null;
    undoTimer = null;
  }, 6000);
};

const performUndo = async () => {
  if (!undoState.value) return;
  const { bedId, prevParticipantId } = undoState.value;
  undoState.value = null;
  if (undoTimer !== null) { window.clearTimeout(undoTimer); undoTimer = null; }
  try {
    if (prevParticipantId) {
      await api.put(`/retreat-beds/${bedId}/assign`, { participantId: prevParticipantId });
    } else {
      await api.put(`/retreat-beds/${bedId}/assign`, { participantId: null });
    }
    await fetchBeds(true);
    if (retreatStore.selectedRetreatId) {
      participantStore.filters.retreatId = retreatStore.selectedRetreatId;
      await participantStore.fetchParticipants();
    }
  } catch (err: any) {
    toast({
      title: t('common.error'),
      description: err.response?.data?.message || err.message || t('bedAssignments.undoError'),
      variant: 'destructive',
    });
  }
};

// Compatibility: set of bed ids considered incompatible for tappedParticipant
// Rule: an empty bed is incompatible if any other participant in the same room
// has opposite snoring status from the tapped participant.
const incompatibleBedIds = computed<Set<string>>(() =>
  computeIncompatibleBedIdsUtil(
    beds.value,
    tappedParticipant.value
      ? { id: tappedParticipant.value.id, snores: (tappedParticipant.value as any).snores }
      : null,
  ),
);

const filterUnassignedBySearch = (list: any[]) =>
  filterUnassignedBySearchUtil(list, unassignedSearch.value);

// Sort order for unassigned lists
const unassignedSort = ref<UnassignedSort>(
  (localStorage.getItem('bedAssignments_unassignedSort') as UnassignedSort) || 'age'
);
watch(unassignedSort, (v) => localStorage.setItem('bedAssignments_unassignedSort', v));

const sortUnassigned = (list: any[]) => sortUnassignedUtil(list, unassignedSort.value);

// Pill click handler (desktop/DevTools fallback; real mobile uses touchend)
let lastTapTs = 0;
const onPillClick = (participant: Participant) => {
  if (Date.now() - lastTapTs < 500) return;
  lastTapTs = Date.now();
  if (tappedParticipant.value?.id === participant.id) {
    clearTap();
    return;
  }
  tappedParticipant.value = { ...participant } as any;
};

// Long-press preview popover
const previewParticipant = ref<Participant | null>(null);
let longPressTimer: number | null = null;
let longPressTriggered = false;

const onPillPressStart = (participant: Participant) => {
  longPressTriggered = false;
  if (longPressTimer !== null) window.clearTimeout(longPressTimer);
  longPressTimer = window.setTimeout(() => {
    longPressTriggered = true;
    previewParticipant.value = participant;
    try { navigator.vibrate?.(40); } catch { /* vibration unsupported */ }
  }, 550);
};

const onPillPressEnd = () => {
  if (longPressTimer !== null) { window.clearTimeout(longPressTimer); longPressTimer = null; }
};

const onPillPressCancel = () => {
  if (longPressTimer !== null) { window.clearTimeout(longPressTimer); longPressTimer = null; }
};

// Intercept click/touchend to block assign-tap if long-press already fired
const onPillClickWithLongPress = (participant: Participant, event: MouseEvent) => {
  if (longPressTriggered) {
    longPressTriggered = false;
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  onPillClick(participant);
};

const closePreview = () => {
  previewParticipant.value = null;
};

// Tap assign to a bed: if a participant is tapped, assign it to the tapped bed
const onBedTap = async (bedId: string) => {
  if (!tappedParticipant.value) return;
  const participantId = tappedParticipant.value.id;
  clearTap();
  await assignParticipant(bedId, participantId);
};

// Search states
const searchQuery = ref('');
const searchType = ref<'all' | 'participants' | 'beds'>('all');
const participantFilter = ref<'all' | 'walkers' | 'servers' | 'snores' | 'nonSnores' | 'free'>('all');
const ageFilter = ref<'all' | 'under40' | '40to55' | '56to65' | 'over65'>('all');

const calculateAge = (birthDate: string | Date): number | null => {
  if (!birthDate) return null;
  let dob: Date;
  if (typeof birthDate === 'string') {
    const match = birthDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
    dob = match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date(birthDate);
  } else {
    dob = birthDate;
  }
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age;
};

const fetchBeds = async (silent = false) => {
  if (!retreatStore.selectedRetreatId) return;
  // Only show loader on initial load; subsequent refetches update in place
  // so that the DOM doesn't unmount and scroll position stays put.
  if (!silent && beds.value.length === 0) loading.value = true;
  error.value = null;
  try {
    const response = await api.get(`/retreats/${retreatStore.selectedRetreatId}/beds`);
    beds.value = response.data;
  } catch (err: any) {
    const errorMessage = err.response?.data?.message || err.message || t('bedAssignments.fetchBedsError');
    error.value = errorMessage;
    toast({
      title: t('common.error'),
      description: errorMessage,
      variant: 'destructive',
    });
  } finally {
    loading.value = false;
  }
};

const groupedBeds = computed(() => {
  return beds.value.reduce((acc, bed) => {
    const floor = bed.floor || 0;
    if (!acc[floor]) {
      acc[floor] = [];
    }
    acc[floor].push(bed);
    return acc;
  }, {} as Record<string, RetreatBed[]>);
});

const sortedFloors = computed(() => {
  return Object.keys(groupedBeds.value).sort((a, b) => Number(a) - Number(b));
});

const unassignedParticipants = computed(() => {
  const assignedIds = new Set(beds.value.map(b => b.participantId).filter(Boolean));

  const allParticipants = participantStore.participants || [];
  const filteredParticipants = allParticipants.filter(p =>
    !assignedIds.has(p.id) &&
    !p.isCancelled &&
    p.type !== 'waiting'
  );

  return filteredParticipants;
});

const unassignedWalkers = computed(() =>
  sortUnassigned(filterUnassignedBySearch(unassignedParticipants.value.filter((p: any) => p.type === 'walker')))
);

const unassignedServers = computed(() =>
  sortUnassigned(filterUnassignedBySearch(unassignedParticipants.value.filter((p: any) => p.type === 'server')))
);

// Statistics
const totalParticipants = computed(() => {
  return (participantStore.participants || []).filter(p =>
    !p.isCancelled &&
    p.type !== 'waiting'
  ).length;
});

const totalBeds = computed(() => beds.value.filter(b => b.isActive !== false).length);

const assignedBeds = computed(() => beds.value.filter(b => b.isActive !== false && b.participantId).length);

// Search and filter computed properties
const filteredBeds = computed(() => {
  let filtered = [...beds.value];

  // Apply participant filter
  if (participantFilter.value !== 'all') {
    filtered = filtered.filter(bed => {
      if (participantFilter.value === 'free') {
        return !bed.participant && bed.isActive !== false;
      }
      if (!bed.participant) return false;

      switch (participantFilter.value) {
        case 'walkers':
          return bed.participant.type === 'walker';
        case 'servers':
          return bed.participant.type === 'server';
        case 'snores':
          return bed.participant.snores === true;
        case 'nonSnores':
          return bed.participant.snores === false;
        default:
          return true;
      }
    });
  }

  // Apply age filter
  if (ageFilter.value !== 'all') {
    filtered = filtered.filter(bed => {
      if (!bed.participant?.birthDate) return false;
      const age = calculateAge(bed.participant.birthDate);
      if (age === null) return false;
      switch (ageFilter.value) {
        case 'under40': return age < 40;
        case '40to55': return age >= 40 && age <= 55;
        case '56to65': return age >= 56 && age <= 65;
        case 'over65': return age > 65;
        default: return true;
      }
    });
  }

  // Apply search query
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase().trim();

    filtered = filtered.filter(bed => {
      // Search beds
      if (searchType.value === 'all' || searchType.value === 'beds') {
        if (
          bed.roomNumber.toLowerCase().includes(query) ||
          bed.bedNumber.toLowerCase().includes(query) ||
          (bed.floor && bed.floor.toString().includes(query)) ||
          bed.type.toLowerCase().includes(query)
        ) {
          return true;
        }
      }

      // Search participants
      if (searchType.value === 'all' || searchType.value === 'participants') {
        if (bed.participant) {
          const participant = bed.participant;
          if (
            participant.firstName.toLowerCase().includes(query) ||
            participant.lastName.toLowerCase().includes(query) ||
            (participant.id_on_retreat && participant.id_on_retreat.toString().includes(query)) ||
            (participant.family_friend_color && participant.family_friend_color.toLowerCase().includes(query))
          ) {
            return true;
          }
        }
      }

      return false;
    });
  }

  return filtered;
});

const groupedFilteredBeds = computed(() => {
  return filteredBeds.value.reduce((acc, bed) => {
    const floor = bed.floor || 0;
    const label = (bed as any).floorLabel || '';
    const key = `${floor}||${label}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(bed);
    return acc;
  }, {} as Record<string, RetreatBed[]>);
});

const sortedFilteredFloors = computed(() => {
  return Object.keys(groupedFilteredBeds.value).sort((a, b) => {
    const [af, al = ''] = a.split('||');
    const [bf, bl = ''] = b.split('||');
    return Number(af) - Number(bf) || al.localeCompare(bl);
  });
});

// Room grouping computed properties
const groupedFilteredBedsByRoomAndFloor = computed(() => {
  return filteredBeds.value.reduce((acc, bed) => {
    const floor = bed.floor || 0;
    const label = (bed as any).floorLabel || '';
    const key = `${floor}||${label}`;
    const roomNumber = bed.roomNumber;

    if (!acc[key]) acc[key] = {};
    if (!acc[key][roomNumber]) acc[key][roomNumber] = [];

    acc[key][roomNumber].push(bed);
    return acc;
  }, {} as Record<string, Record<string, RetreatBed[]>>);
});

// Drag and drop functions
const startDrag = (event: DragEvent, participant: Participant) => {
  // Cancel long-press preview timer: on Mac the native drag takes >550ms to fire,
  // and the preview dialog would otherwise pop up and block the drag.
  onPillPressCancel();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/json', JSON.stringify({
      ...participant,
      sourceBedId: beds.value.find(b => b.participantId === participant.id)?.id
    }));
    if (participant.type === 'walker' || participant.type === 'server') {
      startDragState(participant.type);
    }
  }
};

const handleDragEnd = () => {
  endDrag();
  isOverUnassignedServer.value = false;
  isOverUnassignedWalker.value = false;
  isOverBed.value = null;
};

const onDragOverUnassigned = (_event: DragEvent, participantType: 'server' | 'walker') => {
  // dataTransfer.getData() is blocked in dragover events (Safari strict).
  // Read the reactive draggedParticipantType instead.
  if (!draggedParticipantType.value) return;
  if (participantType === 'server' && draggedParticipantType.value === 'server') {
    isOverUnassignedServer.value = true;
  } else if (participantType === 'walker' && draggedParticipantType.value === 'walker') {
    isOverUnassignedWalker.value = true;
  }
};

const onDragLeaveUnassigned = (event: DragEvent, participantType: 'server' | 'walker') => {
  // Only clear highlight if pointer truly left the zone, not when it entered a child.
  const target = event.currentTarget as HTMLElement;
  const relatedTarget = event.relatedTarget as HTMLElement | null;
  if (!relatedTarget || !target.contains(relatedTarget)) {
    if (participantType === 'server') isOverUnassignedServer.value = false;
    else isOverUnassignedWalker.value = false;
  }
};

const onDropToUnassigned = async (event: DragEvent, _participantType: 'server' | 'walker') => {
  isOverUnassignedServer.value = false;
  isOverUnassignedWalker.value = false;

  const participantData = event.dataTransfer?.getData('application/json');
  if (!participantData) return;

  const participant = JSON.parse(participantData);

  // Only proceed if the participant was dragged from a bed
  if (!participant.sourceBedId) return;

  try {
    await unassignParticipant(participant.sourceBedId);
  } catch (error) {
    console.error('Failed to unassign participant:', error);
  }
};

const onDragOverBed = (event: DragEvent, bedId: string) => {
  isOverBed.value = bedId;
};

const onDragLeaveBed = (event: DragEvent, bedId: string) => {
  // Avoid flicker when the pointer moves over a child element of the bed card.
  const target = event.currentTarget as HTMLElement | null;
  const relatedTarget = event.relatedTarget as HTMLElement | null;
  if (target && relatedTarget && target.contains(relatedTarget)) return;
  if (isOverBed.value === bedId) {
    isOverBed.value = null;
  }
};

const onDropToBed = async (event: DragEvent, bedId: string) => {
  isOverBed.value = null;

  const participantData = event.dataTransfer?.getData('application/json');
  if (!participantData) return;

  const participant = JSON.parse(participantData);
  try {
    await assignParticipant(bedId, participant.id);
  } catch (error) {
    console.error('Failed to assign participant:', error);
  }
};

const assignParticipant = async (bedId: string, participantId: string) => {
  const prevBed = beds.value.find(b => b.id === bedId);
  const prevParticipantId = prevBed?.participantId ?? null;
  const participant = (participantStore.participants || []).find((p: any) => p.id === participantId);
  const bedLabel = prevBed ? `${prevBed.roomNumber}-${prevBed.bedNumber}` : '';
  const participantName = participant
    ? `${participant.firstName} ${participant.lastName}`.trim()
    : t('bedAssignments.participant') || 'Participante';
  try {
    await api.put(`/retreat-beds/${bedId}/assign`, { participantId });
    // Refresh data
    await fetchBeds(true);
    if (retreatStore.selectedRetreatId) {
      participantStore.filters.retreatId = retreatStore.selectedRetreatId;
      await participantStore.fetchParticipants();
    }
    // Show undo banner
    undoState.value = { bedId, prevParticipantId, participantName, bedLabel };
    scheduleUndoClear();
  } catch (error: any) {
    const errorMessage = error.response?.data?.message || error.message || t('bedAssignments.assignmentError');
    toast({
      title: t('common.error'),
      description: errorMessage,
      variant: 'destructive',
    });
  }
};

const unassignParticipant = async (bedId: string) => {
  try {
    await api.put(`/retreat-beds/${bedId}/assign`, { participantId: null });
    // Refresh data
    await fetchBeds(true);
    if (retreatStore.selectedRetreatId) {
      participantStore.filters.retreatId = retreatStore.selectedRetreatId;
      await participantStore.fetchParticipants();
    }
  } catch (error: any) {
    const errorMessage = error.response?.data?.message || error.message || t('bedAssignments.unassignmentError');
    toast({
      title: t('common.error'),
      description: errorMessage,
      variant: 'destructive',
    });
  }
};

const toggleBedActive = async (bedId: string) => {
  const bed = beds.value.find(b => b.id === bedId);
  if (!bed) return;

  const newIsActive = bed.isActive === false ? true : false;
  try {
    await api.put(`/retreat-beds/${bedId}/toggle-active`, { isActive: newIsActive });
    await fetchBeds(true);
    if (retreatStore.selectedRetreatId) {
      participantStore.filters.retreatId = retreatStore.selectedRetreatId;
      await participantStore.fetchParticipants();
    }
    toast({
      title: newIsActive ? t('bedAssignments.bedEnabled') : t('bedAssignments.bedDisabled'),
      description: newIsActive ? t('bedAssignments.bedEnabledDesc') : t('bedAssignments.bedDisabledDesc'),
    });
  } catch (error: any) {
    const errorMessage = error.response?.data?.message || error.message;
    toast({
      title: t('common.error'),
      description: errorMessage,
      variant: 'destructive',
    });
  }
};

// Action functions
const confirmAutoAssign = async () => {
  if (!retreatStore.selectedRetreatId) return;

  isAutoAssigning.value = true;
  try {
    await api.post(`/retreats/${retreatStore.selectedRetreatId}/auto-assign-beds`);
    isAutoAssignDialogOpen.value = false;
    await fetchBeds();
    toast({
      title: t('bedAssignments.autoAssignSuccess'),
      description: t('bedAssignments.autoAssignSuccessDesc'),
    });
  } catch (error: any) {
    const errorMessage = error.response?.data?.message || error.message || t('bedAssignments.autoAssignError');
    toast({
      title: t('common.error'),
      description: errorMessage,
      variant: 'destructive',
    });
  } finally {
    isAutoAssigning.value = false;
  }
};

const confirmClearAssignments = async () => {
  if (!retreatStore.selectedRetreatId) return;

  isClearing.value = true;
  try {
    await api.delete(`/retreats/${retreatStore.selectedRetreatId}/bed-assignments`);
    isClearAssignmentsDialogOpen.value = false;
    await fetchBeds();
    toast({
      title: t('bedAssignments.clearAssignmentsSuccess'),
      description: t('bedAssignments.clearAssignmentsSuccessDesc'),
    });
  } catch (error: any) {
    const errorMessage = error.response?.data?.message || error.message || t('bedAssignments.clearAssignmentsError');
    toast({
      title: t('common.error'),
      description: errorMessage,
      variant: 'destructive',
    });
  } finally {
    isClearing.value = false;
  }
};

const exportAssignments = async () => {
  if (!retreatStore.selectedRetreatId) return;

  try {
    const response = await api.get(`/retreats/${retreatStore.selectedRetreatId}/bed-assignments/export`, {
      responseType: 'blob'
    });

    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `bed-assignments-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);

    toast({
      title: t('bedAssignments.exportSuccess'),
      description: t('bedAssignments.exportSuccessDesc'),
    });
  } catch (error: any) {
    const errorMessage = error.response?.data?.message || error.message || t('bedAssignments.exportError');
    toast({
      title: t('common.error'),
      description: errorMessage,
      variant: 'destructive',
    });
  }
};

// Search functions
const clearSearch = () => {
  searchQuery.value = '';
  searchType.value = 'all';
  participantFilter.value = 'all';
  ageFilter.value = 'all';
};

const shouldHighlightBed = (bed: RetreatBed) => {
  if (!searchQuery.value.trim()) return false;

  const query = searchQuery.value.toLowerCase().trim();
  if (bed.participant) {
    return (
      bed.participant.firstName.toLowerCase().includes(query) ||
      bed.participant.lastName.toLowerCase().includes(query) ||
      (bed.participant.id_on_retreat && bed.participant.id_on_retreat.toString().includes(query))
    );
  }

  return (
    bed.roomNumber.toLowerCase().includes(query) ||
    bed.bedNumber.toLowerCase().includes(query) ||
    (bed.floor && bed.floor.toString().includes(query))
  );
};

const toggleViewMode = () => {
  viewMode.value = viewMode.value === 'individual' ? 'grouped' : 'individual';
};

const getFilterLabel = () => {
  const parts: string[] = [];
  const participantLabels: Record<string, string> = {
    walkers: t('bedAssignments.participantFilter.walkers'),
    servers: t('bedAssignments.participantFilter.servers'),
    snores: t('bedAssignments.participantFilter.snores'),
    nonSnores: t('bedAssignments.participantFilter.nonSnores'),
    free: t('bedAssignments.participantFilter.free')
  };
  if (participantLabels[participantFilter.value]) {
    parts.push(participantLabels[participantFilter.value]);
  }
  const ageLabels: Record<string, string> = {
    under40: t('bedAssignments.ageFilter.under40'),
    '40to55': t('bedAssignments.ageFilter.40to55'),
    '56to65': t('bedAssignments.ageFilter.56to65'),
    over65: t('bedAssignments.ageFilter.over65')
  };
  if (ageLabels[ageFilter.value]) {
    parts.push(ageLabels[ageFilter.value]);
  }
  return parts.join(', ');
};

// Use props.id (route param) as the single source of truth to avoid
// ping-pong loops when selectedRetreatId differs from the URL.
const onJessyBedMutation = () => fetchBeds();

onMounted(async () => {
  await retreatStore.fetchRetreat(props.id);
  fetchBeds();
  participantStore.filters.retreatId = props.id;
  participantStore.fetchParticipants();
  window.addEventListener('jessy:beds-changed', onJessyBedMutation);
  // Attach scroll listener for progress bar
  scrollEl = document.querySelector('main') || window;
  (scrollEl as any).addEventListener('scroll', computeScrollProgress, { passive: true });
  computeScrollProgress();
});

onUnmounted(() => {
  window.removeEventListener('jessy:beds-changed', onJessyBedMutation);
  clearTap();
  if (scrollEl) {
    (scrollEl as any).removeEventListener('scroll', computeScrollProgress);
    scrollEl = null;
  }
});

watch(() => retreatStore.selectedRetreatId, (newId, oldId) => {
  if (newId && newId !== oldId && newId !== props.id) {
    // User picked a different retreat from the sidebar — let the router handle it
    return;
  }
  if (newId && newId !== oldId) {
    fetchBeds();
    participantStore.filters.retreatId = newId;
    participantStore.fetchParticipants();
  }
});
</script>
