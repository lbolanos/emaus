// Guard anti-400 para Tareas Pre-Retiro (misma clase de bug que
// scheduleWriteSchemas.simple.test.ts): los schemas de ESCRITURA deben tolerar
// el DTO de LECTURA completo — los campos derivados (`responsible`, `children`,
// `progress`, `completedAt`, timestamps) se descartan, nunca revientan Zod.

import { describe, it, expect } from '@jest/globals';
import {
	CreateRetreatPreRetreatTaskSchema,
	UpdateRetreatPreRetreatTaskSchema,
	CreatePreRetreatTaskTemplateSchema,
	UpdatePreRetreatTaskTemplateSchema,
	SetPreRetreatTaskStatusSchema,
	MaterializePreRetreatTasksSchema,
} from '@repo/types';

const RETREAT_ID = '4c8173c9-a068-4efe-a936-e3618523bead';
const TASK_ID = '11111111-1111-4111-8111-111111111111';
const SET_ID = '22222222-2222-4222-8222-222222222222';
const PARTICIPANT_ID = '33333333-3333-4333-8333-333333333333';

// DTO de lectura completo de una tarea de retiro, como lo regresa el list:
// con responsible (JOIN), children anidados, progress y timestamps.
const fullReadTask = {
	id: TASK_ID,
	retreatId: RETREAT_ID,
	templateId: null,
	parentId: null,
	name: 'Snacks',
	description: null,
	dueOffsetDays: 14,
	dueDate: '2026-09-04',
	status: 'in_progress',
	responsibleParticipantId: PARTICIPANT_ID,
	responsibleText: 'Fernando',
	notes: 'presupuesto aprobado',
	supportNotes: 'Emaús Mujeres',
	sortOrder: 330,
	responsible: { id: PARTICIPANT_ID, firstName: 'Fernando', lastName: 'R.', nickname: null },
	children: [
		{
			id: '55555555-5555-4555-8555-555555555555',
			retreatId: RETREAT_ID,
			parentId: TASK_ID,
			name: 'Comprar snacks',
			status: 'done',
			sortOrder: 0,
		},
	],
	progress: { done: 1, total: 3 },
	completedAt: null,
	createdAt: '2026-07-01T00:00:00.000Z',
	updatedAt: '2026-07-01T00:00:00.000Z',
};

const fullReadTemplate = {
	id: TASK_ID,
	templateSetId: SET_ID,
	parentId: null,
	name: 'Snacks',
	description: null,
	dueOffsetDays: 14,
	defaultOrder: 330,
	supportNotes: null,
	isActive: true,
	children: [
		{
			id: '55555555-5555-4555-8555-555555555555',
			templateSetId: SET_ID,
			parentId: TASK_ID,
			name: 'Comprar snacks',
			defaultOrder: 0,
			isActive: true,
		},
	],
	createdAt: '2026-07-01T00:00:00.000Z',
	updatedAt: '2026-07-01T00:00:00.000Z',
};

describe('Write schemas de Tareas Pre-Retiro toleran el DTO de lectura (anti-400)', () => {
	it('CreateRetreatPreRetreatTaskSchema acepta el DTO de lectura sucio y descarta derivados', () => {
		const r = CreateRetreatPreRetreatTaskSchema.safeParse({
			body: fullReadTask,
			params: { retreatId: RETREAT_ID },
		});
		expect(r.success).toBe(true);
		if (r.success) {
			expect(r.data.body).not.toHaveProperty('responsible');
			expect(r.data.body).not.toHaveProperty('children');
			expect(r.data.body).not.toHaveProperty('progress');
			expect(r.data.body).not.toHaveProperty('completedAt');
			expect(r.data.body).not.toHaveProperty('retreatId');
		}
	});

	it('UpdateRetreatPreRetreatTaskSchema acepta el DTO de lectura sucio', () => {
		const r = UpdateRetreatPreRetreatTaskSchema.safeParse({
			body: fullReadTask,
			params: { id: TASK_ID },
		});
		expect(r.success).toBe(true);
	});

	it('Update es parcial: solo status o solo dueDate son válidos', () => {
		expect(
			UpdateRetreatPreRetreatTaskSchema.safeParse({
				body: { status: 'done' },
				params: { id: TASK_ID },
			}).success,
		).toBe(true);
		expect(
			UpdateRetreatPreRetreatTaskSchema.safeParse({
				body: { dueDate: '2026-08-01' },
				params: { id: TASK_ID },
			}).success,
		).toBe(true);
	});

	it('dueDate es date-only: rechaza ISO con hora', () => {
		const r = UpdateRetreatPreRetreatTaskSchema.safeParse({
			body: { dueDate: '2026-08-01T00:00:00.000Z' },
			params: { id: TASK_ID },
		});
		expect(r.success).toBe(false);
	});

	it('responsibleParticipantId coacciona "" → null (tolerancia a <select> vacío)', () => {
		const r = UpdateRetreatPreRetreatTaskSchema.safeParse({
			body: { responsibleParticipantId: '' },
			params: { id: TASK_ID },
		});
		expect(r.success).toBe(true);
		if (r.success) expect(r.data.body.responsibleParticipantId).toBeNull();
	});

	it('Create/UpdatePreRetreatTaskTemplateSchema aceptan el DTO de lectura con children', () => {
		const c = CreatePreRetreatTaskTemplateSchema.safeParse({ body: fullReadTemplate });
		expect(c.success).toBe(true);
		if (c.success) expect(c.data.body).not.toHaveProperty('children');

		const u = UpdatePreRetreatTaskTemplateSchema.safeParse({
			body: fullReadTemplate,
			params: { id: TASK_ID },
		});
		expect(u.success).toBe(true);
	});

	it('SetPreRetreatTaskStatusSchema valida el enum de estados', () => {
		expect(
			SetPreRetreatTaskStatusSchema.safeParse({
				body: { status: 'not_applicable' },
				params: { id: TASK_ID },
			}).success,
		).toBe(true);
		expect(
			SetPreRetreatTaskStatusSchema.safeParse({
				body: { status: 'listo' },
				params: { id: TASK_ID },
			}).success,
		).toBe(false);
	});

	it('MaterializePreRetreatTasksSchema: body vacío es válido (defaults del server)', () => {
		const r = MaterializePreRetreatTasksSchema.safeParse({
			body: {},
			params: { retreatId: RETREAT_ID },
		});
		expect(r.success).toBe(true);
	});
});
