# UI Components Notes

## ✅ FIXED: Switch Component is Now Fully Functional

The `Switch` component from `@repo/ui` (built on `reka-ui`) has been refactored to handle reactivity correctly. It now works as a standard Vue 3 `v-model` component.

### Previous Issues (Now Resolved)

1.  **`:checked` prop reactivity**: Resolved. The component now reacts to both `modelValue` and `checked` props correctly.
2.  **`@update:checked` and `@update:modelValue`**: Resolved. Events are now correctly emitted when the component is toggled.
3.  **Internal state conflicts**: Resolved. Logic now uses a computed property to sync external props with the internal state via `v-model:checked`.
4.  **Double-toggling**: Resolved. The manual click handler has been replaced/refined to work seamlessly with `reka-ui`'s internals.

### Recommended Usage Patterns

#### Modern `v-model` Pattern (Recommended)

The most reliable way to use the `Switch` is via direct `v-model` on a reactive object structure.

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { Switch, Label } from '@repo/ui';

const localFilters = ref({
	snores: true,
	hasMedication: false,
});
</script>

<template>
	<div class="flex items-center space-x-2">
		<Label for="snores">Snores</Label>
		<!-- ✅ BEST WAY: Direct v-model -->
		<Switch id="snores" v-model="localFilters.snores" />
	</div>
</template>
```

#### Manual Controlled Pattern

If you need to perform actions during the toggle, you can still use the prop + emit pattern.

```vue
<template>
	<Switch :model-value="isActive" @update:model-value="handleToggle" />
</template>

<script setup lang="ts">
const isActive = ref(true);
const handleToggle = (value: boolean) => {
	isActive.value = value;
	// secondary actions...
};
</script>
```

### Key Implementation Points

1.  **Use `v-model`** - This is the standard and most robust pattern for Vue 3 components.
2.  **Initialize carefully** - Ensure your proxy/ref objects are correctly unwrapped when initializing state from props (especially in Modal/Dialog components).
3.  **No more `:key` hacks** - The component no longer requires a `:key` to force re-renders when state changes.

## Component Compatibility Matrix (Updated)

| Component                        | Works with `v-model`? | Works with `:checked`? | Recommended |
| -------------------------------- | --------------------- | ---------------------- | ----------- |
| **Switch** (@repo/ui)            | ✅ Yes                | ✅ Yes (Legacy)        | ✅ Yes      |
| **Input** (@repo/ui)             | ✅ Yes                | ✅ Yes                 | ✅ Yes      |
| **Select** (@repo/ui)            | ✅ Yes                | ✅ Yes                 | ✅ Yes      |
| Native `<input type="checkbox">` | N/A                   | ✅ Yes                 | ⚠️ Optional |

## @repo/ui Components Status

All core components in `@repo/ui` are now confirmed to work correctly with Vue 3's reactivity system:

- **Switch** - (FIXED) Standard toggle behavior
- **Dialog** - Modal dialogs
- **Button** - Action buttons
- **Select** - Dropdown selects
- **Input** - Text inputs
- **Tabs** - Tab navigation
- **Label** - Form labels
- **Card** - Card containers

## Vue Reactivity Notes

### Unwrapping complex structures in props

When receiving filters or state as a prop, ensure you unwrap potential proxy structures before deep cloning:

```ts
watch(
	() => props.open,
	(isOpen) => {
		if (isOpen) {
			let currentFilters = props.filters || {};
			// Unwrap if the object is still wrapped in a .value proxy from certain store interactions
			if (currentFilters && typeof currentFilters === 'object' && 'value' in currentFilters) {
				currentFilters = { ...currentFilters, ...(currentFilters as any).value };
				delete (currentFilters as any).value;
			}
			localFilters.value = JSON.parse(JSON.stringify(currentFilters));
		}
	},
);
```

● Checkbox Struggle Summary:

  1. Initial attempt - Used @update:checked="(checked) => toggleFunction(id, checked)" with a function that accepts the boolean state
    - Problem: TypeScript errors, wrong pattern for this Checkbox component
  2. The fix - Changed to @click="toggleFunction(id)" with a simple toggle function that adds/removes from a Set
    - This is the pattern used elsewhere in the codebase (Step3ServiceInfo.vue, ImportMembersModal.vue)

  Key takeaway: The reka-ui Checkbox component in this project works with @click + simple toggle pattern, not with @update:checked + explicit boolean handling. The checkbox's visual state is controlled by the :checked prop, and clicking just needs to toggle the underlying data.


  Modal Freeze Issue

  Problem

  When closing the edit community dialog, the interface froze - but only for edit mode, not add new mode.

  Root Cause

  The issue was caused by the Google Places Autocomplete web component (gmp-place-autocomplete) creating DOM elements (.pac-container) outside the component tree. When using Radix Dialog with Teleport, these elements weren't being properly cleaned up.

  Solution

  Replace Radix Dialog with a custom div-based modal using <Teleport to="body" v-if="...">:

  <Teleport to="body" v-if="isFormModalOpen">
    <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
         @click.self="isFormModalOpen = false">
      <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col">
        <!-- Header -->
        <div class="flex items-center justify-between p-6 border-b">
          <h2 class="text-xl font-semibold">Title</h2>
          <Button variant="ghost" size="icon" @click="isFormModalOpen = false">X</Button>
        </div>
        <!-- Body -->
        <div class="flex-1 overflow-y-auto p-6">...</div>
        <!-- Footer -->
        <div class="flex items-center justify-end gap-2 p-6 border-t bg-gray-50">...</div>
      </div>
    </div>
  </Teleport>

  Key Points

  1. Use v-if on the Teleport - ensures complete unmounting when closed
  2. Custom modal, not Radix Dialog - when you have third-party web components inside
  3. Add onBeforeUnmount hook - for cleanup of external DOM elements:

  onBeforeUnmount(() => {
    document.querySelectorAll('.pac-container').forEach(el => el.remove());
  });

  When to Use This Pattern

  - Use Radix Dialog: For simple forms without third-party web components
  - Use Custom Modal + Teleport: When using web components that create global DOM elements (like Google Maps, autocomplete, etc.)

  This pattern is already used in ParticipantList.vue (bulk message dialog) and BulkEditParticipantsModal.vue.