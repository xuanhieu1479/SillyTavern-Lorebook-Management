import type { Plugin } from "vite";
import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";

const APP_DIR = path.resolve(__dirname, "data");
const BACKUP_DIR = path.join(APP_DIR, "backup");
const SETTINGS_PATH = path.join(APP_DIR, "settings.json");

function ensureAppDir() {
  if (!fs.existsSync(APP_DIR)) fs.mkdirSync(APP_DIR, { recursive: true });
}

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function readSettings(): Record<string, unknown> {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      return JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
    }
  } catch { /* ignore */ }
  return {};
}

function getDataDir(): string {
  const settings = readSettings();
  const configured =
    typeof settings.dataDir === "string" && settings.dataDir.trim() ? settings.dataDir.trim() : null;
  return configured ? path.resolve(configured) : APP_DIR;
}

function listWorldFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "settings.json");
}

export default function dataPlugin(): Plugin {
  return {
    name: "data-api",
    configureServer(server) {
      // Load all lorebook files from the configured worlds directory.
      server.middlewares.use("/api/load-all", (req, res) => {
        if (req.method !== "GET") {
          res.statusCode = 405;
          res.end();
          return;
        }
        try {
          const dataDir = getDataDir();
          const files = listWorldFiles(dataDir);
          const result = files.map((f) => {
            const raw = fs.readFileSync(path.join(dataDir, f), "utf-8");
            const data = JSON.parse(raw) as Record<string, unknown>;
            const { entries, ...fileExtras } = data;
            return {
              fileName: f.replace(/\.json$/i, ""),
              fileExtras,
              entries: (entries as Record<string, unknown>) ?? {},
            };
          });
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(result));
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(err) }));
        }
      });

      // Create a snapshot of all world files into APP_DIR/backup/.
      server.middlewares.use("/api/snapshot", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }
        try {
          ensureAppDir();
          ensureBackupDir();
          const dataDir = getDataDir();
          const files = listWorldFiles(dataDir);
          const snapshot: Record<string, unknown> = {};
          for (const f of files) {
            const raw = fs.readFileSync(path.join(dataDir, f), "utf-8");
            try {
              snapshot[f] = JSON.parse(raw);
            } catch {
              snapshot[f] = raw;
            }
          }
          const now = new Date();
          const pad = (n: number) => String(n).padStart(2, "0");
          const name = `Snapshot-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.json`;
          fs.writeFileSync(path.join(BACKUP_DIR, name), JSON.stringify(snapshot, null, 2), "utf-8");
          const settings = readSettings();
          settings.latestSnapshot = name;
          fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf-8");
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true, name }));
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(err) }));
        }
      });

      // Snapshot current state without writing to disk (used for redo stash).
      server.middlewares.use("/api/snapshot-current", (req, res) => {
        if (req.method !== "GET") {
          res.statusCode = 405;
          res.end();
          return;
        }
        try {
          const dataDir = getDataDir();
          const files = listWorldFiles(dataDir);
          const snapshot: Record<string, unknown> = {};
          for (const f of files) {
            const raw = fs.readFileSync(path.join(dataDir, f), "utf-8");
            try { snapshot[f] = JSON.parse(raw); } catch { snapshot[f] = raw; }
          }
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(snapshot));
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(err) }));
        }
      });

      // Restore from a raw snapshot object. Only overwrites files that currently exist.
      server.middlewares.use("/api/restore-raw", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = "";
        req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
        req.on("end", () => {
          try {
            const dataDir = getDataDir();
            const snapshot = JSON.parse(body) as Record<string, unknown>;
            const existing = new Set(listWorldFiles(dataDir));
            for (const [fileName, content] of Object.entries(snapshot)) {
              if (!existing.has(fileName)) continue;
              fs.writeFileSync(
                path.join(dataDir, fileName),
                typeof content === "string" ? content : JSON.stringify(content, null, 4),
                "utf-8"
              );
            }
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true }));
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: String(err) }));
          }
        });
      });

      // List all backups.
      server.middlewares.use("/api/backups", (req, res) => {
        if (req.method !== "GET") {
          res.statusCode = 405;
          res.end();
          return;
        }
        try {
          ensureBackupDir();
          const files = fs.readdirSync(BACKUP_DIR)
            .filter((f) => f.startsWith("Snapshot-") && f.endsWith(".json"))
            .map((f) => {
              const stat = fs.statSync(path.join(BACKUP_DIR, f));
              return { name: f, size: stat.size };
            })
            .sort((a, b) => b.name.localeCompare(a.name));
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(files));
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(err) }));
        }
      });

      // Restore from a named backup. Only overwrites files that currently exist.
      server.middlewares.use("/api/restore", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = "";
        req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
        req.on("end", () => {
          try {
            ensureBackupDir();
            const { snapshotName } = JSON.parse(body) as { snapshotName?: string };

            if (!snapshotName || !fs.existsSync(path.join(BACKUP_DIR, snapshotName))) {
              res.statusCode = 404;
              res.end(JSON.stringify({ error: "Snapshot not found." }));
              return;
            }

            const dataDir = getDataDir();
            const raw = fs.readFileSync(path.join(BACKUP_DIR, snapshotName), "utf-8");
            const snapshot = JSON.parse(raw) as Record<string, unknown>;
            const existing = new Set(listWorldFiles(dataDir));

            for (const [fileName, content] of Object.entries(snapshot)) {
              if (!existing.has(fileName)) continue;
              fs.writeFileSync(
                path.join(dataDir, fileName),
                typeof content === "string" ? content : JSON.stringify(content, null, 4),
                "utf-8"
              );
            }

            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true, restored: snapshotName }));
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: String(err) }));
          }
        });
      });

      // Open the configured worlds folder in the OS file explorer.
      server.middlewares.use("/api/open-folder", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }
        const dataDir = getDataDir();
        const normalized = path.resolve(dataDir);
        const platform = process.platform;
        const cmd = platform === "win32" ? `explorer "${normalized}"` : platform === "darwin" ? `open "${normalized}"` : `xdg-open "${normalized}"`;
        exec(cmd);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: true }));
      });

      // Read/write settings.json (lives in APP_DIR, separate from the worlds folder).
      server.middlewares.use("/api/settings", (req, res) => {
        if (req.method === "GET") {
          try {
            ensureAppDir();
            if (fs.existsSync(SETTINGS_PATH)) {
              const raw = fs.readFileSync(SETTINGS_PATH, "utf-8");
              res.setHeader("Content-Type", "application/json");
              res.end(raw);
            } else {
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({}));
            }
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: String(err) }));
          }
          return;
        }
        if (req.method === "POST") {
          let body = "";
          req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
          req.on("end", () => {
            try {
              ensureAppDir();
              fs.writeFileSync(SETTINGS_PATH, body, "utf-8");
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ ok: true }));
            } catch (err) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: String(err) }));
            }
          });
          return;
        }
        res.statusCode = 405;
        res.end();
      });

      // Save a world file to the configured worlds directory.
      server.middlewares.use("/api/save-category", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = "";
        req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
        req.on("end", () => {
          try {
            const { fileName, content } = JSON.parse(body);
            const dataDir = getDataDir();
            if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
            fs.writeFileSync(path.join(dataDir, `${fileName}.json`), content, "utf-8");
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true }));
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: String(err) }));
          }
        });
      });
    },
  };
}
