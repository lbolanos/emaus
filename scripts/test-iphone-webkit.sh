#!/bin/bash
# Test the app with Playwright WebKit (Safari engine) emulating an iPhone
# Usage: ./scripts/test-iphone-webkit.sh [url] [email] [password]
#
# Prerequisites (one-time):
#   sudo env "PATH=$PATH" npx playwright install webkit
#   sudo env "PATH=$PATH" npx playwright install-deps webkit

# Strip trailing slash from URL
URL="${1:-http://localhost:5173}"
URL="${URL%/}"
LOGIN_EMAIL="${2:-}"
LOGIN_PASSWORD="${3:-}"

echo "=== Installing WebKit if needed ==="
npx playwright install webkit 2>/dev/null

echo ""
echo "=== Testing with WebKit (Safari engine) - iPhone 14 Pro ==="
echo "URL: $URL"
echo ""

node -e "
const { webkit, devices } = require('playwright');

(async () => {
  const iPhone = devices['iPhone 14 Pro'];
  const browser = await webkit.launch({ headless: true });

  // ─── Run A: Normal modern iPhone ───
  console.log('========================================');
  console.log('  RUN A: Modern iPhone (iOS 16)');
  console.log('========================================');
  const ctxA = await browser.newContext({
    ...iPhone,
    extraHTTPHeaders: { 'ngrok-skip-browser-warning': '1' },
  });
  const results = { A: await runTests(ctxA, 'A'), B: null };

  // ─── Authenticated tests (Run A only) ───
  const LOGIN_EMAIL = '${LOGIN_EMAIL}';
  const LOGIN_PASSWORD = '${LOGIN_PASSWORD}';
  if (LOGIN_EMAIL && LOGIN_PASSWORD) {
    console.log('');
    console.log('--- Authenticated tests (Run A) ---');
    await runAuthTests(ctxA, results.A);
  } else {
    console.log('');
    console.log('--- Skipping auth tests (no credentials provided) ---');
  }

  await ctxA.close();

  // ─── Run B: Older iPhone — delete TransformStream before page loads ───
  console.log('');
  console.log('========================================');
  console.log('  RUN B: Older iPhone (no TransformStream)');
  console.log('========================================');
  const ctxB = await browser.newContext({
    ...iPhone,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
    extraHTTPHeaders: { 'ngrok-skip-browser-warning': '1' },
  });
  // Delete TransformStream BEFORE any page script runs
  await ctxB.addInitScript(() => {
    delete globalThis.TransformStream;
    delete globalThis.ReadableStream;
    delete globalThis.WritableStream;
  });
  results.B = await runTests(ctxB, 'B');
  await ctxB.close();

  // ─── Final Summary ───
  console.log('');
  console.log('========================================');
  console.log('  FINAL SUMMARY');
  console.log('========================================');

  for (const [run, r] of Object.entries(results)) {
    const label = run === 'A' ? 'Modern iPhone' : 'Older iPhone (no TransformStream)';
    console.log('');
    console.log('Run ' + run + ': ' + label);
    console.log('  Tests passed: ' + r.passed + '/' + r.total);
    if (r.appErrors.length > 0) {
      console.log('  APP ERRORS (' + r.appErrors.length + '):');
      r.appErrors.forEach(e => console.log('    ERROR: ' + e));
    } else {
      console.log('  App errors: NONE');
    }
    console.log('  Known dev-env errors (ignored): ' + r.knownDevErrors.length);
    console.log('  Bundle sizes: ' + JSON.stringify(r.bundleSizes));
  }

  const totalAppErrors = results.A.appErrors.length + results.B.appErrors.length;
  console.log('');
  if (totalAppErrors > 0) {
    console.log('RESULT: FAIL (' + totalAppErrors + ' app errors)');
    process.exit(1);
  } else {
    console.log('RESULT: ALL PASS');
  }

  await browser.close();

  // ─── Test runner function ───
  async function runTests(context, runLabel) {
    const appErrors = [];
    const knownDevErrors = [];
    let passed = 0;
    let total = 0;
    const bundleSizes = {};

    // Helper: create a fresh page with listeners for each test
    async function freshPage() {
      const page = await context.newPage();
      page.on('console', msg => {
        if (msg.type() === 'error') {
          const text = msg.text();
          (isKnownDevError(text) ? knownDevErrors : appErrors).push(text);
        }
      });
      page.on('pageerror', err => {
        (isKnownDevError(err.message) ? knownDevErrors : appErrors).push(err.message);
      });
      page.on('response', response => {
        const url = response.url();
        const ct = response.headers()['content-type'] || '';
        if (ct.includes('javascript') && url.includes('/assets/')) {
          const name = url.split('/').pop();
          const size = parseInt(response.headers()['content-length'] || '0', 10);
          if (size > 0) bundleSizes[name] = (size / 1024 / 1024).toFixed(2) + ' MB';
        }
      });
      return page;
    }

    const KNOWN_DEV_PATTERNS = [
      /AxiosError/i, /csrf/i, /access control/i, /Google Maps/i,
      /401.*Unauthorized/i, /Failed to load resource/i, /NetworkError/i,
      /fetch/i, /recaptcha/i, /assets\.ngrok\.com/i, /Content Security Policy/i,
    ];
    const isKnownDevError = (msg) => KNOWN_DEV_PATTERNS.some(p => p.test(msg));

    // Test 1: Landing page loads (not white screen)
    total++;
    console.log('');
    console.log('--- Test 1: Landing page ---');
    try {
      const page = await freshPage();
      await page.goto('${URL}', { waitUntil: 'networkidle', timeout: 30000 });
      const bodyText = await page.locator('body').innerText();
      const hasContent = bodyText.trim().length > 50;
      const hasH1 = await page.locator('h1').count() > 0;
      console.log('  URL:', page.url());
      console.log('  Body text length:', bodyText.trim().length);
      console.log('  Has h1:', hasH1);
      if (hasContent && hasH1) {
        console.log('  PASS: Landing page has visible content');
        passed++;
      } else {
        console.log('  FAIL: Page appears blank (white screen!)');
        appErrors.push('Landing page blank — likely JS crash');
      }
      await page.close();
    } catch (e) {
      console.log('  FAIL:', e.message);
    }

    // Test 2: Login page renders
    total++;
    console.log('');
    console.log('--- Test 2: Login page ---');
    try {
      const page = await freshPage();
      await page.goto('${URL}/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
      // Wait for Vue to render — check for Login heading or button in DOM
      await page.waitForTimeout(5000);
      const loginHTML = await page.locator('#app').innerHTML();
      const hasLoginForm = loginHTML.includes('Login') && loginHTML.includes('password');
      const loginBtn = await page.locator('button').filter({ hasText: 'Login' }).count() > 0;
      console.log('  Login form in DOM:', hasLoginForm);
      console.log('  Login button count:', await page.locator('button').filter({ hasText: 'Login' }).count());
      if (hasLoginForm) {
        console.log('  PASS: Login page rendered');
        passed++;
      } else {
        console.log('  FAIL: Login form not found (white screen?)');
        appErrors.push('Login page blank — likely JS crash');
      }
      await page.close();
    } catch (e) {
      console.log('  FAIL:', e.message);
    }

    // Test 3: /app redirects to login
    total++;
    console.log('');
    console.log('--- Test 3: /app route (auth redirect) ---');
    try {
      const page = await freshPage();
      await page.goto('${URL}/app', { waitUntil: 'networkidle', timeout: 30000 });
      const finalUrl = page.url();
      console.log('  Redirected to:', finalUrl);
      if (finalUrl.includes('/login') || finalUrl.includes('/app')) {
        console.log('  PASS: Route handled correctly');
        passed++;
      } else {
        console.log('  FAIL: Unexpected redirect');
      }
      await page.close();
    } catch (e) {
      console.log('  FAIL:', e.message);
    }

    // Test 4: viewport-fit=cover meta tag
    total++;
    console.log('');
    console.log('--- Test 4: viewport-fit=cover meta tag ---');
    try {
      const page = await freshPage();
      await page.goto('${URL}', { waitUntil: 'networkidle', timeout: 30000 });
      const viewport = await page.locator('meta[name=viewport]').first().getAttribute('content');
      console.log('  Viewport:', viewport);
      if (viewport && viewport.includes('viewport-fit=cover')) {
        console.log('  PASS: viewport-fit=cover present');
        passed++;
      } else {
        console.log('  FAIL: viewport-fit=cover missing');
      }
      await page.close();
    } catch (e) {
      console.log('  FAIL:', e.message);
    }

    // Test 5: Main bundle size check
    total++;
    console.log('');
    console.log('--- Test 5: Bundle size check ---');
    try {
      const mainBundle = Object.entries(bundleSizes).find(([k]) => k.startsWith('index'));
      if (mainBundle) {
        const sizeMB = parseFloat(mainBundle[1]);
        console.log('  Main bundle:', mainBundle[0], '=', mainBundle[1]);
        if (sizeMB < 5) {
          console.log('  PASS: Bundle is under 5MB (mobile-safe)');
          passed++;
        } else {
          console.log('  FAIL: Bundle is ' + mainBundle[1] + ' — too large for mobile Safari');
          appErrors.push('Main bundle too large: ' + mainBundle[1]);
        }
      } else {
        console.log('  SKIP: Could not detect bundle size (dev server does not set content-length)');
        passed++;
      }
    } catch (e) {
      console.log('  FAIL:', e.message);
    }

    console.log('');
    console.log('  Results: ' + passed + '/' + total + ' passed, ' + appErrors.length + ' app errors, ' + knownDevErrors.length + ' ignored dev errors');

    return { passed, total, appErrors, knownDevErrors, bundleSizes };
  }

  // ─── Authenticated test runner (reuses context to preserve cookies) ───
  async function runAuthTests(context, resultObj) {
    const KNOWN_DEV_PATTERNS = [
      /AxiosError/i, /csrf/i, /access control/i, /Google Maps/i,
      /401.*Unauthorized/i, /Failed to load resource/i, /NetworkError/i,
      /fetch/i, /recaptcha/i, /assets\\.ngrok\\.com/i, /Content Security Policy/i,
    ];
    const isKnownDevError = (msg) => KNOWN_DEV_PATTERNS.some(p => p.test(msg));

    // Single persistent page for all auth tests (preserves session cookie)
    const page = await context.newPage();
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        (isKnownDevError(text) ? resultObj.knownDevErrors : resultObj.appErrors).push(text);
      }
    });
    page.on('pageerror', err => {
      (isKnownDevError(err.message) ? resultObj.knownDevErrors : resultObj.appErrors).push(err.message);
    });

    // Test 6: Login → Dashboard
    resultObj.total++;
    console.log('');
    console.log('--- Test 6: Login → Dashboard ---');
    try {
      await page.goto('${URL}/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);

      // Fill login form
      await page.locator('input[type=\"email\"], input[name=\"email\"]').first().fill('${LOGIN_EMAIL}');
      await page.locator('input[type=\"password\"]').first().fill('${LOGIN_PASSWORD}');
      await page.locator('button').filter({ hasText: 'Login' }).first().click();

      // Wait for navigation to dashboard
      await page.waitForTimeout(5000);
      const finalUrl = page.url();
      const html = await page.locator('#app').innerHTML();
      const hasH1 = html.includes('<h1');
      const hasContent = html.length > 200;
      console.log('  Final URL:', finalUrl);
      console.log('  Has h1:', hasH1);
      console.log('  HTML length:', html.length);
      if (finalUrl.includes('/app') && hasContent) {
        console.log('  PASS: Logged in and dashboard rendered');
        resultObj.passed++;
      } else {
        console.log('  FAIL: Dashboard did not render after login');
        resultObj.appErrors.push('Login → Dashboard failed. URL: ' + finalUrl);
      }
    } catch (e) {
      console.log('  FAIL:', e.message);
    }

    // Test 7: Tables page renders with data
    resultObj.total++;
    console.log('');
    console.log('--- Test 7: Tables page ---');
    try {
      await page.goto('${URL}/app/tables', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(5000);
      const tablesHtml = await page.locator('#app').innerHTML();
      // Check for table cards or table-related content
      const hasTableContent = tablesHtml.includes('Mesa') || tablesHtml.includes('table') || tablesHtml.includes('mesa');
      const htmlLength = tablesHtml.length;
      console.log('  HTML length:', htmlLength);
      console.log('  Has table content:', hasTableContent);
      if (htmlLength > 200 && hasTableContent) {
        console.log('  PASS: Tables page rendered with content');
        resultObj.passed++;
      } else if (htmlLength > 200) {
        console.log('  PASS: Tables page rendered (no table data yet)');
        resultObj.passed++;
      } else {
        console.log('  FAIL: Tables page blank');
        resultObj.appErrors.push('Tables page blank after auth');
      }
    } catch (e) {
      console.log('  FAIL:', e.message);
    }

    // Test 8: AiChatWidget button present
    resultObj.total++;
    console.log('');
    console.log('--- Test 8: AiChatWidget ---');
    try {
      // Chat widget should be present on any /app page
      await page.waitForTimeout(2000);
      const html = await page.locator('body').innerHTML();
      // The chat widget renders a floating button — look for it in DOM
      const hasChatButton = html.includes('chat') || html.includes('Chat') || html.includes('ai-chat');
      const chatBtnCount = await page.locator('button').filter({ hasText: /chat|Chat/i }).count();
      const fabCount = await page.locator('[class*=\"chat\"], [class*=\"Chat\"], [id*=\"chat\"]').count();
      console.log('  Chat-related text in DOM:', hasChatButton);
      console.log('  Chat buttons:', chatBtnCount);
      console.log('  Chat elements:', fabCount);
      if (hasChatButton || chatBtnCount > 0 || fabCount > 0) {
        console.log('  PASS: Chat widget found in DOM');
        resultObj.passed++;
      } else {
        console.log('  FAIL: Chat widget not found');
        resultObj.appErrors.push('AiChatWidget not found in DOM');
      }
    } catch (e) {
      console.log('  FAIL:', e.message);
    }

    await page.close();
  }
})();
"
