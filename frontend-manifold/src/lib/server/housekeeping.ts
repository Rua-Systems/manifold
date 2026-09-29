// Periodic cleanup inside the app process: trash purge, audit retention and orphaned files register
// their tasks here in later phases.

const DAY = 24 * 60 * 60 * 1000;

export interface HousekeepingTask {
	name: string;
	run: (now: Date) => Promise<void>;
}

export async function runHousekeeping(tasks: HousekeepingTask[], now = new Date()): Promise<void> {
	for (const task of tasks) {
		try {
			await task.run(now);
		} catch (error) {
			console.error(`Housekeeping task "${task.name}" failed.`, error);
		}
	}
}

// The single timer of this process; it holds no per-user data.
let timer: ReturnType<typeof setInterval> | undefined;

/** Runs every task once now, then once a day. Calling it again replaces the previous timer. */
export function startHousekeeping(tasks: HousekeepingTask[]): void {
	if (timer !== undefined) {
		clearInterval(timer);
	}

	void runHousekeeping(tasks);
	timer = setInterval(() => {
		void runHousekeeping(tasks);
	}, DAY);
	// The timer must not keep the process alive on shutdown.
	timer.unref();
}
