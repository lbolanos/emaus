// Integración con DB real: validación de jerarquía (profundidad máx 2) y de
// pertenencia al mismo set en el CRUD de tareas del template.

import { setupTestDatabase, teardownTestDatabase } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { PreRetreatTaskTemplate } from '@/entities/preRetreatTaskTemplate.entity';
import { PreRetreatTaskTemplateSet } from '@/entities/preRetreatTaskTemplateSet.entity';
import { PreRetreatTaskTemplateService } from '@/services/preRetreatTaskTemplateService';
import { v4 as uuidv4 } from 'uuid';

describe('PreRetreatTaskTemplateService — jerarquía y validaciones', () => {
  let service: PreRetreatTaskTemplateService;
  let setId: string;
  let otherSetId: string;

  const getDS = () => TestDataFactory['testDataSource'];

  beforeAll(async () => {
    await setupTestDatabase();
  });
  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    const ds = getDS();
    await ds.getRepository(PreRetreatTaskTemplate).createQueryBuilder().delete().execute();
    await ds.getRepository(PreRetreatTaskTemplateSet).createQueryBuilder().delete().execute();
    const setRepo = ds.getRepository(PreRetreatTaskTemplateSet);
    setId = (await setRepo.save(setRepo.create({ id: uuidv4(), name: 'Set A', isActive: true }))).id;
    otherSetId = (await setRepo.save(setRepo.create({ id: uuidv4(), name: 'Set B', isActive: true }))).id;
    service = new PreRetreatTaskTemplateService();
  });

  it('crea una raíz y una sub-tarea válida (2 niveles)', async () => {
    const root = await service.create({ templateSetId: setId, name: 'Snacks', dueOffsetDays: 14 });
    const child = await service.create({ templateSetId: setId, parentId: root.id, name: 'Comprar' });
    expect(child.parentId).toBe(root.id);
    const all = await service.listAll(setId);
    expect(all).toHaveLength(2);
  });

  it('rechaza crear un nieto (padre que ya es sub-tarea)', async () => {
    const root = await service.create({ templateSetId: setId, name: 'Snacks', dueOffsetDays: 14 });
    const child = await service.create({ templateSetId: setId, parentId: root.id, name: 'Comprar' });
    await expect(
      service.create({ templateSetId: setId, parentId: child.id, name: 'Nieto' }),
    ).rejects.toThrow(/dos niveles/);
  });

  it('rechaza un padre de otro template', async () => {
    const rootB = await service.create({ templateSetId: otherSetId, name: 'Raíz B', dueOffsetDays: 7 });
    await expect(
      service.create({ templateSetId: setId, parentId: rootB.id, name: 'Hija cruzada' }),
    ).rejects.toThrow(/otro template/);
  });

  it('rechaza convertir en sub-tarea una raíz que ya tiene hijos', async () => {
    const root = await service.create({ templateSetId: setId, name: 'Snacks', dueOffsetDays: 14 });
    await service.create({ templateSetId: setId, parentId: root.id, name: 'Comprar' });
    const otherRoot = await service.create({ templateSetId: setId, name: 'Flores', dueOffsetDays: 2 });
    await expect(service.update(root.id, { parentId: otherRoot.id })).rejects.toThrow(/sub-tareas/);
  });

  it('rechaza que una tarea sea su propio padre', async () => {
    const root = await service.create({ templateSetId: setId, name: 'Snacks', dueOffsetDays: 14 });
    await expect(service.update(root.id, { parentId: root.id })).rejects.toThrow(/propio padre/);
  });

  it('eliminar una raíz cascada a sus sub-tareas', async () => {
    const root = await service.create({ templateSetId: setId, name: 'Snacks', dueOffsetDays: 14 });
    await service.create({ templateSetId: setId, parentId: root.id, name: 'Comprar' });
    await service.delete(root.id);
    const all = await service.listAll(setId);
    expect(all).toHaveLength(0);
  });
});
