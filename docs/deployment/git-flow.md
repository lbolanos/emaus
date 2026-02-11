# Git Flow Workflow

This document describes the Git Flow branching strategy used in the Emaus project. Git Flow is a proven, production-ready branching model that supports parallel development while maintaining a stable production codebase.

## Branch Structure

The repository uses the following branch structure:

### 1. `master` (Production)

- **Purpose**: Stable, production-ready code
- **Protections**:
  - Requires at least 1 pull request review before merging
  - Requires CI checks to pass
  - Requires branches to be up to date
  - No direct pushes allowed (except superadmin in emergencies)
- **Deployment**: Automatically deploys to production via GitHub Actions
- **Naming**: No variations - always `master`

### 2. `develop` (Integration)

- **Purpose**: Integration branch for features, next release
- **Protections**:
  - Requires at least 1 pull request review before merging
  - Requires CI checks to pass
  - Allows force pushes for rebasing (team coordination needed)
- **Deployment**: No automatic deployment (integration only)
- **Naming**: No variations - always `develop`

### 3. `feature/*` (Feature Branches)

- **Purpose**: Develop individual features
- **Branch from**: `develop`
- **Naming**: `feature/descriptive-name`
  - Examples: `feature/user-authentication`, `feature/export-participants`
- **Merge back to**: `develop` via pull request
- **Delete after merge**: Yes, keep repository clean

### 4. `release/*` (Release Branches)

- **Purpose**: Prepare code for production release
- **Branch from**: `develop`
- **Naming**: `release/v1.2.3` (semantic versioning)
- **When to create**: When a release is ready to be prepared
- **What to do**:
  - Final testing and bug fixes only
  - Update version numbers and changelog
  - Update environment configurations if needed
- **Merge to**: Both `master` and back to `develop`
- **After merge**: Create a tag on master: `git tag -a v1.2.3 -m "Release v1.2.3"`

### 5. `hotfix/*` (Hotfix Branches)

- **Purpose**: Fix critical bugs in production
- **Branch from**: `master`
- **Naming**: `hotfix/descriptive-name`
  - Examples: `hotfix/login-security-issue`
- **Merge to**: Both `master` (with tag) and back to `develop`
- **When to use**: Only for critical production issues that can't wait for the next release

## Workflow Examples

### Feature Development Workflow

```bash
# 1. Start new feature
git checkout develop
git pull origin develop
git checkout -b feature/add-export-function

# 2. Make changes and commit
echo "export function new() {}" >> src/export.ts
git add src/export.ts
git commit -m "feat: add export function"

# 3. Push feature branch
git push -u origin feature/add-export-function

# 4. Create pull request on GitHub
# - Go to repository on GitHub
# - Create PR from feature/add-export-function to develop
# - Request reviews from team members

# 5. After approval, merge and delete
# - Merge PR (use "Squash and merge" or "Create a merge commit")
# - GitHub automatically deletes the branch
# - Pull latest develop locally
git checkout develop
git pull origin develop
```

### Release Workflow

```bash
# 1. Create release branch from develop
git checkout develop
git pull origin develop
git checkout -b release/v1.2.3

# 2. Update version numbers
# - Edit package.json: version = "1.2.3"
# - Edit README.md if needed
git add package.json
git commit -m "chore: bump version to 1.2.3"

# 3. Final testing on release branch
# - Run full test suite
# - Perform manual QA
# - Fix any bugs found

# 4. Merge to master
git checkout master
git pull origin master
git merge --no-ff release/v1.2.3
git tag -a v1.2.3 -m "Release v1.2.3"
git push origin master
git push origin v1.2.3

# 5. Merge back to develop
git checkout develop
git pull origin develop
git merge --no-ff release/v1.2.3
git push origin develop

# 6. Delete release branch
git branch -d release/v1.2.3
git push origin :release/v1.2.3
```

### Hotfix Workflow

```bash
# 1. Create hotfix branch from master
git checkout master
git pull origin master
git checkout -b hotfix/fix-login-bug

# 2. Fix the issue
# - Make minimal changes only
# - Fix only the critical issue
git add .
git commit -m "fix: resolve login authentication issue"

# 3. Merge to master with tag
git checkout master
git pull origin master
git merge --no-ff hotfix/fix-login-bug
git tag -a v1.2.4 -m "Hotfix v1.2.4"
git push origin master
git push origin v1.2.4

# 4. Merge back to develop
git checkout develop
git pull origin develop
git merge --no-ff hotfix/fix-login-bug
git push origin develop

# 5. Delete hotfix branch
git branch -d hotfix/fix-login-bug
git push origin :hotfix/fix-login-bug
```

## Commit Message Convention

