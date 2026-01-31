## Description

Please include a summary of the changes and related context. What problem does this PR solve?

Fixes #(issue number)

## Type of Change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to change)
- [ ] Documentation update
- [ ] Performance improvement
- [ ] Refactoring
- [ ] Other (please describe)

## Changes Made

List the specific changes made in this PR:
- Change 1
- Change 2
- Change 3

## Testing

How was this change tested? Please describe the test plan:
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing completed
- [ ] Tested on multiple browsers/devices (if applicable)

### Test Coverage

What areas of the application should be tested to verify this change?
- Test case 1
- Test case 2

## Checklist

- [ ] My code follows the style guidelines of this project (`pnpm lint` passes)
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes (`pnpm test` passes)
- [ ] Any dependent changes have been merged and published
- [ ] Code builds successfully (`pnpm build` passes)
- [ ] Branch is up to date with the base branch

## Deployment Notes

Does this PR require any deployment considerations?

- [ ] Database migrations (describe migration)
- [ ] Environment variable changes
- [ ] Configuration changes
- [ ] New dependencies
- [ ] Breaking API changes

### Migration Instructions

If this PR includes database migrations, describe how to run them:

```bash
# Example migration steps
pnpm migration:run
```

### Rollback Instructions

If this PR needs to be rolled back, describe the rollback process:

```bash
# Example rollback steps
pnpm migration:revert
git revert <commit-hash>
```

## Screenshots / Demos

If applicable, include screenshots or GIFs of the UI changes:

(Add screenshots here)

## Performance Impact

Will this PR impact application performance?
- [ ] No impact
- [ ] Minor improvement
- [ ] Significant improvement
- [ ] Potential regression (describe mitigations)

## Breaking Changes

Does this PR introduce any breaking changes?
- [ ] No breaking changes
- [ ] Yes, breaking changes (describe below)

### Breaking Changes Details

If breaking changes were introduced, describe them and any migration path for users:

## Related Issues

Link to related issues:
- Relates to #(issue number)
- Depends on #(issue number)

## Reviewers

Tag team members who should review this PR:
@reviewer1 @reviewer2

## Additional Context

Add any other context about the PR that reviewers should know:

---

**Deployment:** This PR will be deployed to production automatically after merging to `master` branch.
