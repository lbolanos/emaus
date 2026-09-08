<template>
  <Dialog :open="open" @update:open="handleClose">
    <DialogContent class="max-w-6xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle class="text-xl">
          {{ props.mode === 'add' ? $t('retreatModal.addTitle') : $t('retreatModal.editTitle') }}
        </DialogTitle>
        <DialogDescription>
          {{ props.mode === 'add' ? $t('retreatModal.addDescription') : $t('retreatModal.editDescription') }}
        </DialogDescription>
      </DialogHeader>

      <form @submit.prevent="handleSubmit" class="space-y-6">
        <Tabs v-model="activeTab" class="w-full">
          <TabsList class="grid w-full grid-cols-8">
            <TabsTrigger value="general">{{ $t('retreatModal.sections.general') }}</TabsTrigger>
            <TabsTrigger value="logistics">{{ $t('retreatModal.sections.logistics') }}</TabsTrigger>
            <TabsTrigger value="settings">Ajustes</TabsTrigger>
            <TabsTrigger value="financials">{{ $t('retreatModal.sections.financials') }}</TabsTrigger>
            <TabsTrigger value="notes">{{ $t('retreatModal.sections.notes') }}</TabsTrigger>
            <TabsTrigger value="closing">Clausura</TabsTrigger>
            <TabsTrigger value="flyer">{{ $t('retreatModal.sections.flyer') }}</TabsTrigger>
            <TabsTrigger value="memories">Recuerdos</TabsTrigger>
          </TabsList>

          <!-- General Tab -->
          <TabsContent value="general" class="space-y-6 mt-6">
            <!-- Basic Info: Type, Number, Parish, House -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">

              <div class="space-y-2">
                <Label for="parish">
                  {{ $t('retreatModal.parish') }}
                  <span class="text-red-500">*</span>
                </Label>
                <Input
                  id="parish"
                  v-model="formData.parish"
                  :class="{ 'border-red-500': errors.parish }"
                  :placeholder="$t('retreatModal.parishPlaceholder')"
                  required
                />
                <p v-if="errors.parish" class="text-sm text-red-500">{{ errors.parish }}</p>
              </div>
              
              <div class="space-y-2">
                <Label for="retreatType">
                  {{ $t('retreatModal.retreatType') }}
                </Label>
                <Select v-model="formData.retreat_type">
                  <SelectTrigger id="retreatType">
                    <SelectValue :placeholder="$t('retreatModal.retreatTypePlaceholder')" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="men">{{ $t('retreatModal.types.men') }}</SelectItem>
                      <SelectItem value="women">{{ $t('retreatModal.types.women') }}</SelectItem>
                      <SelectItem value="couples">{{ $t('retreatModal.types.couples') }}</SelectItem>
                      <SelectItem value="effeta">{{ $t('retreatModal.types.effeta') }}</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              <div class="space-y-2">
                <Label for="retreatNumber">
                  {{ $t('retreatModal.retreatNumber') }}
                </Label>
                <Input
                  id="retreatNumber"
                  v-model="formData.retreat_number_version"
                  :placeholder="$t('retreatModal.retreatNumberPlaceholder')"
                />
              </div>

              <div class="space-y-2">
                <Label for="slug">
                  URL corta (slug)
                </Label>
                <div class="flex items-center gap-2">
                  <span class="text-sm text-muted-foreground whitespace-nowrap">emaus.cc/</span>
                  <Input
                    id="slug"
                    v-model="formData.slug"
                    :class="{ 'border-red-500': !slugAvailable }"
                    placeholder="ej: interlomasiii"
                    @input="normalizeSlug"
                  />
                </div>
                <p v-if="!slugAvailable" class="text-xs text-red-500">Este slug ya está en uso. Elige otro.</p>
                <p v-else class="text-xs text-muted-foreground">Se auto-genera desde parroquia + número. Solo letras minúsculas y números.</p>
                <div
                  v-if="slugAvailable && slugSeemsMismatched"
                  class="mt-2 p-2 rounded-md bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start gap-2"
                >
                  <span class="text-base leading-none">⚠️</span>
                  <div class="flex-1">
                    <p>El slug <code class="font-mono">{{ formData.slug }}</code> no parece coincidir con la parroquia <code class="font-mono">{{ formData.parish }}</code>. Probablemente quedó del retiro anterior al duplicar. ¿Regenerar?</p>
                    <button
                      type="button"
                      class="mt-1 text-amber-700 underline hover:text-amber-800 font-medium"
                      @click="regenerateSlugFromParish"
                    >Regenerar slug desde parroquia</button>
                  </div>
                </div>
              </div>

              <div class="space-y-2">
                <Label for="externalRegistrationUrl">
                  Registro externo de caminantes
                </Label>
                <Input
                  id="externalRegistrationUrl"
                  v-model="formData.externalRegistrationUrl"
                  type="url"
                  placeholder="https://ejemplo.com/inscripcion"
                  @blur="normalizeExternalRegistrationUrl"
                />
                <p class="text-xs text-muted-foreground">
                  Solo si la parroquia lleva el registro en su propio sitio. Al llenarlo,
                  <code class="font-mono">emaus.cc/{{ formData.slug || 'slug' }}</code> redirige ahí,
                  y el QR del volante y el enlace del tablero apuntan al mismo lugar.
                  Los servidores siguen registrándose en emaus.cc.
                </p>
              </div>

            </div>

            <!-- Casa + regeneración de camas -->
            <div class="p-4 border rounded-lg space-y-3">
              <div class="space-y-1">
                <Label for="houseId" class="font-medium">
                  {{ $t('retreatModal.house') }}
                  <span class="text-red-500">*</span>
                </Label>
                <p class="text-xs text-muted-foreground">
                  Selecciona la casa de retiro donde se llevará a cabo.
                </p>
              </div>
              <Select v-model="formData.houseId">
                <SelectTrigger id="houseId" :class="{ 'border-red-500': errors.houseId }">
                  <SelectValue :placeholder="$t('retreatModal.selectHouse')" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem v-for="house in availableHouses" :key="house.id" :value="house.id">
                      <div class="flex flex-col">
                        <span class="font-medium">{{ house.name }}</span>
                        <span class="text-xs text-muted-foreground">{{ houseLocationLabel(house) }}</span>
                      </div>
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <p v-if="errors.houseId" class="text-sm text-red-500">{{ errors.houseId }}</p>
              <div v-if="props.mode === 'edit'" class="flex items-center space-x-2 pt-1">
                <Checkbox
                  id="refreshBeds"
                  :model-value="refreshBedsFromHouse"
                  @update:model-value="refreshBedsFromHouse = $event"
                  :disabled="isSubmitting"
                />
                <Label for="refreshBeds" class="text-sm cursor-pointer">
                  {{ $t('retreatModal.refreshBedsFromHouse') }}
                </Label>
              </div>
              <p v-if="props.mode === 'edit'" class="text-xs text-muted-foreground">
                Al activarlo, al guardar se regenerarán las camas del retiro desde la configuración actual de la casa.
              </p>

              <!-- Timezone (override opcional) -->
              <div class="space-y-1 pt-2 border-t">
                <Label for="retreatTimezone" class="font-medium text-sm">Zona horaria del retiro</Label>
                <p class="text-xs text-muted-foreground">
                  Por defecto se usa la zona horaria de la casa.
                  <span v-if="selectedHouseTimezone" class="font-medium">Casa: {{ selectedHouseTimezone }}.</span>
                  Cambia solo si este retiro será en otra zona.
                </p>
                <Select :model-value="formData.timezone ?? '__inherit__'" @update:model-value="onTimezoneSelect">
                  <SelectTrigger id="retreatTimezone" class="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__inherit__">
                      Heredar de la casa{{ selectedHouseTimezone ? ` (${selectedHouseTimezone})` : '' }}
                    </SelectItem>
                    <SelectItem v-for="tz in retreatTimezoneOptions" :key="tz" :value="tz">
                      {{ tz }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <!-- Comunidad organizadora (opcional) -->
            <div class="p-4 border rounded-lg space-y-3">
              <div class="space-y-1">
                <Label for="retreatCommunity" class="font-medium">
                  {{ $t('retreatModal.community') }}
                </Label>
                <p class="text-xs text-muted-foreground">
                  {{ $t('retreatModal.communityHint') }}
                </p>
              </div>
              <Select
                :model-value="formData.communityId ?? '__none__'"
                @update:model-value="onCommunitySelect"
              >
                <SelectTrigger id="retreatCommunity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{{ $t('retreatModal.communityNone') }}</SelectItem>
                  <SelectItem
                    v-for="community in availableCommunities"
                    :key="community.id"
                    :value="community.id"
                  >
                    {{ community.name }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <!-- Dates -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="space-y-2">
                <Label for="startDate">
                  {{ $t('retreatModal.startDate') }}
                  <span class="text-red-500">*</span>
                </Label>
                <Input
                  id="startDate"
                  type="date"
                  v-model="startDate"
                  :min="props.mode === 'add' ? minDate : undefined"
                  :class="{ 'border-red-500': errors.startDate }"
                  required
                />
                <p v-if="errors.startDate" class="text-sm text-red-500">{{ errors.startDate }}</p>
              </div>

              <div class="space-y-2">
                <Label for="endDate">
                  {{ $t('retreatModal.endDate') }}
                  <span class="text-red-500">*</span>
                </Label>
                <Input
                  id="endDate"
                  type="date"
                  v-model="endDate"
                  :min="props.mode === 'add' ? (startDate || minDate) : undefined"
                  :class="{ 'border-red-500': errors.endDate }"
                  required
                />
                <p v-if="errors.endDate" class="text-sm text-red-500">{{ errors.endDate }}</p>
              </div>
            </div>
          </TabsContent>

          <!-- Logistics Tab -->
          <TabsContent value="logistics" class="space-y-6 mt-6">
            <!-- Capacity -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="space-y-2">
                <Label for="max_walkers">{{ $t('retreatModal.max_walkers') }}</Label>
                <Input
                  id="max_walkers"
                  type="number"
                  v-model.number="formData.max_walkers"
                  :placeholder="$t('retreatModal.maxWalkersPlaceholder')"
                  :class="{ 'border-red-500': errors.max_walkers }"
                  min="1"
                />
                <p v-if="errors.max_walkers" class="text-sm text-red-500">{{ errors.max_walkers }}</p>
              </div>

              <div class="space-y-2">
                <Label for="max_servers">{{ $t('retreatModal.max_servers') }}</Label>
                <Input
                  id="max_servers"
                  type="number"
                  v-model.number="formData.max_servers"
                  :placeholder="$t('retreatModal.maxServersPlaceholder')"
                  :class="{ 'border-red-500': errors.max_servers }"
                  min="1"
                />
                <p v-if="errors.max_servers" class="text-sm text-red-500">{{ errors.max_servers }}</p>
              </div>
            </div>

            <!-- Configuración de parejas (solo retiros de matrimonios) -->
            <div v-if="formData.retreat_type === 'couples'" class="space-y-3 p-3 border rounded-md bg-muted/20">
              <p class="text-sm font-medium">{{ $t('retreatModal.couplesConfig.title') }}</p>
              <div class="flex items-center space-x-2">
                <Checkbox
                  id="couplesShareRoom"
                  :model-value="formData.couplesShareRoom"
                  @update:model-value="formData.couplesShareRoom = $event === true"
                />
                <Label for="couplesShareRoom" class="text-sm cursor-pointer">
                  {{ $t('retreatModal.couplesConfig.shareRoom') }}
                </Label>
              </div>
              <div class="flex items-center space-x-2">
                <Checkbox
                  id="couplesShareTable"
                  :model-value="formData.couplesShareTable"
                  @update:model-value="formData.couplesShareTable = $event === true"
                />
                <Label for="couplesShareTable" class="text-sm cursor-pointer">
                  {{ $t('retreatModal.couplesConfig.shareTable') }}
                </Label>
              </div>
            </div>

            <!-- House capacity info display -->
            <div v-if="houseCapacity.walkerBeds !== null && mode === 'add'" class="text-sm text-muted-foreground p-3 border rounded-md bg-muted/20">
              <span class="font-medium mr-2">House Bed Capacity:</span>
              <div class="flex items-center space-x-4 inline-flex">
                <span class="flex items-center">
                  <div class="w-2 h-2 bg-blue-500 rounded-full mr-1"></div>
                  {{ $t('retreatModal.walkerBeds', { count: houseCapacity.walkerBeds }) }}
                </span>
                <span class="flex items-center">
                  <div class="w-2 h-2 bg-green-500 rounded-full mr-1"></div>
                  {{ $t('retreatModal.serverBeds', { count: houseCapacity.serverBeds }) }}
                </span>
              </div>
            </div>

            <!-- Arrival Times -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="space-y-2">
                <Label for="walkerArrivalTime">
                  {{ $t('retreatModal.walkerArrivalTime') }}
                </Label>
                <Input
                  id="walkerArrivalTime"
                  type="time"
                  v-model="formData.walkerArrivalTime"
                  :placeholder="$t('retreatModal.timePlaceholder')"
                />
                <p class="text-xs text-muted-foreground">
                  {{ $t('retreatModal.walkerArrivalTimeDescription') }}
                </p>
              </div>

              <div class="space-y-2">
                <Label for="serverArrivalTimeFriday">
                  {{ $t('retreatModal.serverArrivalTimeFriday') }}
                </Label>
                <Input
                  id="serverArrivalTimeFriday"
                  type="time"
                  v-model="formData.serverArrivalTimeFriday"
                  :placeholder="$t('retreatModal.timePlaceholder')"
                />
                <p class="text-xs text-muted-foreground">
                  {{ $t('retreatModal.serverArrivalTimeFridayDescription') }}
                </p>
              </div>
            </div>

            <!-- Minuto a Minuto template -->
            <div
              v-if="scheduleTemplateSets.length"
              class="p-4 border rounded-lg space-y-3"
            >
              <div class="space-y-1">
                <Label class="font-medium">Template Minuto a Minuto</Label>
                <p class="text-xs text-muted-foreground">
                  <template v-if="props.mode === 'add'">
                    Al crear el retiro se clonará la agenda del template elegido. Podrás ajustarla después en la vista "Minuto a Minuto".
                  </template>
                  <template v-else>
                    Elige un template y pulsa "Importar ahora" para generar la agenda desde cero en este retiro. Si ya había agenda, la sobrescribirá.
                  </template>
                </p>
              </div>
              <select
                v-model="selectedScheduleTemplateSetId"
                class="w-full border rounded px-2 py-2 text-sm"
                :disabled="isSubmitting || isMaterializing"
              >
                <option
                  v-for="s in scheduleTemplateSets"
                  :key="s.id"
                  :value="s.id"
                >
                  {{ s.name }}{{ s.isDefault ? ' ★' : '' }}
                </option>
              </select>
              <p
                v-if="selectedScheduleTemplateSet?.description"
                class="text-xs text-muted-foreground"
              >
                {{ selectedScheduleTemplateSet.description }}
              </p>
              <div v-if="props.mode === 'add'" class="flex items-center space-x-2">
                <Checkbox
                  id="materializeOnCreate"
                  :model-value="materializeOnCreate"
                  @update:model-value="materializeOnCreate = $event"
                  :disabled="isSubmitting"
                />
                <Label for="materializeOnCreate" class="text-sm cursor-pointer">
                  Importar la agenda al crear el retiro
                </Label>
              </div>
              <div v-else-if="props.retreat" class="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  @click="handleMaterializeNow"
                  :disabled="isSubmitting || isMaterializing || !selectedScheduleTemplateSetId"
                >
                  <Loader2 v-if="isMaterializing" class="w-4 h-4 mr-2 animate-spin" />
                  Importar ahora (sobrescribe)
                </Button>
              </div>
            </div>

            <!-- Tareas Pre-Retiro template -->
            <div
              v-if="preTaskTemplateSets.length"
              class="p-4 border rounded-lg space-y-3"
            >
              <div class="space-y-1">
                <Label class="font-medium">Template Tareas Pre-Retiro</Label>
                <p class="text-xs text-muted-foreground">
                  <template v-if="props.mode === 'add'">
                    Al crear el retiro se generará el checklist "qué hacer y cuándo" con fechas límite calculadas desde la fecha de inicio.
                  </template>
                  <template v-else>
                    Elige un template y pulsa "Importar ahora" para regenerar el checklist de este retiro. Si ya había tareas, las sobrescribirá.
                  </template>
                </p>
              </div>
              <select
                v-model="selectedPreTaskSetId"
                class="w-full border rounded px-2 py-2 text-sm"
                :disabled="isSubmitting || isMaterializingPreTasks"
              >
                <option
                  v-for="s in preTaskTemplateSets"
                  :key="s.id"
                  :value="s.id"
                >
                  {{ s.name }}{{ s.isDefault ? ' ★' : '' }}
                </option>
              </select>
              <p
                v-if="selectedPreTaskSet?.description"
                class="text-xs text-muted-foreground"
              >
                {{ selectedPreTaskSet.description }}
              </p>
              <div v-if="props.mode === 'add'" class="flex items-center space-x-2">
                <Checkbox
                  id="materializePreTasksOnCreate"
                  :model-value="materializePreTasksOnCreate"
                  @update:model-value="materializePreTasksOnCreate = $event"
                  :disabled="isSubmitting"
                />
                <Label for="materializePreTasksOnCreate" class="text-sm cursor-pointer">
                  Crear las tareas al crear el retiro
                </Label>
              </div>
              <div v-else-if="props.retreat" class="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  @click="handleMaterializePreTasksNow"
                  :disabled="isSubmitting || isMaterializingPreTasks || !selectedPreTaskSetId"
                >
                  <Loader2 v-if="isMaterializingPreTasks" class="w-4 h-4 mr-2 animate-spin" />
                  Importar ahora (sobrescribe)
                </Button>
              </div>
            </div>

          </TabsContent>

          <!-- Settings Tab (visibilidad, roles, notificaciones, pickup) -->
          <TabsContent value="settings" class="space-y-6 mt-6">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="p-4 border rounded-lg">
                <div class="space-y-1">
                  <Label for="isPublic" class="font-medium">{{ $t('retreatModal.isPublic') }}</Label>
                  <p class="text-xs text-muted-foreground">{{ $t('retreatModal.isPublicDescription') }}</p>
                </div>
                <RadioGroup v-model="formData.isPublic" :disabled="isSubmitting" class="flex space-x-4 mt-2">
                  <div class="flex items-center space-x-2">
                    <RadioGroupItem id="isPublic-yes" :value="true" />
                    <Label for="isPublic-yes">{{ $t('common.yes') }}</Label>
                  </div>
                  <div class="flex items-center space-x-2">
                    <RadioGroupItem id="isPublic-no" :value="false" />
                    <Label for="isPublic-no">{{ $t('common.no') }}</Label>
                  </div>
                </RadioGroup>
                <div
                  v-if="formData.isPublic"
                  class="mt-3 p-2 rounded-md bg-blue-50 border border-blue-200 text-blue-900 text-xs flex gap-2"
                >
                  <span class="text-base leading-none">ℹ️</span>
                  <span>{{ $t('retreatModal.isPublicWarning') }}</span>
                </div>
              </div>

              <div class="p-4 border rounded-lg">
                <div class="space-y-1">
                  <Label for="roleInvitationEnabled" class="font-medium">{{ $t('retreatModal.roleInvitationEnabled') }}</Label>
                  <p class="text-xs text-muted-foreground">{{ $t('retreatModal.roleInvitationDescription') }}</p>
                </div>
                <RadioGroup v-model="formData.roleInvitationEnabled" :disabled="isSubmitting" class="flex space-x-4 mt-2">
                  <div class="flex items-center space-x-2">
                    <RadioGroupItem id="roleInvitationEnabled-yes" :value="true" />
                    <Label for="roleInvitationEnabled-yes">{{ $t('common.yes') }}</Label>
                  </div>
                  <div class="flex items-center space-x-2">
                    <RadioGroupItem id="roleInvitationEnabled-no" :value="false" />
                    <Label for="roleInvitationEnabled-no">{{ $t('common.no') }}</Label>
                  </div>
                </RadioGroup>
              </div>

              <!-- Email notification settings -->
              <div class="p-4 border rounded-lg md:col-span-2">
                <div class="space-y-1 mb-3">
                  <Label class="font-medium">{{ $t('retreatModal.notificationSettings') }}</Label>
                  <p class="text-xs text-muted-foreground">{{ $t('retreatModal.notificationSettingsDescription') }}</p>
                </div>
                <div class="flex flex-wrap gap-4">
                  <div class="flex items-center space-x-2">
                    <Checkbox
                      id="notifyParticipant"
                      :model-value="formData.notifyParticipant"
                      @update:model-value="formData.notifyParticipant = $event"
                      :disabled="isSubmitting"
                    />
                    <Label for="notifyParticipant">{{ $t('retreatModal.notifyParticipant') }}</Label>
                  </div>
                  <div class="flex items-center space-x-2">
                    <Checkbox
                      id="notifyInviter"
                      :model-value="formData.notifyInviter"
                      @update:model-value="formData.notifyInviter = $event"
                      :disabled="isSubmitting"
                    />
                    <Label for="notifyInviter">{{ $t('retreatModal.notifyInviter') }}</Label>
                  </div>
                  <div v-for="n in [1, 2, 3]" :key="n" class="flex items-center space-x-2">
                    <Checkbox
                      :id="`notifyPalanquero-${n}`"
                      :model-value="formData.notifyPalanqueros.includes(n)"
                      @update:model-value="togglePalanquero(n)"
                      :disabled="isSubmitting"
                    />
                    <Label :for="`notifyPalanquero-${n}`">Palanquero {{ n }}</Label>
                  </div>
                </div>
              </div>

              <div class="p-4 border rounded-lg">
                <div class="space-y-1">
                  <Label class="font-medium">{{ $t('retreatModal.showPickupInfo') }}</Label>
                  <p class="text-xs text-muted-foreground">{{ $t('retreatModal.showPickupInfoDescription') }}</p>
                </div>
                <RadioGroup v-model="formData.flyer_options.showPickupInfo" :disabled="isSubmitting" class="flex space-x-4 mt-2">
                  <div class="flex items-center space-x-2">
                    <RadioGroupItem id="showPickupInfo-yes" :value="true" />
                    <Label for="showPickupInfo-yes">{{ $t('common.yes') }}</Label>
                  </div>
                  <div class="flex items-center space-x-2">
                    <RadioGroupItem id="showPickupInfo-no" :value="false" />
                    <Label for="showPickupInfo-no">{{ $t('common.no') }}</Label>
                  </div>
                </RadioGroup>
              </div>
            </div>
          </TabsContent>

          <!-- Financials Tab -->
          <TabsContent value="financials" class="space-y-6 mt-6">
            <div class="space-y-2">
              <Label for="cost">{{ $t('retreatModal.cost') }}</Label>
              <Input
                id="cost"
                v-model="formData.cost"
                :placeholder="$t('retreatModal.costPlaceholder')"
              />
              <p v-if="costNotNumeric" class="text-sm text-amber-600">
                {{ $t('retreatModal.costNotNumericHint') }}
              </p>
              <p v-if="formData.retreat_type === 'couples'" class="text-sm text-muted-foreground">
                {{ $t('retreatModal.couplesConfig.costPerCoupleHint') }}
              </p>
            </div>

            <!-- Cobro del servidor + valor de la comida (paz y salvo v2).
                 El cobro del CAMINANTE es el campo "Costo" de arriba. -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="space-y-2">
                <Label for="serverFeeAmount">{{ $t('retreatModal.serverFeeAmount') }}</Label>
                <Input
                  id="serverFeeAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  v-model.number="formData.serverFeeAmount"
                  :placeholder="$t('retreatModal.feeAmountPlaceholder')"
                />
              </div>
              <div class="space-y-2">
                <Label for="mealCost">{{ $t('retreatModal.mealCost') }}</Label>
                <Input
                  id="mealCost"
                  type="number"
                  min="0"
                  step="0.01"
                  v-model.number="formData.mealCost"
                  :placeholder="$t('retreatModal.feeAmountPlaceholder')"
                />
              </div>
            </div>
            <p class="text-sm text-muted-foreground">
              {{ $t('retreatModal.feesHelp') }}
            </p>

            <div class="space-y-2">
              <Label for="paymentInfo">{{ $t('retreatModal.paymentInfo') }}</Label>
              <Textarea
                id="paymentInfo"
                v-model="formData.paymentInfo"
                :placeholder="$t('retreatModal.paymentInfoPlaceholder')"
                rows="4"
              />
            </div>

            <div class="space-y-2">
              <Label for="paymentMethods">{{ $t('retreatModal.paymentMethods') }}</Label>
              <Textarea
                id="paymentMethods"
                v-model="formData.paymentMethods"
                :placeholder="$t('retreatModal.paymentMethodsPlaceholder')"
                rows="2"
              />
            </div>
          </TabsContent>

          <!-- Notes Tab -->
          <TabsContent value="notes" class="space-y-6 mt-6">
            <div class="space-y-2">
              <Label for="openingNotes">{{ $t('retreatModal.openingNotes') }}</Label>
              <Textarea
                id="openingNotes"
                v-model="formData.openingNotes"
                :placeholder="$t('retreatModal.openingNotesPlaceholder')"
                rows="2"
              />
            </div>

            <div class="space-y-2">
              <Label for="closingNotes">{{ $t('retreatModal.closingNotes') }}</Label>
              <Textarea
                id="closingNotes"
                v-model="formData.closingNotes"
                :placeholder="$t('retreatModal.closingNotesPlaceholder')"
                rows="2"
              />
            </div>

            <div class="space-y-2">
              <Label for="thingsToBringNotes">{{ $t('retreatModal.thingsToBringNotes') }}</Label>
              <Textarea
                id="thingsToBringNotes"
                v-model="formData.thingsToBringNotes"
                :placeholder="$t('retreatModal.thingsToBringPlaceholder')"
                rows="2"
              />
            </div>

            <div class="space-y-2">
              <Label for="contactPhones">{{ $t('retreatModal.contactPhones') }}</Label>
              <Textarea
                id="contactPhones"
                v-model="formData.contactPhones"
                :placeholder="$t('retreatModal.contactPhonesPlaceholder')"
                rows="2"
              />
              <p class="text-sm text-muted-foreground">{{ $t('retreatModal.contactPhonesHelp') }}</p>
            </div>
          </TabsContent>

          <!-- Closing Mass Tab -->
          <TabsContent value="closing" class="space-y-6 mt-6">
            <div class="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
              Captura la iglesia donde se celebra la <strong>Misa de Clausura</strong>. La dirección
              se mostrará en el dashboard del retiro y estará disponible como variables en las plantillas
              de mensajes para invitar a familiares
              (<code>{{ '{retreat.closingChurchName}' }}</code>,
              <code>{{ '{retreat.closingChurchAddress}' }}</code>,
              <code>{{ '{retreat.closingChurchMapsUrl}' }}</code>,
              <code>{{ '{retreat.closingChurchWazeUrl}' }}</code>).
            </div>

            <div class="space-y-2">
              <Label for="closingChurchName">Nombre de la iglesia</Label>
              <Input
                id="closingChurchName"
                v-model="formData.closingChurchName"
                placeholder="Ej: Parroquia San Judas Tadeo"
              />
            </div>

            <div class="space-y-2">
              <Label for="closingChurchAddress">Dirección</Label>
              <div class="relative">
                <gmp-place-autocomplete
                  v-if="closingChurchAddressEditing"
                  ref="closingChurchAutocompleteField"
                  class="w-full"
                  placeholder="Buscar iglesia o dirección..."
                  :requested-fields="['displayName', 'addressComponents', 'location']"
                  :value="formData.closingChurchAddress"
                />
                <Input
                  v-else
                  id="closingChurchAddress"
                  :model-value="formData.closingChurchAddress"
                  placeholder="Click para buscar la dirección"
                  readonly
                  class="cursor-pointer"
                  @click="closingChurchAddressEditing = true"
                />
              </div>
              <p v-if="formData.closingChurchLatitude != null && formData.closingChurchLongitude != null" class="text-xs text-muted-foreground">
                Coordenadas: {{ formData.closingChurchLatitude.toFixed(6) }}, {{ formData.closingChurchLongitude.toFixed(6) }}
              </p>
              <p v-else class="text-xs text-muted-foreground">
                Selecciona un resultado del autocompletado para guardar las coordenadas (necesarias para abrir Maps/Waze).
              </p>
            </div>

            <div
              v-if="formData.closingChurchLatitude != null && formData.closingChurchLongitude != null"
              class="space-y-2 rounded-md border bg-muted/20 p-3"
            >
              <Label class="text-sm font-medium">Vista previa de URLs (se usarán en plantillas)</Label>
              <div class="space-y-2 text-xs">
                <div class="flex items-center gap-2">
                  <span class="font-medium w-12 shrink-0">Maps:</span>
                  <code class="truncate flex-1 rounded bg-background px-1 py-0.5">{{ closingChurchMapsUrlPreview }}</code>
                  <Button type="button" variant="outline" size="sm" @click="copyClosingChurchUrl('maps')">Copiar</Button>
                  <Button type="button" variant="outline" size="sm" @click="openClosingChurchUrl('maps')">Abrir</Button>
                </div>
                <div class="flex items-center gap-2">
                  <span class="font-medium w-12 shrink-0">Waze:</span>
                  <code class="truncate flex-1 rounded bg-background px-1 py-0.5">{{ closingChurchWazeUrlPreview }}</code>
                  <Button type="button" variant="outline" size="sm" @click="copyClosingChurchUrl('waze')">Copiar</Button>
                  <Button type="button" variant="outline" size="sm" @click="openClosingChurchUrl('waze')">Abrir</Button>
                </div>
              </div>
            </div>
          </TabsContent>

          <!-- Flyer Tab -->
          <TabsContent value="flyer" class="space-y-4 mt-6">
            <div class="space-y-3 p-4 border rounded-md">
              <p class="text-sm text-muted-foreground">{{ $t('retreatModal.flyer.editorHint') }}</p>
              <Button
                v-if="retreat"
                type="button"
                variant="outline"
                as-child
              >
                <router-link :to="{ name: 'retreat-flyer-edit', params: { id: retreat.id } }">
                  {{ $t('retreatModal.flyer.openEditor') }}
                </router-link>
              </Button>
              <p v-else class="text-sm text-muted-foreground">
                {{ $t('retreatModal.flyer.editorNeedsSavedRetreat') }}
              </p>
            </div>
          </TabsContent>

          <!-- Memories Tab -->
          <TabsContent value="memories" class="space-y-6 mt-6">
            <MemoryUploadForm
              v-if="retreat"
             	:retreat-id="retreat.id"
             	:current-photo-url="retreat.memoryPhotoUrl"
             	:current-music-url="retreat.musicPlaylistUrl"
             	:retreat-end-date="retreat.endDate"
             	@saved="handleMemorySaved"
            />
            <div v-else class="text-center py-8 text-muted-foreground">
             	<p>Guarda el retiro primero para poder añadir recuerdos</p>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <div class="flex justify-between items-center w-full">
            <div class="text-xs text-muted-foreground">
              <span class="text-red-500">*</span> {{ $t('retreatModal.requiredFields') }}
            </div>
            <div class="flex items-center space-x-2">
              <Button
                type="button"
                variant="outline"
                @click="handleClose"
                :disabled="isSubmitting"
              >
                {{ $t('retreatModal.cancel') }}
              </Button>
              <Button
                type="submit"
                :disabled="isSubmitting || !isFormValid"
                class="min-w-[120px]"
              >
                <Loader2 v-if="isSubmitting" class="w-4 h-4 mr-2 animate-spin" />
                {{ props.mode === 'add' ? $t('retreatModal.create') : $t('retreatModal.saveChanges') }}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>

  <!-- Success Dialog (only for add mode) -->
  <Dialog :open="showSuccessDialog" @update:open="showSuccessDialog = $event">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle class="flex items-center space-x-2">
          <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <span>{{ $t('retreatModal.successTitle') }}</span>
        </DialogTitle>
        <DialogDescription>
          {{ $t('retreatModal.successDescription') }}
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4">
        <div class="space-y-2">
          <Label class="text-sm font-medium">{{ $t('retreatModal.walkerUrl') }}</Label>
          <div class="flex space-x-2">
            <Input :model-value="walkerUrl" readonly class="bg-white" />
            <Button
              type="button"
              variant="outline"
              size="sm"
              @click="copyToClipboard(walkerUrl, 'walker')"
              class="flex-shrink-0"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
              </svg>
            </Button>
          </div>
        </div>

        <div class="space-y-2">
          <Label class="text-sm font-medium">{{ $t('retreatModal.serverUrl') }}</Label>
          <div class="flex space-x-2">
            <Input :model-value="serverUrl" readonly class="bg-white" />
            <Button
              type="button"
              variant="outline"
              size="sm"
              @click="copyToClipboard(serverUrl, 'server')"
              class="flex-shrink-0"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
              </svg>
            </Button>
          </div>
        </div>

        <div v-if="copiedType" class="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center space-x-2">
          <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
          </svg>
          <span class="text-sm text-blue-800">
            {{ $t('retreatModal.linkCopied', { type: copiedType }) }}
          </span>
        </div>
      </div>

      <DialogFooter>
        <Button @click="closeSuccessDialog" class="w-full">
          {{ $t('retreatModal.closeAndContinue') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, Button, Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue, Textarea, RadioGroup, RadioGroupItem, Tabs, TabsContent, TabsList, TabsTrigger, Checkbox } from '@repo/ui';
import { Loader2 } from 'lucide-vue-next';
import { useHouseStore } from '@/stores/houseStore';
import { useCommunityStore } from '@/stores/communityStore';
import { api, scheduleTemplateApi, retreatScheduleApi, preRetreatTaskApi, preRetreatTaskTemplateApi, type ScheduleTemplateSetDTO, type PreRetreatTaskTemplateSetDTO } from '@/services/api';
import { getApiUrl } from '@/config/runtimeConfig';
import { useToast } from '@repo/ui';
import type { CreateRetreat, Retreat } from '@repo/types';
import { buildClosingChurchMapsUrl, buildClosingChurchWazeUrl } from '@repo/utils';
import { loadGoogleMaps } from '@/utils/googleMaps';
import { houseLocationLabel as houseLabel } from '@/utils/houseLabel';
import MemoryUploadForm from '@/components/social/MemoryUploadForm.vue';

interface Props {
  open: boolean;
  mode: 'add' | 'edit';
  retreat?: Retreat | null;
  initialData?: Partial<CreateRetreat>;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
  (e: 'submit', data: CreateRetreat): Promise<Retreat | undefined>;
  (e: 'update', data: Partial<Retreat> & { id: string; _refreshBeds?: boolean }): Promise<void>;
}>();

const houseStore = useHouseStore();
const communityStore = useCommunityStore();
const { toast } = useToast();

// State
const isSubmitting = ref(false);
const refreshBedsFromHouse = ref(false);
const showSuccessDialog = ref(false);
const createdRetreat = ref<Retreat | null>(null);
const copiedType = ref<string | null>(null);
const activeTab = ref('general');

// Minuto-a-minuto template
const scheduleTemplateSets = ref<ScheduleTemplateSetDTO[]>([]);
const selectedScheduleTemplateSetId = ref<string>('');
const materializeOnCreate = ref(true);
const isMaterializing = ref(false);

async function handleMaterializeNow() {
	if (!props.retreat || !selectedScheduleTemplateSetId.value) return;
	if (
		!confirm(
			`Esto reemplazará la agenda actual del retiro con "${selectedScheduleTemplateSet.value?.name}". ¿Continuar?`,
		)
	) {
		return;
	}
	isMaterializing.value = true;
	try {
		const baseDate = new Date(props.retreat.startDate).toISOString().slice(0, 10);
		await retreatScheduleApi.materialize(
			props.retreat.id,
			baseDate,
			selectedScheduleTemplateSetId.value,
			true,
		);
		toast({
			title: 'Agenda importada',
			description: `Minuto a minuto regenerado desde "${selectedScheduleTemplateSet.value?.name}"`,
		});
	} catch (err: any) {
		toast({
			title: 'Error al importar la agenda',
			description: err?.response?.data?.message || err?.message || 'No se pudo importar el template.',
			variant: 'destructive',
		});
	} finally {
		isMaterializing.value = false;
	}
}

const selectedScheduleTemplateSet = computed(
	() => scheduleTemplateSets.value.find((s) => s.id === selectedScheduleTemplateSetId.value) ?? null,
);

async function loadScheduleTemplateSets() {
	try {
		scheduleTemplateSets.value = await scheduleTemplateApi.listSets();
		if (!selectedScheduleTemplateSetId.value && scheduleTemplateSets.value.length) {
			const def =
				scheduleTemplateSets.value.find((s) => s.isDefault) ?? scheduleTemplateSets.value[0];
			selectedScheduleTemplateSetId.value = def.id;
		}
	} catch {
		// user may lack scheduleTemplate:read permission — silently skip
		scheduleTemplateSets.value = [];
	}
}

// Tareas pre-retiro template
const preTaskTemplateSets = ref<PreRetreatTaskTemplateSetDTO[]>([]);
const selectedPreTaskSetId = ref<string>('');
const materializePreTasksOnCreate = ref(true);
const isMaterializingPreTasks = ref(false);

const selectedPreTaskSet = computed(
	() => preTaskTemplateSets.value.find((s) => s.id === selectedPreTaskSetId.value) ?? null,
);

async function loadPreTaskTemplateSets() {
	try {
		preTaskTemplateSets.value = await preRetreatTaskTemplateApi.listSets();
		if (!selectedPreTaskSetId.value && preTaskTemplateSets.value.length) {
			const def =
				preTaskTemplateSets.value.find((s) => s.isDefault) ?? preTaskTemplateSets.value[0];
			selectedPreTaskSetId.value = def.id;
		}
	} catch {
		// user may lack preRetreatTaskTemplate:read permission — silently skip
		preTaskTemplateSets.value = [];
	}
}

async function handleMaterializePreTasksNow() {
	if (!props.retreat || !selectedPreTaskSetId.value) return;
	if (
		!confirm(
			`Esto reemplazará las tareas pre-retiro actuales con "${selectedPreTaskSet.value?.name}". ¿Continuar?`,
		)
	) {
		return;
	}
	isMaterializingPreTasks.value = true;
	try {
		await preRetreatTaskApi.materialize(props.retreat.id, {
			templateSetId: selectedPreTaskSetId.value,
			clearExisting: true,
		});
		toast({
			title: 'Tareas importadas',
			description: `Checklist pre-retiro regenerado desde "${selectedPreTaskSet.value?.name}"`,
		});
	} catch (err: any) {
		toast({
			title: 'Error al importar las tareas',
			description: err?.response?.data?.message || err?.message || 'No se pudo importar el template.',
			variant: 'destructive',
		});
	} finally {
		isMaterializingPreTasks.value = false;
	}
}


// Form data
const formData = ref({
  parish: '',
  startDate: new Date(),
  endDate: new Date(),
  houseId: '',
  communityId: null as string | null,
  timezone: null as string | null,
  openingNotes: '',
  closingNotes: '',
  thingsToBringNotes: '',
  contactPhones: '',
  cost: '',
  paymentInfo: '',
  paymentMethods: '',
  serverFeeAmount: undefined as number | null | undefined,
  mealCost: undefined as number | null | undefined,
  max_walkers: undefined as number | undefined,
  max_servers: undefined as number | undefined,
  isPublic: false,
  roleInvitationEnabled: true,
  notifyParticipant: true,
  notifyInviter: true,
  notifyPalanqueros: [] as number[],
  walkerArrivalTime: '',
  serverArrivalTimeFriday: '',
  retreat_type: undefined as 'men' | 'women' | 'couples' | 'effeta' | undefined,
  couplesShareRoom: true,
  couplesShareTable: true,
  retreat_number_version: '',
  slug: '',
  externalRegistrationUrl: '',
  closingChurchName: '' as string | null,
  closingChurchAddress: '' as string | null,
  closingChurchLatitude: null as number | null,
  closingChurchLongitude: null as number | null,
  flyer_options: {
    // The flyer editor owns the text overrides and the block layout; the modal keeps
    // the registration-form toggle it shows in the General tab, plus the two legacy
    // QR flags that FlyerOptions still requires.
    showQrCodesLocation: true,
    showQrCodesRegistration: true,
    showPickupInfo: true,
  },
});

/**
 * People type "parroquia.com/inscripcion" without a protocol, and the write
 * schema requires http(s) — the API would answer 400 with a bare "Validation
 * error" that says nothing about which field or why. Prepending https:// here
 * removes the most likely rejection and shows the user what will be saved.
 * Real garbage still fails validation, which is what we want.
 */
function normalizeExternalRegistrationUrl(): void {
  const raw = formData.value.externalRegistrationUrl?.trim() ?? '';
  if (!raw) {
    formData.value.externalRegistrationUrl = '';
    return;
  }
  formData.value.externalRegistrationUrl = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

// Slug helpers
function generateSlug(parish: string, number: string): string {
  return (parish + number)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function normalizeSlug() {
  formData.value.slug = formData.value.slug
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  checkSlugAvailability();
}

/**
 * Heuristic: when duplicating a retreat the parish name is updated but the
 * slug is often forgotten \u2014 leaving the new retreat exposed at the OLD slug
 * (e.g. "San Judas Tadeo" served at /mam/interlomasiii). Flag this so the
 * coordinator notices BEFORE sharing the URL with caminantes.
 *
 * Mismatch = slug doesn't contain ANY normalized token of length \u22654 from
 * the parish name. Length \u22654 avoids false positives on short words like
 * "san", "del", "la". Length 3 was tried but produced too many warnings.
 */
const slugSeemsMismatched = computed<boolean>(() => {
  const parish = formData.value.parish;
  const slug = formData.value.slug;
  if (!parish || !slug || slug.length < 4) return false;
  const norm = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ');
  const slugN = norm(slug).replace(/\s+/g, '');
  const tokens = norm(parish).split(/\s+/).filter((t) => t.length >= 4);
  if (!tokens.length) return false;
  return !tokens.some((t) => slugN.includes(t));
});

function regenerateSlugFromParish() {
  formData.value.slug = generateSlug(
    formData.value.parish,
    formData.value.retreat_number_version || '',
  );
  checkSlugAvailability();
}

const slugAvailable = ref(true);
let slugCheckTimeout: ReturnType<typeof setTimeout> | null = null;

async function checkSlugAvailability() {
  if (!formData.value.slug) {
    slugAvailable.value = true;
    return;
  }
  if (slugCheckTimeout) clearTimeout(slugCheckTimeout);
  slugCheckTimeout = setTimeout(async () => {
    try {
      const excludeId = props.mode === 'edit' && props.retreat ? `?excludeId=${props.retreat.id}` : '';
      const res = await fetch(`${getApiUrl()}/retreats/public/slug-available/${formData.value.slug}${excludeId}`);
      if (res.ok) {
        const data = await res.json();
        slugAvailable.value = data.available;
      } else {
        slugAvailable.value = true;
      }
    } catch {
      slugAvailable.value = true;
    }
  }, 400);
}

// Validation errors
const errors = ref<Record<string, string>>({});

// Computed properties

const minDate = computed(() => {
  const today = new Date();
  return today.toISOString().split('T')[0];
});

const availableHouses = computed(() => {
  return houseStore.houses;
});

// `getCommunities` ya devuelve sólo las comunidades que el usuario administra
// (o todas, si es superadmin), que son exactamente las que el backend le dejará
// vincular. Ofrecer más sería enseñar un desplegable que devuelve 403.
const availableCommunities = computed(() => communityStore.communities);

// Etiqueta de la casa en el desplegable (dirección, no ciudad). Ver util para el porqué.
const houseLocationLabel = houseLabel;

const selectedHouseTimezone = computed<string | null>(() => {
  const h = availableHouses.value.find((house: any) => house.id === formData.value.houseId);
  return (h as any)?.timezone ?? null;
});

const RETREAT_TIMEZONE_OPTIONS = [
  'America/Mexico_City',
  'America/Tijuana',
  'America/Cancun',
  'America/Bogota',
  'America/Lima',
  'America/Santiago',
  'America/Guayaquil',
  'America/Caracas',
  'America/Argentina/Buenos_Aires',
  'America/Sao_Paulo',
  'America/Costa_Rica',
  'America/Guatemala',
  'America/Panama',
  'America/Asuncion',
  'America/Montevideo',
  'America/La_Paz',
  'America/Havana',
  'America/Santo_Domingo',
  'America/Puerto_Rico',
  'Europe/Madrid',
  'UTC',
];

const retreatTimezoneOptions = computed(() => {
  const set = new Set<string>(RETREAT_TIMEZONE_OPTIONS);
  if (formData.value.timezone) set.add(formData.value.timezone);
  return Array.from(set).sort((a, b) => a.localeCompare(b));
});

function onTimezoneSelect(value: string) {
  formData.value.timezone = value === '__inherit__' ? null : value;
}

// El sentinel evita mandar '' (que Zod rechazaría si no fuera por el
// preprocess) y deja explícito el caso "sin comunidad", que es el default.
function onCommunitySelect(value: string) {
  formData.value.communityId = value === '__none__' ? null : value;
}

const houseCapacity = computed(() => {
  const selectedHouse = availableHouses.value.find(house => house.id === formData.value.houseId);
  if (!selectedHouse || !selectedHouse.beds) {
    return { walkerBeds: null, serverBeds: null };
  }

  const walkerBeds = selectedHouse.beds.filter((bed: any) => bed.defaultUsage === 'caminante').length;
  const serverBeds = selectedHouse.beds.filter((bed: any) => bed.defaultUsage === 'servidor').length;

  return { walkerBeds, serverBeds };
});

const isFormValid = computed(() => {
  return formData.value.parish.trim() !== '' &&
         formData.value.houseId !== '' &&
         formData.value.startDate &&
         formData.value.endDate &&
         slugAvailable.value &&
         Object.keys(errors.value).length === 0;
});

// Aviso: el "Costo" es el cobro del caminante; si no contiene un número, el caminante
// quedaría en 0 (paz y salvo automático) por error de captura.
const costNotNumeric = computed(() => {
  const c = formData.value.cost;
  if (!c || !String(c).trim()) return false;
  const parsed = parseFloat(String(c).replace(/[^0-9.-]/g, ''));
  return !parsed; // NaN o 0
});

const startDate = computed({
  get: () => {
    if (!formData.value.startDate) return '';
    const date = formData.value.startDate instanceof Date
      ? formData.value.startDate
      : new Date(formData.value.startDate);
    if (isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
  },
  set: (val: string) => {
    if (val) {
      formData.value.startDate = new Date(val);
    } else {
      formData.value.startDate = new Date();
    }
    validateDates();
  },
});

const endDate = computed({
  get: () => {
    if (!formData.value.endDate) return '';
    const date = formData.value.endDate instanceof Date
      ? formData.value.endDate
      : new Date(formData.value.endDate);
    if (isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
  },
  set: (val: string) => {
    if (val) {
      formData.value.endDate = new Date(val);
    } else {
      formData.value.endDate = new Date();
    }
    validateDates();
  },
});

const walkerUrl = computed(() => {
  if (!createdRetreat.value) return '';
  return `${window.location.origin}/register/walker/${createdRetreat.value.id}`;
});

const serverUrl = computed(() => {
  if (!createdRetreat.value) return '';
  return `${window.location.origin}/register/server/${createdRetreat.value.id}`;
});

// Methods
const validateDates = () => {
  const start = formData.value.startDate;
  const end = formData.value.endDate;

  delete errors.value.startDate;
  delete errors.value.endDate;

  const startDateObj = start instanceof Date ? start : new Date(start);
  const endDateObj = end instanceof Date ? end : new Date(end);
  const minDateObj = new Date(minDate.value);

  if (start && isNaN(startDateObj.getTime())) {
    errors.value.startDate = 'Invalid start date';
    return;
  }

  if (end && isNaN(endDateObj.getTime())) {
    errors.value.endDate = 'Invalid end date';
    return;
  }

  if (start && end && startDateObj >= endDateObj) {
    errors.value.endDate = 'End date must be after start date';
  }

  // Past start date is only an error in ADD mode. In EDIT mode the retreat
  // already exists with whatever date — the coordinator may legitimately need
  // to fix the slug, notes, or close-out details on a retreat that already
  // happened. Refusing to save would force them to either downgrade the
  // record or talk to a developer. Saving with the original past date is a
  // no-op for date semantics; what matters is letting other fields persist.
  if (start && startDateObj < minDateObj && props.mode !== 'edit') {
    errors.value.startDate = 'Start date cannot be in the past';
  }
};

const validateForm = () => {
  errors.value = {};

  if (!formData.value.parish.trim()) {
    errors.value.parish = 'Parish name is required';
  }

  if (!formData.value.houseId) {
    errors.value.houseId = 'House selection is required';
  }

  if (!formData.value.startDate) {
    errors.value.startDate = 'Start date is required';
  }

  if (!formData.value.endDate) {
    errors.value.endDate = 'End date is required';
  }

  validateDates();

  if (formData.value.max_walkers !== undefined && formData.value.max_walkers < 1) {
    errors.value.max_walkers = 'Maximum walkers must be greater than 0';
  }

  if (formData.value.max_servers !== undefined && formData.value.max_servers < 1) {
    errors.value.max_servers = 'Maximum servers must be greater than 0';
  }

  return Object.keys(errors.value).length === 0;
};

const togglePalanquero = (n: number) => {
  const arr = formData.value.notifyPalanqueros;
  const idx = arr.indexOf(n);
  if (idx >= 0) {
    arr.splice(idx, 1);
  } else {
    arr.push(n);
    arr.sort();
  }
};

const handleSubmit = async () => {
  if (!validateForm()) {
    toast({
      title: 'Validation Error',
      description: 'Please fix the errors before submitting.',
      variant: 'destructive',
    });
    return;
  }

  isSubmitting.value = true;

  try {
    if (props.mode === 'add') {
      const retreat = await emit('submit', { ...formData.value });
      if (retreat) {
        createdRetreat.value = retreat;

        // Auto-materialize minuto a minuto if template selected
        if (materializeOnCreate.value && selectedScheduleTemplateSetId.value) {
          try {
            const baseDate = new Date(retreat.startDate).toISOString().slice(0, 10);
            await retreatScheduleApi.materialize(
              retreat.id,
              baseDate,
              selectedScheduleTemplateSetId.value,
              false,
            );
            toast({
              title: 'Agenda importada',
              description: `Minuto a minuto generado desde "${selectedScheduleTemplateSet.value?.name}"`,
            });
          } catch (err: any) {
            toast({
              title: 'Retiro creado, pero la agenda no se importó',
              description: err?.response?.data?.message || err?.message || 'Puedes importarla manualmente en la vista Minuto a Minuto.',
              variant: 'destructive',
            });
          }
        }

        // Auto-materialize tareas pre-retiro if template selected
        if (materializePreTasksOnCreate.value && selectedPreTaskSetId.value) {
          try {
            await preRetreatTaskApi.materialize(retreat.id, {
              templateSetId: selectedPreTaskSetId.value,
              clearExisting: true,
            });
            toast({
              title: 'Tareas pre-retiro creadas',
              description: `Checklist generado desde "${selectedPreTaskSet.value?.name}"`,
            });
          } catch (err: any) {
            toast({
              title: 'Retiro creado, pero las tareas no se importaron',
              description: err?.response?.data?.message || err?.message || 'Puedes importarlas manualmente en la vista Tareas Pre-Retiro.',
              variant: 'destructive',
            });
          }
        }

        showSuccessDialog.value = true;
        resetForm();
      }
    } else if (props.retreat) {
      const updateData = {
        parish: formData.value.parish,
        houseId: formData.value.houseId,
        communityId: formData.value.communityId,
        timezone: formData.value.timezone,
        isPublic: formData.value.isPublic,
        roleInvitationEnabled: formData.value.roleInvitationEnabled,
        notifyParticipant: formData.value.notifyParticipant,
        notifyInviter: formData.value.notifyInviter,
        notifyPalanqueros: formData.value.notifyPalanqueros.length > 0 ? formData.value.notifyPalanqueros : undefined,
        startDate: new Date(formData.value.startDate),
        endDate: new Date(formData.value.endDate),
        openingNotes: formData.value.openingNotes,
        closingNotes: formData.value.closingNotes,
        thingsToBringNotes: formData.value.thingsToBringNotes,
        contactPhones: formData.value.contactPhones,
        cost: formData.value.cost,
        paymentInfo: formData.value.paymentInfo,
        paymentMethods: formData.value.paymentMethods,
        externalRegistrationUrl: formData.value.externalRegistrationUrl,
        serverFeeAmount: formData.value.serverFeeAmount,
        mealCost: formData.value.mealCost,
        max_walkers: formData.value.max_walkers,
        max_servers: formData.value.max_servers,
        walkerArrivalTime: formData.value.walkerArrivalTime || undefined,
        serverArrivalTimeFriday: formData.value.serverArrivalTimeFriday || undefined,
        retreat_type: formData.value.retreat_type || undefined,
        // Solo viajan en retiros de matrimonios: en los demás no aplican y no
        // tiene sentido escribirlos.
        ...(formData.value.retreat_type === 'couples'
          ? {
              couplesShareRoom: formData.value.couplesShareRoom,
              couplesShareTable: formData.value.couplesShareTable,
            }
          : {}),
        retreat_number_version: formData.value.retreat_number_version || undefined,
        slug: formData.value.slug || undefined,
        flyer_options: formData.value.flyer_options,
        closingChurchName: formData.value.closingChurchName || null,
        closingChurchAddress: formData.value.closingChurchAddress || null,
        closingChurchLatitude: formData.value.closingChurchLatitude,
        closingChurchLongitude: formData.value.closingChurchLongitude,
      };

      await emit('update', { id: props.retreat.id, ...updateData, _refreshBeds: refreshBedsFromHouse.value });
      emit('update:open', false);
    }
  } catch (error: any) {
    toast({
      title: 'Error',
      description: error.response?.data?.message || error.message || 'Failed to save retreat.',
      variant: 'destructive',
    });
  } finally {
    isSubmitting.value = false;
  }
};

const resetForm = () => {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  formData.value = {
    parish: '',
    startDate: today,
    endDate: tomorrow,
    houseId: '',
    communityId: null as string | null,
    timezone: null as string | null,
    openingNotes: '',
    closingNotes: '',
    thingsToBringNotes: '',
    contactPhones: '',
    cost: '',
    paymentInfo: '',
    paymentMethods: '',
    externalRegistrationUrl: '',
    serverFeeAmount: undefined,
    mealCost: undefined,
    max_walkers: undefined,
    max_servers: undefined,
    isPublic: false,
    roleInvitationEnabled: true,
    notifyParticipant: true,
    notifyInviter: true,
    notifyPalanqueros: [],
    walkerArrivalTime: '',
    serverArrivalTimeFriday: '',
    retreat_type: undefined,
    couplesShareRoom: true,
    couplesShareTable: true,
    retreat_number_version: '',
    slug: '',
    closingChurchName: '' as string | null,
    closingChurchAddress: '' as string | null,
    closingChurchLatitude: null as number | null,
    closingChurchLongitude: null as number | null,
    flyer_options: {
      showQrCodesLocation: true,
      showQrCodesRegistration: true,
      showPickupInfo: true,
    },
  };
  errors.value = {};
};

const handleClose = () => {
  if (!isSubmitting.value) {
    resetForm();
    emit('update:open', false);
  }
};

const closeSuccessDialog = () => {
  showSuccessDialog.value = false;
  createdRetreat.value = null;
  copiedType.value = null;
  emit('update:open', false);
};

const copyToClipboard = async (text: string, type: string) => {
  try {
    await navigator.clipboard.writeText(text);
    copiedType.value = type;
    setTimeout(() => {
      copiedType.value = null;
    }, 3000);
  } catch (error) {
    toast({
      title: 'Error',
      description: 'Failed to copy link to clipboard.',
      variant: 'destructive',
    });
  }
};

// Closing church Google Places autocomplete -------------------------------
const closingChurchAddressEditing = ref(false);
const closingChurchAutocompleteField = ref<any>(null);

const closingChurchMapsUrlPreview = computed(() =>
  buildClosingChurchMapsUrl(
    formData.value.closingChurchLatitude,
    formData.value.closingChurchLongitude,
  ),
);

const closingChurchWazeUrlPreview = computed(() =>
  buildClosingChurchWazeUrl(
    formData.value.closingChurchLatitude,
    formData.value.closingChurchLongitude,
  ),
);

const handleClosingPlaceChange = async ({ placePrediction }: any) => {
  if (!placePrediction) return;
  try {
    const place = placePrediction.toPlace();
    await place.fetchFields({ fields: ['displayName', 'addressComponents', 'location'] });

    if (place.displayName && !formData.value.closingChurchName) {
      formData.value.closingChurchName = place.displayName;
    }
    if (place.addressComponents) {
      const parts: { [key: string]: string } = {};
      place.addressComponents.forEach((c: any) => {
        const type = c.types[0];
        parts[type] = c.longText;
      });
      const street = `${parts.route || ''} ${parts.street_number || ''}`.trim();
      const sublocality = parts.sublocality_level_1 || '';
      const locality = parts.locality || '';
      const adminArea = parts.administrative_area_level_1 || '';
      const country = parts.country || '';
      formData.value.closingChurchAddress = [street, sublocality, locality, adminArea, country]
        .filter(Boolean)
        .join(', ');
    }
    if (place.location) {
      formData.value.closingChurchLatitude = place.location.lat();
      formData.value.closingChurchLongitude = place.location.lng();
    }
    closingChurchAddressEditing.value = false;
  } catch (err) {
    console.error('Error resolviendo iglesia de clausura:', err);
  }
};

watch(closingChurchAutocompleteField, (newField, oldField) => {
  if (oldField) oldField.removeEventListener('gmp-select', handleClosingPlaceChange);
  if (newField) newField.addEventListener('gmp-select', handleClosingPlaceChange);
});

watch(closingChurchAddressEditing, async (editing) => {
  if (editing) {
    // Lazy-load Google Maps script al activar el autocomplete (no se carga
    // si el usuario nunca abre la tab Clausura).
    try {
      await loadGoogleMaps();
    } catch (err) {
      console.warn('No se pudo cargar Google Maps:', err);
    }
    await nextTick();
    if (closingChurchAutocompleteField.value && formData.value.closingChurchAddress) {
      closingChurchAutocompleteField.value.value = formData.value.closingChurchAddress;
    }
  }
});

// Pre-cargar Google Maps cuando el usuario abre la tab Clausura por primera
// vez (mejora UX: el primer click en el input queda casi instantáneo).
watch(activeTab, (tab) => {
  if (tab === 'closing') {
    void loadGoogleMaps().catch(() => undefined);
  }
});

async function copyClosingChurchUrl(kind: 'maps' | 'waze') {
  const url =
    kind === 'maps' ? closingChurchMapsUrlPreview.value : closingChurchWazeUrlPreview.value;
  if (!url) return;
  try {
    await navigator.clipboard.writeText(url);
    toast({ title: 'URL copiada', description: url });
  } catch {
    toast({ title: 'No se pudo copiar', description: url, variant: 'destructive' });
  }
}

function openClosingChurchUrl(kind: 'maps' | 'waze') {
  const url =
    kind === 'maps' ? closingChurchMapsUrlPreview.value : closingChurchWazeUrlPreview.value;
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
}

const handleMemorySaved = (data: { memoryPhotoUrl?: string; musicPlaylistUrl?: string }) => {
	// Mirror the current primary photo/song onto the local retreat so the rest
	// of the UI reflects additions, removals and primary changes immediately.
	if (props.retreat) {
		props.retreat.memoryPhotoUrl = data.memoryPhotoUrl;
		props.retreat.musicPlaylistUrl = data.musicPlaylistUrl;
	}
};

// Watchers
watch(() => props.open, (newOpen) => {
  if (newOpen) {
    // Reset to first tab when modal opens
    activeTab.value = 'general';
    refreshBedsFromHouse.value = false;
    closingChurchAddressEditing.value = false;
    void loadScheduleTemplateSets();
    void loadPreTaskTemplateSets();

    if (props.mode === 'edit' && props.retreat) {
      // Edit mode - populate
        formData.value = {
          ...formData.value,
          parish: props.retreat.parish,
          startDate: props.retreat.startDate ? new Date(props.retreat.startDate) : new Date(),
          endDate: props.retreat.endDate ? new Date(props.retreat.endDate) : new Date(),
          houseId: props.retreat.houseId,
          communityId: (props.retreat as any).communityId ?? null,
          timezone: (props.retreat as any).timezone ?? null,
          openingNotes: props.retreat.openingNotes || '',
          closingNotes: props.retreat.closingNotes || '',
          thingsToBringNotes: props.retreat.thingsToBringNotes || '',
          contactPhones: props.retreat.contactPhones || '',
          cost: props.retreat.cost || '',
          paymentInfo: props.retreat.paymentInfo || '',
          paymentMethods: props.retreat.paymentMethods || '',
          externalRegistrationUrl: (props.retreat as any).externalRegistrationUrl || '',
          serverFeeAmount: (props.retreat as any).serverFeeAmount ?? undefined,
          mealCost: (props.retreat as any).mealCost ?? undefined,
          max_walkers: props.retreat.max_walkers,
          max_servers: props.retreat.max_servers,
          isPublic: props.retreat.isPublic,
          roleInvitationEnabled: props.retreat.roleInvitationEnabled,
          notifyParticipant: (props.retreat as any).notifyParticipant ?? true,
          notifyInviter: (props.retreat as any).notifyInviter ?? true,
          notifyPalanqueros: (props.retreat as any).notifyPalanqueros ?? [],
          walkerArrivalTime: props.retreat.walkerArrivalTime || '',
          serverArrivalTimeFriday: props.retreat.serverArrivalTimeFriday || '',
          retreat_type: props.retreat.retreat_type,
          couplesShareRoom: props.retreat.couplesShareRoom ?? true,
          couplesShareTable: props.retreat.couplesShareTable ?? true,
          retreat_number_version: props.retreat.retreat_number_version || '',
          slug: (props.retreat as any).slug || '',
          closingChurchName: (props.retreat as any).closingChurchName || '',
          closingChurchAddress: (props.retreat as any).closingChurchAddress || '',
          closingChurchLatitude: (props.retreat as any).closingChurchLatitude ?? null,
          closingChurchLongitude: (props.retreat as any).closingChurchLongitude ?? null,
          // Spread, never enumerate: the flyer editor stores `blocks`, `images` and
          // future keys in here, and PUT /retreats/:id replaces the whole column.
          flyer_options: {
            ...((props.retreat as any).flyer_options ?? {}),
            showPickupInfo: (props.retreat as any).flyer_options?.showPickupInfo ?? true,
          },
        };
    } else if (props.initialData) {
      // Add mode with initial data
      const initialFlyerOptions = (props.initialData.flyer_options || {}) as any;

      formData.value = {
        ...formData.value,
        ...props.initialData,
        startDate: props.initialData.startDate ? new Date(props.initialData.startDate) : new Date(),
        endDate: props.initialData.endDate ? new Date(props.initialData.endDate) : new Date(),
        // Nullable in the API (null clears the link); the input needs a string.
        externalRegistrationUrl: (props.initialData as any).externalRegistrationUrl ?? '',
        flyer_options: {
          ...initialFlyerOptions,
          showPickupInfo: initialFlyerOptions.showPickupInfo ?? true,
        },
      };
    } else {
      // Add mode - reset form
      resetForm();
    }
    validateDates();
  }
});

// Auto-generate slug from parish + number when in add mode or when slug is empty
let lastAutoSlug = '';
watch([() => formData.value.parish, () => formData.value.retreat_number_version], ([parish, number]) => {
  const auto = generateSlug(parish || '', number || '');
  if (!formData.value.slug || formData.value.slug === lastAutoSlug) {
    formData.value.slug = auto;
  }
  lastAutoSlug = auto;
});

watch(() => formData.value.houseId, async (newHouseId) => {
  if (newHouseId && props.mode === 'add') {
    try {
      const house = await houseStore.fetchHouseById(newHouseId);
      if (house && house.beds) {
        const walkerBeds = house.beds.filter((b: any) => b.defaultUsage === 'caminante').length;
        const serverBeds = house.beds.filter((b: any) => b.defaultUsage === 'servidor').length;
        formData.value.max_walkers = walkerBeds;
        formData.value.max_servers = serverBeds;
      }
    } catch (error) {
      console.error('Error fetching house details:', error);
    }
  }
});

// Initialize
onMounted(() => {
  if (houseStore.houses.length === 0) {
    houseStore.fetchHouses();
  }
  if (communityStore.communities.length === 0) {
    communityStore.fetchCommunities();
  }
  validateDates();
});
</script>