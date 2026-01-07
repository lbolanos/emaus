# Print CSS Media Implementation Guide

This guide explains how to properly implement print functionality in Vue.js components using CSS media queries and the print container pattern used in this project.

## Overview

The project uses a global print styling pattern that hides all content by default and only shows elements wrapped in a `.print-container` class. This ensures consistent printing across all views.

## Key Concepts

### The `.print-container` Pattern

Other view components (TablesView, RoomsView, etc.) use global print styles that hide everything with `body * { visibility: hidden; }` and only show `.print-container` elements.

**Why this matters:** Without wrapping your printable content in `.print-container`, your print output will be blank.

## Implementation Steps

### 1. Wrap Printable Content

Wrap all content that should appear when printing in a `.print-container` div:

```vue
<template>
	<div class="p-4">
		<!-- Print Container - wraps content visible during print -->
		<div class="print-container">
			<!-- Header with print-only info -->
			<div class="print-only-header">
				<h1>{{ retreatStore.selectedRetreat?.parish }}</h1>
				<h2>{{ props.type ? $t(`sidebar.${props.type}s`) : $t('participants.all') }}</h2>
				<p>{{ new Date().toLocaleDateString() }}</p>
			</div>

			<!-- Toolbar (hidden during print) -->
			<div class="toolbar no-print">
				<Button @click="handlePrint">Print</Button>
			</div>

			<!-- Main content (visible during print) -->
			<div class="main-content">
				<!-- Your table/content here -->
			</div>
		</div>
		<!-- End Print Container -->
	</div>
</template>
```

### 2. Use `.no-print` Class

Add the `.no-print` class to elements that should NOT appear in print:

```vue
<div class="toolbar no-print">
  <Button @click="someAction">Action</Button>
</div>
```

Common `.no-print` elements:

- Toolbars and action buttons
- Search/filter inputs
- Pagination controls
- Dropdown menus
- Checkboxes for selection
- Action buttons (edit, delete, etc.)

### 3. Add Print Styles

Add both scoped and global print styles to your component:

```vue
<style scoped>
/* Scoped print styles */
@media print {
	.print-only-header {
		display: block !important;
		margin-bottom: 20px !important;
		text-align: center !important;
	}

	.participant-row {
		page-break-inside: avoid !important;
	}
}
</style>

<style>
/* Global print styles */
.print-only-header {
	display: none;
}

@media print {
	@page {
		margin: 1cm;
	}

	/* Hide elements marked with no-print class */
	.no-print {
		display: none !important;
	}

	/* Show print-only elements */
	.print-only-header {
		display: block !important;
	}

	/* Table styling */
	table {
		width: 100% !important;
		border-collapse: collapse !important;
		margin: 0 !important;
	}

	th,
	td {
		border: 1px solid #ddd !important;
		padding: 4px 8px !important;
		font-size: 8pt !important;
	}

	thead {
		display: table-header-group !important;
	}
}
</style>
```

### 4. Print Function

Add a simple print function that calls `window.print()`:

```typescript
const handlePrint = () => {
	window.print();
};
```

## Complete Example

Here's a complete example from `ParticipantList.vue`:

```vue
<script setup lang="ts">
const handlePrint = () => {
	window.print();
};
</script>

<template>
	<div class="p-0 sm:p-4">
		<div class="print-container">
			<!-- Print Header -->
			<div class="print-only-header">
				<h1 class="text-2xl font-bold">{{ retreatStore.selectedRetreat?.parish }}</h1>
				<h2 class="text-xl">
					{{ props.type ? $t(`sidebar.${props.type}s`) : $t('participants.all') }}
				</h2>
				<p class="text-sm text-gray-500">{{ new Date().toLocaleDateString() }}</p>
			</div>

			<!-- Toolbar (no-print) -->
			<div class="flex gap-2 mb-4 no-print">
				<Button @click="handlePrint">
					<Printer class="w-4 h-4 mr-2" />
					Print
				</Button>
			</div>

			<!-- Table Content -->
			<div v-else class="border rounded-md">
				<Table>
					<!-- Your table content -->
				</Table>
			</div>
		</div>
	</div>
</template>

<style scoped>
@media print {
	.print-only-header {
		display: block !important;
	}
	.participant-row {
		page-break-inside: avoid !important;
	}
}
</style>

<style>
.print-only-header {
	display: none;
}

@media print {
	@page {
		margin: 1cm;
	}
	.no-print {
		display: none !important;
	}
	.print-only-header {
		display: block !important;
	}
	table {
		width: 100% !important;
		border-collapse: collapse !important;
	}
	th,
	td {
		border: 1px solid #ddd !important;
		padding: 4px 8px !important;
	}
}
</style>
```

## Badge/Card Printing Example

For printing badges or cards (like `BadgesView.vue`):

