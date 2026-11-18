// Runs every sample through the candidate systems and records what each one
// said. Safe to re-run: finished (sample, system, pass) rows are skipped.
//
// Usage (from the repo root):
//   node eval/run.js --run <name> [--systems a,b]
//                    [--sets fleurs,scenario,tvspeech,ramc,gigaspeech2]
//                    [--passes 2] [--limit N]
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { SYSTEMS } = require("./lib/systems");

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i].startsWith("--")) {
      args[argv[i].slice(2)] = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

function loadSamples(sets, limit) {
  const dataDir = path.join(__dirname, "data");
  const folders = { fleurs: "fleurs", scenario: "scenarios", tvspeech: "tvspeech", ramc: "ramc", gigaspeech2: "gigaspeech2" };
  const samples = [];
  for (const set of sets) {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(dataDir, folders[set], "manifest.json"), "utf8")
    );
    for (const lang of ["zh", "th"]) {
      const rows = manifest.filter((row) => row.srcLang === lang);
      for (const row of limit ? rows.slice(0, limit) : rows) {
        samples.push({ ...row, wavPath: path.join(dataDir, row.wav) });
      }
    }
  }
  return samples;
}

async function runPool(tasks, concurrency) {
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < tasks.length) {
        const index = next;
        next += 1;
        await tasks[index]();
      }
    })
  );
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.run) throw new Error("--run <name> is required");
  const systemNames = (args.systems || Object.keys(SYSTEMS).join(",")).split(",");
  const sets = (args.sets || "fleurs,scenario").split(",");
  const passes = Number(args.passes || 2);
  const samples = loadSamples(sets, args.limit ? Number(args.limit) : 0);

  const runDir = path.join(__dirname, "results", args.run);
  fs.mkdirSync(runDir, { recursive: true });
  const outputsPath = path.join(runDir, "outputs.jsonl");
  const done = new Set();
  if (fs.existsSync(outputsPath)) {
    for (const line of fs.readFileSync(outputsPath, "utf8").split("\n")) {
      if (!line.trim()) continue;
      const row = JSON.parse(line);
      if (!row.error) done.add(`${row.system}|${row.sampleId}|${row.pass}`);
    }
  }

  await Promise.all(
    systemNames.map(async (name) => {
      const system = SYSTEMS[name];
      if (!system) throw new Error(`Unknown system '${name}'`);
      const tasks = [];
      for (let pass = 1; pass <= passes; pass += 1) {
        for (const sample of samples) {
          if (done.has(`${name}|${sample.id}|${pass}`)) continue;
          tasks.push(async () => {
            const row = { system: name, sampleId: sample.id, pass };
            for (let attempt = 1; attempt <= 2; attempt += 1) {
              try {
                Object.assign(row, await system.run(sample));
                delete row.error;
                break;
              } catch (error) {
                row.error = error instanceof Error ? error.message : String(error);
              }
            }
            fs.appendFileSync(outputsPath, `${JSON.stringify(row)}\n`);
          });
        }
      }
      await runPool(tasks, system.concurrency);
      console.log(`${name}: ran ${tasks.length} turns`);
    })
  );
  console.log(`outputs: ${outputsPath}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
