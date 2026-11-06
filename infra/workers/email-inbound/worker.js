// Cloudflare Email Worker: recibe los emails del Email Routing de emaus.cc
// (catch-all), los parsea con postal-mime y los POST-ea al API de Emaús
// (specs/letters-email, contrato en infra/README.md §Email inbound).
//
// A diferencia del failover worker (single file en cloudflare.tf), este usa
// la librería postal-mime y se despliega con wrangler (ver README §Email
// inbound): MIME parsing hecho en casa NO — encodings, multipart y quoted-
// printable tienen demasiadas esquinas.
//
// Comportamiento según respuesta del API (D5):
//   404 (unknown_mailbox / mailbox_disabled) → setReject → bounce al remitente
//   401/5xx/timeout → log y drop (Cloudflare reintenta; NO rebota al remitente)
// Los topes (≤10 adjuntos, ≤8 MB c/u, ≤12 MB total) se aplican AQUÍ antes de
// postear: el email que excede rebota con causa clara.
import PostalMime from 'postal-mime';

const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 12 * 1024 * 1024;
const API_TIMEOUT_MS = 15_000;

export default {
	async email(message, env, ctx) {
		const to = message.to;
		// Pre-filtro barato: solo los buzones carta.* entran al pipeline. Todo lo
		// demás se acepta en silencio (drop) para no romper el correo normal del
		// dominio — el catch-all recibe TODO lo que apunte a emaus.cc.
		const localPart = (to || '').split('@')[0].toLowerCase();
		if (!localPart.startsWith('carta.')) {
			// Aceptar sin procesar: retornar sin setReject ni forward (setReject(false)
			// no es la API documentada — podría rechazar correo normal del dominio).
			return;
		}

		let parsed;
		try {
			const raw = await message.raw.arrayBuffer();
			parsed = await PostalMime.parse(raw);
		} catch (err) {
			console.error('postal-mime parse error:', err);
			message.setReject('No se pudo leer el mensaje. Reenvía tu carta, por favor.');
			return;
		}

		const attachments = (parsed.attachments ?? []).map((a) => ({
			fileName: a.filename || 'adjunto',
			mimeType: a.mimeType || 'application/octet-stream',
			contentBase64: arrayBufferToBase64(a.content),
		}));

		// Topes ANTES de postear (D11): exceso → bounce con causa clara.
		if (attachments.length > MAX_ATTACHMENTS) {
			message.setReject(`Máximo ${MAX_ATTACHMENTS} adjuntos por carta.`);
			return;
		}
		let totalBytes = 0;
		for (const a of attachments) {
			const size = Math.floor((a.contentBase64.length * 3) / 4);
			if (size > MAX_ATTACHMENT_BYTES || (totalBytes += size) > MAX_TOTAL_ATTACHMENT_BYTES) {
				message.setReject('Adjuntos demasiado grandes (máx 8 MB c/u, 12 MB en total).');
				return;
			}
		}

		const payload = {
			messageId: parsed.messageId || null,
			from: parsed.from?.address || message.from,
			fromName: parsed.from?.name || null,
			to,
			subject: parsed.subject || null,
			text: parsed.text || null,
			html: parsed.html || null,
			receivedAt: new Date().toISOString(),
			attachments,
		};

		let apiStatus = 0;
		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
			const res = await fetch(`${env.LETTER_WEBHOOK_API_URL}/api/letters/webhook`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Emaus-Letter-Secret': env.LETTER_WEBHOOK_SECRET,
				},
				body: JSON.stringify(payload),
				signal: controller.signal,
			});
			clearTimeout(timeoutId);
			apiStatus = res.status;
			const body = await res.json().catch(() => ({}));

			if (apiStatus === 404) {
				// unknown_mailbox / mailbox_disabled → bounce claro al remitente.
				message.setReject('La dirección de cartas no es válida. Verifícala con el equipo.');
				return;
			}
			if (apiStatus === 413) {
				message.setReject('Adjuntos demasiado grandes (máx 8 MB c/u, 12 MB en total).');
				return;
			}
			console.log('letter delivered:', to, apiStatus, body.duplicate ? 'duplicate' : 'accepted');
		} catch (err) {
			// Error de red/timeout/5xx: NO rebota (no revela que el endpoint existe);
			// solo log — Cloudflare reintenta la entrega del email.
			console.error('letter webhook error:', to, apiStatus, err);
		}
	},
};

function arrayBufferToBase64(buffer) {
	const bytes = new Uint8Array(buffer);
	let binary = '';
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
	}
	return btoa(binary);
}
