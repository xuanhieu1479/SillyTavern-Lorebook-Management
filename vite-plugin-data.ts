import type { Plugin } from "vite";
import type { ServerResponse } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";

const APP_DIR = path.resolve(__dirname, "data");
const SETTINGS_PATH = path.join(APP_DIR, "settings.json");

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
      // SSE for SillyTavern textarea sync
      let latestTextarea = "";
      const sseClients = new Set<ServerResponse>();

      // SSE for settings change notifications (e.g., when ST extension clears copied flags)
      const settingsSseClients = new Set<ServerResponse>();

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
        res.write(`data: ${JSON.stringify({ content: latestTextarea })}\n\n`);

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
            const { content } = JSON.parse(body);
            latestTextarea = content ?? "";
            for (const client of sseClients) {
              client.write(`data: ${JSON.stringify({ content: latestTextarea })}\n\n`);
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
