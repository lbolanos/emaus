# Retreat Switching & Role-Based Permission Validation

## Problem Summary

The original implementation had critical issues with retreat switching and permission management:

1. **Static Permission Loading**: User permissions were loaded only once during login and never refreshed when switching retreats
2. **Missing Retreat-Specific Logic**: The system didn't filter permissions based on the selected retreat
3. **Sidebar Used Stale Permissions**: Menu items didn't update when users switched between retreats with different roles

## Solution Implementation

### 1. Enhanced Auth Store (`stores/authStore.ts`)

**Added Features:**

- `refreshUserProfile()` method to reload user permissions
- `refreshingProfile` loading state for UI feedback
- Better error handling with session expiration detection

**Key Code:**

```typescript
async function refreshUserProfile() {
	if (!isAuthenticated.value) return;

	try {
		refreshingProfile.value = true;
		const response = await api.get('/auth/status');
		if (response.data && response.data.authenticated !== false) {
			userProfile.value = response.data.profile;
		}
	} catch (error: any) {
		// Handle session expiration and other errors
		if (error.response?.status === 401) {
			// Force logout on session expiration
			await logout();
		} else {
			// Show warning for other errors
			toast({
				title: 'Warning',
				description: 'Could not refresh permissions. Some features may be limited.',
				variant: 'default',
			});
		}
	} finally {
		refreshingProfile.value = false;
	}
}
```

### 2. Updated Retreat Store Hook (`components/layout/Header.vue`)

**Added Automatic Permission Refresh:**

```typescript
watch(
	() => retreatStore.selectedRetreatId,
	async (newId, oldId) => {
		if (newId && newId !== oldId) {
			console.log(
				`Retreat selection changed from ${oldId} to ${newId}. Refreshing user permissions...`,
			);
			await authStore.refreshUserProfile();
			console.log('User permissions refreshed for new retreat.');
		}
	},
);
```

**Added Loading Indicator:**

- Visual spinner when refreshing permissions
- "Updating permissions..." message

### 3. Enhanced Permission Composable (`composables/useAuthPermissions.ts`)

**Added Retreat-Specific Permission Logic:**

```typescript
// Get retreat-specific permissions based on selected retreat
const retreatSpecificPermissions = computed(() => {
	if (!authStore.userProfile || !retreatStore.selectedRetreatId) return [];

	// Get permissions from user's role for the selected retreat
	const retreatRole = authStore.userProfile.roles.find((roleDetail) =>
		roleDetail.retreats.some((retreat) => retreat.retreatId === retreatStore.selectedRetreatId),
	);

	if (!retreatRole) {
		// If no specific retreat role, fall back to global permissions
		return userPermissions.value;
	}

	// Combine global permissions with retreat-specific permissions
	const globalPermissions = authStore.userProfile.permissions.map(
		(p) => `${p.resource}:${p.operation}`,
	);
	const retreatPermissions = retreatRole.globalPermissions.map(
		(p) => `${p.resource}:${p.operation}`,
	);

	// Remove duplicates and return unique permissions
	return [...new Set([...globalPermissions, ...retreatPermissions])];
});
```

**Updated All Permission Checks:**

- All permission checking functions now use `retreatSpecificPermissions`
- Reactive updates when retreat changes
- Added `currentRetreatRole` and `hasRoleInCurrentRetreat` computed properties

### 4. Sidebar Integration (`components/layout/Sidebar.vue`)

**Automatic Integration:**

- Already uses `useAuthPermissions` composable
- Permission checks automatically use retreat-specific permissions
- Menu visibility updates reactively when retreat changes

**Key Validation:**

```typescript
// Special case for role management - requires user:manage permission
if (item.name === 'role-management' && !can.manage('user')) return false;

// Standard permission check for other items
if (
	item.permission &&
	item.permission !== 'superadmin' &&
	item.name !== 'role-management' &&
	!can.read(item.permission)
)
	return false;
```

## Validation Scenarios

### Scenario 1: User with Multiple Roles

**Setup:**

- User has admin role in Retreat A
- User has servidor role in Retreat B
- No global roles

**Expected Behavior:**

1. Select Retreat A → User sees admin-level menu items (role management, full participant management)
2. Select Retreat B → User sees limited menu items (read-only participant access)
3. Role management menu should only appear for Retreat A

### Scenario 2: User with Global Superadmin Role

**Setup:**

