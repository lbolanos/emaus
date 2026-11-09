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
// Topes (D11 revisado 2026-11-08): la carta NUNCA rebota por tamaño — el texto
// y las fotos que quepan SIEMPRE entran. Aquí solo se descarta (sin rebote) lo
// que supera 10 MB C/U (con aviso para la bandeja); el corte por total (16 MB)
// y por formato lo hace el API, que avisa igual en la bandeja.
import PostalMime from 'postal-mime';

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
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
			// message.raw es un ReadableStream en el runtime de Workers —
			// .arrayBuffer() no existe ahí; postal-mime lo consume directo.
			const parser = new PostalMime();
			parsed = await parser.parse(message.raw);
		} catch (err) {
			console.error('postal-mime parse error:', err);
			message.setReject('No se pudo leer el mensaje. Reenvía tu carta, por favor.');
			return;
		}

		// Los adjuntos que superan 10 MB c/u se descartan SIN rebote: quitarlos del
		// payload acota el POST y el aviso viaja a la bandeja (payload.warnings).
		// El resto de topes (total 16 MB, formatos, ≤10 adjuntos) los aplica el API.
		const warnings = [];
		const attachments = [];
		for (const a of parsed.attachments ?? []) {
			const attachment = {
				fileName: a.filename || 'adjunto',
				mimeType: a.mimeType || 'application/octet-stream',
				contentBase64: arrayBufferToBase64(a.content),
			};
			if (Math.floor((attachment.contentBase64.length * 3) / 4) > MAX_ATTACHMENT_BYTES) {
				warnings.push(
					`Adjunto "${attachment.fileName}" descartado: supera ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB`,
				);
				continue;
			}
			attachments.push(attachment);
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
			warnings,
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
				// El payload igual excedió el parser del API (p. ej. muchas fotos de
				// 9 MB): mejor rebotar con causa clara que perder la carta en silencio.
				message.setReject('El correo es demasiado grande (máx 10 MB por adjunto).');
				return;
			}
			if (apiStatus >= 200 && apiStatus < 300) {
				console.log('letter delivered:', to, apiStatus, body.duplicate ? 'duplicate' : 'accepted');
			} else {
				// 4xx no-reintentable (400 payload / 401 secret): log y drop — reintentar
				// no lo arregla y rebotar revelaría el endpoint.
				console.error('letter webhook unexpected status:', to, apiStatus, body);
			}
		} catch (err) {
			// Error de red/timeout/5xx: re-lanzar — Cloudflare SOLO reintenta cuando el
			// Worker lanza; tragar el error perdería la carta en silencio.
			console.error('letter webhook error:', to, err);
			throw err;
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
