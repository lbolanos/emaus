import { describe, it, expect, beforeEach } from 'vitest';
import {
  collapseStorageKey,
  initialCollapsedDays,
  isRetreatOver,
  readCollapsedDays,
  retreatDayToday,
  writeCollapsedDays,
} from '../mamCollapse';

// specs/ux-mam-responsabilidades, D4 and D5c.
const retreat = { startDate: '2026-10-16', endDate: '2026-10-18', timezone: 'America/Mexico_City' };
const days = [1, 2, 3];

describe('retreatDayToday', () => {
  it('maps today to the retreat day in the retreat timezone', () => {
    // 2026-10-17 05:00 UTC is still Oct 16 in CDMX (UTC-6): day 1, not day 2.
    expect(retreatDayToday(retreat, days, new Date('2026-10-17T05:00:00Z'))).toBe(1);
    expect(retreatDayToday(retreat, days, new Date('2026-10-17T07:00:00Z'))).toBe(2);
    expect(retreatDayToday(retreat, days, new Date('2026-10-18T18:00:00Z'))).toBe(3);
  });

  it('is null before and after the retreat', () => {
    expect(retreatDayToday(retreat, days, new Date('2026-10-15T18:00:00Z'))).toBeNull();
    expect(retreatDayToday(retreat, days, new Date('2026-10-19T18:00:00Z'))).toBeNull();
  });

  it('is null when that day has no activities, or without a start date', () => {
    expect(retreatDayToday(retreat, [1, 3], new Date('2026-10-17T18:00:00Z'))).toBeNull();
    expect(retreatDayToday({ startDate: null }, days)).toBeNull();
  });
});

describe('initialCollapsedDays', () => {
  it('opens only today during the retreat', () => {
    expect(initialCollapsedDays(days, 2)).toEqual([1, 3]);
  });

  it('opens every day outside the retreat', () => {
    expect(initialCollapsedDays(days, null)).toEqual([]);
  });
});

describe('collapsed days persistence', () => {
  beforeEach(() => localStorage.clear());

  it('is null until the coordinator chooses', () => {
    expect(readCollapsedDays('r1')).toBeNull();
  });

  it('round-trips per retreat, sorted', () => {
    writeCollapsedDays('r1', [3, 1]);
    expect(readCollapsedDays('r1')).toEqual([1, 3]);
    expect(readCollapsedDays('r2')).toBeNull();
  });

  it('keeps an explicit "all open" choice apart from "never chose"', () => {
    writeCollapsedDays('r1', []);
    expect(readCollapsedDays('r1')).toEqual([]);
  });

  it('ignores garbage in storage', () => {
    localStorage.setItem(collapseStorageKey('r1'), '{not json');
    expect(readCollapsedDays('r1')).toBeNull();
    localStorage.setItem(collapseStorageKey('r1'), '[1,"x",2.5,3]');
    expect(readCollapsedDays('r1')).toEqual([1, 3]);
  });
});

describe('isRetreatOver', () => {
  it('is false during the retreat and the day after', () => {
    expect(isRetreatOver(retreat, new Date('2026-10-18T18:00:00Z'))).toBe(false);
    expect(isRetreatOver(retreat, new Date('2026-10-19T18:00:00Z'))).toBe(false);
  });

  it('is true from the second day after the end', () => {
    expect(isRetreatOver(retreat, new Date('2026-10-20T18:00:00Z'))).toBe(true);
  });

  it('is false without an end date', () => {
    expect(isRetreatOver({ endDate: null })).toBe(false);
  });
});
