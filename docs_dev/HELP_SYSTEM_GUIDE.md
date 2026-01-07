# Help System Guide

This guide explains how to add and modify help documentation for pages in the Emaus Retreat Logistics Management System.

## Overview

The help system consists of:

- **Markdown files** in `apps/web/src/docs/en/` and `apps/web/src/docs/es/`
- **Help index** in `apps/web/src/config/helpIndex.ts`
- **Help components** (`HelpView.vue`, `HelpPanel.vue`)
- **Help button** in the header (question mark icon)

## Adding Help for a New Page

### Step 1: Create the Markdown Content

Create a new markdown file in both English and Spanish directories:

**English**: `apps/web/src/docs/en/your-page.md`
**Spanish**: `apps/web/src/docs/es/your-page.md`

Example markdown structure:

```markdown
# Page Title

Brief description of what this page does.

## Main Feature 1

Explanation of the first main feature...

## Main Feature 2

Explanation of the second main feature...
```

### Step 2: Add Section to Help Index

Edit `apps/web/src/config/helpIndex.ts` to add a new section:

```typescript
{
  key: 'your-page',
  title: 'Your Page',
  titleEs: 'Tu Página',
  icon: 'mdi-icon-name',
  routeContext: ['your-page-route', 'your-page-view'],
  topics: [
    {
      key: 'overview',
      title: 'Overview',
      titleEs: 'Descripción General',
      content: 'your-page.md',
    },
  ],
},
```

#### Fields Explained:

| Field          | Description                                | Example                        |
| -------------- | ------------------------------------------ | ------------------------------ |
| `key`          | Unique identifier for the section          | `'bed-assignments'`            |
| `title`        | English display title                      | `'Bed Assignments'`            |
| `titleEs`      | Spanish display title                      | `'Asignaciones de Camas'`      |
| `icon`         | Material Design Icon class                 | `'mdi-bed'`                    |
| `routeContext` | Array of route names that map to this help | `['bed-assignments', 'rooms']` |
| `topics`       | Array of help topics in this section       | See below                      |

#### Topic Fields:

| Field     | Description                               |
| --------- | ----------------------------------------- |
| `key`     | Unique identifier for the topic           |
| `title`   | English title                             |
| `titleEs` | Spanish title                             |
| `content` | Markdown filename (without .md extension) |

### Step 3: Add Translations (Optional)

Add any new UI strings to the locale files:

**English** - `apps/web/src/locales/en.json`:

```json
{
	"help": {
		"yourPage": {
			"title": "Your Page",
			"description": "Description of your page"
		}
	}
}
```

**Spanish** - `apps/web/src/locales/es.json`:

```json
{
	"help": {
		"yourPage": {
			"title": "Tu Página",
			"description": "Descripción de tu página"
		}
	}
}
```

## Route Context Mapping

The `routeContext` field in the help index determines which help section shows when the user clicks the help button.

### How to Find Your Route Name

Look at your route definition in `apps/web/src/router/index.ts`:

```typescript
{
  path: 'bed-assignments',
  name: 'bed-assignments', // This is the route name
  component: BedAssignmentsView,
  props: true,
}
```

### Matching Routes to Help

The help system uses partial matching. If `routeContext` includes `'bed'`, it will match:

- `bed-assignments`
- `bed-assignments/:id`
- `bed-something`

**Example:**

```typescript
// This will match routes: 'walkers', 'walkers-view', 'walkers-edit', etc.
routeContext: ['walkers', 'walkers-view'];
```

## Markdown Writing Guidelines

### Use Clear Headings

```markdown
# Main Title (Page Name)

## Section Title

### Subsection Title
```

### Include Step-by-Step Instructions

```markdown
## Adding a New Item

1. Click the **Add** button
2. Fill in the required fields
3. Click **Save** to confirm
```

### Use Code Blocks for Technical Content

```markdown
### API Endpoint
```

POST /api/participants

```

```

### Add Tips and Notes

```markdown
> **Tip**: Use filters to quickly find specific items.

> **Note**: This action cannot be undone.
```

## Testing Your Help Content

### 1. Test the Full Documentation Page

Navigate to `http://localhost:5173/help` and verify:

