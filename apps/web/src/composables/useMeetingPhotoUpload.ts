import { ref, shallowRef, unref } from 'vue';
import { useCommunityStore } from '@/stores/communityStore';
import type { FaceMatchResult } from '@/services/api';
import { PHOTO_MAX_SIDE, resizeImageForAnalysis, resizeImageToDataUrl } from '@/utils/imageResize';

/**
 * Cover photo upload for a community meeting plus the optional face analysis
 * (specs/community-attendance-faces D1, FR-14, FR-18).
 *
 * Every time a cover is uploaded or replaced, and only if the community has face recognition
 * turned on, a second 3200 px version of the same original is made and sent for analysis. That
 * version is never stored. A failure of the analysis never blocks the cover (D12).
 */

/** Photo waiting for the attendance view to analyze it: kept in memory only (no localStorage). */
export interface PendingGroupPhoto {
	communityId: string;
	meetingId: string;
	/** 3200 px JPEG data URL, not stored by the server. */
	image: string;
}

const pendingGroupPhoto = shallowRef<PendingGroupPhoto | null>(null);

/** Leaves the photo for the attendance view, which opens after navigating from the list. */
export const stashGroupPhoto = (photo: PendingGroupPhoto) => {
	pendingGroupPhoto.value = photo;
};

/** Takes the stashed photo if it belongs to this meeting; it is consumed (a reload loses it). */
export const takeGroupPhoto = (communityId: string, meetingId: string): PendingGroupPhoto | null => {
	const photo = pendingGroupPhoto.value;
	if (!photo || photo.communityId !== communityId || photo.meetingId !== meetingId) return null;
	pendingGroupPhoto.value = null;
	return photo;
};

/** The flag comes in the community payload; the shared `Community` type does not declare it yet. */
export const isFaceRecognitionEnabled = (community: unknown): boolean =>
	!!(community as { faceRecognitionEnabled?: boolean } | null | undefined)?.faceRecognitionEnabled;

/** What the review shows when the analysis could not run at all (network, 403, timeout). */
export const degradedResult = (reason: FaceMatchResult['reason'] = 'error'): FaceMatchResult => ({
	faces: [],
	degraded: true,
	reason,
});

export function useMeetingPhotoUpload() {
	const communityStore = useCommunityStore();
	/** Resizing and uploading the cover. */
	const uploading = ref(false);
	/** Waiting for the analysis answer. */
	const analyzing = ref(false);

	const faceEnabled = () => isFaceRecognitionEnabled(unref(communityStore.currentCommunity));

	/**
	 * Uploads the cover exactly as before (1600 px). With face recognition on it also returns the
	 * 3200 px version for the analysis, or `null` when it is off or could not be made.
	 */
	const uploadCover = async (
		meetingId: string,
		file: File,
	): Promise<{ meeting: any; analysisImage: string | null; analysisSkipped: boolean }> => {
		uploading.value = true;
		try {
			// Shrunk in the browser: the server takes at most 2MB and a phone photo weighs 3-8MB.
			const dataUrl = await resizeImageToDataUrl(file, { maxSide: PHOTO_MAX_SIDE });
			const meeting = await communityStore.setMeetingPhoto(meetingId, dataUrl);
			const enabled = faceEnabled();
			const analysisImage = enabled ? await prepareAnalysisImage(file) : null;
			// `analysisSkipped`: it was on but the 3200 px version could not be made.
			return { meeting, analysisImage, analysisSkipped: enabled && !analysisImage };
		} finally {
			uploading.value = false;
		}
	};

	/** Asks for the analysis. Never throws: any failure becomes the degraded review (D12). */
	const analyze = async (
		communityId: string,
		meetingId: string,
		image: string,
	): Promise<FaceMatchResult> => {
		analyzing.value = true;
		try {
			const result = await communityStore.analyzeGroupPhoto(communityId, meetingId, image);
			return {
				...result,
				faces: Array.isArray(result?.faces) ? result.faces : [],
			};
		} catch (error) {
			console.error('Face analysis failed:', error);
			return degradedResult('error');
		} finally {
			analyzing.value = false;
		}
	};

	/** Cover upload followed by the analysis when the function is on. `onAnalyzing` fires between. */
	const uploadAndAnalyze = async (
		communityId: string,
		meetingId: string,
		file: File,
		{ onAnalyzing }: { onAnalyzing?: () => void } = {},
	): Promise<{ meeting: any; analysis: FaceMatchResult | null; analysisSkipped: boolean }> => {
		const { meeting, analysisImage, analysisSkipped } = await uploadCover(meetingId, file);
		if (!analysisImage) return { meeting, analysis: null, analysisSkipped };
		onAnalyzing?.();
		return { meeting, analysis: await analyze(communityId, meetingId, analysisImage), analysisSkipped };
	};

	return { uploading, analyzing, faceEnabled, uploadCover, analyze, uploadAndAnalyze };
}

/**
 * 3200 px version of the original for the analysis, or `null` if it cannot be made (the cover
 * is already safe by then, so this only costs the review).
 */
export async function prepareAnalysisImage(file: File): Promise<string | null> {
	try {
		return await resizeImageForAnalysis(file);
	} catch (error) {
		console.error('Could not prepare the photo for analysis:', error);
		return null;
	}
}
