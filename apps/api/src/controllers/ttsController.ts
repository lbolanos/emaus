import { Request, Response, NextFunction } from 'express';
import { EdgeTTS } from 'node-edge-tts';
import path from 'path';
import os from 'os';
import fs from 'fs';
import crypto from 'crypto';

const MAX_TEXT_LENGTH = 5000;
const DEFAULT_VOICE = 'es-MX-DaliaNeural';

export const speak = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { text, voice } = req.body;

		if (!text || typeof text !== 'string') {
			return res.status(400).json({ message: 'Se requiere el campo "text"' });
		}

		if (text.length > MAX_TEXT_LENGTH) {
			return res.status(400).json({ message: `El texto no puede exceder ${MAX_TEXT_LENGTH} caracteres` });
		}

		const selectedVoice = voice || DEFAULT_VOICE;
		const tmpFile = path.join(os.tmpdir(), `tts-${crypto.randomUUID()}.mp3`);

		const tts = new EdgeTTS({
			voice: selectedVoice,
			lang: 'es-MX',
			outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
		});

		await tts.ttsPromise(text, tmpFile);

		res.setHeader('Content-Type', 'audio/mpeg');
		res.setHeader('Cache-Control', 'no-cache');

		const stream = fs.createReadStream(tmpFile);
		stream.pipe(res);
		stream.on('end', () => {
			fs.unlink(tmpFile, () => {});
		});
		stream.on('error', () => {
			fs.unlink(tmpFile, () => {});
			if (!res.headersSent) {
				res.status(500).json({ message: 'Error al generar audio' });
			}
		});
	} catch (error) {
		next(error);
	}
};

export const voices = async (_req: Request, res: Response, next: NextFunction) => {
	try {
		// Return a curated list of Spanish voices
		const spanishVoices = [
			{ id: 'es-MX-DaliaNeural', name: 'Dalia', locale: 'es-MX', gender: 'Female' },
			{ id: 'es-MX-JorgeNeural', name: 'Jorge', locale: 'es-MX', gender: 'Male' },
			{ id: 'es-ES-ElviraNeural', name: 'Elvira', locale: 'es-ES', gender: 'Female' },
			{ id: 'es-ES-AlvaroNeural', name: 'Alvaro', locale: 'es-ES', gender: 'Male' },
			{ id: 'es-AR-ElenaNeural', name: 'Elena', locale: 'es-AR', gender: 'Female' },
			{ id: 'es-CO-SalomeNeural', name: 'Salome', locale: 'es-CO', gender: 'Female' },
		];
		res.json(spanishVoices);
	} catch (error) {
		next(error);
	}
};
