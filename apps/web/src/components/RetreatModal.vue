<template>
  <Dialog :open="open" @update:open="handleClose">
    <DialogContent class="max-w-4xl max-h-[90vh] overflow-y-auto">
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
          <TabsList class="grid w-full grid-cols-5">
            <TabsTrigger value="general">{{ $t('retreatModal.sections.general') }}</TabsTrigger>
            <TabsTrigger value="logistics">{{ $t('retreatModal.sections.logistics') }}</TabsTrigger>
            <TabsTrigger value="financials">{{ $t('retreatModal.sections.financials') }}</TabsTrigger>
            <TabsTrigger value="notes">{{ $t('retreatModal.sections.notes') }}</TabsTrigger>
            <TabsTrigger value="flyer">{{ $t('retreatModal.sections.flyer') }}</TabsTrigger>
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
                <Label for="houseId">
                  {{ $t('retreatModal.house') }}
                  <span class="text-red-500">*</span>
                </Label>
                <Select v-model="formData.houseId">
                  <SelectTrigger id="houseId" :class="{ 'border-red-500': errors.houseId }">
                    <SelectValue :placeholder="$t('retreatModal.selectHouse')" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem v-for="house in availableHouses" :key="house.id" :value="house.id">
                        <div class="flex flex-col">
                          <span class="font-medium">{{ house.name }}</span>
                          <span class="text-xs text-muted-foreground">{{ house.city }}, {{ house.state }}</span>
                        </div>
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <p v-if="errors.houseId" class="text-sm text-red-500">{{ errors.houseId }}</p>
              </div>
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
                  :min="minDate"
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
                  :min="startDate || minDate"
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

            <!-- Public & Roles Settings -->
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
            </div>

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

          <!-- Flyer Tab -->
          <TabsContent value="flyer" class="space-y-6 mt-6">
            <Tabs default-value="settings" class="w-full">
              <TabsList class="grid w-full grid-cols-5 mb-4">
                <TabsTrigger value="settings">{{ $t('retreatModal.flyer.tabs.settings') }}</TabsTrigger>
                <TabsTrigger value="header">{{ $t('retreatModal.flyer.tabs.header') }}</TabsTrigger>
                <TabsTrigger value="content">{{ $t('retreatModal.flyer.tabs.content') }}</TabsTrigger>
                <TabsTrigger value="footer">{{ $t('retreatModal.flyer.tabs.footer') }}</TabsTrigger>
                <TabsTrigger value="json">{{ $t('retreatModal.flyer.tabs.json') }}</TabsTrigger>
              </TabsList>

              <!-- Settings Tab -->
              <TabsContent value="settings" class="space-y-6">
                <div class="space-y-4 p-4 border rounded-md">
                   <div class="flex items-center space-x-2">
                       <input
                          type="checkbox"
                          id="showQrCodesLocation"
                          v-model="formData.flyer_options.showQrCodesLocation"
                          class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <Label for="showQrCodesLocation" class="cursor-pointer">{{ $t('retreatModal.flyer.showQrCodesLocation') }}</Label>
                  </div>
                   <div class="flex items-center space-x-2">
                       <input
                          type="checkbox"
                          id="showQrCodesRegistration"
                          v-model="formData.flyer_options.showQrCodesRegistration"
                          class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <Label for="showQrCodesRegistration" class="cursor-pointer">{{ $t('retreatModal.flyer.showQrCodesRegistration') }}</Label>
                  </div>
                </div>
              </TabsContent>

               <!-- Header Tab -->
              <TabsContent value="header" class="space-y-6">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div class="space-y-2">
                      <Label>{{ $t('retreatModal.flyer.headerCatholicRetreat') }}</Label>
                      <Input v-model="formData.flyer_options.catholicRetreatOverride" :placeholder="$t('retreatFlyer.catholicRetreat')" />
                     </div>
                     <div class="space-y-2">
                      <Label>{{ $t('retreatModal.flyer.headerEmausFor') }}</Label>
                      <Input v-model="formData.flyer_options.emausForOverride" :placeholder="$t('retreatFlyer.emausFor')" />
                     </div>
                     <div class="space-y-2">
                      <Label>{{ $t('retreatModal.flyer.headerWeekendOf') }}</Label>
                      <Input v-model="formData.flyer_options.weekendOfHopeOverride" :placeholder="$t('retreatFlyer.weekendOfHope')" />
                     </div>
                      <div class="space-y-2">
                      <Label>{{ $t('retreatModal.flyer.headerHope') }}</Label>
                      <Input v-model="formData.flyer_options.hopeOverride" :placeholder="$t('retreatFlyer.hope')" />
                     </div>
                </div>
                 <!-- Main Text Overrides usually go in Header or top section -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
                    <div class="space-y-2">
                      <Label for="titleOverride">{{ $t('retreatModal.flyer.titleOverride') }}</Label>
                      <Input
                        id="titleOverride"
                        v-model="formData.flyer_options.titleOverride"
                        :placeholder="$t('retreatFlyer.hope')"
                      />
                    </div>
                    <div class="space-y-2">
                      <Label for="subtitleOverride">{{ $t('retreatModal.flyer.subtitleOverride') }}</Label>
                      <Input
                        id="subtitleOverride"
                        v-model="formData.flyer_options.subtitleOverride"
                        :placeholder="$t('retreatFlyer.weekendOfHope')"
                      />
                    </div>
                </div>
              </TabsContent>

              <!-- Content Tab -->
              <TabsContent value="content" class="space-y-6">
                 <div class="grid grid-cols-1 gap-4">
                     <div class="space-y-2">
                      <Label for="hopeQuoteOverride">{{ $t('retreatModal.flyer.hopeQuoteOverride') }}</Label>
                      <Textarea
                        id="hopeQuoteOverride"
                        v-model="formData.flyer_options.hopeQuoteOverride"
                        :placeholder="$t('retreatFlyer.hopeQuote')"
                        rows="2"
                      />
                    </div>
                    
                    <div class="space-y-2">
                      <Label for="encounterDescriptionOverride">{{ $t('retreatModal.flyer.description') }}</Label>
                      <Textarea
                        id="encounterDescriptionOverride"
                        v-model="formData.flyer_options.encounterDescriptionOverride"
                        :placeholder="$t('retreatFlyer.encounterDescription')"
                        rows="3"
                      />
                    </div>

                     <div class="space-y-2">
                        <Label>{{ $t('retreatModal.flyer.whatToBringHeader') }}</Label>
                        <Input v-model="formData.flyer_options.whatToBringOverride" :placeholder="$t('retreatFlyer.whatToBring')" />
                    </div>
                     <div class="space-y-2">
                        <Label>{{ $t('retreatModal.flyer.arrivalNote') }}</Label>
                        <Input v-model="formData.flyer_options.arrivalTimeNoteOverride" :placeholder="$t('retreatFlyer.arrivalTimeNote')" />
                    </div>
                </div>
              </TabsContent>

              <!-- Footer Tab -->
               <TabsContent value="footer" class="space-y-6">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="space-y-2">
                        <Label>{{ $t('retreatModal.flyer.callToActionDareToLiveIt') }}</Label>
                        <Input v-model="formData.flyer_options.dareToLiveItOverride" :placeholder="$t('retreatFlyer.dareToLiveIt')" />
                    </div>
                      <div class="space-y-2">
                        <Label>{{ $t('retreatModal.flyer.registerButton') }}</Label>
                        <Input v-model="formData.flyer_options.registerOverride" :placeholder="$t('retreatFlyer.register')" />
                    </div>
                     <div class="space-y-2">
                        <Label>{{ $t('retreatModal.flyer.scanToRegister') }}</Label>
                        <Input v-model="formData.flyer_options.scanToRegisterOverride" :placeholder="$t('retreatFlyer.scanToRegister')" />
                    </div>
                     <div class="space-y-2">
                        <Label>{{ $t('retreatModal.flyer.goToRegistration') }}</Label>
                        <Input v-model="formData.flyer_options.goToRegistrationOverride" :placeholder="$t('retreatFlyer.goToRegistration')" />
                    </div>
                     <div class="space-y-2">
                        <Label>{{ $t('retreatModal.flyer.limitedCapacity') }}</Label>
                        <Input v-model="formData.flyer_options.limitedCapacityOverride" :placeholder="$t('retreatFlyer.limitedCapacity')" />
                    </div>
                    <div class="space-y-2">
                        <Label>{{ $t('retreatModal.flyer.dontMissIt') }}</Label>
                        <Input v-model="formData.flyer_options.dontMissItOverride" :placeholder="$t('retreatFlyer.dontMissIt')" />
                    </div>
                    
                     <div class="space-y-2">
                        <Label>{{ $t('retreatModal.flyer.comeLabel') }}</Label>
                        <Input v-model="formData.flyer_options.comeOverride" :placeholder="$t('retreatFlyer.come')" />
                    </div>
                    <div class="col-span-1 md:col-span-2 space-y-2">
                        <Label>{{ $t('retreatModal.flyer.reservationNote') }}</Label>
                        <Textarea
                          id="reservationNoteOverride"
                          v-model="formData.flyer_options.reservationNoteOverride"
                          :placeholder="$t('retreatFlyer.reservationNote')"
                          rows="2"
                        />                    
                    </div>
                </div>
               </TabsContent>

              <!-- JSON Tab -->
              <TabsContent value="json" class="space-y-4">
                <div class="space-y-2">
                  <Label for="flyerOptionsJson">Flyer Options JSON</Label>
                  <Textarea
                    id="flyerOptionsJson"
                    v-model="flyerOptionsJsonString"
                    rows="20"
                    class="font-mono text-sm"
                    @blur="parseFlyerOptionsJson"
                  />
                  <p v-if="flyerOptionsJsonError" class="text-sm text-red-500">{{ flyerOptionsJsonError }}</p>
                </div>
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <div class="flex justify-between items-center w-full">
            <div class="text-xs text-muted-foreground">
              <span class="text-red-500">*</span> {{ $t('retreatModal.requiredFields') }}
            </div>
            <div class="flex space-x-2">
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
import { ref, computed, onMounted, watch } from 'vue';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, Button, Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue, Textarea, RadioGroup, RadioGroupItem, Tabs, TabsContent, TabsList, TabsTrigger } from '@repo/ui';
import { Loader2 } from 'lucide-vue-next';
import { useHouseStore } from '@/stores/houseStore';
import { useToast } from '@repo/ui';
import type { CreateRetreat, Retreat } from '@repo/types';

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
  (e: 'update', data: Retreat): Promise<void>;
}>();

