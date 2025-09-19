<script setup lang="ts">
import { onMounted, markRaw } from 'vue'
import { useToast } from '@repo/ui'
import { useRetreatStore } from '@/stores/retreatStore'
import { useParticipantStore } from '@/stores/participantStore'
import ParticipantList from '@/components/ParticipantList.vue'

const walkerTableColumns = ['id_on_retreat','firstName', 'lastName', 'email', 'cellPhone', 'parish', 'paymentAmount'];
const walkerFormShowColumns = ['id_on_retreat','firstName', 'lastName', 'cellPhone', 'parish', 'paymentAmount', 'email'];
const nonEditableColumns = ['email'];
const walkerFormEditColumns = walkerTableColumns.filter(c => !nonEditableColumns.includes(c));

const { toast } = useToast()
const retreatStore = useRetreatStore()
const participantStore = useParticipantStore()

function checkBirthdaysDuringRetreat() {
  //console.log('🔍 DEBUG: checkBirthdaysDuringRetreat started')

  const currentRetreat = retreatStore.selectedRetreat || retreatStore.mostRecentRetreat
  //console.log('🔍 DEBUG: currentRetreat:', currentRetreat)
  if (!currentRetreat) {
    //console.log('🔍 DEBUG: No current retreat found')
    return
  }

  const retreatStart = new Date(currentRetreat.startDate)
  const retreatEnd = new Date(currentRetreat.endDate)
  //console.log('🔍 DEBUG: retreatStart:', retreatStart, 'retreatEnd:', retreatEnd)

  const walkers = participantStore.participants.filter(p => p.type === 'walker')
  //console.log('🔍 DEBUG: Total walkers found:', walkers.length)
  //console.log('🔍 DEBUG: All participants:', participantStore.participants)

  const birthdayWalkers = walkers.filter((walker) => {
    //console.log('🔍 DEBUG: Checking walker:', walker.firstName, walker.lastName, 'birthDate:', walker.birthDate)
    if (!walker.birthDate) {
      //console.log('🔍 DEBUG: Walker has no birthDate')
      return false
    }

    // Parse the date string directly to get the correct calendar date
    const birthDateStr = walker.birthDate
    const [birthYear, birthMonth, birthDay] = birthDateStr.split('T')[0].split('-').map(Number)
    //console.log('🔍 DEBUG: Birth month:', birthMonth - 1, 'birth day:', birthDay)
    //console.log('🔍 DEBUG: Original birthDate string:', walker.birthDate)
    //console.log('🔍 DEBUG: Parsed from string - Year:', birthYear, 'Month:', birthMonth, 'Day:', birthDay)

    // Check each day of the retreat - create new Date objects to avoid modification issues
    const currentDate = new Date(retreatStart)
    const endDate = new Date(retreatEnd)

    //console.log('🔍 DEBUG: Retreat date range - Start:', retreatStart.toISOString(), 'End:', retreatEnd.toISOString())

    while (currentDate <= endDate) {
      const currentMonth = currentDate.getMonth() + 1 // Convert to 1-indexed month
      const currentDay = currentDate.getDate()
      //console.log('🔍 DEBUG: Checking date:', currentDate.toISOString(), 'month:', currentMonth, 'day:', currentDay)
      if (currentMonth === birthMonth && currentDay === birthDay) {
        //console.log('🔍 DEBUG: Birthday match found for', walker.firstName, walker.lastName)
        return true
      }
      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1)
    }
    //console.log('🔍 DEBUG: No birthday match for', walker.firstName, walker.lastName)
    return false
  })

  //console.log('🔍 DEBUG: birthdayWalkers found:', birthdayWalkers.length)

  if (birthdayWalkers.length > 0) {
    const walkerNames = birthdayWalkers.map((w) => `${w.firstName} ${w.lastName}`).join(', ')
    const birthdayText = birthdayWalkers.length === 1 ? 'cumple años' : 'cumplen años'

    //console.log('🔍 DEBUG: Showing toast for birthdays:', walkerNames)
    toast({
      title: '🎂 Cumpleaños durante el retiro',
      description: `${walkerNames} ${birthdayText} durante las fechas del retiro`,
      duration: 0, // 0 = infinite/sticky
      variant: 'destructive' // This makes it red/alert style
    })
  } else {
    //console.log('🔍 DEBUG: No birthdays found during retreat')
  }
}

onMounted(async () => {
  //console.log('🔍 DEBUG: onMounted started')

  // Wait for participants to be loaded
  if (participantStore.participants.length === 0) {
    //console.log('🔍 DEBUG: No participants found, trying to load them...')
    try {
      // Try to load participants - check available methods
      const storeMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(participantStore))
      //console.log('🔍 DEBUG: Available store methods:', storeMethods)

      // Look for common loading methods
      const loadMethod = storeMethods.find(method =>
        method.toLowerCase().includes('load') ||
        method.toLowerCase().includes('fetch') ||
        method.toLowerCase().includes('get')
      )

      if (loadMethod && typeof (participantStore as any)[loadMethod] === 'function') {
        //console.log('🔍 DEBUG: Using method:', loadMethod)
        await (participantStore as any)[loadMethod]()
      }
      //console.log('🔍 DEBUG: Participants loaded:', participantStore.participants.length)
    } catch (error) {
      console.error('🔍 DEBUG: Error loading participants:', error)
    }
  }

  // Small delay to ensure data is ready
  setTimeout(() => {
    //console.log('🔍 DEBUG: Checking birthdays with', participantStore.participants.length, 'participants')
    checkBirthdaysDuringRetreat()
  }, 500)
})
</script>

<template>
  <ParticipantList type="walker"
    :columns-to-show-in-table="walkerTableColumns"
    :columns-to-show-in-form="walkerFormShowColumns"
    :columns-to-edit-in-form="walkerFormEditColumns"
 />
</template>