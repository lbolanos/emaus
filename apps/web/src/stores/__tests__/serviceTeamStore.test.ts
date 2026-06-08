import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

// Mock the centralized API service - only the named exports the store imports
const mockApi = {
	getServiceTeamsByRetreat: vi.fn(),
	createServiceTeam: vi.fn(),
	updateServiceTeam: vi.fn(),
	deleteServiceTeam: vi.fn(),
	addServiceTeamMember: vi.fn(),
	removeServiceTeamMember: vi.fn(),
	assignServiceTeamLeader: vi.fn(),
	unassignServiceTeamLeader: vi.fn(),
	initializeDefaultServiceTeams: vi.fn(),
};

vi.mock('@/services/api', () => mockApi);

const toastSpy = vi.fn();
vi.mock('@repo/ui', () => ({
	useToast: vi.fn(() => ({ toast: toastSpy })),
}));

// retreatStore is instantiated at store setup ($subscribe + selectedRetreatId)
vi.mock('../retreatStore', () => ({
	useRetreatStore: vi.fn(() => ({
		selectedRetreatId: 'retreat-1',
		$subscribe: vi.fn(),
	})),
}));

describe('ServiceTeamStore - addMembersToTeam', () => {
	let store: any;

	beforeEach(async () => {
		vi.clearAllMocks();
		setActivePinia(createPinia());
		const { useServiceTeamStore } = await import('../serviceTeamStore');
		store = useServiceTeamStore();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('adds each selected server as a member and updates state with the final team', async () => {
		store.teams = [{ id: 'team-1', name: 'Música y Alabanza', teamType: 'musica', members: [] }];
		const afterFirst = {
			id: 'team-1',
			name: 'Música y Alabanza',
			teamType: 'musica',
			members: [{ participantId: 'p-2' }],
		};
		const afterSecond = {
			...afterFirst,
			members: [{ participantId: 'p-2' }, { participantId: 'p-3' }],
		};
		mockApi.addServiceTeamMember.mockResolvedValueOnce(afterFirst).mockResolvedValueOnce(afterSecond);

		const result = await store.addMembersToTeam('team-1', ['p-2', 'p-3']);

		expect(mockApi.addServiceTeamMember).toHaveBeenCalledTimes(2);
		expect(mockApi.addServiceTeamMember).toHaveBeenNthCalledWith(1, 'team-1', 'p-2');
		expect(mockApi.addServiceTeamMember).toHaveBeenNthCalledWith(2, 'team-1', 'p-3');
		// State updated in place with the final (most complete) team
		expect(store.teams.find((t: any) => t.id === 'team-1')).toEqual(afterSecond);
		expect(result).toEqual(afterSecond);
		expect(toastSpy).toHaveBeenCalledWith({ title: 'Servidores agregados al equipo' });
	});

	it('does nothing when the id list is empty', async () => {
		const result = await store.addMembersToTeam('team-1', []);
		expect(mockApi.addServiceTeamMember).not.toHaveBeenCalled();
		expect(result).toBeUndefined();
	});

	it('shows a destructive toast and does not throw on API error', async () => {
		store.teams = [{ id: 'team-9', name: 'Cuartos', teamType: 'cuartos', members: [] }];
		mockApi.addServiceTeamMember.mockRejectedValue(new Error('boom'));

		const result = await store.addMembersToTeam('team-9', ['p-1']);

		expect(result).toBeUndefined();
		expect(toastSpy).toHaveBeenCalledWith(
			expect.objectContaining({ variant: 'destructive' }),
		);
	});
});
