// Tests for sidebar badge logic and receptionStore behavior.
// Pure unit tests — no database, no Vue, no Pinia.
//
// These replicate the logic from:
//   - apps/web/src/components/layout/Sidebar.vue  (ITEM_BADGE / itemBadge / itemBadgeColor)
//   - apps/web/src/stores/receptionStore.ts        (setPending / clear)

// ── Types ──────────────────────────────────────────────────────────────────

interface ParticipantCounts {
  walkers: number;
  servers: number;
  angelitos: number;
  waiting: number;
  canceled: number;
}

// ── Extracted logic ────────────────────────────────────────────────────────

/**
 * Mirrors the participantCounts computed in Sidebar.vue.
 */
function computeParticipantCounts(
  participants: Array<{ type: string | null; isCancelled: boolean }>,
): ParticipantCounts {
  return {
    walkers:   participants.filter(p => p.type === 'walker'         && !p.isCancelled).length,
    servers:   participants.filter(p => p.type === 'server'         && !p.isCancelled).length,
    angelitos: participants.filter(p => p.type === 'partial_server' && !p.isCancelled).length,
    waiting:   participants.filter(p => p.type === 'waiting'        && !p.isCancelled).length,
    canceled:  participants.filter(p => p.isCancelled).length,
  };
}

/**
 * Mirrors the ITEM_BADGE / itemBadge() helper in Sidebar.vue.
 * Returns the count for the given sidebar item name, or null if 0.
 */
function itemBadge(
  name: string,
  counts: ParticipantCounts,
  pendingCount: number | null,
): number | null {
  const map: Record<string, number | null> = {
    walkers:        counts.walkers   || null,
    servers:        counts.servers   || null,
    angelitos:      counts.angelitos || null,
    'waiting-list': counts.waiting   || null,
    canceled:       counts.canceled  || null,
    reception:      pendingCount     || null,
  };
  return map[name] ?? null;
}

/**
 * Mirrors the itemBadgeColor() helper in Sidebar.vue.
 */
function itemBadgeColor(name: string): string {
  const colors: Record<string, string> = {
    walkers:        'bg-blue-500',
    servers:        'bg-green-600',
    angelitos:      'bg-purple-500',
    'waiting-list': 'bg-amber-500',
    canceled:       'bg-red-500',
    reception:      'bg-amber-500',
  };
  return colors[name] ?? 'bg-gray-500';
}

/**
 * Mirrors the receptionStore setPending / clear logic.
 */
function makeReceptionStore() {
  let pendingCount: number | null = null;
  return {
    get pendingCount() { return pendingCount; },
    setPending(n: number) { pendingCount = n; },
    clear() { pendingCount = null; },
  };
}

// ── Tests: computeParticipantCounts ───────────────────────────────────────

describe('computeParticipantCounts', () => {
  it('returns all zeros for empty participant list', () => {
    const result = computeParticipantCounts([]);
    expect(result).toEqual({ walkers: 0, servers: 0, angelitos: 0, waiting: 0, canceled: 0 });
  });

  it('counts walkers correctly', () => {
    const ps = [
      { type: 'walker', isCancelled: false },
      { type: 'walker', isCancelled: false },
      { type: 'walker', isCancelled: true },  // cancelled → not in walkers
    ];
    expect(computeParticipantCounts(ps).walkers).toBe(2);
  });

  it('counts canceled separately from active participants', () => {
    const ps = [
      { type: 'walker', isCancelled: true },
      { type: 'server', isCancelled: true },
      { type: 'walker', isCancelled: false },
    ];
    const result = computeParticipantCounts(ps);
    expect(result.canceled).toBe(2);
    expect(result.walkers).toBe(1);
    expect(result.servers).toBe(0);
  });

  it('counts all types independently', () => {
    const ps = [
      { type: 'walker',         isCancelled: false },
      { type: 'server',         isCancelled: false },
      { type: 'server',         isCancelled: false },
      { type: 'partial_server', isCancelled: false },
      { type: 'waiting',        isCancelled: false },
      { type: 'waiting',        isCancelled: false },
      { type: 'waiting',        isCancelled: false },
      { type: 'walker',         isCancelled: true },
    ];
    expect(computeParticipantCounts(ps)).toEqual({
      walkers: 1, servers: 2, angelitos: 1, waiting: 3, canceled: 1,
    });
  });
});

