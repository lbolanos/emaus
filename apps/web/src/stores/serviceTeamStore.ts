import { defineStore } from 'pinia';
import { ref } from 'vue';
import {
	getServiceTeamsByRetreat,
	createServiceTeam,
	updateServiceTeam as updateServiceTeamApi,
	deleteServiceTeam as deleteServiceTeamApi,
	addServiceTeamMember,
	removeServiceTeamMember,
	assignServiceTeamLeader,
	unassignServiceTeamLeader,
	initializeDefaultServiceTeams,
} from '@/services/api';
import type { ServiceTeam } from '@repo/types';
import { useRetreatStore } from './retreatStore';
import { useToast } from '@repo/ui';

export const useServiceTeamStore = defineStore('serviceTeam', () => {
	const teams = ref<ServiceTeam[]>([]);
	const isLoading = ref(false);
	const error = ref<string | null>(null);
	const { toast } = useToast();
	const retreatStore = useRetreatStore();

	const fetchTeams = async () => {
		if (!retreatStore.selectedRetreatId) {
			teams.value = [];
			return;
		}
		isLoading.value = true;
		error.value = null;
		try {
			teams.value = await getServiceTeamsByRetreat(retreatStore.selectedRetreatId);
		} catch (e: any) {
			error.value = 'Error al cargar equipos de servicio.';
			toast({ title: 'Error', description: error.value, variant: 'destructive' });
			console.error(e);
		} finally {
			isLoading.value = false;
		}
	};

	const createTeam = async (data: any) => {
		try {
			const newTeam = await createServiceTeam(data);
			if (newTeam) teams.value.push(newTeam);
		} catch (e: any) {
			console.error('Failed to create team', e);
			toast({ title: 'Error', description: 'Error al crear equipo', variant: 'destructive' });
		}
	};

	const updateTeam = async (id: string, data: any) => {
		try {
			const updated = await updateServiceTeamApi(id, data);
			updateTeamInState(updated);
		} catch (e: any) {
			console.error('Failed to update team', e);
			toast({ title: 'Error', description: 'Error al actualizar equipo', variant: 'destructive' });
		}
	};

	const deleteTeam = async (id: string) => {
		try {
			await deleteServiceTeamApi(id);
			teams.value = teams.value.filter((t) => t.id !== id);
		} catch (e: any) {
			console.error('Failed to delete team', e);
			toast({ title: 'Error', description: 'Error al eliminar equipo', variant: 'destructive' });
		}
	};

	const addMember = async (
		teamId: string,
		participantId: string,
		role?: string,
		sourceTeamId?: string,
	) => {
		try {
			const updated = await addServiceTeamMember(teamId, participantId, role, sourceTeamId);
			updateTeamInState(updated);
			// If moved from another team, refresh that team too
			if (sourceTeamId && sourceTeamId !== teamId) {
				const sourceIdx = teams.value.findIndex((t) => t.id === sourceTeamId);
				if (sourceIdx !== -1) {
					// Remove member from source team locally
					const sourceTeam = teams.value[sourceIdx];
					if (sourceTeam.members) {
						sourceTeam.members = sourceTeam.members.filter(
							(m) => m.participantId !== participantId,
						);
					}
					if (sourceTeam.leaderId === participantId) {
						sourceTeam.leaderId = undefined;
						sourceTeam.leader = undefined;
					}
				}
			}
		} catch (e: any) {
			console.error('Failed to add member', e);
			toast({ title: 'Error', description: 'Error al agregar miembro', variant: 'destructive' });
		}
	};

	const removeMember = async (teamId: string, participantId: string) => {
		try {
			const updated = await removeServiceTeamMember(teamId, participantId);
			updateTeamInState(updated);
		} catch (e: any) {
			console.error('Failed to remove member', e);
			toast({ title: 'Error', description: 'Error al remover miembro', variant: 'destructive' });
		}
	};

	const assignLeader = async (
		teamId: string,
		participantId: string,
		sourceTeamId?: string,
	) => {
		try {
			const updated = await assignServiceTeamLeader(teamId, participantId, sourceTeamId);
			updateTeamInState(updated);
			if (sourceTeamId && sourceTeamId !== teamId) {
				const sourceIdx = teams.value.findIndex((t) => t.id === sourceTeamId);
				if (sourceIdx !== -1) {
					const sourceTeam = teams.value[sourceIdx];
					if (sourceTeam.leaderId === participantId) {
						sourceTeam.leaderId = undefined;
						sourceTeam.leader = undefined;
					}
					if (sourceTeam.members) {
						sourceTeam.members = sourceTeam.members.filter(
							(m) => m.participantId !== participantId,
						);
					}
				}
			}
		} catch (e: any) {
			console.error('Failed to assign leader', e);
			toast({ title: 'Error', description: 'Error al asignar líder', variant: 'destructive' });
		}
	};

	const unassignLeader = async (teamId: string) => {
		try {
			const updated = await unassignServiceTeamLeader(teamId);
			updateTeamInState(updated);
		} catch (e: any) {
			console.error('Failed to unassign leader', e);
			toast({ title: 'Error', description: 'Error al desasignar líder', variant: 'destructive' });
		}
	};

	const initializeDefaults = async () => {
		if (!retreatStore.selectedRetreatId) return;
		isLoading.value = true;
		try {
			teams.value = await initializeDefaultServiceTeams(retreatStore.selectedRetreatId);
			toast({ title: 'Equipos creados exitosamente' });
		} catch (e: any) {
			console.error('Failed to initialize defaults', e);
			toast({ title: 'Error', description: 'Error al crear equipos por defecto', variant: 'destructive' });
		} finally {
			isLoading.value = false;
		}
	};

	const updateTeamInState = (updatedTeam: ServiceTeam) => {
		const index = teams.value.findIndex((t) => t.id === updatedTeam.id);
		if (index !== -1) {
			teams.value[index] = updatedTeam;
		} else {
			teams.value.push(updatedTeam);
		}
	};

	retreatStore.$subscribe(() => {
		fetchTeams();
	});

	return {
		teams,
		isLoading,
		error,
		fetchTeams,
		createTeam,
		updateTeam,
		deleteTeam,
		addMember,
		removeMember,
		assignLeader,
		unassignLeader,
		initializeDefaults,
	};
});
