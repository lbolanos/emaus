/**
 * Integration tests (real TypeORM via testDataSource) for the table memory-photo
 * feature (spec table-memory-photo): set/remove on tables, presign on both
 * readers, S3 cleanup on delete, and the merge into the memories gallery.
 *
 * Tests run with AVATAR_STORAGE=base64 (default), so the base64 branch persists
 * the data-URI as-is; the S3 branch is covered in its own block, forcing S3
 * mode and stubbing only the upload (same approach as
 * retreatMemoryService.integration.test.ts).
 */

import sharp from 'sharp';
import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { TableMesa } from '@/entities/tableMesa.entity';
import { Retreat } from '@/entities/retreat.entity';
import * as tableMesaService from '@/services/tableMesaService';
import {
	retreatMemoryService,
	tablePhotosForRetreat,
	tablePhotosForRetreats,
} from '@/services/retreatMemoryService';
import { avatarStorageService } from '@/services/avatarStorageService';
import { s3Service } from '@/services/s3Service';

const getDS = () => (TestDataFactory as any)['testDataSource'];

const DATA_URI = 'data:image/png;base64,aGVsbG8=';
const S3_URL = 'https://bucket.s3.us-east-1.amazonaws.com/retreat-memories/r/tables/t.webp';
const S3_KEY = 'retreat-memories/r/tables/t.webp';

