<template>
  <div class="p-4 space-y-4">
    <div v-if="loadingCommunity || loadingMeeting" class="flex justify-center py-12">
      <Loader2 class="w-8 h-8 animate-spin text-primary" />
    </div>

    <template v-else-if="currentMeeting && currentCommunity">
      <div class="flex justify-between items-center">
        <div>
          <h1 class="text-2xl font-bold">{{ currentMeeting.title }} - {{ $t('community.meeting.recordAttendance') }}</h1>
          <div class="flex items-center text-sm text-muted-foreground">
            <router-link :to="{ name: 'community-meetings', params: { id: currentCommunity.id } }" class="hover:underline">
              {{ $t('community.meeting.title') }}
            </router-link>
            <ChevronRight class="w-4 h-4 mx-1" />
            <span>{{ $t('community.meeting.recordAttendance') }}</span>
          </div>
        </div>
        <Button @click="saveAttendance" :disabled="isSaving">
          <Loader2 v-if="isSaving" class="w-4 h-4 mr-2 animate-spin" />
          {{ $t('addRetreatModal.submit') }}
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{{ $t('participants.name') }}</TableHead>
              <TableHead>{{ $t('community.participationRate') }}</TableHead>
              <TableHead class="text-right">{{ $t('community.meeting.recordAttendance') }}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="member in members" :key="member.id">
              <TableCell class="font-medium">
                {{ member.participant.firstName }} {{ member.participant.lastName }}
              </TableCell>
              <TableCell>
                <Badge variant="outline">
                  {{ Math.round(member.lastMeetingsAttendanceRate || 0) }}%
                </Badge>
              </TableCell>
              <TableCell class="text-right">
                <div class="flex justify-end space-x-2">
                  <Button 
                    size="sm" 
                    :variant="attendanceMap[member.id] === false ? 'destructive' : 'outline'"
                    @click="setAttendance(member.id, false)"
                  >
                    {{ $t('community.meeting.absent') }}
                  </Button>
                  <Button 
                    size="sm" 
                    :variant="attendanceMap[member.id] === true ? 'default' : 'outline'"
                    @click="setAttendance(member.id, true)"
                  >
                    {{ $t('community.meeting.present') }}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Card>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive } from 'vue';
import { useCommunityStore } from '@/stores/communityStore';
import { storeToRefs } from 'pinia';
import { Loader2, ChevronRight } from 'lucide-vue-next';
import { 
  Button, Card, Table, TableHeader, TableRow, TableHead, TableBody, TableCell, Badge
} from '@repo/ui';
import { useToast } from '@repo/ui';
import { useRouter } from 'vue-router';

const props = defineProps<{
  id: string; // communityId
  meetingId: string;
}>();

const router = useRouter();
const communityStore = useCommunityStore();
const { currentCommunity, members, loadingCommunity } = storeToRefs(communityStore);
const { toast } = useToast();

const currentMeeting = ref<any>(null);
const loadingMeeting = ref(true);
const isSaving = ref(false);
const attendanceMap = reactive<Record<string, boolean | null>>({});

onMounted(async () => {
  await communityStore.fetchCommunity(props.id);
  await communityStore.fetchMembers(props.id);
  
  try {
    const resMeetings = await communityStore.fetchMeetings(props.id);
    currentMeeting.value = resMeetings?.find((m: any) => m.id === props.meetingId);
    
    // Fetch current attendance to populate
    const existingAttendance = await communityStore.fetchAttendance(props.id, props.meetingId);
    
    // Initialize map
    members.value.forEach(member => {
      const record = existingAttendance?.find((a: any) => a.memberId === member.id);
      attendanceMap[member.id] = record ? record.attended : null;
    });
  } catch (error) {
    console.error('Failed to load meeting or attendance:', error);
  } finally {
    loadingMeeting.value = false;
  }
});

const setAttendance = (memberId: string, isPresent: boolean) => {
  attendanceMap[memberId] = isPresent;
};

const saveAttendance = async () => {
  const records = Object.entries(attendanceMap)
    .filter(([_, value]) => value !== null)
    .map(([memberId, isPresent]) => ({
      memberId,
      attended: isPresent === true
    }));

  if (records.length === 0) return;

  isSaving.value = true;
  try {
    await communityStore.recordAttendance(props.id, props.meetingId, records);
    toast({
      title: 'Attendance Saved',
      description: 'The attendance has been recorded successfully.'
    });
    router.push({ name: 'community-meetings', params: { id: props.id } });
  } catch (error) {
    console.error('Failed to save attendance:', error);
  } finally {
    isSaving.value = false;
  }
};
</script>