// ── Tests: itemBadge ───────────────────────────────────────────────────────

describe('itemBadge', () => {
  const counts: ParticipantCounts = {
    walkers: 38, servers: 15, angelitos: 4, waiting: 2, canceled: 3,
  };

  it('returns walker count for "walkers"', () => {
    expect(itemBadge('walkers', counts, null)).toBe(38);
  });

  it('returns server count for "servers"', () => {
    expect(itemBadge('servers', counts, null)).toBe(15);
  });

  it('returns partial_server count for "angelitos"', () => {
    expect(itemBadge('angelitos', counts, null)).toBe(4);
  });

  it('returns waiting count for "waiting-list"', () => {
    expect(itemBadge('waiting-list', counts, null)).toBe(2);
  });

  it('returns canceled count for "canceled"', () => {
    expect(itemBadge('canceled', counts, null)).toBe(3);
  });

  it('returns pendingCount for "reception"', () => {
    expect(itemBadge('reception', counts, 26)).toBe(26);
  });

  it('returns null when count is 0 (badge should be hidden)', () => {
    const zeroCounts = { walkers: 0, servers: 0, angelitos: 0, waiting: 0, canceled: 0 };
    expect(itemBadge('walkers', zeroCounts, null)).toBeNull();
  });

  it('returns null for unknown item names', () => {
    expect(itemBadge('tables', counts, null)).toBeNull();
    expect(itemBadge('palancas', counts, null)).toBeNull();
  });

  it('returns null for reception when pendingCount is 0', () => {
    expect(itemBadge('reception', counts, 0)).toBeNull();
  });

  it('returns null for reception when pendingCount is null', () => {
    expect(itemBadge('reception', counts, null)).toBeNull();
  });
});

// ── Tests: itemBadgeColor ──────────────────────────────────────────────────

describe('itemBadgeColor', () => {
  it('returns blue for walkers', () => {
    expect(itemBadgeColor('walkers')).toBe('bg-blue-500');
  });

  it('returns green for servers', () => {
    expect(itemBadgeColor('servers')).toBe('bg-green-600');
  });

  it('returns purple for angelitos', () => {
    expect(itemBadgeColor('angelitos')).toBe('bg-purple-500');
  });

  it('returns amber for waiting-list', () => {
    expect(itemBadgeColor('waiting-list')).toBe('bg-amber-500');
  });

  it('returns red for canceled', () => {
    expect(itemBadgeColor('canceled')).toBe('bg-red-500');
  });

  it('returns amber for reception', () => {
    expect(itemBadgeColor('reception')).toBe('bg-amber-500');
  });

  it('returns gray fallback for unknown items', () => {
    expect(itemBadgeColor('tables')).toBe('bg-gray-500');
    expect(itemBadgeColor('unknown')).toBe('bg-gray-500');
  });
});

// ── Tests: receptionStore ─────────────────────────────────────────────────

describe('receptionStore', () => {
  it('starts with pendingCount null', () => {
    const store = makeReceptionStore();
    expect(store.pendingCount).toBeNull();
  });

  it('setPending updates pendingCount', () => {
    const store = makeReceptionStore();
    store.setPending(26);
    expect(store.pendingCount).toBe(26);
  });

  it('setPending to 0 sets count to 0', () => {
    const store = makeReceptionStore();
    store.setPending(26);
    store.setPending(0);
    expect(store.pendingCount).toBe(0);
  });

  it('clear resets to null', () => {
    const store = makeReceptionStore();
    store.setPending(10);
    store.clear();
    expect(store.pendingCount).toBeNull();
  });

  it('multiple setPending calls keep latest value', () => {
    const store = makeReceptionStore();
    store.setPending(10);
    store.setPending(20);
    store.setPending(5);
    expect(store.pendingCount).toBe(5);
  });
});