Follow conventional commits for clear, descriptive messages:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- **feat**: A new feature
- **fix**: A bug fix
- **docs**: Documentation changes
- **style**: Code style changes (formatting, semicolons, etc)
- **refactor**: Code refactoring without feature changes
- **perf**: Performance improvements
- **test**: Adding or updating tests
- **chore**: Build process, dependencies, tooling

### Examples

```
feat(auth): add JWT refresh token support

fix(api): resolve race condition in participant import

docs(deployment): update EC2 deployment guide

refactor(ui): simplify form validation logic
```

## Pull Request Guidelines

### Before Creating a PR

1. **Ensure your branch is up to date**

   ```bash
   git fetch origin
   git rebase origin/develop
   ```

2. **Run local checks**

   ```bash
   pnpm lint    # Check code style
   pnpm test    # Run test suite
   pnpm build   # Verify build succeeds
   ```

3. **Use a descriptive branch name** (`feature/`, `hotfix/`, `release/`)

### When Creating a PR

1. **Use the PR template** (automatically provided)

2. **Fill in all sections**:
   - Description: What does this PR do?
   - Changes: List the key changes
   - Testing: How was this tested?
   - Checklist: Confirm all items are addressed

3. **Reference related issues**
   ```
   Fixes #123
   Related to #456
   ```

### PR Review Process

1. **Automatic checks must pass**
   - Linting must pass
   - Tests must pass
   - Build must succeed

2. **At least 1 approval required** from team members

3. **All conversations must be resolved** before merging

4. **Branch must be up to date** before merging

### Merging Options

- **Squash and merge**: For feature branches (cleaner history)
- **Create a merge commit**: For release and hotfix branches (preserves history)

## Common Issues and Solutions

### Issue: Local branch is behind remote

```bash
# Update your local branch
git fetch origin
git rebase origin/develop
# If you already pushed, force push (use with caution!)
git push -f origin feature/my-feature
```

### Issue: Accidentally committed to develop

```bash
# Undo last commit but keep changes
git reset --soft HEAD~1
# Create new branch and recommit
git checkout -b feature/my-feature
git commit -m "feat: my feature"
git push -u origin feature/my-feature
```

### Issue: Need to update feature branch with latest develop

```bash
git fetch origin
git rebase origin/develop
# If already pushed, force push
git push -f origin feature/my-feature
```

### Issue: Merge conflict when rebasing

```bash
# Resolve conflicts in your editor
# Stage resolved files
git add <resolved-files>
# Continue rebase
git rebase --continue
# Force push to remote
git push -f origin feature/my-feature
```

## Best Practices

1. **Keep feature branches small and focused**
   - One feature per branch
   - Aim for < 400 lines of code per PR
   - Easier to review and merge

2. **Keep commits atomic**
   - One logical change per commit
   - Descriptive commit messages
   - Easy to revert individual changes if needed

3. **Test before pushing**
   - Run `pnpm test` locally
   - Run `pnpm build` to verify build succeeds
   - Test your changes manually

4. **Communicate with the team**
   - Mention relevant team members in PRs
   - Ask for reviews early, don't wait
   - Discuss complex changes before implementing

5. **Delete merged branches**
   - Keeps repository clean
   - Reduces confusion
   - GitHub can auto-delete after merge

6. **Use descriptive PR titles**
   - Should explain what the PR does
   - Example: "Add participant export to Excel"
   - Bad example: "Fix stuff"

7. **Review others' PRs**
   - Share knowledge across team
   - Catch issues early
   - Maintain code quality

## Protected Branch Rules

### Master Branch

- ✅ Require at least 1 pull request review before merging
- ✅ Require status checks to pass (lint, test, build)
- ✅ Require branches to be up to date
- ✅ Include administrators in restrictions (no direct pushes)
- ✅ Auto-merge allowed: No
- ✅ Require code owner reviews: Yes (if CODEOWNERS file exists)

### Develop Branch

- ✅ Require at least 1 pull request review before merging
- ✅ Require status checks to pass (lint, test, build)
- ✅ Allow force pushes (team must coordinate)
- ✅ Auto-merge allowed: No

## FAQ

**Q: Can I push directly to develop?**
A: No, all changes must go through pull requests to maintain code quality and team communication.

**Q: What if I need to fix a feature I just pushed?**
A: Make a new commit on your feature branch and push. Request another review if needed.

**Q: How often should I merge feature branches?**
A: As soon as they're tested and approved. Don't let features sit for too long.

**Q: What if master is broken?**
A: Use a hotfix branch. This prevents blocking the develop branch.

**Q: Should I rebase or merge?**
A: Use rebase for feature branches (cleaner history), merge for release/hotfix branches (preserves context).

**Q: How do I handle merge conflicts?**
A: Resolve them locally, test thoroughly, then push. Never push unresolved conflicts.
