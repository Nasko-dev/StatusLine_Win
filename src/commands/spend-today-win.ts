#!/usr/bin/env bun
/**
 * Show today's spending - Windows compatible
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pc from "picocolors";

const c = pc.createColors(true);
const DATA_DIR = join(import.meta.dir, "..", "..", "data");
const SPEND_FILE = join(DATA_DIR, "spend.json");

interface SpendSession {
	id: string;
	cost: number;
	date: string;
	duration_ms: number;
	cwd: string;
}

async function main() {
	if (!existsSync(SPEND_FILE)) {
		console.log(c.yellow("No spend data found."));
		return;
	}

	const content = await readFile(SPEND_FILE, "utf-8");
	const data = JSON.parse(content);
	const today = new Date().toISOString().split("T")[0];

	const todaySessions: SpendSession[] = data.sessions.filter(
		(s: SpendSession) => s.date === today
	);

	if (todaySessions.length === 0) {
		console.log(c.yellow("No sessions today."));
		return;
	}

	console.log(c.bold(`\n📅 Today's Sessions (${today})\n`));

	let totalCost = 0;
	let totalDuration = 0;

	for (const session of todaySessions) {
		const mins = Math.floor(session.duration_ms / 60000);
		const path = session.cwd.replace(/\\/g, "/").split("/").slice(-2).join("/");
		console.log(
			`  ${c.gray("•")} ${c.white(`$${session.cost.toFixed(2)}`)} ${c.gray(`(${mins}m)`)} ${c.gray(path)}`
		);
		totalCost += session.cost;
		totalDuration += session.duration_ms;
	}

	const totalMins = Math.floor(totalDuration / 60000);
	const hrs = Math.floor(totalMins / 60);
	const mins = totalMins % 60;
	const durationStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;

	console.log(c.gray("\n  ─────────────────────────"));
	console.log(
		`  ${c.bold("Total:")} ${c.green(`$${totalCost.toFixed(2)}`)} ${c.gray(`(${durationStr})`)} ${c.gray(`• ${todaySessions.length} sessions`)}`
	);
	console.log("");
}

main();
