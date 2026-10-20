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

		it('should record the live web release instead of copying the dist symlink', () => {
			expect(workflowContent).toContain(
				'readlink /var/www/emaus/apps/web/dist > "$PREV_DIR/web-release.txt"'
			);
			// dist is a symlink into releases/: a copy of it dangles from previous/.
			expect(workflowContent).not.toContain('cp -r /var/www/emaus/apps/web/dist');
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

		it('should record the live commit from DEPLOYED_VERSION, not from the box git worktree', () => {
			// The deploy never advances the server's git checkout, so `git rev-parse HEAD`
			// there names a months-old commit instead of the version being replaced.
			const snapshotStart = workflowContent.indexOf("<< 'SNAPSHOTEOF'");
			const snapshotEnd = workflowContent.indexOf('SNAPSHOTEOF', snapshotStart + 20);
			const snapshotBlock = workflowContent.slice(snapshotStart, snapshotEnd);

			expect(snapshotBlock).toContain(
				`sed -n 's/^commit=//p' /var/www/emaus/DEPLOYED_VERSION > "$PREV_DIR/git-commit.txt"`,
			);
			expect(snapshotBlock).not.toContain('rev-parse');
		});

		it('should record snapshot timestamp', () => {
			expect(workflowContent).toContain('"$PREV_DIR/snapshot-timestamp.txt"');
		});

		it('should snapshot BEFORE uploading anything to the server', () => {
			// The API dist, package files and lockfile are overwritten in place: a
			// snapshot taken after any upload copies the new build, and the rollback
			// would restore the version it is rolling back.
			const snapshotStart = workflowContent.indexOf("<< 'SNAPSHOTEOF'");
			const snapshotEnd = workflowContent.indexOf('SNAPSHOTEOF', snapshotStart + 20);
			const firstUpload = workflowContent.search(/^\s*(scp|rsync)\s/m);

			expect(snapshotStart).toBeGreaterThan(-1);
			expect(firstUpload).toBeGreaterThan(snapshotEnd);
		});

		it('should place snapshot BEFORE database backup and deploy', () => {
			const snapshotIndex = workflowContent.indexOf("<< 'SNAPSHOTEOF'");
			const backupIndex = workflowContent.indexOf('Backup database before deploy');
			const restartIndex = workflowContent.indexOf('Deploy, restart, and validate application');

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

	describe('Deploy workflow web release', () => {
		it('should name the release dir uniquely per run attempt', () => {
			// A re-run of an already-published sha must not reuse (and wipe) the live release.
			expect(workflowContent).toMatch(/RELEASE_ID="\$\{GITHUB_SHA:0:12\}-\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}"/);
			expect(workflowContent).not.toMatch(/rm -rf \S*releases\/\$RELEASE_ID/);
		});

		it('should publish with an atomic symlink swap', () => {
			expect(workflowContent).toContain('ln -sfn "$REL" dist.next');
			expect(workflowContent).toContain('mv -T dist.next dist');
		});

		it('should not fail a live deploy when old-release cleanup fails', () => {
			expect(workflowContent).toMatch(/xargs -r rm -rf -- \\\n\s*\|\| echo/);
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
			expect(rollbackScript).toContain('lightsail-emaus.pem');
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
			{ src: 'web/dist (readlink)', dest: 'web-release.txt' },
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

		it('should restore web by swapping the dist symlink, never writing into dist', () => {
			expect(rollbackScript).toContain('"$PREV_DIR/web-release.txt"');
			expect(rollbackScript).toContain('ln -sfn "$PREV_REL" dist.next');
			expect(rollbackScript).toContain('mv -T dist.next dist');
			expect(rollbackScript).not.toContain('rm -rf "$APP_DIR/apps/web/dist"');
		});

		it('should pass the shell simulation of the snapshot + rollback cycle', () => {
			const output = execSync('bash scripts/tests/test-rollback-logic.sh', {
				cwd: ROOT,
				encoding: 'utf-8',
			});
			expect(output).toMatch(/Results: \d+ passed, 0 failed/);
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
			// The deploy workflow may use either `pm2 restart <name>` or the
			// ecosystem-config-aware `pm2 startOrReload ecosystem.config.js`
			// (which re-reads kill_timeout / max_memory_restart on every deploy).
			// Both target the same process; test accepts either.
			const workflowUsesEcosystem = /pm2\s+(start|startOrReload|reload)\s+\S*ecosystem\.config\.js/.test(
				workflowContent,
			);
			const workflowUsesRestart = workflowContent.includes(`pm2 restart ${pm2Name}`);
			expect(workflowUsesEcosystem || workflowUsesRestart).toBe(true);
			// The rollback script should keep using the explicit restart-by-name
			// form so that a rollback doesn't need ecosystem.config.js to exist.
			expect(rollbackScript).toContain(`pm2 restart ${pm2Name}`);
		});

		it('should snapshot/restore the same set of artifact names', () => {
			const artifactNames = [
				'api-dist',
				'web-release.txt',
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