```vue
<template>
	<div class="p-4">
		<div class="print-container">
			<!-- Header with print button -->
			<div class="flex justify-between items-center mb-6 no-print">
				<h1>Badges</h1>
				<Button @click="printBadges">Print</Button>
			</div>

			<!-- Badges Grid -->
			<div class="badges-container">
				<div v-for="item in items" :key="item.id" class="badge-item">
					<!-- Badge content -->
				</div>
			</div>
		</div>
	</div>
</template>

<style scoped>
.badges-container {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
	gap: 24px;
}

.badge-item {
	background: white;
	border-radius: 20px;
	box-shadow: 0 10px 40px rgba(0, 0, 0, 0.08);
}

@media print {
	.badges-container {
		grid-template-columns: repeat(3, 1fr);
		gap: 16px;
		margin: 0;
		padding: 0;
	}

	.badge-item {
		break-inside: avoid;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
		margin-bottom: 16px;
		border: 1px solid #e5e7eb;
	}
}
</style>
```

## Best Practices

### 1. Page Breaks

Prevent unwanted page breaks:

```css
@media print {
	/* Avoid breaking inside elements */
	.badge-item,
	.participant-row,
	table {
		page-break-inside: avoid;
	}

	/* Control page breaks before/after */
	h1,
	h2 {
		page-break-after: avoid;
	}
}
```

### 2. Print-Only Header

Add a header that only appears during print:

```vue
<template>
	<div class="print-container">
		<div class="print-only-header">
			<h1>Report Title</h1>
			<p>Date: {{ new Date().toLocaleDateString() }}</p>
		</div>
		<!-- Content -->
	</div>
</template>

<style>
.print-only-header {
	display: none;
}

@media print {
	.print-only-header {
		display: block !important;
		text-align: center;
		margin-bottom: 20px;
	}
}
</style>
```

### 3. Hide Columns in Tables

Use the `.no-print` class on table headers and cells:

```vue
<template>
	<Table>
		<TableHeader>
			<TableRow>
				<!-- Selection column (hidden in print) -->
				<TableHead class="no-print">
					<input type="checkbox" />
				</TableHead>

				<!-- Data columns (visible in print) -->
				<TableHead>Name</TableHead>
				<TableHead>Email</TableHead>

				<!-- Actions column (hidden in print) -->
				<TableHead class="no-print">Actions</TableHead>
			</TableRow>
		</TableHeader>
		<TableBody>
			<TableRow>
				<TableCell class="no-print">
					<input type="checkbox" />
				</TableCell>
				<TableCell>{{ name }}</TableCell>
				<TableCell>{{ email }}</TableCell>
				<TableCell class="no-print">
					<Button>Edit</Button>
				</TableCell>
			</TableRow>
		</TableBody>
	</Table>
</template>
```

### 4. @page Settings

Control page margins and size:

```css
@media print {
	@page {
		margin: 1cm;
		size: A4;
		/* Or use custom size */
		/* size: 8.5in 11in; */
	}

	/* Landscape mode */
	@page landscape {
		size: A4 landscape;
	}
}
```

### 5. Print Colors

Ensure text is readable when printed:

```css
@media print {
	/* Force black text for better readability */
	body {
		color: #000 !important;
	}

	/* Remove background colors that don't print well */
	.colored-background {
		background: white !important;
	}
}
```

## Common Issues and Solutions

### Issue: Blank Page When Printing

**Cause:** Missing `.print-container` wrapper.

**Solution:** Wrap all printable content in `.print-container`:

```vue
<!-- WRONG - No wrapper -->
<div>
  <div class="no-print">Toolbar</div>
  <Table>...</Table>
</div>

<!-- CORRECT - With print-container -->
<div>
  <div class="print-container">
    <div class="no-print">Toolbar</div>
    <Table>...</Table>
  </div>
</div>
```

### Issue: Images Not Showing in Print

**Cause:** Browser's "Background graphics" setting is disabled by default.

**Solution:** Use `print-color-adjust` or ensure images use `img` tags:

```css
@media print {
	.badge-image {
		print-color-adjust: exact;
		-webkit-print-color-adjust: exact;
	}
}
```

### Issue: Content Cut Off

**Cause:** Page breaks in wrong places.

**Solution:** Use `page-break-inside: avoid`:

```css
@media print {
	.card,
	.row,
	table {
		page-break-inside: avoid;
	}
}
```

### Issue: Wrong Column Count in Print

**Cause:** Grid/column styles not overridden for print.

**Solution:** Explicitly set grid columns in print media query:

```css
.badges-container {
	grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
}

@media print {
	.badges-container {
		grid-template-columns: repeat(3, 1fr); /* Fixed for print */
	}
}
```

## Translation Keys for Print Headers

Add these keys to your locale files (`apps/web/src/locales/es.json`):

```json
{
	"sidebar": {
		"walkers": "Caminantes",
		"servers": "Servidores",
		"partial_servers": "Angelitos",
		"partialServers": "Angelitos",
		"waitings": "Lista de Espera"
	},
	"participants": {
		"all": "Participantes"
	}
}
```

## Testing Print Styles

1. Open the print preview (Ctrl+P or Cmd+P)
2. Check that:
   - All `.no-print` elements are hidden
   - Content in `.print-container` is visible
   - Page breaks are in logical places
   - Tables have proper borders
   - Text is readable
   - Images/graphics appear correctly

## Files Reference

- `apps/web/src/components/ParticipantList.vue` - Table printing example
- `apps/web/src/views/BadgesView.vue` - Badge/card printing example
- `apps/web/src/locales/es.json` - Translation keys
