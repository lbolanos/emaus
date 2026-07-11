/**
 * Quick vision test — run with:
 *   node src/tests/vision-test.mjs
 */
import 'dotenv/config';
import fs from 'fs';

const IMAGE_PATH = '/mnt/d/Users/lbola/OneDrive/Pictures/Capturas de pantalla/Captura de pantalla 2026-04-14 230026.png';

const ZAI_API_KEY = process.env.ZAI_API_KEY || process.env.OPENAI_API_KEY;
const ZAI_VISION_API_KEY = process.env.ZAI_VISION_API_KEY;

const CONFIGS = [
  {
    label: 'glm-4.6v  (vision key)',
    model: 'glm-4.6v',
    apiKey: ZAI_VISION_API_KEY,
    baseUrl: 'https://api.z.ai/api/paas/v4',
  },
  {
    label: 'glm-4.6v  (main key)',
    model: 'glm-4.6v',
    apiKey: ZAI_API_KEY,
    baseUrl: 'https://api.z.ai/api/paas/v4',
  },
  {
    label: 'glm-4v-plus (vision key)',
    model: 'glm-4v-plus',
    apiKey: ZAI_VISION_API_KEY,
    baseUrl: 'https://api.z.ai/api/paas/v4',
  },
  {
    label: 'glm-4v-plus (main key)',
    model: 'glm-4v-plus',
    apiKey: ZAI_API_KEY,
    baseUrl: 'https://api.z.ai/api/paas/v4',
  },
].filter((cfg) => cfg.apiKey);

if (CONFIGS.length === 0) {
  console.error('Define ZAI_API_KEY (u OPENAI_API_KEY) y/o ZAI_VISION_API_KEY en el entorno o en .env');
  process.exit(1);
}

const imageBase64 = fs.readFileSync(IMAGE_PATH).toString('base64');
console.log(`Image loaded: ${Math.round(imageBase64.length * 3 / 4 / 1024)}KB\n`);

for (const cfg of CONFIGS) {
  process.stdout.write(`Testing ${cfg.label} ... `);
  try {
    const body = {
      model: cfg.model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}` } },
            { type: 'text', text: 'List every number you can read in this image. Respond with just the numbers separated by commas.' },
          ],
        },
      ],
      max_tokens: 200,
    };

    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
      console.log(`❌ HTTP ${res.status}: ${data?.error?.message || JSON.stringify(data)}`);
    } else {
      const text = data.choices?.[0]?.message?.content || '(empty)';
      console.log(`✅ "${text}"`);
    }
  } catch (e) {
    console.log(`❌ ${e.message}`);
  }
}
