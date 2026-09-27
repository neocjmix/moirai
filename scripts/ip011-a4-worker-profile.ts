/** Isolated v5 complete-build process profile. No DB or production store. */
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

const ticksPerSecond = Number(
  spawnSync("getconf", ["CLK_TCK"], { encoding: "utf8" }).stdout.trim()
);
if (process.platform !== "linux" || !Number.isFinite(ticksPerSecond))
  throw Error("a4_worker_linux_required");

interface Measurement {
  count: number;
  elapsed_ms: number;
  peak_rss_mib: number;
  sampled_cpu_seconds: number;
  exit_code: number | null;
  exit_signal: NodeJS.Signals | null;
  cancelled: boolean;
  result: Record<string, unknown> | null;
}

function measure(count: number, cancel: boolean): Promise<Measurement> {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/ip011-a4-profile.ts",
        String(count),
        "sparse"
      ],
      {
        env: {
          ...process.env,
          A4_COMPLETE: "1",
          A4_MEMORY_PHASES: "1",
          A4_QUERY_CENTER_X: "-355.1"
        },
        stdio: ["ignore", "pipe", "pipe"]
      }
    );
    let stdout = "";
    let stderr = "";
    let peakRssKiB = 0;
    let cpuTicks = 0;
    let cancelled = false;
    let timedOut = false;
    child.stdout.setEncoding("utf8").on("data", (data: string) => {
      stdout += data;
    });
    child.stderr.setEncoding("utf8").on("data", (data: string) => {
      stderr += data;
    });
    const poll = setInterval(() => {
      try {
        const status = readFileSync(`/proc/${child.pid}/status`, "utf8");
        const hwm = Number(status.match(/^VmHWM:\s+(\d+) kB/m)?.[1] ?? 0);
        peakRssKiB = Math.max(peakRssKiB, hwm);
        const stat = readFileSync(`/proc/${child.pid}/stat`, "utf8");
        const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
        cpuTicks = Number(fields[11]) + Number(fields[12]);
        if (
          cancel &&
          !cancelled &&
          performance.now() - started >= 3000 &&
          peakRssKiB >= 300 * 1024
        ) {
          cancelled = child.kill("SIGKILL");
        }
      } catch {
        // A process that just exited no longer has /proc entries.
      }
    }, 100);
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, 8 * 60_000);
    child.once("error", reject);
    child.once("close", (code, signal) => {
      clearInterval(poll);
      clearTimeout(timeout);
      if (timedOut) return reject(Error(`a4_worker_timeout_${count}`));
      if (cancelled ? signal !== "SIGKILL" : code !== 0)
        return reject(
          Error(
            `a4_worker_exit_${count}:${code}:${signal}:${stderr.slice(-500)}`
          )
        );
      let result: Record<string, unknown> | null = null;
      if (!cancelled) {
        try {
          result = JSON.parse(stdout.trim()) as Record<string, unknown>;
        } catch {
          return reject(Error(`a4_worker_output_invalid_${count}`));
        }
      }
      resolve({
        count,
        elapsed_ms: performance.now() - started,
        peak_rss_mib: peakRssKiB / 1024,
        sampled_cpu_seconds: cpuTicks / ticksPerSecond,
        exit_code: code,
        exit_signal: signal,
        cancelled,
        result
      });
    });
  });
}

const baseline = await measure(10000, false);
process.stdout.write(JSON.stringify({ phase: "10k", ...baseline }) + "\n");
const cancellation = await measure(100000, true);
process.stdout.write(
  JSON.stringify({ phase: "100k_cancel", ...cancellation }) + "\n"
);
const restart = await measure(100000, false);
process.stdout.write(
  JSON.stringify({ phase: "100k_restart", ...restart }) + "\n"
);
const failures = [
  ...(baseline.elapsed_ms > 180000 ? ["10k_wall"] : []),
  ...(baseline.peak_rss_mib > 3072 ? ["10k_rss"] : []),
  ...(!cancellation.cancelled ? ["cancel_missing"] : []),
  ...(restart.result?.count !== 100000 ||
  restart.result?.samples == null ||
  restart.result?.documents == null
    ? ["restart_incomplete"]
    : [])
];
process.stdout.write(
  JSON.stringify({ phase: "gate", host: process.version, failures }) + "\n"
);
if (failures.length)
  throw Error(`a4_worker_budget_failed:${failures.join(",")}`);
