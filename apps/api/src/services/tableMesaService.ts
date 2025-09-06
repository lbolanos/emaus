import { AppDataSource } from '../data-source';
import { TableMesa } from '../entities/tableMesa.entity';
import { Participant } from '../entities/participant.entity';
import { Retreat } from '../entities/retreat.entity';
import { v4 as uuidv4 } from 'uuid';
import { In } from 'typeorm';
import { tableMesaSchema } from '@repo/types';

const tableMesaRepository = AppDataSource.getRepository(TableMesa);
const participantRepository = AppDataSource.getRepository(Participant);

const MAX_WALKERS_PER_TABLE = 7;

export const findTablesByRetreatId = async (retreatId: string) => {
  const tables = await tableMesaRepository.find({
    where: { retreatId },
    relations: ['lider', 'colider1', 'colider2', 'walkers'],
    order: { name: 'ASC' },
  });
  return tableMesaSchema.array().parse(tables);
};

export const findTableById = async (id: string) => {
  return tableMesaRepository.findOne({
    where: { id },
    relations: ['lider', 'colider1', 'colider2', 'walkers'],
  });
};

export const createTable = async (tableData: { name: string; retreatId: string }) => {
  const newTable = tableMesaRepository.create({
    ...tableData,
    id: uuidv4(),
  });
  return tableMesaRepository.save(newTable);
};

export const createDefaultTablesForRetreat = async (retreat: Retreat) => {
  for (let i = 1; i <= 5; i++) {
    const newTable = tableMesaRepository.create({
      id: uuidv4(),
      name: `Table ${i}`,
      retreatId: retreat.id,
    });
    await tableMesaRepository.save(newTable);
  }
};

export const updateTable = async (id: string, tableData: Partial<TableMesa>) => {
  const table = await tableMesaRepository.findOneBy({ id });
  if (!table) return null;
  tableMesaRepository.merge(table, tableData);
  return tableMesaRepository.save(table);
};

export const deleteTable = async (id: string) => {
  await tableMesaRepository.delete(id);
};

export const assignLeaderToTable = async (tableId: string, participantId: string, role: 'lider' | 'colider1' | 'colider2') => {
  const table = await findTableById(tableId);
  if (!table) throw new Error('Table not found');

  const participant = await participantRepository.findOneBy({ id: participantId });
  if (!participant) throw new Error('Participant not found');
  if (participant.type !== 'server') throw new Error('Only servers can be assigned as leaders.');

  // Un-assign the participant from any other leader role they might have
  await AppDataSource.createQueryBuilder()
    .update(TableMesa)
    .set({ liderId: null })
    .where({ liderId: participantId })
    .execute();
  await AppDataSource.createQueryBuilder()
    .update(TableMesa)
    .set({ colider1Id: null })
    .where({ colider1Id: participantId })
    .execute();
  await AppDataSource.createQueryBuilder()
    .update(TableMesa)
    .set({ colider2Id: null })
    .where({ colider2Id: participantId })
    .execute();

  // Assign to the new role
  table[`${role}Id`] = participantId;
  await tableMesaRepository.save(table);
  return findTableById(tableId); // Return the table with all relations
};

export const unassignLeaderFromTable = async (tableId: string, role: 'lider' | 'colider1' | 'colider2') => {
  const table = await findTableById(tableId);
  if (!table) throw new Error('Table not found');

  // Use a direct update to set the foreign key to null, which is more reliable.
  await tableMesaRepository.update(tableId, { [`${role}Id`]: null });

  return findTableById(tableId); // Refetch to get the updated state with relations.
};

export const assignWalkerToTable = async (tableId: string, participantId: string) => {
  const participant = await participantRepository.findOneBy({ id: participantId });
  if (!participant) throw new Error('Participant not found');
  if (participant.type !== 'walker') throw new Error('Only walkers can be assigned to a table.');

  participant.tableId = tableId as string | null;
  await participantRepository.save(participant);
  return findTableById(tableId);
};

export const unassignWalkerFromTable = async (tableId: string, participantId: string) => {
  const participant = await participantRepository.findOneBy({ id: participantId });
  if (!participant) throw new Error('Participant not found');

  participant.tableId = null;
  await participantRepository.save(participant);
  return findTableById(tableId);
};

export const rebalanceTablesForRetreat = async (retreatId: string) => {
  const walkers = await participantRepository.find({
    where: { retreatId, type: 'walker', isCancelled: false },
    order: { registrationDate: 'ASC' },
  });
  const tables = await tableMesaRepository.find({
    where: { retreatId },
    order: { name: 'ASC' },
  });

  const walkerCount = walkers.length;
  let tableCount = tables.length;

  const idealTableCount = Math.max(1, Math.ceil(walkerCount / MAX_WALKERS_PER_TABLE));

  if (tableCount < idealTableCount) {
    for (let i = tableCount + 1; i <= idealTableCount; i++) {
      const newTable = await createTable({ name: `Table ${i}`, retreatId });
      tables.push(newTable);
    }
  } else if (tableCount > idealTableCount && tableCount > 5) {
    const tablesToDelete = tables.slice(idealTableCount);
    const emptyTablesToDelete = tablesToDelete.filter(t => {
        const walkersAtTable = walkers.filter(w => w.tableId === t.id);
        return walkersAtTable.length === 0;
    });
    const tableIdsToDelete = emptyTablesToDelete.map(t => t.id);
    if (tableIdsToDelete.length > 0) {
      await tableMesaRepository.delete({ id: In(tableIdsToDelete) });
    }
    // This splice is optimistic. A better approach would be to refetch.
    tables.splice(idealTableCount);
  }

  // Unassign all walkers in a single query
  await AppDataSource.createQueryBuilder()
    .update(Participant)
    .set({ tableId: null })
    .where({ retreatId, type: 'walker' })
    .execute();

  if (walkers.length > 0 && tables.length > 0) {
    const updates = walkers.map((walker, i) => ({ id: walker.id, tableId: tables[i % tables.length].id }));
    await participantRepository.save(updates);
  }
};