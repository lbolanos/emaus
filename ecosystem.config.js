module.exports = {
	apps: [
		{
			name: 'emaus-api',
			script: 'apps/api/env-wrapper.sh',
			args: ['node', 'dist/index.js'],
			cwd: '/var/www/emaus',
			instances: 1,
			exec_mode: 'fork',
			env: {
				NODE_ENV: 'production',
				PORT: 3001,
			},
			error_log: '/var/log/emaus/api-error.log',
			out_log: '/var/log/emaus/api-out.log',
			combine_logs: true,
			time: true,

			// Memory: Lightsail bundle has 1 GB RAM. Real workload sits ~580 MB
			// during heavy use (saw OOM-restart at 586 MB on 2026-04-25). Bumping
			// to 700 MB gives headroom while still leaving 300 MB for the system.
			max_memory_restart: '700M',

			// Restart timing: PM2's default kill_timeout is 1600 ms. The API uses
			// SIGINT/SIGTERM handlers (apps/api/src/index.ts) to close the http
			// server gracefully, but with open WS connections that can take a few
			// seconds. 10 s here matches the in-app forceExit watchdog (8 s) and
			// prevents PM2 from SIGKILLing while the port is still bound — which
			// is exactly what produced the EADDRINUSE crashloop in §17.
			kill_timeout: 10000,

			// 10 s before retrying after a crash. Combined with the graceful
			// shutdown handler, this gives the OS enough time to fully release
			// :3001 (TIME_WAIT etc.) before the next bind attempt.
			restart_delay: 10000,

			max_restarts: 5,
			min_uptime: '60s',
		},
	],
};
