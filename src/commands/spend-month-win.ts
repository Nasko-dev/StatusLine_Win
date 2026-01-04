#!/usr/bin/env bun
/**
 * Show this month's spending - Windows compatible
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

	const now = new Date();
	const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
		.toISOString()
		.split("T")[0];

	const monthSessions: SpendSession[] = data.sessions.filter(
		(s: SpendSession) => s.date >= monthStart
	);

	if (monthSessions.length === 0) {
		console.log(c.yellow("No sessions this month."));
		return;
	}

	// Group by date
	const byDate = new Map<string, SpendSession[]>();
	for (const session of monthSessions) {
		const existing = byDate.get(session.date) || [];
		existing.push(session);
		byDate.set(session.date, existing);
	}

	const monthName = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
	console.log(c.bold(`\n📅 ${monthName} Spending\n`));

	let grandTotal = 0;
	let grandDuration = 0;
	let grandSessions = 0;

	// Sort dates descending
	const sortedDates = [...byDate.keys()].sort((a, b) => b.localeCompare(a));

	for (const date of sortedDates) {
		const sessions = byDate.get(date)!;
		let dayCost = 0;
		let dayDuration = 0;

		for (const s of sessions) {
			dayCost += s.cost;
			dayDuration += s.duration_ms;
		}

		const mins = Math.floor(dayDuration / 60000);
		const dayStr = new Date(date).toLocaleDateString("en-US", {
			weekday: "short",
			month: "short",
			day: "numeric",
		});

		console.log(
			`  ${c.white(dayStr.padEnd(12))} ${c.green(`$${dayCost.toFixed(2).padStart(6)}`)} ${c.gray(`(${mins}m)`)} ${c.gray(`• ${sessions.length} sessions`)}`
		);

		grandTotal += dayCost;
		grandDuration += dayDuration;
		grandSessions += sessions.length;
	}

	const totalMins = Math.floor(grandDuration / 60000);
	const hrs = Math.floor(totalMins / 60);
	const mins = totalMins % 60;
	const durationStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;

	console.log(c.gray("\n  ─────────────────────────────────"));
	console.log(
		`  ${c.bold("Total:")}      ${c.green(`$${grandTotal.toFixed(2).padStart(6)}`)} ${c.gray(`(${durationStr})`)} ${c.gray(`• ${grandSessions} sessions`)}`
	);
	console.log("");
}

main();
