<script setup lang="ts">
import { toast } from 'vue-sonner';
import { ref } from 'vue';
import { useRoute } from 'vue-router';
import { z } from 'zod';
import { serverSchema, Server } from '@repo/types';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@repo/ui/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card';
import { Input } from '@repo/ui/components/ui/input';
import { Label } from '@repo/ui/components/ui/label';
import { Button } from '@repo/ui/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui/components/ui/select';
import { Checkbox } from '@repo/ui/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@repo/ui/components/ui/radio-group';

const route = useRoute();


const retreatId = route.params.retreatId as string;

const formData = ref<Partial<Omit<Server, 'id'>>>({
  retreatId,
  type: 'server',
  sacraments: [],
 });

const onSubmit = async () => {
  try {
    const validatedData = serverSchema.parse(formData.value);
    // TODO: Call API to save data
    console.log(validatedData);
        toast('Registration Successful');
  } catch (error) {
    if (error instanceof z.ZodError) {
      toast.error('Validation Error', { description: error.errors.map((e) => e.message).join('\n') });
    }
  }
};

const sacramentOptions = ['baptism', 'communion', 'confirmation', 'marriage', 'none'] as const;

function updateSacraments(sacrament: typeof sacramentOptions[number]) {
  if (!formData.value.sacraments) {
    formData.value.sacraments = [];
  }

  const index = formData.value.sacraments.indexOf(sacrament);
  if (index > -1) {
    formData.value.sacraments.splice(index, 1);
  } else {
    formData.value.sacraments.push(sacrament);
  }
}
</script>

