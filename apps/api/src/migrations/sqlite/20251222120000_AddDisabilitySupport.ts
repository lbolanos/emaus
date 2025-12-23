import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDisabilitySupport20251222120000 implements MigrationInterface {
  name = 'AddDisabilitySupport20251222120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if column already exists (from partial migration run)
    const tableInfo = await queryRunner.query(`PRAGMA table_info("participants")`);
    const hasColumn = tableInfo.some((col: any) => col.name === 'disabilitySupport');

    if (hasColumn) {
      console.log('  disabilitySupport column already exists, skipping...');
      return;
    }

    console.log(' Adding disability support column to participants table...');
    await queryRunner.query(`ALTER TABLE "participants" ADD COLUMN "disabilitySupport" text`);
    console.log('  Added disabilitySupport column');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "participants" DROP COLUMN "disabilitySupport"`);
  }
}
