import type { Plugin } from 'vite';
import httpProxy from 'http-proxy-node16';
import { fork } from 'node:child_process';
import chalk from 'chalk';
import { fileURLToPath } from 'node:url';
const wranglerPath = new URL('../bin/wrangler.js', import.meta.resolve('wrangler'));
export const wrangler = fileURLToPath(wranglerPath.toString());

export default function wranglerPagesFunctionsDev(options: PluginOptions): Plugin<null> {
	return {
		name: 'wrangler-pages-functions-dev',
		async configureServer(server) {
			const wranglerPagesDevOutput = await spawnWranglerPagesDev({
				displayWranglerLogs: options.displayWranglerLogs ?? true,
				wranglerProcessStartTimeout: options.wranglerProcessStartTimeout ?? 20_000,
				onWranglerRestart: () => {
					if (options.reloadOnPagesFunctionsChanges !== false) {
						server.hot.send({ type: 'full-reload' });
					}
				},
			});

			if ('errorMessage' in wranglerPagesDevOutput) {
				console.error(
					`\x1b[33m
		ERROR: Failed to start \`wrangler pages dev\`, the Pages Functions handling is disabled!
		
		The error that occurred when trying to start the wrangler process is:
		${wranglerPagesDevOutput.errorMessage}
		\\x1b[0m`
						.replace(/\n {8}/g, '\n')
						.replace(/(^\n|\n$)/, ''),
				);
				return;
			}

			const proxy = httpProxy.createProxyServer();

			const wranglerUrl = wranglerPagesDevOutput.url;

			const testUrl = getTestUrl(options.matchRoutes);

			server.middlewares.use((req, res, next) => {
				if (!req.url || !testUrl(req.url)) {
					next();
					return;
				}

				req.url = `${wranglerUrl}${req.url}`;

				proxy.web(req, res, { target: wranglerUrl }, (e) => {
					console.error(e);
					next(e);
				});
			});
		},
	};
}

type PluginOptions = {
	/** Regular expression(s) to indicate what routes should be handled by Pages functions
	 *
	 * Example:
	 *  - matchRoutes: /^\/api\// only handles requests to /api/... routes
	 */
	matchRoutes: RegExp | RegExp[];
	/** Whether when there are Pages functions changes a full page reload should be triggered
	 * (so that web pages fetching from Pages functions can be refreshed and get the updated values)
	 *
	 * default: true
	 */
	reloadOnPagesFunctionsChanges?: boolean;
	/**
	 * Whether the logs from the underlying `wrangler pages dev` instance are to be displayed or not
	 *
	 * default: true
	 */
	displayWranglerLogs?: boolean;
	/**
	 * The amount of time to wait for wrangler pages dev to emit its ready ipc message
	 *
	 * default: 20_000
	 */
	wranglerProcessStartTimeout?: number;
};

function getTestUrl(matchRoutes: PluginOptions['matchRoutes']): (url: string) => boolean {
	if (Array.isArray(matchRoutes)) {
		return (url: string) => matchRoutes.some((regexp) => regexp.test(url));
	}
	return (url: string) => matchRoutes.test(url);
}

async function spawnWranglerPagesDev({
	onWranglerRestart,
	displayWranglerLogs,
	wranglerProcessStartTimeout,
}: {
	onWranglerRestart: () => void;
	displayWranglerLogs: boolean;
	wranglerProcessStartTimeout: number;
}): Promise<{ url: string } | { errorMessage: string }> {
	let wranglerHasStarted = false;
	const wranglerPromise = new Promise<{ url: string }>((resolve) => {
		const wranglerProcess = fork(wrangler, ['pages', 'dev', '.', '--port=3333'], {
			stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
		}).on('message', (message) => {
			if (!wranglerHasStarted) {
				wranglerHasStarted = true;
				const parsedMessage = JSON.parse(message.toString());
				resolve({ url: `http://${parsedMessage.ip}:${parsedMessage.port}` });
			} else {
				onWranglerRestart();
			}
		});
		if (displayWranglerLogs) {
			wranglerProcess.stdout?.on('data', (data: unknown) => displayWranglerLog(data, 'stdout'));
			wranglerProcess.stderr?.on('data', (data: unknown) => displayWranglerLog(data, 'stderr'));
		}
	});

	const timeoutPromise = new Promise<{ errorMessage: string }>((resolve) => {
		setTimeout(() => {
			resolve({
				errorMessage:
					'Timeout error, could not hear back from `wrangler pages dev` in a reasonable amount of time',
			});
		}, wranglerProcessStartTimeout);
	});

	return Promise.race([wranglerPromise, timeoutPromise]);
}

function displayWranglerLog(log: unknown, outputType: 'stdout' | 'stderr'): void {
	const unstyledLog = `${log ?? ''}`.replace(
		/[\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
		'',
	);
	if (unstyledLog.trim()) {
		const linePrefix = chalk.yellow('[backend]');
		const lines = unstyledLog.split('\n');
		for (const line of lines) {
			let formattedLine = outputType === 'stderr' ? chalk.yellow(line) : line;
			formattedLine = formattedLine.trim() ? `${linePrefix} ${formattedLine}\n` : '';
			process[outputType].write(`${chalk.dim(formattedLine)}`);
		}
	}
}
