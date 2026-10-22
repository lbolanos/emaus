import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { config } from '../config';

/**
 * The ONLY module that talks to the face model. Tests mock this module
 * (`jest.mock('@/services/faceModelClient')`), so nothing in the suite reaches Gemini.
 */

export const FACE_MODEL_TIMEOUT_MS = 45_000;

export const FaceModelResponseSchema = z.object({
	faces: z.array(
		z.object({
			box: z
				.array(z.number())
				.length(4)
				.describe('[ymin, xmin, ymax, xmax], each 0-1000, relative to the group photo'),
			match: z
				.number()
				.nullable()
				.describe('Number of the gallery tile showing the same person, or null if none'),
			confidence: z.number().describe('0-1'),
		}),
	),
});
export type FaceModelResponse = z.infer<typeof FaceModelResponseSchema>;

const PROMPT = `La primera imagen es una foto de grupo. La segunda es una galeria de caras de referencia: cada recuadro lleva un numero debajo (marcado con digitos de segmentos).

Tarea:
1. Detecta TODAS las caras visibles en la foto de grupo, incluso las pequenas o parciales.
2. Para cada cara devuelve su caja [ymin, xmin, ymax, xmax] con valores de 0 a 1000 relativos a la foto de grupo.
3. Si la persona es la misma que la de algun recuadro de la galeria, devuelve el numero de ese recuadro en "match". Compara rasgos faciales permanentes (forma de la cara, ojos, nariz, boca, cejas, orejas), NO la ropa, el fondo, el peinado pasajero ni la pose.
4. Si no estas razonablemente seguro de que es la misma persona, o la persona no esta en la galeria, devuelve match = null. Es mejor dejar null que adivinar.
5. "confidence" es tu confianza de 0 a 1.`;

export interface DetectFacesInput {
	/** Group photo, JPEG. */
	photo: Buffer;
	/** Numbered gallery grid, JPEG. */
	gallery: Buffer;
}

/** Thrown for any failure of the model call; `kind` drives the degraded-mode reason. */
export class FaceModelError extends Error {
	constructor(
		public readonly kind: 'busy' | 'quota' | 'timeout' | 'error',
		message: string,
	) {
		super(message);
		this.name = 'FaceModelError';
	}
}

function classify(error: unknown): FaceModelError {
	const e = error as { name?: string; statusCode?: number; status?: number; cause?: unknown };
	if (e?.name === 'AbortError' || e?.name === 'TimeoutError') {
		return new FaceModelError('timeout', 'Face model timed out');
	}
	const status = e?.statusCode ?? e?.status;
	if (status === 429) return new FaceModelError('quota', 'Face model quota exceeded');
	if (status === 503 || status === 500 || status === 502 || status === 504) {
		return new FaceModelError('busy', `Face model unavailable (${status})`);
	}
	// Never include the message: provider errors can echo request fragments.
	return new FaceModelError('error', 'Face model call failed');
}

export async function detectFaces(input: DetectFacesInput): Promise<FaceModelResponse> {
	try {
		const { object } = await generateObject({
			model: google(config.ai.faceModel),
			schema: FaceModelResponseSchema,
			abortSignal: AbortSignal.timeout(FACE_MODEL_TIMEOUT_MS),
			messages: [
				{
					role: 'user',
					content: [
						{ type: 'image', image: input.photo, mediaType: 'image/jpeg' },
						{ type: 'image', image: input.gallery, mediaType: 'image/jpeg' },
						{ type: 'text', text: PROMPT },
					],
				},
			],
		});
		return object;
	} catch (error) {
		throw classify(error);
	}
}
