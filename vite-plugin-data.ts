import type { Plugin } from "vite";
import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";

const DATA_DIR = path.resolve(__dirname, "data");

const BACKUP_DIR = path.join(DATA_DIR, "backup");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

export default function dataPlugin(): Plugin {
  return {
    name: "data-api",
    configureServer(server) {
      // Load all JSON files from /data (except settings.json)
      server.middlewares.use("/api/load-all", (req, res) => {
        if (req.method !== "GET") {
          res.statusCode = 405;
          res.end();
          return;
        }
        try {
          ensureDataDir();
          const files = fs.readdirSync(DATA_DIR)
            .filter((f) => f.endsWith(".json") && f !== "settings.json");
          const result = files.map((f) => {
            const raw = fs.readFileSync(path.join(DATA_DIR, f), "utf-8");
            const data = JSON.parse(raw);
            return {
              fileName: f.replace(/\.json$/i, ""),
              entries: data.entries ?? {},
            };
          });
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(result));
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(err) }));
        }
      });

      // Create a snapshot of all data files
      server.middlewares.use("/api/snapshot", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }
        try {
          ensureDataDir();
          ensureBackupDir();
          const files = fs.readdirSync(DATA_DIR)
            .filter((f) => f.endsWith(".json") && f !== "settings.json");
          const snapshot: Record<string, unknown> = {};
          for (const f of files) {
            const raw = fs.readFileSync(path.join(DATA_DIR, f), "utf-8");
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
          // Update latestSnapshot in settings.json
          const settingsPath = path.join(DATA_DIR, "settings.json");
          let settings: Record<string, unknown> = {};
          if (fs.existsSync(settingsPath)) {
            try { settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8")); } catch { /* ignore */ }
          }
          settings.latestSnapshot = name;
          fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true, name }));
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(err) }));
        }
      });

      // Get current state as snapshot (without writing to disk)
      server.middlewares.use("/api/snapshot-current", (req, res) => {
        if (req.method !== "GET") {
          res.statusCode = 405;
          res.end();
          return;
        }
        try {
          ensureDataDir();
          const files = fs.readdirSync(DATA_DIR)
            .filter((f) => f.endsWith(".json") && f !== "settings.json");
          const snapshot: Record<string, unknown> = {};
          for (const f of files) {
            const raw = fs.readFileSync(path.join(DATA_DIR, f), "utf-8");
            try { snapshot[f] = JSON.parse(raw); } catch { snapshot[f] = raw; }
          }
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(snapshot));
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(err) }));
        }
      });

      // Restore from a raw snapshot object (for redo from localStorage)
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
            ensureDataDir();
            const snapshot = JSON.parse(body) as Record<string, unknown>;
            // Remove current category files
            const existing = fs.readdirSync(DATA_DIR)
              .filter((f) => f.endsWith(".json") && f !== "settings.json");
            for (const f of existing) {
              fs.unlinkSync(path.join(DATA_DIR, f));
            }
            // Write snapshot files
            for (const [fileName, content] of Object.entries(snapshot)) {
              fs.writeFileSync(
                path.join(DATA_DIR, fileName),
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

      // List all backups
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

      // Restore from a snapshot
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
            ensureDataDir();
            ensureBackupDir();
            const { snapshotName } = JSON.parse(body) as { snapshotName?: string };

            if (!snapshotName || !fs.existsSync(path.join(BACKUP_DIR, snapshotName))) {
              res.statusCode = 404;
              res.end(JSON.stringify({ error: "Snapshot not found." }));
              return;
            }

            const raw = fs.readFileSync(path.join(BACKUP_DIR, snapshotName), "utf-8");
            const snapshot = JSON.parse(raw) as Record<string, unknown>;

            // Remove all current category .json files (not settings.json)
            const existing = fs.readdirSync(DATA_DIR)
              .filter((f) => f.endsWith(".json") && f !== "settings.json");
            for (const f of existing) {
              fs.unlinkSync(path.join(DATA_DIR, f));
            }

            // Write snapshot files back
            for (const [fileName, content] of Object.entries(snapshot)) {
              fs.writeFileSync(
                path.join(DATA_DIR, fileName),
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

      // Open data folder in file explorer
      server.middlewares.use("/api/open-folder", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }
        ensureDataDir();
        const normalized = path.resolve(DATA_DIR);
        const platform = process.platform;
        const cmd = platform === "win32" ? `explorer "${normalized}"` : platform === "darwin" ? `open "${normalized}"` : `xdg-open "${normalized}"`;
        exec(cmd);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: true }));
      });

      // Load settings
      server.middlewares.use("/api/settings", (req, res) => {
        const filePath = path.join(DATA_DIR, "settings.json");
        if (req.method === "GET") {
          try {
            ensureDataDir();
            if (fs.existsSync(filePath)) {
              const raw = fs.readFileSync(filePath, "utf-8");
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
              ensureDataDir();
              fs.writeFileSync(filePath, body, "utf-8");
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

      // Save a category file (SillyTavern format)
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
            ensureDataDir();
            fs.writeFileSync(path.join(DATA_DIR, `${fileName}.json`), content, "utf-8");
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true }));
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: String(err) }));
          }
        });
      });

      // Delete a category file
      server.middlewares.use("/api/delete-category", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = "";
        req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
        req.on("end", () => {
          try {
            const { fileName } = JSON.parse(body);
            const filePath = path.join(DATA_DIR, `${fileName}.json`);
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true }));
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: String(err) }));
          }
        });
      });

      // Rename a category file
      server.middlewares.use("/api/rename-category", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = "";
        req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
        req.on("end", () => {
          try {
            const { oldName, newName } = JSON.parse(body);
            ensureDataDir();
            const oldPath = path.join(DATA_DIR, `${oldName}.json`);
            const newPath = path.join(DATA_DIR, `${newName}.json`);
            if (fs.existsSync(oldPath)) {
              fs.renameSync(oldPath, newPath);
            }
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
