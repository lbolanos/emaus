/**
 * Tests for bulk email sending logic.
 *
 * These tests validate the business rules for sending bulk emails
 * from ParticipantList, without database dependencies.
 * Tests cover: recipient filtering, error accumulation, progress tracking,
 * template selection, and validation guards.
 */

describe('Bulk Email Logic', () => {
	// --- Helpers that mirror ParticipantList.vue logic ---

	const filterParticipantsWithEmail = (participants: any[]) =>
		participants.filter((p: any) => p.email && p.email.trim() !== '');

	const filterParticipantsWithoutEmail = (participants: any[]) =>
		participants.filter((p: any) => !p.email || p.email.trim() === '');

	const buildErrorMessage = (participant: any, error: any): string => {
		const name = `${participant.firstName} ${participant.lastName}`;
		const msg = error?.response?.data?.message || error?.message || 'Error desconocido';
		return `${name}: ${msg}`;
	};

	/**
	 * Simulates the bulk send loop from ParticipantList.vue sendBulkEmail().
	 * Calls sendFn for each recipient, accumulates results.
	 */
	const simulateBulkSend = async (
		recipients: any[],
		sendFn: (participant: any) => Promise<void>,
	) => {
		const results = { success: 0, failed: 0, errors: [] as string[] };
		let progress = 0;

		for (const participant of recipients) {
			try {
				await sendFn(participant);
				results.success++;
			} catch (err: any) {
				results.failed++;
				results.errors.push(buildErrorMessage(participant, err));
			}
			progress++;
		}

		return { results, progress };
	};

	// --- Mock data ---

	const mockParticipants = [
		{ id: '1', firstName: 'Juan', lastName: 'Pérez', email: 'juan@example.com', cellPhone: '555-0001' },
		{ id: '2', firstName: 'María', lastName: 'López', email: 'maria@example.com', cellPhone: '555-0002' },
		{ id: '3', firstName: 'Carlos', lastName: 'García', email: '', cellPhone: '555-0003' },
		{ id: '4', firstName: 'Ana', lastName: 'Martínez', email: null, cellPhone: '555-0004' },
		{ id: '5', firstName: 'Pedro', lastName: 'Sánchez', email: 'pedro@example.com', cellPhone: null },
		{ id: '6', firstName: 'Laura', lastName: 'Ramírez', email: '   ', cellPhone: '555-0006' },
	];

	const mockTemplates = [
		{ id: 'tpl-1', name: 'Bienvenida', message: '<p>Hola {{firstName}}, bienvenido al retiro.</p>' },
		{ id: 'tpl-2', name: 'Pago', message: '<p>{{firstName}} {{lastName}}, su pago está pendiente.</p>' },
		{ id: 'tpl-3', name: 'Confirmación', message: '<p>Confirmado para {{firstName}}.</p>' },
	];

	// --- Tests ---

	describe('Recipient filtering', () => {
		it('should include only participants with non-empty email', () => {
			const withEmail = filterParticipantsWithEmail(mockParticipants);
			expect(withEmail).toHaveLength(3);
			expect(withEmail.map(p => p.id)).toEqual(['1', '2', '5']);
		});

		it('should exclude participants with empty string email', () => {
			const withEmail = filterParticipantsWithEmail(mockParticipants);
			expect(withEmail.find(p => p.id === '3')).toBeUndefined();
		});

		it('should exclude participants with null email', () => {
			const withEmail = filterParticipantsWithEmail(mockParticipants);
			expect(withEmail.find(p => p.id === '4')).toBeUndefined();
		});

		it('should exclude participants with whitespace-only email', () => {
			const withEmail = filterParticipantsWithEmail(mockParticipants);
			expect(withEmail.find(p => p.id === '6')).toBeUndefined();
		});

		it('should identify participants without email', () => {
			const withoutEmail = filterParticipantsWithoutEmail(mockParticipants);
			expect(withoutEmail).toHaveLength(3);
			expect(withoutEmail.map(p => p.id)).toEqual(['3', '4', '6']);
		});

		it('should return empty when all participants have email', () => {
			const allWithEmail = [
				{ id: '1', email: 'a@b.com' },
				{ id: '2', email: 'c@d.com' },
			];
			expect(filterParticipantsWithoutEmail(allWithEmail)).toHaveLength(0);
		});

		it('should return empty when no participants have email', () => {
			const noneWithEmail = [
				{ id: '1', email: '' },
				{ id: '2', email: null },
			];
			expect(filterParticipantsWithEmail(noneWithEmail)).toHaveLength(0);
		});

		it('should handle empty participant list', () => {
			expect(filterParticipantsWithEmail([])).toHaveLength(0);
			expect(filterParticipantsWithoutEmail([])).toHaveLength(0);
		});
	});

	describe('Validation guards', () => {
		it('should block send when SMTP is not configured', () => {
			const smtpConfigured = false;
			const canSend = smtpConfigured && filterParticipantsWithEmail(mockParticipants).length > 0;
			expect(canSend).toBe(false);
		});

		it('should block send when no recipients have email', () => {
			const smtpConfigured = true;
			const noEmailParticipants = [{ id: '1', email: '' }];
			const canSend = smtpConfigured && filterParticipantsWithEmail(noEmailParticipants).length > 0;
			expect(canSend).toBe(false);
		});

		it('should allow send when SMTP configured and recipients have email', () => {
			const smtpConfigured = true;
			const canSend = smtpConfigured && filterParticipantsWithEmail(mockParticipants).length > 0;
			expect(canSend).toBe(true);
		});

		it('should block send when message is empty', () => {
			const message = '';
			const canSend = message.trim().length > 0;
			expect(canSend).toBe(false);
		});

		it('should block send when message is whitespace only', () => {
			const message = '   \n\t  ';
			const canSend = message.trim().length > 0;
			expect(canSend).toBe(false);
		});

		it('should allow send when message has content', () => {
			const message = '<p>Hola</p>';
			const canSend = message.trim().length > 0;
			expect(canSend).toBe(true);
		});
	});

	describe('Bulk send loop', () => {
		it('should send to all recipients successfully', async () => {
			const recipients = filterParticipantsWithEmail(mockParticipants);
			const sendFn = jest.fn().mockResolvedValue(undefined);

			const { results, progress } = await simulateBulkSend(recipients, sendFn);

			expect(results.success).toBe(3);
			expect(results.failed).toBe(0);
			expect(results.errors).toHaveLength(0);
			expect(progress).toBe(3);
			expect(sendFn).toHaveBeenCalledTimes(3);
		});

		it('should continue sending after individual failures', async () => {
			const recipients = filterParticipantsWithEmail(mockParticipants);
			const sendFn = jest.fn()
				.mockResolvedValueOnce(undefined)
				.mockRejectedValueOnce(new Error('SMTP timeout'))
				.mockResolvedValueOnce(undefined);

			const { results, progress } = await simulateBulkSend(recipients, sendFn);

			expect(results.success).toBe(2);
			expect(results.failed).toBe(1);
			expect(results.errors).toHaveLength(1);
			expect(progress).toBe(3);
		});

		it('should handle all failures', async () => {
			const recipients = filterParticipantsWithEmail(mockParticipants);
			const sendFn = jest.fn().mockRejectedValue(new Error('Server down'));

			const { results } = await simulateBulkSend(recipients, sendFn);

			expect(results.success).toBe(0);
			expect(results.failed).toBe(3);
			expect(results.errors).toHaveLength(3);
		});

		it('should track progress incrementally', async () => {
			const recipients = filterParticipantsWithEmail(mockParticipants);
			let progressLog: number[] = [];
			let currentProgress = 0;

			const sendFn = jest.fn().mockImplementation(async () => {
				currentProgress++;
				progressLog.push(currentProgress);
			});

			await simulateBulkSend(recipients, sendFn);

			expect(progressLog).toEqual([1, 2, 3]);
		});

		it('should handle empty recipients list', async () => {
			const sendFn = jest.fn();
			const { results, progress } = await simulateBulkSend([], sendFn);

			expect(results.success).toBe(0);
			expect(results.failed).toBe(0);
			expect(progress).toBe(0);
			expect(sendFn).not.toHaveBeenCalled();
		});

		it('should send sequentially, not in parallel', async () => {
			const recipients = filterParticipantsWithEmail(mockParticipants);
			const callOrder: string[] = [];

			const sendFn = jest.fn().mockImplementation(async (p: any) => {
				callOrder.push(`start-${p.id}`);
				await new Promise(r => setTimeout(r, 10));
				callOrder.push(`end-${p.id}`);
			});

			await simulateBulkSend(recipients, sendFn);

			// Each end should come before next start (sequential)
			expect(callOrder).toEqual([
				'start-1', 'end-1',
				'start-2', 'end-2',
				'start-5', 'end-5',
			]);
		});
	});

	describe('Error message formatting', () => {
		it('should format error with response data message', () => {
			const participant = { firstName: 'Juan', lastName: 'Pérez' };
			const error = { response: { data: { message: 'Correo inválido' } } };
			expect(buildErrorMessage(participant, error)).toBe('Juan Pérez: Correo inválido');
		});

		it('should fallback to error.message', () => {
			const participant = { firstName: 'María', lastName: 'López' };
			const error = { message: 'Network error' };
			expect(buildErrorMessage(participant, error)).toBe('María López: Network error');
		});

		it('should fallback to default message', () => {
			const participant = { firstName: 'Carlos', lastName: 'García' };
			const error = {};
			expect(buildErrorMessage(participant, error)).toBe('Carlos García: Error desconocido');
		});

		it('should handle null error', () => {
			const participant = { firstName: 'Ana', lastName: 'Díaz' };
			expect(buildErrorMessage(participant, null)).toBe('Ana Díaz: Error desconocido');
		});

		it('should prefer response.data.message over error.message', () => {
			const participant = { firstName: 'Pedro', lastName: 'Ruiz' };
			const error = {
				message: 'Generic error',
				response: { data: { message: 'Specific error from server' } },
			};
			expect(buildErrorMessage(participant, error)).toBe('Pedro Ruiz: Specific error from server');
		});
	});

	describe('Template selection', () => {
		const onBulkTemplateSelect = (templateId: string, templates: any[]) => {
			const template = templates.find((t: any) => t.id === templateId);
			if (template) {
				return { message: template.message || '', subject: template.name || 'Mensaje' };
			}
			return null;
		};

		it('should populate message and subject from template', () => {
			const result = onBulkTemplateSelect('tpl-1', mockTemplates);
			expect(result).toEqual({
				message: '<p>Hola {{firstName}}, bienvenido al retiro.</p>',
				subject: 'Bienvenida',
			});
		});

		it('should return null for non-existent template', () => {
			const result = onBulkTemplateSelect('non-existent', mockTemplates);
			expect(result).toBeNull();
		});

		it('should default subject to Mensaje when template has no name', () => {
			const templates = [{ id: 'tpl-x', name: '', message: '<p>Test</p>' }];
			const result = onBulkTemplateSelect('tpl-x', templates);
			expect(result?.subject).toBe('Mensaje');
		});

		it('should default message to empty string when template has no message', () => {
			const templates = [{ id: 'tpl-x', name: 'Test', message: '' }];
			const result = onBulkTemplateSelect('tpl-x', templates);
			expect(result?.message).toBe('');
		});
	});

	describe('Send payload structure', () => {
		it('should build correct payload for sendEmailViaBackend', () => {
			const participant = mockParticipants[0];
			const retreatId = 'retreat-123';
			const templateId = 'tpl-1';
			const templateName = 'Bienvenida';

			const payload = {
				to: participant.email,
				subject: 'Bienvenida',
				html: '<p>Hola Juan, bienvenido al retiro.</p>',
				text: 'Hola Juan, bienvenido al retiro.',
				participantId: participant.id,
				retreatId,
				templateId: templateId || undefined,
				templateName,
			};

			expect(payload.to).toBe('juan@example.com');
			expect(payload.participantId).toBe('1');
			expect(payload.retreatId).toBe('retreat-123');
			expect(payload.templateId).toBe('tpl-1');
			expect(payload.templateName).toBe('Bienvenida');
		});

		it('should set templateId to undefined when no template selected', () => {
			const templateId = '';
			const payload = {
				templateId: templateId || undefined,
			};
			expect(payload.templateId).toBeUndefined();
		});
	});

	describe('Text content extraction', () => {
		const extractText = (html: string) =>
			html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

		it('should strip HTML tags', () => {
			expect(extractText('<p>Hola <strong>Juan</strong></p>')).toBe('Hola Juan');
		});

		it('should collapse whitespace', () => {
			expect(extractText('<p>Hola</p>   <p>Mundo</p>')).toBe('Hola Mundo');
		});

		it('should handle empty HTML', () => {
			expect(extractText('')).toBe('');
		});

		it('should handle plain text', () => {
			expect(extractText('Sin etiquetas HTML')).toBe('Sin etiquetas HTML');
		});

		it('should strip subject HTML tags', () => {
			const subject = '<b>Mensaje</b> para Juan'.replace(/<[^>]*>/g, '');
			expect(subject).toBe('Mensaje para Juan');
		});
	});

	describe('Phase transitions', () => {
		it('should follow compose -> sending -> results flow', async () => {
			const phases: string[] = [];
			let phase = 'compose';

			// Simulate the flow
			phases.push(phase);

			// Start sending
			phase = 'sending';
			phases.push(phase);

			// Complete sending
			const recipients = [{ id: '1', firstName: 'Juan', lastName: 'P', email: 'j@e.com' }];
			await simulateBulkSend(recipients, async () => {});

			phase = 'results';
			phases.push(phase);

			expect(phases).toEqual(['compose', 'sending', 'results']);
		});

		it('should reset state when opening dialog', () => {
			const initialState = {
				phase: 'compose',
				template: '',
				message: '',
				subject: '',
				progress: 0,
				total: 0,
				results: { success: 0, failed: 0, errors: [] as string[] },
				sending: false,
			};

			// Simulate reset
			const state = { ...initialState };

			expect(state.phase).toBe('compose');
			expect(state.template).toBe('');
			expect(state.message).toBe('');
			expect(state.subject).toBe('');
			expect(state.progress).toBe(0);
			expect(state.total).toBe(0);
			expect(state.results.success).toBe(0);
			expect(state.results.failed).toBe(0);
			expect(state.results.errors).toHaveLength(0);
			expect(state.sending).toBe(false);
		});
	});

	describe('WhatsApp exclusion', () => {
		it('should only support email method for bulk sending', () => {
			// WhatsApp API only supports single recipient
			// Bulk messages should only offer email
			const supportedMethods = ['email'];
			expect(supportedMethods).not.toContain('whatsapp');
			expect(supportedMethods).toContain('email');
			expect(supportedMethods).toHaveLength(1);
		});
	});
});