const houseStore = useHouseStore();
const { toast } = useToast();

// State
const isSubmitting = ref(false);
const showSuccessDialog = ref(false);
const createdRetreat = ref<Retreat | null>(null);
const copiedType = ref<string | null>(null);
const activeTab = ref('general');

// JSON Editor for flyer_options
const flyerOptionsJsonError = ref<string | null>(null);

const flyerOptionsJsonString = computed({
  get: () => {
    try {
      return JSON.stringify(formData.value.flyer_options, null, 2);
    } catch {
      return '{}';
    }
  },
  set: (value: string) => {
    try {
      const parsed = JSON.parse(value);
      formData.value.flyer_options = parsed;
      flyerOptionsJsonError.value = null;
    } catch (e: any) {
      flyerOptionsJsonError.value = `Invalid JSON: ${e.message}`;
    }
  }
});

const parseFlyerOptionsJson = () => {
  try {
    const parsed = JSON.parse(flyerOptionsJsonString.value);
    formData.value.flyer_options = parsed;
    flyerOptionsJsonError.value = null;
  } catch (e: any) {
    flyerOptionsJsonError.value = `Invalid JSON: ${e.message}`;
  }
};

// Form data
const formData = ref({
  parish: '',
  startDate: new Date(),
  endDate: new Date(),
  houseId: '',
  openingNotes: '',
  closingNotes: '',
  thingsToBringNotes: '',
  contactPhones: '',
  cost: '',
  paymentInfo: '',
  paymentMethods: '',
  max_walkers: undefined as number | undefined,
  max_servers: undefined as number | undefined,
  isPublic: false,
  roleInvitationEnabled: true,
  walkerArrivalTime: '',
  serverArrivalTimeFriday: '',
  retreat_type: undefined as 'men' | 'women' | 'couples' | 'effeta' | undefined,
  retreat_number_version: '',
  flyer_options: {
    titleOverride: '',
    subtitleOverride: '',
    showQrCodes: true, // Deprecated in UI but kept for state shape if needed
    showQrCodesLocation: true,
    showQrCodesRegistration: true,
    catholicRetreatOverride: '',
    emausForOverride: '',
    weekendOfHopeOverride: '',
    hopeOverride: '',
    hopeQuoteOverride: '',
    encounterDescriptionOverride: '',
    dareToLiveItOverride: '',
    arrivalTimeNoteOverride: '',
    whatToBringOverride: '',
    registerOverride: '',
    scanToRegisterOverride: '',
    goToRegistrationOverride: '',
    limitedCapacityOverride: '',
    dontMissItOverride: '',
    reservationNoteOverride: '',
    comeOverride: '',
  },
});

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
         Object.keys(errors.value).length === 0;
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

  if (start && startDateObj < minDateObj) {
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
        showSuccessDialog.value = true;
        resetForm();
      }
    } else if (props.retreat) {
      const updateData = {
        parish: formData.value.parish,
        houseId: formData.value.houseId,
        isPublic: formData.value.isPublic,
        roleInvitationEnabled: formData.value.roleInvitationEnabled,
        startDate: new Date(formData.value.startDate),
        endDate: new Date(formData.value.endDate),
        openingNotes: formData.value.openingNotes,
        closingNotes: formData.value.closingNotes,
        thingsToBringNotes: formData.value.thingsToBringNotes,
        contactPhones: formData.value.contactPhones,
        cost: formData.value.cost,
        paymentInfo: formData.value.paymentInfo,
        paymentMethods: formData.value.paymentMethods,
        max_walkers: formData.value.max_walkers,
        max_servers: formData.value.max_servers,
        walkerArrivalTime: formData.value.walkerArrivalTime || undefined,
        serverArrivalTimeFriday: formData.value.serverArrivalTimeFriday || undefined,
        retreat_type: formData.value.retreat_type || undefined,
        retreat_number_version: formData.value.retreat_number_version || undefined,
        flyer_options: formData.value.flyer_options,
      };

      // Debug logging
      console.log('RetreatModal - Updating retreat with isPublic:', updateData.isPublic);
      console.log('RetreatModal - Full update data:', updateData);

      await emit('update', { ...props.retreat, ...updateData });
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
    openingNotes: '',
    closingNotes: '',
    thingsToBringNotes: '',
    contactPhones: '',
    cost: '',
    paymentInfo: '',
    paymentMethods: '',
    max_walkers: undefined,
    max_servers: undefined,
    isPublic: false,
    roleInvitationEnabled: true,
    walkerArrivalTime: '',
    serverArrivalTimeFriday: '',
    retreat_type: undefined,
    retreat_number_version: '',
    flyer_options: {
        titleOverride: '',
        subtitleOverride: '',
        showQrCodes: true,
        showQrCodesLocation: true,
        showQrCodesRegistration: true,
        catholicRetreatOverride: '',
        emausForOverride: '',
        weekendOfHopeOverride: '',
        hopeOverride: '',
        hopeQuoteOverride: '',
        encounterDescriptionOverride: '',
        dareToLiveItOverride: '',
        arrivalTimeNoteOverride: '',
        whatToBringOverride: '',
        registerOverride: '',
        scanToRegisterOverride: '',
        goToRegistrationOverride: '',
        limitedCapacityOverride: '',
        dontMissItOverride: '',
        reservationNoteOverride: '',
        comeOverride: '',
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

// Watchers
watch(() => props.open, (newOpen) => {
  if (newOpen) {
    // Reset to first tab when modal opens
    activeTab.value = 'general';

    if (props.mode === 'edit' && props.retreat) {
      // Edit mode - populate        // Initialize with legacy showQrCodes if new fields are undefined
        const legacyShowQr = (props.retreat as any).flyer_options?.showQrCodes ?? true;

        formData.value = {
          ...formData.value,
          parish: props.retreat.parish,
          startDate: props.retreat.startDate ? new Date(props.retreat.startDate) : new Date(),
          endDate: props.retreat.endDate ? new Date(props.retreat.endDate) : new Date(),
          houseId: props.retreat.houseId,
          openingNotes: props.retreat.openingNotes || '',
          closingNotes: props.retreat.closingNotes || '',
          thingsToBringNotes: props.retreat.thingsToBringNotes || '',
          contactPhones: props.retreat.contactPhones || '',
          cost: props.retreat.cost || '',
          paymentInfo: props.retreat.paymentInfo || '',
          paymentMethods: props.retreat.paymentMethods || '',
          max_walkers: props.retreat.max_walkers,
          max_servers: props.retreat.max_servers,
          isPublic: props.retreat.isPublic,
          roleInvitationEnabled: props.retreat.roleInvitationEnabled,
          walkerArrivalTime: props.retreat.walkerArrivalTime || '',
          serverArrivalTimeFriday: props.retreat.serverArrivalTimeFriday || '',
          retreat_type: props.retreat.retreat_type,
          retreat_number_version: props.retreat.retreat_number_version || '',
          flyer_options: {
            titleOverride: (props.retreat as any).flyer_options?.titleOverride || '',
            subtitleOverride: (props.retreat as any).flyer_options?.subtitleOverride || '',
            showQrCodes: legacyShowQr,
            showQrCodesLocation: (props.retreat as any).flyer_options?.showQrCodesLocation ?? legacyShowQr,
            showQrCodesRegistration: (props.retreat as any).flyer_options?.showQrCodesRegistration ?? legacyShowQr,
            catholicRetreatOverride: (props.retreat as any).flyer_options?.catholicRetreatOverride || '',
            emausForOverride: (props.retreat as any).flyer_options?.emausForOverride || '',
            weekendOfHopeOverride: (props.retreat as any).flyer_options?.weekendOfHopeOverride || '',
            hopeOverride: (props.retreat as any).flyer_options?.hopeOverride || '',
            hopeQuoteOverride: (props.retreat as any).flyer_options?.hopeQuoteOverride || '',
            encounterDescriptionOverride: (props.retreat as any).flyer_options?.encounterDescriptionOverride || '',
            dareToLiveItOverride: (props.retreat as any).flyer_options?.dareToLiveItOverride || '',
            arrivalTimeNoteOverride: (props.retreat as any).flyer_options?.arrivalTimeNoteOverride || '',
            whatToBringOverride: (props.retreat as any).flyer_options?.whatToBringOverride || '',
            registerOverride: (props.retreat as any).flyer_options?.registerOverride || '',
            scanToRegisterOverride: (props.retreat as any).flyer_options?.scanToRegisterOverride || '',
            goToRegistrationOverride: (props.retreat as any).flyer_options?.goToRegistrationOverride || '',
            limitedCapacityOverride: (props.retreat as any).flyer_options?.limitedCapacityOverride || '',
            dontMissItOverride: (props.retreat as any).flyer_options?.dontMissItOverride || '',
            reservationNoteOverride: (props.retreat as any).flyer_options?.reservationNoteOverride || '',
            comeOverride: (props.retreat as any).flyer_options?.comeOverride || '',
        },
      };
    } else if (props.initialData) {
      // Add mode with initial data
      const initialFlyerOptions = (props.initialData.flyer_options || {}) as any;
      const legacyShowQrInitial = initialFlyerOptions.showQrCodes ?? true;

      formData.value = {
        ...formData.value,
        ...props.initialData,
        startDate: props.initialData.startDate ? new Date(props.initialData.startDate) : new Date(),
        endDate: props.initialData.endDate ? new Date(props.initialData.endDate) : new Date(),
        flyer_options: {
          titleOverride: initialFlyerOptions.titleOverride || '',
          subtitleOverride: initialFlyerOptions.subtitleOverride || '',
          showQrCodes: legacyShowQrInitial,
          showQrCodesLocation: initialFlyerOptions.showQrCodesLocation ?? legacyShowQrInitial,
          showQrCodesRegistration: initialFlyerOptions.showQrCodesRegistration ?? legacyShowQrInitial,
          catholicRetreatOverride: initialFlyerOptions.catholicRetreatOverride || '',
          emausForOverride: initialFlyerOptions.emausForOverride || '',
          weekendOfHopeOverride: initialFlyerOptions.weekendOfHopeOverride || '',
          hopeOverride: initialFlyerOptions.hopeOverride || '',
          hopeQuoteOverride: initialFlyerOptions.hopeQuoteOverride || '',
          encounterDescriptionOverride: initialFlyerOptions.encounterDescriptionOverride || '',
          dareToLiveItOverride: initialFlyerOptions.dareToLiveItOverride || '',
          arrivalTimeNoteOverride: initialFlyerOptions.arrivalTimeNoteOverride || '',
          whatToBringOverride: initialFlyerOptions.whatToBringOverride || '',
          registerOverride: initialFlyerOptions.registerOverride || '',
          scanToRegisterOverride: initialFlyerOptions.scanToRegisterOverride || '',
          goToRegistrationOverride: initialFlyerOptions.goToRegistrationOverride || '',
          limitedCapacityOverride: initialFlyerOptions.limitedCapacityOverride || '',
          dontMissItOverride: initialFlyerOptions.dontMissItOverride || '',
          reservationNoteOverride: initialFlyerOptions.reservationNoteOverride || '',
          comeOverride: initialFlyerOptions.comeOverride || '',
        },
      };
    } else {
      // Add mode - reset form
      resetForm();
    }
    validateDates();
  }
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
  validateDates();
});
</script>