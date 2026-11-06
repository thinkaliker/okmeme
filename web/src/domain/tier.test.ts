import { describe, expect, it } from 'vitest';
import { TIER, assignableTiers, viewerTier } from '@/domain/tier';

describe('assignableTiers', () => {
  const owner = viewerTier(TIER.owner);
  const admin = viewerTier(TIER.admin);
  const staff = viewerTier(TIER.staff);

  it('never offers the owner tier, and never offers anything for an owner', () => {
    expect(assignableTiers(owner, TIER.owner)).toEqual([]);
    expect(assignableTiers(admin, TIER.owner)).toEqual([]);
    expect(assignableTiers(owner, TIER.full)).not.toContain(TIER.owner);
  });

  it('lets an owner move admins, and stops an admin moving another admin', () => {
    expect(assignableTiers(owner, TIER.admin)).toEqual([1, 2, 3, 4]);
    expect(assignableTiers(admin, TIER.admin)).toEqual([]);
    expect(assignableTiers(admin, TIER.staff)).toEqual([1, 2, 3, 4]);
  });

  it('offers nothing below admin, since the panel is admin-only', () => {
    expect(assignableTiers(staff, TIER.limited)).toEqual([]);
  });
});