- User has superadmin role globally
- User has various retreat-specific roles

**Expected Behavior:**

1. Any retreat selection → User sees all menu items including global settings
2. Retreat-specific permissions enhance global permissions
3. No permission restrictions regardless of retreat

### Scenario 3: User No Role in Selected Retreat

**Setup:**

- User has roles in Retreat A only
- User switches to Retreat B where they have no role

**Expected Behavior:**

1. Select Retreat A → User sees appropriate menu items based on their role
2. Select Retreat B → User sees only basic functionality, limited menu items
3. Role management menu hidden

### Scenario 4: Session Expiration During Retreat Switch

**Setup:**

- User's session expires while switching retreats

**Expected Behavior:**

1. System detects 401 error during permission refresh
2. User is automatically logged out
3. Redirected to login page with appropriate message

## Technical Implementation Details

### Permission Hierarchy

1. **Global Permissions** - User roles without retreat association
2. **Retreat-Specific Permissions** - Roles tied to specific retreats
3. **Combined Permissions** - Union of global and retreat-specific permissions
4. **Reactive Updates** - Permissions update automatically when retreat changes

### API Response Structure

The `/auth/status` endpoint returns:

```typescript
{
  authenticated: boolean,
  user: User,
  profile: {
    roles: [{
      role: Role,
      retreats: [{
        retreatId: string,
        role: Role
      }],
      globalPermissions: [{
        resource: string,
        operation: string
      }]
    }],
    permissions: [{
      resource: string,
      operation: string
    }]
  }
}
```

### Error Handling

- **Network Errors**: Show warning toast, don't logout
- **Authentication Errors (401)**: Force logout and redirect
- **Permission Refresh Failures**: Graceful degradation with limited functionality

## Testing Instructions

### Manual Testing Steps:

1. **Login with multi-role user**

   ```bash
   # Use user with different roles in different retreats
   ```

2. **Test Retreat Switching**
   - Select different retreats from header dropdown
   - Verify menu items update appropriately
   - Check loading indicator appears

3. **Test Permission Restrictions**
   - Verify role management appears only for users with `user:manage` permission
   - Test restricted menu items are properly hidden
   - Validate navigation permissions work correctly

4. **Test Error Scenarios**
   - Test with expired session (simulate 401 error)
   - Test network connectivity issues
   - Verify graceful error handling

### Automated Testing:

```typescript
// Test retreat-specific permissions
describe('Retreat Permission Switching', () => {
	it('should refresh permissions when retreat changes', async () => {
		// Mount component with mock auth store
		// Change selected retreat
		// Verify refreshUserProfile was called
		// Verify menu items updated
	});

	it('should show role management only with user:manage permission', () => {
		// Test with user having user:manage permission
		// Test with user without user:manage permission
		// Verify menu item visibility
	});
});
```

## Performance Considerations

### Optimization:

1. **Computation Caching**: Permission calculations are cached in computed properties
2. **Minimal API Calls**: Permission refresh only happens on retreat change
3. **Reactive Updates**: Vue's reactivity ensures efficient UI updates
4. **Error Prevention**: Graceful fallbacks prevent complete UI failure

### Memory Usage:

- Permission data is stored in reactive refs
- No memory leaks from retreat switching
- Automatic cleanup on logout

## Security Considerations

### Permission Validation:

1. **Server-Side Verification**: All API calls still validate permissions server-side
2. **Client-Side Optimization**: UI restrictions improve UX but don't replace server security
3. **Session Management**: Proper session expiration handling
4. **Permission Isolation**: Retreat-specific permissions don't affect other retreats

## Deployment Notes

### Migration:

- No database schema changes required
- Backward compatible with existing permission system
- Gradual rollout possible

### Configuration:

- No environment variables needed
- Existing authentication flow unchanged
- Permission refresh is automatic

## Conclusion

The implemented solution provides:

- ✅ **Dynamic Permission Updates**: Permissions refresh when switching retreats
- ✅ **Retreat-Specific Access Control**: Different roles per retreat
- ✅ **Reactive UI Updates**: Menu items update automatically
- ✅ **Error Resilience**: Graceful handling of network and auth errors
- ✅ **User Feedback**: Loading indicators and clear error messages
- ✅ **Security Maintenance**: Server-side validation remains intact

This implementation ensures that users see exactly what they're permitted to see based on their specific role in each retreat, providing a secure and intuitive user experience.
