---
name: safari-ios-compatibility
description: Diagnose and fix Safari iOS blank page issues in Vue/Vite SPAs. Use when users report blank pages on iPhone/iPad, Safari crashes, or "Maximum call stack size exceeded" errors. Covers stack overflow from deep module evaluation, vue-i18n compiler pitfalls, large chunk splitting, nginx SPA caching, and Safari-specific DOM issues.
license: MIT
metadata:
  author: emaus-team
  version: "1.0"
---

# Safari iOS Compatibility for Vue/Vite SPAs

Hard-won lessons from debugging blank pages on Safari iOS. Safari has a **much smaller call stack** than Chrome (~1/10th), stricter module evaluation, and unique DOM handling quirks. These issues are silent — no error in DevTools, just a white screen.

## 1. Stack Overflow from Deep Module Evaluation

**Symptom:** `RangeError: Maximum call stack size exceeded` at `:0` (no useful stack trace). Page is completely blank.

**Root cause:** Safari iOS has a shallow call stack for ES module evaluation. When Vite bundles modules, each `import` statement triggers synchronous evaluation of the imported module and all its transitive dependencies. A deep chain of 30+ static imports can overflow Safari's stack.

**Common triggers:**
- Router files with many eager view imports
- `main.ts` with many static imports
- Large barrel files (`index.ts`) that re-export everything

### Fix: Lazy-load all route components

```typescript
// ❌ WRONG — creates deep synchronous evaluation chain
import WalkersView from '../views/WalkersView.vue';
import ServersView from '../views/ServersView.vue';
// ... 30 more imports

// ✅ CORRECT — each view loads in a fresh call stack
const WalkersView = () => import('../views/WalkersView.vue');
const ServersView = () => import('../views/ServersView.vue');
```

### Fix: Dynamic imports in main.ts

```typescript
// ❌ WRONG — static imports cascade into hundreds of modules
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';

// ✅ CORRECT — dynamic imports give Safari a fresh stack per module
async function boot() {
  const { createApp } = await import('vue');
  const { createPinia } = await import('pinia');
  const App = (await import('./App.vue')).default;
  const router = (await import('./router')).default;
  // ...
}
boot();
```

### Fix: Keep manualChunks in Vite config

Vite's `manualChunks` splits vendor code into separate files. Removing it creates monolithic chunks that overflow Safari's stack during evaluation.

```typescript
// vite.config.ts — KEEP this, don't remove
rollupOptions: {
  output: {
    manualChunks: (id) => {
      if (id.includes('node_modules')) {
        if (id.includes('@tiptap')) return 'vendor-tiptap';
        if (id.includes('chart.js')) return 'vendor-charts';
        if (id.includes('lucide-vue-next')) return 'vendor-icons';
        return 'vendor';
      }
    },
  },
}
```

## 2. Large Chunks Crash Safari

**Symptom:** `PRELOAD_ERR: Maximum call stack size exceeded` when navigating to a route. The entry point loads fine but a specific route's chunk crashes Safari.

**Root cause:** A single chunk is too large (>2MB) because it bundles a massive data dependency. The `country-state-city` library alone is ~8MB of country/state/city JSON data.

**How to detect:** Check build output for oversized chunks:
```
ParticipantRegistrationView-xxx.js  8,677 kB  ← TOO LARGE
```

### Fix: Lazy-load heavy data dependencies with defineAsyncComponent

```typescript
// ❌ WRONG — pulls 8MB of country data into the parent chunk
import CountrySelector from '@/components/form/CountrySelector.vue';
import StateSelector from '@/components/form/StateSelector.vue';
import CitySelector from '@/components/form/CitySelector.vue';

// ✅ CORRECT — country data loads only when the component renders
import { defineAsyncComponent } from 'vue';
const CountrySelector = defineAsyncComponent(() => import('@/components/form/CountrySelector.vue'));
const StateSelector = defineAsyncComponent(() => import('@/components/form/StateSelector.vue'));
const CitySelector = defineAsyncComponent(() => import('@/components/form/CitySelector.vue'));
```

**Result:** Chunk size dropped from 8.6MB → 59KB.

**Rule of thumb:** Any dependency that bundles large datasets (phone metadata, country lists, timezone data, locale data) MUST be lazy-loaded via `defineAsyncComponent` or dynamic `import()`.

## 3. vue-i18n `@` Character in Translations

**Symptom:** `VUE_ERR: Invalid linked format` — component renders as `<!---->` (empty comment). No visible error unless you add `app.config.errorHandler`.

**Root cause:** The full vue-i18n build (with runtime compiler) interprets `@` as a linked message reference (`@:key`). Email addresses like `correo@ejemplo.com` in translation values cause a parse error.

### Fix: Escape `@` in all translation files

```json
// ❌ WRONG — vue-i18n compiler treats @ejemplo as a linked message
"emailPlaceholder": "correo@ejemplo.com"

// ✅ CORRECT — literal @ using vue-i18n escape syntax
"emailPlaceholder": "correo{'@'}ejemplo.com"
```

**Detection:** Search all locale files for unescaped `@`:
```bash
grep -n '"[^"]*@[^"]*"' src/locales/*.json | grep -v "{'@'}"
```

**Other special characters to watch for in vue-i18n message format:**
- `@` — linked messages
- `{` `}` — interpolation
- `|` — pluralization
- `%` — legacy named interpolation

## 4. Vue Fragment Rendering Bug on Safari

