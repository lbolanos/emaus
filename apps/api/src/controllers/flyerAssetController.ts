import type { NextFunction, Request, Response } from 'express';
import type { FlyerAssetKind } from '@repo/types';
import { FlyerAssetError, storeFlyerAsset } from '../services/flyerAssetService';

/**
 * POST /flyer-assets — stores an image for use as flyer artwork and returns its URL.
 *
 * The result is a plain public URL that any retreat can point at, so this is not
 * scoped to a single retreat.
 */
export const uploadFlyerAsset = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { dataUrl, kind } = req.body as { dataUrl: string; kind: FlyerAssetKind };
		const url = await storeFlyerAsset(dataUrl, kind);
		res.status(201).json({ url });
	} catch (error) {
		// Bad images are the caller's problem, not a server fault.
		if (error instanceof FlyerAssetError) {
			return res.status(400).json({ message: error.message });
		}
		if (error instanceof Error && /image|size|MIME|format/i.test(error.message)) {
			return res.status(400).json({ message: error.message });
		}
		next(error);
	}
};
