// Turn a CSV of students (email,team) into a file for Workers KV.
//
//   node scripts/roster.mjs students.csv > roster.json
//   npx wrangler kv bulk put roster.json --binding ROSTER --remote
//
// Re-run it whenever the list changes. To remove students, use
// `npx wrangler kv bulk delete` with a JSON list of their "email:..." keys.
import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/roster.mjs students.csv > roster.json");
  process.exit(1);
}
const rows = readFileSync(file, "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const start = /email/i.test(rows[0]) ? 1 : 0; // skip header row
const out = [];
for (const row of rows.slice(start)) {
  const [email, team] = row.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
  if (!email?.includes("@") || !team) {
    console.error(`skipping bad row: ${row}`);
    continue;
  }
  out.push({ key: `email:${email.toLowerCase()}`, value: team });
}
console.log(JSON.stringify(out, null, 1));
console.error(`${out.length} students`);
