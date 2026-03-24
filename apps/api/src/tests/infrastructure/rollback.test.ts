import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const ROOT = path.resolve(__dirname, '../../../../..');
const WORKFLOW_PATH = path.join(ROOT, '.github/workflows/deploy-production.yml');
const ROLLBACK_SCRIPT_PATH = path.join(ROOT, 'scripts/rollback-production.sh');
const ROOT_PKG_PATH = path.join(ROOT, 'package.json');

describe('Production Rollback Mechanism', () => {
	let workflowContent: string;
	let rollbackScript: string;
	let rootPkg: { scripts: Record<string, string> };

	beforeAll(() => {
		workflowContent = fs.readFileSync(WORKFLOW_PATH, 'utf-8');
		rollbackScript = fs.readFileSync(ROLLBACK_SCRIPT_PATH, 'utf-8');
		rootPkg = JSON.parse(fs.readFileSync(ROOT_PKG_PATH, 'utf-8'));
	});

	describe('Deploy workflow snapshot step', () => {
		it('should contain a rollback snapshot block', () => {
			expect(workflowContent).toContain('Snapshot current version for rollback');
			expect(workflowContent).toContain('SNAPSHOTEOF');
		});

		it('should create the previous directory', () => {
			expect(workflowContent).toContain('PREV_DIR="/var/www/emaus/previous"');
			expect(workflowContent).toContain('mkdir -p "$PREV_DIR"');
		});

		it('should snapshot api dist', () => {
			expect(workflowContent).toContain(
				'cp -r /var/www/emaus/apps/api/dist "$PREV_DIR/api-dist"'
			);
		});

		it('should snapshot web dist', () => {
			expect(workflowContent).toContain(
				'cp -r /var/www/emaus/apps/web/dist "$PREV_DIR/web-dist"'
			);
		});

		it('should snapshot package.json files', () => {
			expect(workflowContent).toContain('"$PREV_DIR/api-package.json"');
			expect(workflowContent).toContain('"$PREV_DIR/web-package.json"');
			expect(workflowContent).toContain('"$PREV_DIR/root-package.json"');
		});

		it('should snapshot lockfile and workspace config', () => {
			expect(workflowContent).toContain('"$PREV_DIR/pnpm-lock.yaml"');
			expect(workflowContent).toContain('"$PREV_DIR/pnpm-workspace.yaml"');
		});

		it('should record git commit hash', () => {
			expect(workflowContent).toContain('"$PREV_DIR/git-commit.txt"');
		});

		it('should record snapshot timestamp', () => {
			expect(workflowContent).toContain('"$PREV_DIR/snapshot-timestamp.txt"');
		});

		it('should place snapshot BEFORE database backup and deploy', () => {
			const snapshotIndex = workflowContent.indexOf('Snapshot current version for rollback');
			const backupIndex = workflowContent.indexOf('Backup database before deploy');
			const restartIndex = workflowContent.indexOf('Deploy and restart application');

			expect(snapshotIndex).toBeGreaterThan(-1);
			expect(backupIndex).toBeGreaterThan(snapshotIndex);
			expect(restartIndex).toBeGreaterThan(backupIndex);
		});

		it('should clean previous dir before snapshotting to avoid stale data', () => {
			expect(workflowContent).toContain('rm -rf "$PREV_DIR"');
		});

		it('should use || true to avoid failing when dirs do not exist yet', () => {
			// Every cp line in the snapshot block should have || true
			const snapshotStart = workflowContent.indexOf('SNAPSHOTEOF');
			const snapshotEnd = workflowContent.indexOf('SNAPSHOTEOF', snapshotStart + 1);
			const snapshotBlock = workflowContent.slice(snapshotStart, snapshotEnd);
			const cpLines = snapshotBlock.split('\n').filter((l) => l.trim().startsWith('cp '));

			expect(cpLines.length).toBeGreaterThanOrEqual(5);
			for (const line of cpLines) {
				expect(line).toContain('|| true');
			}
		});
	});

	describe('Rollback script structure', () => {
		it('should exist and be a bash script', () => {
			expect(fs.existsSync(ROLLBACK_SCRIPT_PATH)).toBe(true);
			expect(rollbackScript).toMatch(/^#!\/usr\/bin\/env bash/);
		});

		it('should be executable', () => {
			const stat = fs.statSync(ROLLBACK_SCRIPT_PATH);
			const isExecutable = (stat.mode & 0o111) !== 0;
			expect(isExecutable).toBe(true);
		});

		it('should use set -euo pipefail for safety', () => {
			expect(rollbackScript).toContain('set -euo pipefail');
		});

		it('should check for SSH key existence', () => {
			expect(rollbackScript).toContain('SSH_KEY=');
			expect(rollbackScript).toContain('emaus-key.pem');
			expect(rollbackScript).toMatch(/if \[.*-f.*SSH_KEY/);
		});

		it('should check for snapshot existence before proceeding', () => {
			expect(rollbackScript).toContain('snapshot-timestamp.txt');
			expect(rollbackScript).toContain('No rollback snapshot found');
		});

		it('should display snapshot info and ask for confirmation', () => {
			expect(rollbackScript).toContain('git-commit.txt');
			expect(rollbackScript).toContain('Timestamp:');
			expect(rollbackScript).toContain('Commit:');
			expect(rollbackScript).toMatch(/read -p.*\(y\/N\)/);
		});

		it('should allow user to cancel rollback', () => {
			expect(rollbackScript).toContain('Rollback cancelled');
		});

		it('should verify snapshot completeness before restoring', () => {
			expect(rollbackScript).toContain('api-dist');
			expect(rollbackScript).toContain('web-dist');
			expect(rollbackScript).toContain('Snapshot is incomplete');
		});
	});

	describe('Rollback script restores all snapshotted files', () => {
		// Extract the files the workflow snapshots and the files the rollback restores
		// They must be consistent

		const snapshotCopies = [
			{ src: 'api/dist', dest: 'api-dist' },
			{ src: 'web/dist', dest: 'web-dist' },
			{ src: 'api/package.json', dest: 'api-package.json' },
			{ src: 'web/package.json', dest: 'web-package.json' },
			{ src: 'package.json', dest: 'root-package.json' },
			{ src: 'pnpm-lock.yaml', dest: 'pnpm-lock.yaml' },
			{ src: 'pnpm-workspace.yaml', dest: 'pnpm-workspace.yaml' },
		];

		for (const { dest } of snapshotCopies) {
			it(`should restore ${dest} from snapshot`, () => {
				// The rollback script should reference this file
				expect(rollbackScript).toContain(dest);
			});
		}

		it('should restore web dist with clean swap (rm then cp)', () => {
			expect(rollbackScript).toContain('rm -rf "$APP_DIR/apps/web/dist"');
			expect(rollbackScript).toContain('cp -r "$PREV_DIR/web-dist" "$APP_DIR/apps/web/dist"');
		});

		it('should restore api dist with clean swap (rm then cp)', () => {
			expect(rollbackScript).toContain('rm -rf "$APP_DIR/apps/api/dist"');
			expect(rollbackScript).toContain('cp -r "$PREV_DIR/api-dist" "$APP_DIR/apps/api/dist"');
		});
	});

	describe('Rollback script post-restore steps', () => {
		it('should run pnpm install after restore', () => {
			expect(rollbackScript).toContain('pnpm install');
		});

		it('should restart PM2 after restore', () => {
			expect(rollbackScript).toContain('pm2 restart emaus-api');
		});

		it('should check PM2 status after restart', () => {
			expect(rollbackScript).toContain('pm2 status emaus-api');
		});

		it('should perform a health check after rollback', () => {
			expect(rollbackScript).toContain('Health check');
			expect(rollbackScript).toContain('curl');
			expect(rollbackScript).toContain('/api/health');
		});

		it('should retry health check multiple times', () => {
			// Should have a retry loop
			expect(rollbackScript).toMatch(/for i in \{1\.\.\d+\}/);
		});
	});

	describe('Package.json integration', () => {
		it('should have prod:rollback script', () => {
			expect(rootPkg.scripts['prod:rollback']).toBeDefined();
		});

		it('should point prod:rollback to the rollback script', () => {
			expect(rootPkg.scripts['prod:rollback']).toContain('rollback-production.sh');
		});

		it('should use bash to run the script', () => {
			expect(rootPkg.scripts['prod:rollback']).toMatch(/^bash /);
		});
	});

	describe('Workflow and script consistency', () => {
		it('should use the same previous directory path', () => {
			const workflowPrevDir = '/var/www/emaus/previous';
			expect(workflowContent).toContain(workflowPrevDir);
			expect(rollbackScript).toContain(workflowPrevDir);
		});

		it('should use the same app directory path', () => {
			expect(workflowContent).toContain('/var/www/emaus/apps/api/dist');
			expect(rollbackScript).toContain('$APP_DIR/apps/api/dist');
			expect(rollbackScript).toContain('APP_DIR="/var/www/emaus"');
		});

		it('should use the same PM2 process name', () => {
			const pm2Name = 'emaus-api';
			expect(workflowContent).toContain(`pm2 restart ${pm2Name}`);
			expect(rollbackScript).toContain(`pm2 restart ${pm2Name}`);
		});

		it('should snapshot/restore the same set of artifact names', () => {
			const artifactNames = [
				'api-dist',
				'web-dist',
				'api-package.json',
				'web-package.json',
				'root-package.json',
				'pnpm-lock.yaml',
				'pnpm-workspace.yaml',
			];

			for (const name of artifactNames) {
				expect(workflowContent).toContain(name);
				expect(rollbackScript).toContain(name);
			}
		});
	});
});