**Symptom:** `TypeError: null is not an object (evaluating 't.nextSibling')` — unhandled promise rejection, app DOM gets wiped.

**Root cause:** Multi-root Vue components (fragments) use comment node anchors for DOM positioning. Safari handles comment node siblings differently than Chrome, causing `nextSibling` to be null.

### Fix: Wrap multi-root templates in a single root element

```html
<!-- ❌ WRONG — fragment with two root nodes -->
<template>
  <RouterView />
  <Toaster />
</template>

<!-- ✅ CORRECT — single root element -->
<template>
  <div id="app-root">
    <RouterView />
    <Toaster />
  </div>
</template>
```

## 5. Safari Double Module Evaluation

**Symptom:** Boot function runs twice. Debug logs show duplicate `JS-START`, `MOUNTED` messages. The second mount overwrites the first, potentially destroying rendered content.

**Root cause:** Safari can evaluate the same ES module twice if it's referenced by different URLs (e.g., `/assets/index.js` vs `/assets/index.js?v=cache-bust`). Each URL is treated as a separate module.

### Fix: Guard against double boot

```typescript
if ((window as any).__APP_BOOTED) {
  // skip — already running
} else {
  (window as any).__APP_BOOTED = true;
  (async function boot() {
    // ... app initialization
  })();
}
```

**Also:** Avoid query-string cache busting for ES module entry points. Use content-hash filenames instead (`entryFileNames: 'assets/[name]-[hash].js'`).

## 6. Nginx SPA Caching for Non-Root Routes

**Symptom:** Landing page (`/`) works, but SPA routes (`/register`, `/dashboard`) show a blank page because the browser serves a cached old `index.html`.

**Root cause:** Nginx `location = /` only matches the exact root path. SPA fallback routes serve `index.html` via `try_files` but without no-cache headers.

### Fix: Apply no-cache to all HTML responses

```nginx
# ❌ WRONG — only caches root path
location = / {
    add_header Cache-Control "no-cache, no-store, must-revalidate";
    try_files /index.html =404;
}
location / {
    try_files $uri $uri/ /index.html;
}

# ✅ CORRECT — static assets cached, all HTML responses uncached
location /assets/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
location / {
    add_header Cache-Control "no-cache, no-store, must-revalidate" always;
    add_header Pragma "no-cache" always;
    try_files $uri /index.html;
}
```

## 7. Polyfills for Older Safari

Safari iOS < 15.4 lacks some modern JS APIs. Add polyfills in `index.html` BEFORE any module scripts:

```html
<script>
  if(!Array.prototype.at){Array.prototype.at=function(n){n=Math.trunc(n)||0;if(n<0)n+=this.length;if(n<0||n>=this.length)return undefined;return this[n]}}
  if(!String.prototype.at){String.prototype.at=function(n){n=Math.trunc(n)||0;if(n<0)n+=this.length;if(n<0||n>=this.length)return undefined;return this[n]}}
  if(typeof globalThis==='undefined'){(function(){if(typeof self!=='undefined'){self.globalThis=self}else if(typeof window!=='undefined'){window.globalThis=window}})()}
  if(!String.prototype.replaceAll){String.prototype.replaceAll=function(a,b){if(a instanceof RegExp){if(!a.global)throw new TypeError('replaceAll must be called with a global RegExp');return this.replace(a,b)}return this.split(a).join(b)}}
</script>
```

## 8. CSS `:has()` Selector

Safari < 15.4 doesn't support CSS `:has()`. Use class-based alternatives:

```css
/* ❌ WRONG — breaks on older Safari */
.card:has(.attended) { background: green; }

/* ✅ CORRECT — class-based approach */
.card--attended { background: green; }
```

## Debugging Toolkit

Since Safari iOS has no accessible DevTools, use an on-page debug overlay:

```html
<!-- Add to index.html body, BEFORE #app -->
<div id="_dbg" style="position:fixed;bottom:0;left:0;right:0;z-index:99999;
  background:#900;color:white;font-size:11px;padding:6px;max-height:30vh;
  overflow:auto;word-break:break-all">...</div>
<script>
  window._L=function(m){document.getElementById('_dbg').textContent+=' | '+m};
  window.onerror=function(m){window._L('ERR:'+m)};
  window.addEventListener('unhandledrejection',function(e){window._L('REJ:'+e.reason)});
</script>
```

Then log from main.ts:
```typescript
app.config.errorHandler = (err, _inst, info) => {
  const d = document.getElementById('_dbg');
  if (d) d.textContent += ' | VUE:' + err?.message + '|' + info;
};
```

Also catch chunk load failures:
```typescript
window.addEventListener('vite:preloadError', (e) => {
  const d = document.getElementById('_dbg');
  if (d) d.textContent += ' | PRELOAD:' + e.payload?.message;
});
```

## Checklist Before Deploying to Production

- [ ] All router view imports are lazy: `() => import(...)`
- [ ] `main.ts` uses dynamic `await import()` for all dependencies
- [ ] No unescaped `@` in translation JSON files
- [ ] No chunks > 500KB (check for embedded data libraries like `country-state-city`)
- [ ] Heavy data dependencies use `defineAsyncComponent`
- [ ] App.vue has a single root element (no fragments)
- [ ] Vite `manualChunks` splits vendor code
- [ ] Nginx sends `no-cache` for ALL routes (not just `/`)
- [ ] Polyfills for `.at()`, `globalThis`, `replaceAll` in `index.html`
- [ ] No CSS `:has()` selector used
- [ ] Build target is `es2015` for maximum compatibility
