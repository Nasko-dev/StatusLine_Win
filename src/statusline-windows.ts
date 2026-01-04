#!/usr/bin/env bun
/**
 * Statusline for Claude Code on Windows
 * Features: Git, Cost, Duration, Context, Usage Limits, Daily Spend
 */

import pc from "picocolors";
import { existsSync, mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

// ============ TYPES ============

interface HookInput {
	session_id: string;
	transcript_path: string;
	cwd: string;
	model: { id: string; display_name: string };
	workspace: { current_dir: string; project_dir: string };
	cost: {
		total_cost_usd: number;
		total_duration_ms: number;
		total_lines_added: number;
		total_lines_removed: number;
	};
}

interface GitStatus {
	branch: string;
	hasChanges: boolean;
	staged: { added: number; deleted: number; files: number };
	unstaged: { added: number; deleted: number; files: number };
}

interface UsageLimits {
	five_hour: { utilization: number; resets_at: string } | null;
	seven_day: { utilization: number; resets_at: string } | null;
}

interface SpendSession {
	id: string;
	cost: number;
	date: string;
	duration_ms: number;
	cwd: string;
}

interface SpendData {
	sessions: SpendSession[];
}

// ============ PATHS ============

const DATA_DIR = join(import.meta.dir, "..", "data");
const SPEND_FILE = join(DATA_DIR, "spend.json");
const PERIOD_FILE = join(DATA_DIR, "period-cost.json");

// ============ COLORS ============

const c = pc.createColors(true);
const gray = (s: string | number) => c.gray(String(s));
const white = (s: string | number) => c.white(String(s));
const green = (s: string | number) => c.green(String(s));
const red = (s: string | number) => c.red(String(s));
const yellow = (s: string | number) => c.yellow(String(s));
const magenta = (s: string | number) => c.magenta(String(s));
const cyan = (s: string | number) => c.cyan(String(s));
const blue = (s: string | number) => c.blue(String(s));
const orange = (s: string | number) => `\x1b[38;5;208m${s}\x1b[0m`;

// ============ FORMATTERS ============

function formatPath(path: string): string {
	const home = process.env.USERPROFILE || process.env.HOME || "";
	let p = path.replace(/\\/g, "/");
	if (home) {
		const h = home.replace(/\\/g, "/");
		if (p.startsWith(h)) p = "~" + p.slice(h.length);
	}
	const segs = p.split("/").filter(s => s);
	return segs.length > 2 ? "/" + segs.slice(-2).join("/") : p;
}

function formatCost(cost: number): string {
	return cost.toFixed(2);
}

function formatDuration(ms: number): string {
	const mins = Math.floor(ms / 60000);
	const hrs = Math.floor(mins / 60);
	const m = mins % 60;
	return hrs > 0 ? `${hrs}h${m}m` : `${m}m`;
}

function formatTokens(tokens: number): string {
	if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}m`;
	if (tokens >= 1000) return `${Math.round(tokens / 1000)}k`;
	return String(tokens);
}

function formatResetTime(resetsAt: string): string {
	try {
		const diff = new Date(resetsAt).getTime() - Date.now();
		if (diff <= 0) return "now";
		const hrs = Math.floor(diff / 3600000);
		const mins = Math.floor((diff % 3600000) / 60000);
		return hrs > 0 ? `${hrs}h${mins}m` : `${mins}m`;
	} catch {
		return "";
	}
}

function progressBar(pct: number, len = 10): string {
	const chars = ["⣀", "⣄", "⣤", "⣦", "⣶", "⣷", "⣿"];
	const steps = len * (chars.length - 1);
	const current = Math.round((pct / 100) * steps);
	const full = Math.floor(current / (chars.length - 1));
	const partial = current % (chars.length - 1);
	const empty = len - full - (partial > 0 ? 1 : 0);

	const colorFn = pct < 50 ? gray : pct < 70 ? yellow : pct < 90 ? orange : red;
	const filled = "⣿".repeat(full) + (partial > 0 ? chars[partial] : "");
	const emptyPart = "⣀".repeat(empty);
	return colorFn(filled) + gray(emptyPart);
}

// ============ GIT ============

const emptyGit: GitStatus = {
	branch: "",
	hasChanges: false,
	staged: { added: 0, deleted: 0, files: 0 },
	unstaged: { added: 0, deleted: 0, files: 0 },
};

async function getGitStatus(): Promise<GitStatus> {
	try {
		const { $ } = await import("bun");
		const check = await $`git rev-parse --git-dir`.quiet().nothrow();
		if (check.exitCode !== 0) return emptyGit;

		const branchRes = await $`git branch --show-current`.quiet().text();
		const branch = branchRes.trim() || "detached";

		const diffCheck = await $`git diff-index --quiet HEAD --`.quiet().nothrow();
		const cachedCheck = await $`git diff-index --quiet --cached HEAD --`.quiet().nothrow();

		if (diffCheck.exitCode === 0 && cachedCheck.exitCode === 0) {
			return { ...emptyGit, branch };
		}

		// Parse numstat output
		const parseStats = (diff: string) => {
			let added = 0, deleted = 0;
			for (const line of diff.split("\n")) {
				if (!line.trim()) continue;
				const [a, d] = line.split("\t").map(n => parseInt(n, 10) || 0);
				added += a;
				deleted += d;
			}
			return { added, deleted };
		};

		// Get staged and unstaged separately
		const [stagedDiff, unstagedDiff, stagedFiles, unstagedFiles] = await Promise.all([
			$`git diff --cached --numstat`.quiet().text(),
			$`git diff --numstat`.quiet().text(),
			$`git diff --cached --name-only`.quiet().text(),
			$`git diff --name-only`.quiet().text(),
		]);

		const stagedStats = parseStats(stagedDiff);
		const unstagedStats = parseStats(unstagedDiff);
		const stagedCount = stagedFiles.split("\n").filter(f => f.trim()).length;
		const unstagedCount = unstagedFiles.split("\n").filter(f => f.trim()).length;

		return {
			branch,
			hasChanges: true,
			staged: { ...stagedStats, files: stagedCount },
			unstaged: { ...unstagedStats, files: unstagedCount },
		};
	} catch {
		return emptyGit;
	}
}

// ============ CONTEXT ============

async function getContextTokens(transcriptPath: string): Promise<number> {
	if (!transcriptPath) return 0;
	try {
		if (!existsSync(transcriptPath)) return 0;
		const content = await Bun.file(transcriptPath).text();
		const lines = content.trim().split("\n");
		let tokens = 0;
		let latest: Date | null = null;

		for (const line of lines) {
			try {
				const data = JSON.parse(line);
				if (!data.message?.usage || data.isSidechain || data.isApiErrorMessage || !data.timestamp) continue;
				const time = new Date(data.timestamp);
				if (!latest || time > latest) {
					latest = time;
					const u = data.message.usage;
					tokens = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
				}
			} catch {}
		}
		return tokens;
	} catch {
		return 0;
	}
}

// ============ USAGE LIMITS ============

async function getCredentials(): Promise<string | null> {
	try {
		const credPath = join(homedir(), ".claude", ".credentials.json");
		if (!existsSync(credPath)) return null;
		const content = await readFile(credPath, "utf-8");
		const creds = JSON.parse(content);
		return creds.claudeAiOauth?.accessToken || null;
	} catch {
		return null;
	}
}

async function getUsageLimits(): Promise<UsageLimits> {
	try {
		const token = await getCredentials();
		if (!token) return { five_hour: null, seven_day: null };

		const res = await fetch("https://api.anthropic.com/api/oauth/usage", {
			method: "GET",
			headers: {
				Accept: "application/json",
				Authorization: `Bearer ${token}`,
				"anthropic-beta": "oauth-2025-04-20",
			},
		});

		if (!res.ok) return { five_hour: null, seven_day: null };
		const data = await res.json();
		return {
			five_hour: data.five_hour || null,
			seven_day: data.seven_day || null,
		};
	} catch {
		return { five_hour: null, seven_day: null };
	}
}

// ============ SPEND TRACKING ============

async function loadSpendData(): Promise<SpendData> {
	try {
		if (!existsSync(SPEND_FILE)) return { sessions: [] };
		const content = await readFile(SPEND_FILE, "utf-8");
		return JSON.parse(content);
	} catch {
		return { sessions: [] };
	}
}

async function saveSession(input: HookInput): Promise<void> {
	if (!input.session_id || !input.cost.total_cost_usd) return;
	try {
		if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

		const data = await loadSpendData();
		const today = new Date().toISOString().split("T")[0];

		const session: SpendSession = {
			id: input.session_id,
			cost: input.cost.total_cost_usd,
			date: today,
			duration_ms: input.cost.total_duration_ms,
			cwd: input.cwd,
		};

		const idx = data.sessions.findIndex(s => s.id === input.session_id);
		if (idx !== -1) {
			data.sessions[idx] = session;
		} else {
			data.sessions.push(session);
		}

		await writeFile(SPEND_FILE, JSON.stringify(data, null, 2));
	} catch {}
}

async function getTodayCost(): Promise<number> {
	try {
		const data = await loadSpendData();
		const today = new Date().toISOString().split("T")[0];
		return data.sessions
			.filter(s => s.date === today)
			.reduce((sum, s) => sum + s.cost, 0);
	} catch {
		return 0;
	}
}

// ============ PERIOD COST (5h window) ============

interface PeriodCostData {
	resets_at: string;
	cost: number;
	last_session_id: string;
}

async function loadPeriodData(): Promise<PeriodCostData | null> {
	try {
		if (!existsSync(PERIOD_FILE)) return null;
		const content = await readFile(PERIOD_FILE, "utf-8");
		return JSON.parse(content);
	} catch {
		return null;
	}
}

async function savePeriodData(data: PeriodCostData): Promise<void> {
	try {
		if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
		await writeFile(PERIOD_FILE, JSON.stringify(data, null, 2));
	} catch {}
}

async function updatePeriodCost(sessionId: string, sessionCost: number, resetsAt: string | null): Promise<void> {
	if (!resetsAt || !sessionCost) return;
	try {
		const data = await loadPeriodData();

		// Normalize resets_at to 5-minute intervals
		const resetDate = new Date(resetsAt);
		const mins = resetDate.getMinutes();
		resetDate.setMinutes(Math.round(mins / 5) * 5, 0, 0);
		const normalizedReset = resetDate.toISOString();

		if (data && data.resets_at === normalizedReset) {
			// Same period - add cost if new session
			if (data.last_session_id !== sessionId) {
				data.cost += sessionCost;
				data.last_session_id = sessionId;
				await savePeriodData(data);
			}
		} else {
			// New period - reset cost
			await savePeriodData({
				resets_at: normalizedReset,
				cost: sessionCost,
				last_session_id: sessionId,
			});
		}
	} catch {}
}

async function getCurrentPeriodCost(): Promise<number> {
	try {
		const data = await loadPeriodData();
		if (!data) return 0;

		// Check if period is still active
		const resetTime = new Date(data.resets_at).getTime();
		if (Date.now() > resetTime) return 0; // Period expired

		return data.cost;
	} catch {
		return 0;
	}
}

// ============ MAIN ============

const input: HookInput = await Bun.stdin.json();

// Gather data in parallel with timeouts
const [git, contextTokens, limits, todayCost, periodCost] = await Promise.all([
	Promise.race([
		getGitStatus(),
		new Promise<GitStatus>(r => setTimeout(() => r(emptyGit), 1500))
	]),
	getContextTokens(input.transcript_path),
	Promise.race([
		getUsageLimits(),
		new Promise<UsageLimits>(r => setTimeout(() => r({ five_hour: null, seven_day: null }), 2000))
	]),
	getTodayCost(),
	getCurrentPeriodCost(),
]);

// Save session and update period cost in background
saveSession(input).catch(() => {});
updatePeriodCost(input.session_id, input.cost.total_cost_usd, limits.five_hour?.resets_at ?? null).catch(() => {});

// Build line 1: Git | Path | Model
const parts1: string[] = [];

if (git.branch) {
	let gitPart = white(git.branch);
	if (git.hasChanges) {
		gitPart += magenta("*");
		const changes: string[] = [];
		const totalAdded = git.staged.added + git.unstaged.added;
		const totalDeleted = git.staged.deleted + git.unstaged.deleted;
		if (totalAdded > 0) changes.push(green(`+${totalAdded}`));
		if (totalDeleted > 0) changes.push(red(`-${totalDeleted}`));
		// Staged files count (gray ~N)
		if (git.staged.files > 0) changes.push(gray(`~${git.staged.files}`));
		// Unstaged files count (yellow ~N)
		if (git.unstaged.files > 0) changes.push(yellow(`~${git.unstaged.files}`));
		if (changes.length) gitPart += " " + changes.join(" ");
	}
	parts1.push(gitPart);
}

parts1.push(gray(formatPath(input.workspace.current_dir)));

const isSonnet = input.model.display_name.toLowerCase().includes("sonnet");
if (!isSonnet) {
	parts1.push(cyan(input.model.display_name));
}

// Build line 2: Session | Limits | Daily
const parts2: string[] = [];

// Cost (green)
parts2.push(`${green("$")}${green(formatCost(input.cost.total_cost_usd))}`);

// Tokens & percentage (cyan for tokens)
const maxTokens = 200000;
const pct = Math.min(100, Math.round((contextTokens / maxTokens) * 100));
parts2.push(`${cyan(formatTokens(contextTokens))} ${progressBar(pct)} ${white(pct)}${gray("%")}`);

// Duration (yellow)
parts2.push(yellow(`(${formatDuration(input.cost.total_duration_ms)})`));

// 5-hour limit with period cost (green for cost)
if (limits.five_hour) {
	const l = limits.five_hour;
	const reset = l.resets_at ? formatResetTime(l.resets_at) : "";
	const totalPeriodCost = periodCost + input.cost.total_cost_usd;
	const costPart = totalPeriodCost > 0 ? `${green("$")}${green(formatCost(totalPeriodCost))} ` : "";
	parts2.push(`${magenta("L:")} ${costPart}${progressBar(l.utilization, 5)} ${white(l.utilization)}${gray("%")}${reset ? cyan(` (${reset})`) : ""}`);
}

// 7-day limit (show only if 5h >= 90%)
if (limits.seven_day && (limits.five_hour?.utilization ?? 0) >= 90) {
	const w = limits.seven_day;
	const reset = w.resets_at ? formatResetTime(w.resets_at) : "";
	parts2.push(`${magenta("W:")} ${progressBar(w.utilization, 5)} ${white(w.utilization)}${gray("%")}${reset ? cyan(` (${reset})`) : ""}`);
}

// Daily spend (green)
const totalToday = todayCost + input.cost.total_cost_usd;
if (totalToday > 0) {
	parts2.push(`${blue("D:")} ${green("$")}${green(formatCost(totalToday))}`);
}

// Output
const sep = ` ${gray("•")} `;
console.log(parts1.join(sep));
console.log(`${gray("S:")} ${parts2.join(" ")}`);
