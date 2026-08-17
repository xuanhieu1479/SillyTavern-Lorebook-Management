import type { Plugin } from "vite";
import type { ServerResponse } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";

const APP_DIR = path.resolve(__dirname, "data");
const SETTINGS_PATH = path.join(APP_DIR, "settings.json");
const DATA_SOURCE_PATH = path.join(APP_DIR, "dataSource.json");
const BACKUP_DIR = path.join(APP_DIR, "backup");
const BACKUP_MAX_AGE_DAYS = 30;
const BACKUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

function ensureAppDir() {
  if (!fs.existsSync(APP_DIR)) fs.mkdirSync(APP_DIR, { recursive: true });
}

function readSettings(): Record<string, unknown> {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      return JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
    }
  } catch { /* ignore */ }
  return {};
}

function readDataSource(): Record<string, unknown> {
  try {
    if (fs.existsSync(DATA_SOURCE_PATH)) {
      return JSON.parse(fs.readFileSync(DATA_SOURCE_PATH, "utf-8"));
    }
  } catch { /* ignore */ }
  return {};
}

function getDataDir(): string {
  const dataSource = readDataSource();
  const configured =
    typeof dataSource.dataDir === "string" && dataSource.dataDir.trim() ? dataSource.dataDir.trim() : null;
  return configured ? path.resolve(configured) : APP_DIR;
}

function listWorldFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "settings.json" && f !== "dataSource.json");
}

function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

function parseTimestamp(name: string): Date | null {
  const match = name.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day, hour, min, sec] = match.map(Number);
  return new Date(year, month - 1, day, hour, min, sec);
}

function createBackup(): void {
  try {
    const dataDir = getDataDir();
    const files = listWorldFiles(dataDir);
    if (files.length === 0) return;

    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

    const timestamp = formatTimestamp(new Date());
    const backupPath = path.join(BACKUP_DIR, timestamp);
    fs.mkdirSync(backupPath, { recursive: true });

    for (const file of files) {
      const src = path.join(dataDir, file);
      const dest = path.join(backupPath, file);
      fs.copyFileSync(src, dest);
    }
    console.log(`[backup] Created backup: ${timestamp} (${files.length} files)`);
  } catch (err) {
    console.error("[backup] Failed to create backup:", err);
  }
}

function cleanOldBackups(): void {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return;

    const cutoff = Date.now() - BACKUP_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    const entries = fs.readdirSync(BACKUP_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const date = parseTimestamp(entry.name);
      if (!date || date.getTime() >= cutoff) continue;

      const folderPath = path.join(BACKUP_DIR, entry.name);
      fs.rmSync(folderPath, { recursive: true, force: true });
      console.log(`[backup] Deleted old backup: ${entry.name}`);
    }
  } catch (err) {
    console.error("[backup] Failed to clean old backups:", err);
  }
}

export default function dataPlugin(): Plugin {
  return {
    name: "data-api",
    configureServer(server) {
      // Initialize backup system
      cleanOldBackups();
      createBackup();
      setInterval(createBackup, BACKUP_INTERVAL_MS);

      // SSE for SillyTavern textarea sync
      let latestTextarea = "";
      let latestChatEntryIds: string[] = [];
      const sseClients = new Set<ServerResponse>();

      // Extract entry IDs from text. IDs have format "CategoryName:uid"
      function extractEntryIds(text: string): string[] {
        const idPattern = /[\w\s\-']+:\d+/g;
        const matches = text.match(idPattern) || [];
        return matches.map(id => id.trim());
      }

      // SSE for settings change notifications (e.g., when ST extension clears copied flags)
      const settingsSseClients = new Set<ServerResponse>();

      // SSE for world info updates (ST extension listens to auto-reload)
      const worldInfoSseClients = new Set<ServerResponse>();

      server.middlewares.use("/api/world-info/stream", (req, res) => {
        if (req.method !== "GET") {
          res.statusCode = 405;
          res.end();
          return;
        }
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.flushHeaders();

        worldInfoSseClients.add(res);
        req.on("close", () => worldInfoSseClients.delete(res));
      });

      function broadcastWorldInfoUpdate() {
        for (const client of worldInfoSseClients) {
          client.write(`event: world-info-updated\ndata: {}\n\n`);
        }
      }

      server.middlewares.use("/api/settings/stream", (req, res) => {
        if (req.method !== "GET") {
          res.statusCode = 405;
          res.end();
          return;
        }
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.flushHeaders();

        settingsSseClients.add(res);
        req.on("close", () => settingsSseClients.delete(res));
      });

      function broadcastSettingsChange(event: string) {
        for (const client of settingsSseClients) {
          client.write(`data: ${JSON.stringify({ event })}\n\n`);
        }
      }

      // SSE stream endpoint - React listens here
      server.middlewares.use("/api/st-textarea/stream", (req, res) => {
        if (req.method !== "GET") {
          res.statusCode = 405;
          res.end();
          return;
        }
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.flushHeaders();

        sseClients.add(res);
        res.write(`data: ${JSON.stringify({ content: latestTextarea, chatEntryIds: latestChatEntryIds })}\n\n`);

        req.on("close", () => sseClients.delete(res));
      });

      // POST endpoint - ST extension sends here
      server.middlewares.use("/api/st-textarea", (req, res) => {
        if (req.method === "OPTIONS") {
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
          res.setHeader("Access-Control-Allow-Headers", "Content-Type");
          res.statusCode = 204;
          res.end();
          return;
        }
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = "";
        req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
        req.on("end", () => {
          try {
            const { content, chatMessages } = JSON.parse(body);
            latestTextarea = content ?? "";

            // Extract entry IDs from all chat messages
            if (Array.isArray(chatMessages)) {
              const allIds = new Set<string>();
              for (const msg of chatMessages) {
                if (typeof msg === "string") {
                  for (const id of extractEntryIds(msg)) {
                    allIds.add(id);
                  }
                }
              }
              latestChatEntryIds = [...allIds];
            }

            for (const client of sseClients) {
              client.write(`data: ${JSON.stringify({ content: latestTextarea, chatEntryIds: latestChatEntryIds })}\n\n`);
            }
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true }));
          } catch {
            res.statusCode = 400;
            res.end();
          }
        });
      });

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
        // CORS for SillyTavern extension access
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");

        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.end();
          return;
        }
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

      // Read/write dataSource.json (stores dataDir separately from other settings).
      server.middlewares.use("/api/data-source", (req, res) => {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");

        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.end();
          return;
        }
        if (req.method === "GET") {
          try {
            ensureAppDir();
            if (fs.existsSync(DATA_SOURCE_PATH)) {
              const raw = fs.readFileSync(DATA_SOURCE_PATH, "utf-8");
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
              fs.writeFileSync(DATA_SOURCE_PATH, body, "utf-8");
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

      // Clear all "copied" flags in settings (called by ST extension on compact).
      server.middlewares.use("/api/clear-copied", (req, res) => {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");

        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.end();
          return;
        }
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }
        try {
          ensureAppDir();
          const settings = readSettings();
          settings.copied = [];
          fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf-8");
          broadcastSettingsChange("copied-cleared");
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(err) }));
        }
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
            broadcastWorldInfoUpdate();
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