<template>
  <div class="container mx-auto p-4">
    <h1 class="text-2xl font-bold mb-4">{{ $t('serverRegistration.title') }}</h1>
    <Tabs default-value="personal-info" class="w-full">
      <TabsList>
        <TabsTrigger value="personal-info">{{ $t('serverRegistration.tabs.personalInfo') }}</TabsTrigger>
        <TabsTrigger value="health-info">{{ $t('serverRegistration.tabs.healthInfo') }}</TabsTrigger>
        <TabsTrigger value="emergency-contact">{{ $t('serverRegistration.tabs.emergencyContact') }}</TabsTrigger>
      </TabsList>

      <TabsContent value="personal-info">
        <Card>
          <CardHeader><CardTitle>{{ $t('serverRegistration.tabs.personalInfo') }}</CardTitle></CardHeader>
          <CardContent class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label for="firstName">{{ $t('serverRegistration.fields.firstName') }}</Label>
                <Input id="firstName" v-model="formData.firstName" />
              </div>
              <div>
                <Label for="lastName">{{ $t('serverRegistration.fields.lastName') }}</Label>
                <Input id="lastName" v-model="formData.lastName" />
              </div>
              <div>
                <Label for="nickname">{{ $t('serverRegistration.fields.nickname') }}</Label>
                <Input id="nickname" v-model="formData.nickname" />
              </div>
              <div>
                <Label for="birthDate">{{ $t('serverRegistration.fields.birthDate') }}</Label>
                <Input id="birthDate" type="date" v-model="formData.birthDate" />
              </div>
              <div>
                <Label for="maritalStatus">{{ $t('serverRegistration.fields.maritalStatus.label') }}</Label>
                <Select v-model="formData.maritalStatus">
                  <SelectTrigger>
                    <SelectValue :placeholder="$t('serverRegistration.fields.maritalStatus.placeholder')" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">{{ $t('serverRegistration.fields.maritalStatus.options.single') }}</SelectItem>
                    <SelectItem value="married">{{ $t('serverRegistration.fields.maritalStatus.options.married') }}</SelectItem>
                    <SelectItem value="separated_divorced">{{ $t('serverRegistration.fields.maritalStatus.options.separated_divorced') }}</SelectItem>
                    <SelectItem value="widowed">{{ $t('serverRegistration.fields.maritalStatus.options.widowed') }}</SelectItem>
                    <SelectItem value="other">{{ $t('serverRegistration.fields.maritalStatus.options.other') }}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label for="street">{{ $t('serverRegistration.fields.street') }}</Label>
                <Input id="street" v-model="formData.street" />
              </div>
              <div>
                <Label for="houseNumber">{{ $t('serverRegistration.fields.houseNumber') }}</Label>
                <Input id="houseNumber" v-model="formData.houseNumber" />
              </div>
              <div>
                <Label for="postalCode">{{ $t('serverRegistration.fields.postalCode') }}</Label>
                <Input id="postalCode" v-model="formData.postalCode" />
              </div>
              <div>
                <Label for="neighborhood">{{ $t('serverRegistration.fields.neighborhood') }}</Label>
                <Input id="neighborhood" v-model="formData.neighborhood" />
              </div>
              <div>
                <Label for="city">{{ $t('serverRegistration.fields.city') }}</Label>
                <Input id="city" v-model="formData.city" />
              </div>
              <div>
                <Label for="state">{{ $t('serverRegistration.fields.state') }}</Label>
                <Input id="state" v-model="formData.state" />
              </div>
              <div>
                <Label for="country">{{ $t('serverRegistration.fields.country') }}</Label>
                <Input id="country" v-model="formData.country" />
              </div>
              <div>
                <Label for="parish">{{ $t('serverRegistration.fields.parish') }}</Label>
                <Input id="parish" v-model="formData.parish" />
              </div>
              <div>
                <Label for="homePhone">{{ $t('serverRegistration.fields.homePhone') }}</Label>
                <Input id="homePhone" v-model="formData.homePhone" />
              </div>
              <div>
                <Label for="workPhone">{{ $t('serverRegistration.fields.workPhone') }}</Label>
                <Input id="workPhone" v-model="formData.workPhone" />
              </div>
              <div>
                <Label for="cellPhone">{{ $t('serverRegistration.fields.cellPhone') }}</Label>
                <Input id="cellPhone" v-model="formData.cellPhone" />
              </div>
              <div>
                <Label for="email">{{ $t('serverRegistration.fields.email') }}</Label>
                <Input id="email" type="email" v-model="formData.email" />
              </div>
              <div>
                <Label for="occupation">{{ $t('serverRegistration.fields.occupation') }}</Label>
                <Input id="occupation" v-model="formData.occupation" />
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="health-info">
        <Card>
          <CardHeader><CardTitle>{{ $t('serverRegistration.tabs.healthInfo') }}</CardTitle></CardHeader>
          <CardContent class="space-y-4">
            <div>
              <Label>{{ $t('serverRegistration.fields.snores') }}</Label>
              <RadioGroup v-model="formData.snores" class="flex space-x-4">
                <div class="flex items-center space-x-2">
                  <RadioGroupItem id="snores-yes" :value="true" />
                  <Label for="snores-yes">{{ $t('common.yes') }}</Label>
                </div>
                <div class="flex items-center space-x-2">
                  <RadioGroupItem id="snores-no" :value="false" />
                  <Label for="snores-no">{{ $t('common.no') }}</Label>
                </div>
              </RadioGroup>
            </div>
            <div>
              <Label>{{ $t('serverRegistration.fields.hasMedication') }}</Label>
              <RadioGroup v-model="formData.hasMedication" class="flex space-x-4">
                <div class="flex items-center space-x-2">
                  <RadioGroupItem id="meds-yes" :value="true" />
                  <Label for="meds-yes">{{ $t('common.yes') }}</Label>
                </div>
                <div class="flex items-center space-x-2">
                  <RadioGroupItem id="meds-no" :value="false" />
                  <Label for="meds-no">{{ $t('common.no') }}</Label>
                </div>
              </RadioGroup>
            </div>
            <div v-if="formData.hasMedication">
              <Label for="medicationDetails">{{ $t('serverRegistration.fields.medicationDetails') }}</Label>
              <Input id="medicationDetails" v-model="formData.medicationDetails" />
            </div>
            <div v-if="formData.hasMedication">
              <Label for="medicationSchedule">{{ $t('serverRegistration.fields.medicationSchedule') }}</Label>
              <Input id="medicationSchedule" v-model="formData.medicationSchedule" />
            </div>
            <div>
              <Label>{{ $t('serverRegistration.fields.hasDietaryRestrictions') }}</Label>
              <RadioGroup v-model="formData.hasDietaryRestrictions" class="flex space-x-4">
                <div class="flex items-center space-x-2">
                  <RadioGroupItem id="diet-yes" :value="true" />
                  <Label for="diet-yes">{{ $t('common.yes') }}</Label>
                </div>
                <div class="flex items-center space-x-2">
                  <RadioGroupItem id="diet-no" :value="false" />
                  <Label for="diet-no">{{ $t('common.no') }}</Label>
                </div>
              </RadioGroup>
            </div>
            <div v-if="formData.hasDietaryRestrictions">
              <Label for="dietaryRestrictionsDetails">{{ $t('serverRegistration.fields.dietaryRestrictionsDetails') }}</Label>
              <Input id="dietaryRestrictionsDetails" v-model="formData.dietaryRestrictionsDetails" />
            </div>
            <div>
              <Label>{{ $t('serverRegistration.fields.sacraments.label') }}</Label>
              <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
                <div v-for="sacrament in sacramentOptions" :key="sacrament" class="flex items-center space-x-2">
                  <Checkbox :id="sacrament" :checked="formData.sacraments?.includes(sacrament)" @update:checked="updateSacraments(sacrament)" />
                  <Label :for="sacrament">{{ $t(`serverRegistration.fields.sacraments.options.${sacrament}`) }}</Label>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="emergency-contact">
        <Card>
          <CardHeader><CardTitle>{{ $t('serverRegistration.tabs.emergencyContact') }}</CardTitle></CardHeader>
          <CardContent class="space-y-6">
            <div>
              <h3 class="font-semibold mb-2">{{ $t('serverRegistration.emergencyContact1') }}</h3>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label for="emergencyContact1Name">{{ $t('serverRegistration.fields.emergencyContact.name') }}</Label>
                  <Input id="emergencyContact1Name" v-model="formData.emergencyContact1Name" />
                </div>
                <div>
                  <Label for="emergencyContact1Relation">{{ $t('serverRegistration.fields.emergencyContact.relation') }}</Label>
                  <Input id="emergencyContact1Relation" v-model="formData.emergencyContact1Relation" />
                </div>
                <div>
                  <Label for="emergencyContact1HomePhone">{{ $t('serverRegistration.fields.emergencyContact.homePhone') }}</Label>
                  <Input id="emergencyContact1HomePhone" v-model="formData.emergencyContact1HomePhone" />
                </div>
                <div>
                  <Label for="emergencyContact1WorkPhone">{{ $t('serverRegistration.fields.emergencyContact.workPhone') }}</Label>
                  <Input id="emergencyContact1WorkPhone" v-model="formData.emergencyContact1WorkPhone" />
                </div>
                <div>
                  <Label for="emergencyContact1CellPhone">{{ $t('serverRegistration.fields.emergencyContact.cellPhone') }}</Label>
                  <Input id="emergencyContact1CellPhone" v-model="formData.emergencyContact1CellPhone" />
                </div>
                <div>
                  <Label for="emergencyContact1Email">{{ $t('serverRegistration.fields.emergencyContact.email') }}</Label>
                  <Input id="emergencyContact1Email" type="email" v-model="formData.emergencyContact1Email" />
                </div>
              </div>
            </div>
            <div>
              <h3 class="font-semibold mb-2">{{ $t('serverRegistration.emergencyContact2') }}</h3>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div>
                  <Label for="emergencyContact2Name">{{ $t('serverRegistration.fields.emergencyContact.name') }}</Label>
                  <Input id="emergencyContact2Name" v-model="formData.emergencyContact2Name" />
                </div>
                <div>
                  <Label for="emergencyContact2Relation">{{ $t('serverRegistration.fields.emergencyContact.relation') }}</Label>
                  <Input id="emergencyContact2Relation" v-model="formData.emergencyContact2Relation" />
                </div>
                <div>
                  <Label for="emergencyContact2HomePhone">{{ $t('serverRegistration.fields.emergencyContact.homePhone') }}</Label>
                  <Input id="emergencyContact2HomePhone" v-model="formData.emergencyContact2HomePhone" />
                </div>
                <div>
                  <Label for="emergencyContact2WorkPhone">{{ $t('serverRegistration.fields.emergencyContact.workPhone') }}</Label>
                  <Input id="emergencyContact2WorkPhone" v-model="formData.emergencyContact2WorkPhone" />
                </div>
                <div>
                  <Label for="emergencyContact2CellPhone">{{ $t('serverRegistration.fields.emergencyContact.cellPhone') }}</Label>
                  <Input id="emergencyContact2CellPhone" v-model="formData.emergencyContact2CellPhone" />
                </div>
                <div>
                  <Label for="emergencyContact2Email">{{ $t('serverRegistration.fields.emergencyContact.email') }}</Label>
                  <Input id="emergencyContact2Email" type="email" v-model="formData.emergencyContact2Email" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
    <div class="mt-4 flex justify-end">
      <Button @click="onSubmit">{{ $t('common.submit') }}</Button>
    </div>
  </div>
</template>
