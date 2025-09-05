import { AppDataSource } from '../data-source';
import { TableMesa } from '../entities/tableMesa.entity';
import { Participant } from '../entities/participant.entity';
import { Retreat } from '../entities/retreat.entity';
import { v4 as uuidv4 } from 'uuid';
import { In } from 'typeorm';

const tableMesaRepository = AppDataSource.getRepository(TableMesa);
const participantRepository = AppDataSource.getRepository(Participant);

const MAX_WALKERS_PER_TABLE = 7;

export const findTablesByRetreatId = async (retreatId: string) => {
  return tableMesaRepository.find({
    where: { retreatId },
    relations: ['lider', 'colider1', 'colider2', 'walkers'],
    order: { name: 'ASC' },
  });
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

export const assignLeader = async (tableId: string, participantId: string, role: 'lider' | 'colider1' | 'colider2') => {
    const table = await tableMesaRepository.findOneBy({ id: tableId });
    if (!table) throw new Error('Table not found');

    const participant = await participantRepository.findOneBy({ id: participantId });
    if (!participant) throw new Error('Participant not found');

    // You might want to add logic to ensure a participant isn't a leader on multiple tables

    table[role] = participant;
    return tableMesaRepository.save(table);
};

export const assignWalkerToTable = async (tableId: string, participantId: string) => {
  const participant = await participantRepository.findOneBy({ id: participantId });
  if (!participant) throw new Error('Participant not found');

  participant.tableId = tableId;
  return participantRepository.save(participant);
};

export const removeWalkerFromTable = async (participantId: string) => {
  const participant = await participantRepository.findOneBy({ id: participantId });
  if (!participant) throw new Error('Participant not found');

  participant.tableId = undefined;
  return participantRepository.save(participant);
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
    .set({ tableId: undefined })
    .where({ retreatId, type: 'walker' })
    .execute();

  if (walkers.length > 0 && tables.length > 0) {
    const updates = walkers.map((walker, i) => ({ id: walker.id, tableId: tables[i % tables.length].id }));
    await participantRepository.save(updates);
  }
};