describe('table memory photo (spec table-memory-photo)', () => {
	let retreat: any;
	let tables: TableMesa[];

	beforeAll(async () => {
		await setupTestDatabase();
	});
	afterAll(async () => {
		await teardownTestDatabase();
	});
	beforeEach(async () => {
		await clearTestData();
		retreat = await TestDataFactory.createTestRetreat();
		tables = await TestDataFactory.createTestTables(retreat.id, 2);
	});

	describe('setTablePhoto / removeTablePhoto (base64 mode)', () => {
		it('persists the data-URI and returns the table without the S3 key', async () => {
			const table = await tableMesaService.setTablePhoto(tables[0].id, DATA_URI, getDS());
			expect(table?.photoUrl).toBe(DATA_URI);
			// The S3 object key never reaches the client.
			expect((table as any).photoS3Key).toBeUndefined();

			const stored = await getDS().getRepository(TableMesa).findOneBy({ id: tables[0].id });
			expect(stored?.photoUrl).toBe(DATA_URI);
			expect(stored?.photoS3Key).toBeNull();
		});

		it('replaces a previous photo', async () => {
			await tableMesaService.setTablePhoto(tables[0].id, DATA_URI, getDS());
			const other = 'data:image/png;base64,b3RoYQ==';
			await tableMesaService.setTablePhoto(tables[0].id, other, getDS());

			const stored = await getDS().getRepository(TableMesa).findOneBy({ id: tables[0].id });
			expect(stored?.photoUrl).toBe(other);
		});

		it('returns null for a missing table', async () => {
			expect(await tableMesaService.setTablePhoto('nope', DATA_URI, getDS())).toBeNull();
			expect(await tableMesaService.removeTablePhoto('nope', getDS())).toBeNull();
		});

		it('removeTablePhoto clears both columns', async () => {
			await tableMesaService.setTablePhoto(tables[0].id, DATA_URI, getDS());

			const table = await tableMesaService.removeTablePhoto(tables[0].id, getDS());
			expect(table?.photoUrl ?? null).toBeNull();

			const stored = await getDS().getRepository(TableMesa).findOneBy({ id: tables[0].id });
			expect(stored?.photoUrl).toBeNull();
			expect(stored?.photoS3Key).toBeNull();
		});
	});

	describe('readers', () => {
		it('findTablesByRetreatId parses tables with and without photoUrl', async () => {
			await getDS().getRepository(TableMesa).update(tables[0].id, { photoUrl: DATA_URI });

			const list = await tableMesaService.findTablesByRetreatId(retreat.id, getDS());
			expect(list).toHaveLength(2);
			expect(list.find((t: any) => t.id === tables[0].id)?.photoUrl).toBe(DATA_URI);
			expect(list.find((t: any) => t.id === tables[1].id)?.photoUrl ?? null).toBeNull();
		});

		it('findTablesByRetreatId presigns photoUrl and strips photoS3Key', async () => {
			await getDS().getRepository(TableMesa).update(tables[0].id, {
				photoUrl: S3_URL,
				photoS3Key: S3_KEY,
			});
			const presign = jest
				.spyOn(s3Service, 'presignPrivateUrl')
				.mockResolvedValue('https://signed');

			const list = await tableMesaService.findTablesByRetreatId(retreat.id, getDS());

			expect(presign).toHaveBeenCalledWith(S3_URL);
			expect(list.find((t: any) => t.id === tables[0].id)?.photoUrl).toBe('https://signed');
			expect((list[0] as any).photoS3Key).toBeUndefined();
			presign.mockRestore();
		});

		it('findTableById presigns photoUrl and hides the key', async () => {
			await getDS().getRepository(TableMesa).update(tables[0].id, {
				photoUrl: S3_URL,
				photoS3Key: S3_KEY,
			});
			const presign = jest
				.spyOn(s3Service, 'presignPrivateUrl')
				.mockResolvedValue('https://signed');

			const table = await tableMesaService.findTableById(tables[0].id, getDS());

			expect(table?.photoUrl).toBe('https://signed');
			expect((table as any).photoS3Key).toBeUndefined();
			presign.mockRestore();
		});
	});

	describe('setTablePhoto (S3 storage, production)', () => {
		afterEach(() => {
			jest.restoreAllMocks();
		});

		it('processes the photo (no avatar crop) and uploads under the per-table key', async () => {
			jest.spyOn(avatarStorageService, 'isS3Storage').mockReturnValue(true);
			const upload = jest.spyOn(s3Service, 'uploadTablePhoto').mockResolvedValue({
				url: S3_URL,
				key: S3_KEY,
			});

			const landscape = await sharp({
				create: { width: 3000, height: 2000, channels: 3, background: { r: 120, g: 90, b: 60 } },
			})
				.jpeg()
				.toBuffer();

			await tableMesaService.setTablePhoto(
				tables[0].id,
				`data:image/jpeg;base64,${landscape.toString('base64')}`,
				getDS(),
			);

			expect(upload).toHaveBeenCalledWith(
				retreat.id,
				tables[0].id,
				expect.any(Buffer),
				'image/webp',
			);
			const [buffer] = upload.mock.calls[0].slice(2);
			const stored = await sharp(buffer).metadata();
			expect(stored.format).toBe('webp');
			// Fitted to 1600 on the long side — NOT the 512px avatar square crop.
			expect([stored.width, stored.height]).toEqual([1600, 1067]);

			const row = await getDS().getRepository(TableMesa).findOneBy({ id: tables[0].id });
			expect(row?.photoUrl).toBe(S3_URL);
			expect(row?.photoS3Key).toBe(S3_KEY);
		});
	});

	describe('deleteTable cleans up S3', () => {
		afterEach(() => {
			jest.restoreAllMocks();
		});

		it('deletes the S3 object when the table had a photo', async () => {
			jest.spyOn(avatarStorageService, 'isS3Storage').mockReturnValue(true);
			const del = jest
				.spyOn(s3Service, 'deleteRetreatMemoryPhotoByKey')
				.mockResolvedValue(undefined);
			await getDS().getRepository(TableMesa).update(tables[0].id, { photoS3Key: S3_KEY });

			await tableMesaService.deleteTable(tables[0].id, getDS());

			expect(del).toHaveBeenCalledWith(S3_KEY);
		});

		it('warns but still deletes the row when the S3 delete fails', async () => {
			jest.spyOn(avatarStorageService, 'isS3Storage').mockReturnValue(true);
			jest
				.spyOn(s3Service, 'deleteRetreatMemoryPhotoByKey')
				.mockRejectedValue(new Error('boom'));
			const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

			await tableMesaService.deleteTable(tables[0].id, getDS());

			const gone = await getDS().getRepository(TableMesa).findOneBy({ id: tables[0].id });
			expect(gone).toBeNull();
			warn.mockRestore();
		});
	});

	describe('gallery merge (tablePhotosForRetreat + listMemories)', () => {
		it('appends table photos after the gallery photos, labeled and badged', async () => {
			const gallery = await retreatMemoryService.addPhoto(retreat.id, 'data:image/a', getDS());
			await getDS().getRepository(TableMesa).update(tables[0].id, { photoUrl: 'data:image/t1' });
			await getDS().getRepository(TableMesa).update(tables[1].id, { photoUrl: 'data:image/t2' });

			const { photos } = await retreatMemoryService.listMemories(retreat.id, getDS());

			expect(photos).toHaveLength(3);
			// Gallery photo first (own order), tables after in natural name order.
			expect(photos[0]).toMatchObject({ id: gallery.id, source: 'gallery', label: null });
			expect(photos[1]).toMatchObject({
				id: tables[0].id,
				source: 'table',
				label: tables[0].name,
				isPrimary: false,
				sortOrder: 1000,
			});
			expect(photos[2]).toMatchObject({
				id: tables[1].id,
				source: 'table',
				label: tables[1].name,
				sortOrder: 1001,
			});
		});

		it('table photos never become primary nor touch the derived mirror', async () => {
			await retreatMemoryService.addPhoto(retreat.id, 'data:image/a', getDS());
			await getDS().getRepository(TableMesa).update(tables[0].id, { photoUrl: 'data:image/t1' });

			const tablePhotos = await tablePhotosForRetreat(retreat.id, getDS());
			expect(tablePhotos).toHaveLength(1);
			expect(tablePhotos[0].isPrimary).toBe(false);

			// The legacy mirror still points at the gallery photo, not the table's.
			const r = await getDS().getRepository(Retreat).findOneBy({ id: retreat.id });
			expect(r?.memoryPhotoUrl).toBe('data:image/a');
		});

		it('returns [] when no table has a photo', async () => {
			expect(await tablePhotosForRetreat(retreat.id, getDS())).toEqual([]);
		});
	});

	describe('tablePhotosForRetreats batch (spec tables-second-cycle D3)', () => {
		it('answers every retreat with ONE query, grouped and naturally ordered', async () => {
			const other = await TestDataFactory.createTestRetreat();
			const otherTables = await TestDataFactory.createTestTables(other.id, 1);
			await getDS().getRepository(TableMesa).update(tables[0].id, { photoUrl: 'data:image/t1' });
			await getDS().getRepository(TableMesa).update(tables[1].id, { photoUrl: 'data:image/t2' });
			await getDS()
				.getRepository(TableMesa)
				.update(otherTables[0].id, { photoUrl: 'data:image/o1' });

			// getRepository memoizes per DataSource, so the spy sees the service's call.
			const find = jest.spyOn(getDS().getRepository(TableMesa), 'find');

			const grouped = await tablePhotosForRetreats([retreat.id, other.id], getDS());

			expect(find).toHaveBeenCalledTimes(1);
			find.mockRestore();

			// Same items as the single-retreat path (delegation parity)…
			const single = await tablePhotosForRetreat(retreat.id, getDS());
			expect(grouped.get(retreat.id)?.map((p) => p.id)).toEqual(single.map((p) => p.id));
			// …with the per-retreat grouping, name order and 1000+ sortOffsets.
			expect(grouped.get(retreat.id)?.map((p) => p.id)).toEqual([tables[0].id, tables[1].id]);
			expect(grouped.get(retreat.id)?.map((p) => p.sortOrder)).toEqual([1000, 1001]);
			expect(grouped.get(other.id)).toHaveLength(1);
			expect(grouped.get(other.id)?.[0]).toMatchObject({
				id: otherTables[0].id,
				label: otherTables[0].name,
				source: 'table',
				isPrimary: false,
				sortOrder: 1000,
			});
		});

		it('returns [] for retreats without photos and skips the query on empty input', async () => {
			const find = jest.spyOn(getDS().getRepository(TableMesa), 'find');

			expect(await tablePhotosForRetreats([], getDS())).toEqual(new Map());
			expect(find).not.toHaveBeenCalled();

			const grouped = await tablePhotosForRetreats([retreat.id], getDS());
			expect(grouped.get(retreat.id)).toEqual([]);
			expect(find).toHaveBeenCalledTimes(1);
			find.mockRestore();
		});
	});
});
