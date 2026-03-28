// Simple badge color tests without database dependencies
// Tests the color differentiation logic for walker vs server badges

/**
 * Extracted color logic from badgeService.ts
 * This mirrors the logic used in both the DOCX export and frontend rendering
 */
const getBadgeColors = (participantType?: string) => {
	const isServer = participantType === 'server' || participantType === 'partial_server';
	return {
		isServer,
		borderColor: isServer ? '1E40AF' : 'DC2626',
		shadingColor: isServer ? '1E3A5A' : '1E40AF',
		emoji: isServer ? '💙' : '🌹',
	};
};

/**
 * Mirrors the frontend CSS class logic in BadgesView.vue
 */
const getBadgeCssClass = (participantType?: string) => {
	const isServer = participantType === 'server' || participantType === 'partial_server';
	return isServer ? 'badge-server' : '';
};

describe('Badge Color Differentiation', () => {
	describe('Walker badges (rosa/rojo theme)', () => {
		test('walker type gets red border color', () => {
			const colors = getBadgeColors('walker');
			expect(colors.borderColor).toBe('DC2626');
		});

		test('walker type gets blue shading (original)', () => {
			const colors = getBadgeColors('walker');
			expect(colors.shadingColor).toBe('1E40AF');
		});

		test('walker type gets rose emoji', () => {
			const colors = getBadgeColors('walker');
			expect(colors.emoji).toBe('🌹');
		});

		test('walker type is not flagged as server', () => {
			const colors = getBadgeColors('walker');
			expect(colors.isServer).toBe(false);
		});

		test('walker type does not get badge-server CSS class', () => {
			expect(getBadgeCssClass('walker')).toBe('');
		});
	});

	describe('Server badges (azul/índigo theme)', () => {
		test('server type gets blue border color', () => {
			const colors = getBadgeColors('server');
			expect(colors.borderColor).toBe('1E40AF');
		});

		test('server type gets dark blue shading', () => {
			const colors = getBadgeColors('server');
			expect(colors.shadingColor).toBe('1E3A5A');
		});

		test('server type gets blue heart emoji', () => {
			const colors = getBadgeColors('server');
			expect(colors.emoji).toBe('💙');
		});

		test('server type is flagged as server', () => {
			const colors = getBadgeColors('server');
			expect(colors.isServer).toBe(true);
		});

		test('server type gets badge-server CSS class', () => {
			expect(getBadgeCssClass('server')).toBe('badge-server');
		});
	});

	describe('Partial server badges (same as server)', () => {
		test('partial_server gets blue border color', () => {
			const colors = getBadgeColors('partial_server');
			expect(colors.borderColor).toBe('1E40AF');
		});

		test('partial_server gets dark blue shading', () => {
			const colors = getBadgeColors('partial_server');
			expect(colors.shadingColor).toBe('1E3A5A');
		});

		test('partial_server gets blue heart emoji', () => {
			const colors = getBadgeColors('partial_server');
			expect(colors.emoji).toBe('💙');
		});

		test('partial_server is flagged as server', () => {
			const colors = getBadgeColors('partial_server');
			expect(colors.isServer).toBe(true);
		});

		test('partial_server gets badge-server CSS class', () => {
			expect(getBadgeCssClass('partial_server')).toBe('badge-server');
		});
	});

	describe('Waiting participants (default to walker theme)', () => {
		test('waiting type gets red border color (walker default)', () => {
			const colors = getBadgeColors('waiting');
			expect(colors.borderColor).toBe('DC2626');
		});

		test('waiting type gets rose emoji', () => {
			const colors = getBadgeColors('waiting');
			expect(colors.emoji).toBe('🌹');
		});

		test('waiting type does not get badge-server CSS class', () => {
			expect(getBadgeCssClass('waiting')).toBe('');
		});
	});

	describe('Edge cases', () => {
		test('undefined type defaults to walker colors', () => {
			const colors = getBadgeColors(undefined);
			expect(colors.borderColor).toBe('DC2626');
			expect(colors.emoji).toBe('🌹');
			expect(colors.isServer).toBe(false);
		});

		test('empty string type defaults to walker colors', () => {
			const colors = getBadgeColors('');
			expect(colors.borderColor).toBe('DC2626');
			expect(colors.isServer).toBe(false);
		});

		test('walker and server colors are distinct', () => {
			const walkerColors = getBadgeColors('walker');
			const serverColors = getBadgeColors('server');

			expect(walkerColors.borderColor).not.toBe(serverColors.borderColor);
			expect(walkerColors.shadingColor).not.toBe(serverColors.shadingColor);
			expect(walkerColors.emoji).not.toBe(serverColors.emoji);
		});

		test('server and partial_server get identical colors', () => {
			const serverColors = getBadgeColors('server');
			const partialColors = getBadgeColors('partial_server');

			expect(serverColors.borderColor).toBe(partialColors.borderColor);
			expect(serverColors.shadingColor).toBe(partialColors.shadingColor);
			expect(serverColors.emoji).toBe(partialColors.emoji);
		});
	});

	describe('Room row colors by bed defaultUsage', () => {
		/**
		 * Extracted from roomService.ts — row background color based on room usage
		 */
		const getRoomRowColor = (defaultUsage: string, isEvenRow: boolean) => {
			const isServerRoom = defaultUsage === 'servidor';
			return isServerRoom
				? (isEvenRow ? 'EFF6FF' : 'DBEAFE')
				: (isEvenRow ? 'FFF1F2' : 'FFE4E6');
		};

		const getRoomTextColor = (defaultUsage: string, hasParticipant: boolean) => {
			const isServerRoom = defaultUsage === 'servidor';
			return !hasParticipant ? '991B1B' : isServerRoom ? '1E3A8A' : '9F1239';
		};

		const getRoomCheckColor = (defaultUsage: string) => {
			const isServerRoom = defaultUsage === 'servidor';
			return isServerRoom ? '1E40AF' : 'E11D48';
		};

		test('caminante even row gets pink background', () => {
			expect(getRoomRowColor('caminante', true)).toBe('FFF1F2');
		});

		test('caminante odd row gets darker pink background', () => {
			expect(getRoomRowColor('caminante', false)).toBe('FFE4E6');
		});

		test('servidor even row gets light blue background', () => {
			expect(getRoomRowColor('servidor', true)).toBe('EFF6FF');
		});

		test('servidor odd row gets darker blue background', () => {
			expect(getRoomRowColor('servidor', false)).toBe('DBEAFE');
		});

		test('caminante text color is dark red when assigned', () => {
			expect(getRoomTextColor('caminante', true)).toBe('9F1239');
		});

		test('servidor text color is dark blue when assigned', () => {
			expect(getRoomTextColor('servidor', true)).toBe('1E3A8A');
		});

		test('unassigned text color is dark red regardless of room type', () => {
			expect(getRoomTextColor('caminante', false)).toBe('991B1B');
			expect(getRoomTextColor('servidor', false)).toBe('991B1B');
		});

		test('caminante checkmark is rose', () => {
			expect(getRoomCheckColor('caminante')).toBe('E11D48');
		});

		test('servidor checkmark is blue', () => {
			expect(getRoomCheckColor('servidor')).toBe('1E40AF');
		});

		test('caminante and servidor row colors are distinct', () => {
			expect(getRoomRowColor('caminante', true)).not.toBe(getRoomRowColor('servidor', true));
			expect(getRoomRowColor('caminante', false)).not.toBe(getRoomRowColor('servidor', false));
		});
	});

	describe('Color value validation', () => {
		test('all color values are valid 6-char hex codes', () => {
			const hexPattern = /^[0-9A-Fa-f]{6}$/;
			const walkerColors = getBadgeColors('walker');
			const serverColors = getBadgeColors('server');

			expect(walkerColors.borderColor).toMatch(hexPattern);
			expect(walkerColors.shadingColor).toMatch(hexPattern);
			expect(serverColors.borderColor).toMatch(hexPattern);
			expect(serverColors.shadingColor).toMatch(hexPattern);
		});

		test('border and shading colors are different for each type', () => {
			const walkerColors = getBadgeColors('walker');
			const serverColors = getBadgeColors('server');

			expect(walkerColors.borderColor).not.toBe(walkerColors.shadingColor);
			expect(serverColors.borderColor).not.toBe(serverColors.shadingColor);
		});
	});
});