- Your section appears in the sidebar
- Clicking it shows your markdown content
- The content is properly formatted

### 2. Test the Contextual Help Panel

1. Navigate to the page you added help for
2. Click the **?** button in the header
3. Verify your help content appears in the slide-out panel
4. Verify "View Full Documentation" link works

### 3. Test Language Switching

1. Switch to Spanish using the language selector
2. Verify help content displays in Spanish
3. Switch back to English

## Common Patterns

### Action-Based Help

```markdown
# Managing Participants

This section explains how to manage retreat participants.

## Adding a Participant

To add a new participant:

1. Navigate to **Participants** in the sidebar
2. Click **Add Participant**
3. Fill in the required information
4. Click **Save**

## Editing Participant Information

1. Find the participant in the list
2. Click **Edit** on their row
3. Modify the information
4. Click **Save**
```

### Feature-Based Help

```markdown
# Bed Assignments

## Overview

The bed assignment system tracks where each participant will sleep...

## Bed Types

- **Normal**: Standard bed
- **Bunk**: Bunk bed (top or bottom)
- **Mattress**: Floor mattress

## Assignment Workflow

### Step 1: Review Configuration

### Step 2: Assign by Priority

### Step 3: Special Considerations
```

## Troubleshooting

### Help Not Showing for a Route

**Problem**: Clicking the help button shows a different section or no help.

**Solution**:

1. Check your route name in `apps/web/src/router/index.ts`
2. Verify `routeContext` in `helpIndex.ts` includes a matching string
3. The system uses partial matching, so `'walkers'` matches `'walkers-view'`

### Markdown Not Rendering

**Problem**: Content appears as plain text or HTML tags are visible.

**Solution**:

1. Ensure markdown file is valid
2. Check for syntax errors in markdown (unclosed backticks, etc.)
3. Verify the file encoding is UTF-8

### Translation Missing

**Problem**: Spanish text shows English content.

**Solution**:

1. Ensure both `title` and `titleEs` are provided in `helpIndex.ts`
2. Create corresponding `.md` file in `apps/web/src/docs/es/`

## File Structure

```
apps/web/src/
├── config/
│   └── helpIndex.ts          # Help section definitions
├── components/
│   ├── HelpPanel.vue         # Slide-out help panel
│   └── layout/
│       └── Header.vue        # Contains help button
├── docs/
│   ├── en/                   # English documentation
│   │   ├── getting-started.md
│   │   ├── walkers.md
│   │   ├── servers.md
│   │   ├── tables.md
│   │   ├── bed-assignments.md
│   │   ├── payments.md
│   │   ├── reports.md
│   │   └── settings.md
│   └── es/                   # Spanish documentation
│       ├── getting-started.md
│       ├── walkers.md
│       └── ...
├── locales/
│   ├── en.json               # English translations
│   └── es.json               # Spanish translations
├── router/
│   └── index.ts              # Route definitions
├── stores/
│   └── helpStore.ts          # Help state management
└── views/
    └── HelpView.vue          # Full documentation page
```

## Best Practices

1. **Keep it Simple** - Help should be easy to scan. Use short paragraphs and bullet points.

2. **Be Consistent** - Use the same terminology as in the UI.

3. **Include Screenshots** - For complex workflows, consider adding screenshots (not yet implemented).

4. **Update Regularly** - When you add features, update the help content.

5. **Test Both Languages** - Always verify help works in both English and Spanish.

6. **Use Route Context Wisely** - Group related routes together under one help section when appropriate.

## Quick Reference

| Task                  | File                                         | Action                        |
| --------------------- | -------------------------------------------- | ----------------------------- |
| Add new help topic    | `src/docs/en/*.md`, `src/docs/es/*.md`       | Create markdown files         |
| Register help section | `src/config/helpIndex.ts`                    | Add section object to array   |
| Add UI translations   | `src/locales/en.json`, `src/locales/es.json` | Add translation keys          |
| Find route name       | `src/router/index.ts`                        | Look at `name` field in route |
| Test full docs        | Navigate to `/help`                          | View all documentation        |
| Test contextual help  | Click **?** button                           | Verify context matching       |
