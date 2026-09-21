import type { APIRequestContext, APIResponse } from '@playwright/test';
import { FLYER_BACKGROUND_PRESETS } from '@repo/types';
import { withCsrf } from './auth';

/**
 * A restore step that quietly 404s/400s is this helper's own failure mode
 * (it would leave the community wiped), so every step must land.
 */
async function mustOk(res: APIResponse, step: string) {
	if (!res.ok()) {
		throw new Error(`flyer state restore failed at ${step}: ${res.status()} ${await res.text()}`);
	}
}

/**
 * The flyer e2e specs write on a REAL dev community (they exercise the actual
 * PUT/DELETE paths). "Clean up" as a bare DELETE is only right when the
 * community started with nothing — otherwise the run quietly wipes whatever
 * visual identity it had saved. Capture before the first write, restore after
 * the last one, failures in between included.
 */
export interface CommunityFlyerState {
	background: string | null;
	cardOpacity: number | null;
	flyerOptions: Record<string, unknown> | null;
}

export async function captureFlyerState(
	ctx: APIRequestContext,
	communityId: string,
): Promise<CommunityFlyerState | null> {
	const res = await ctx.get(`/api/communities/${communityId}`);
	if (!res.ok()) return null;
	const community = await res.json();
	return {
		background: community.flyerBackgroundUrl ?? null,
		cardOpacity: community.flyerCardOpacity ?? null,
		flyerOptions: community.flyerOptions ?? null,
	};
}

export async function restoreFlyerState(
	ctx: APIRequestContext,
	csrfToken: string,
	communityId: string,
	state: CommunityFlyerState | null,
) {
	if (!state) return;
	const headers = withCsrf(csrfToken);
	// Fixed order from a known state: the background DELETE nulls background
	// AND card opacity together, then each surviving piece goes back in.
	// (The background route is a PUT — a POST here 404s and the restore would
	// silently leave the community with no background.)
	await mustOk(
		await ctx.delete(`/api/communities/${communityId}/flyer-background`, { headers }),
		'delete flyer-background',
	);
	await mustOk(
		await ctx.delete(`/api/communities/${communityId}/flyer-options`, { headers }),
		'delete flyer-options',
	);
	if (state.background) {
		const preset = state.background.replace(/^\//, '');
		if ((FLYER_BACKGROUND_PRESETS as readonly string[]).includes(preset)) {
			await mustOk(
				await ctx.put(`/api/communities/${communityId}/flyer-background`, {
					data: { preset },
					headers,
				}),
				'restore preset background',
			);
		} else if (state.background.startsWith('data:')) {
			// Dev stores uploads inline; they round-trip as imageDataUrl.
			await mustOk(
				await ctx.put(`/api/communities/${communityId}/flyer-background`, {
					data: { imageDataUrl: state.background },
					headers,
				}),
				'restore inline background',
			);
		}
		// Anything else is a storage URL (prod-like S3): the API deliberately
		// offers no way to set one by hand (the generic community PUT strips
		// flyer fields), so the community keeps the default background rather
		// than the teardown failing.
	}
	if (typeof state.cardOpacity === 'number') {
		await mustOk(
			await ctx.put(`/api/communities/${communityId}/flyer-card-opacity`, {
				data: { opacity: state.cardOpacity },
				headers,
			}),
			'restore card opacity',
		);
	}
	if (state.flyerOptions) {
		await mustOk(
			await ctx.put(`/api/communities/${communityId}/flyer-options`, {
				data: { flyerOptions: state.flyerOptions },
				headers,
			}),
			'restore flyer options',
		);
	}
}
