import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
	store: {
		currentCommunity: { id: 'c-1', faceRecognitionEnabled: true } as any,
		setMeetingPhoto: vi.fn(),
		analyzeGroupPhoto: vi.fn(),
	},
	resizeCover: vi.fn(),
	resizeAnalysis: vi.fn(),
}));

vi.mock('@/stores/communityStore', () => ({ useCommunityStore: () => mocks.store }));
vi.mock('@/utils/imageResize', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/utils/imageResize')>()),
	resizeImageToDataUrl: (...a: any[]) => mocks.resizeCover(...a),
	resizeImageForAnalysis: (...a: any[]) => mocks.resizeAnalysis(...a),
}));

import {
	degradedResult,
	isFaceRecognitionEnabled,
	stashGroupPhoto,
	takeGroupPhoto,
	useMeetingPhotoUpload,
} from '../useMeetingPhotoUpload';

const file = new File([new Uint8Array([1])], 'grupo.jpg', { type: 'image/jpeg' });

describe('useMeetingPhotoUpload', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, 'error').mockImplementation(() => {});
		mocks.store.currentCommunity = { id: 'c-1', faceRecognitionEnabled: true };
		mocks.resizeCover.mockResolvedValue('data:cover');
		mocks.resizeAnalysis.mockResolvedValue('data:analysis');
		mocks.store.setMeetingPhoto.mockResolvedValue({ id: 'm-1', photoUrl: 'https://x/p.jpg' });
	});

	it('uploads the 1600 px cover exactly as before and also makes the analysis image when enabled', async () => {
		const { uploadCover } = useMeetingPhotoUpload();
		const result = await uploadCover('m-1', file);

		expect(mocks.resizeCover).toHaveBeenCalledWith(file, { maxSide: 1600 });
		expect(mocks.store.setMeetingPhoto).toHaveBeenCalledWith('m-1', 'data:cover');
		expect(mocks.resizeAnalysis).toHaveBeenCalledWith(file);
		expect(result.analysisImage).toBe('data:analysis');
		expect(result.analysisSkipped).toBe(false);
	});

	it('only uploads the cover when face recognition is off', async () => {
		mocks.store.currentCommunity = { id: 'c-1', faceRecognitionEnabled: false };
		const { uploadCover, uploadAndAnalyze } = useMeetingPhotoUpload();

		expect((await uploadCover('m-1', file)).analysisImage).toBeNull();
		const full = await uploadAndAnalyze('c-1', 'm-1', file);

		expect(full.analysis).toBeNull();
		expect(mocks.resizeAnalysis).not.toHaveBeenCalled();
		expect(mocks.store.analyzeGroupPhoto).not.toHaveBeenCalled();
	});

	it('keeps the cover and flags the analysis as skipped when the big version cannot be made', async () => {
		mocks.resizeAnalysis.mockRejectedValue(new Error('La foto es demasiado pesada para analizarla'));
		const { uploadAndAnalyze } = useMeetingPhotoUpload();

		const result = await uploadAndAnalyze('c-1', 'm-1', file);

		expect(mocks.store.setMeetingPhoto).toHaveBeenCalled();
		expect(result.analysis).toBeNull();
		expect(result.analysisSkipped).toBe(true);
	});

	it('runs the analysis after the cover and announces it', async () => {
		const faces = [{ box: [0, 0, 10, 10], crop: 'data:crop', suggestedMemberId: 'mem-1' }];
		mocks.store.analyzeGroupPhoto.mockResolvedValue({ faces });
		const onAnalyzing = vi.fn();
		const { uploadAndAnalyze } = useMeetingPhotoUpload();

		const result = await uploadAndAnalyze('c-1', 'm-1', file, { onAnalyzing });

		expect(onAnalyzing).toHaveBeenCalledTimes(1);
		expect(mocks.store.analyzeGroupPhoto).toHaveBeenCalledWith('c-1', 'm-1', 'data:analysis');
		expect(result.analysis?.faces).toEqual(faces);
	});

	it('turns a failed analysis into the degraded review instead of throwing', async () => {
		mocks.store.analyzeGroupPhoto.mockRejectedValue(new Error('503'));
		const { analyze, analyzing } = useMeetingPhotoUpload();

		const result = await analyze('c-1', 'm-1', 'data:analysis');

		expect(result).toEqual(degradedResult('error'));
		expect(analyzing.value).toBe(false);
	});

	it('keeps the group photo in memory for the attendance view, once and only for its meeting', () => {
		stashGroupPhoto({ communityId: 'c-1', meetingId: 'm-1', image: 'data:analysis' });

		expect(takeGroupPhoto('c-1', 'm-2')).toBeNull();
		expect(takeGroupPhoto('c-1', 'm-1')?.image).toBe('data:analysis');
		expect(takeGroupPhoto('c-1', 'm-1')).toBeNull();
	});

	it('reads the flag defensively', () => {
		expect(isFaceRecognitionEnabled(null)).toBe(false);
		expect(isFaceRecognitionEnabled({})).toBe(false);
		expect(isFaceRecognitionEnabled({ faceRecognitionEnabled: true })).toBe(true);
	});
});
