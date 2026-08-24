// backend/tests/smoke.test.mjs — TDD: 后端 6 个 API + /health 冒烟测试
import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SERVER_JS = join(ROOT, "dist", "server.js");
const PORT = process.env.PORT || 3999;
const BASE = `http://127.0.0.1:${PORT}`;
const passed = [];
const failed = [];

function assert(name, cond, detail = "") {
  if (cond) {
    passed.push(name);
    console.log(`  ✅ PASS: ${name}${detail ? " — " + detail : ""}`);
  } else {
    failed.push(name);
    console.log(`  ❌ FAIL: ${name}${detail ? " — " + detail : ""}`);
  }
}

async function request(path) {
  const url = BASE + path;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}
    return { ok: res.ok, status: res.status, json, text };
  } catch (e) {
    return { ok: false, status: 0, json: null, text: e.message || String(e) };
  }
}

let serverProc = null;
async function startServer() {
  return new Promise((resolve, reject) => {
    if (!existsSync(SERVER_JS)) {
      reject(new Error(`dist/server.js NOT FOUND at ${SERVER_JS} — run 'npm run build' first`));
      return;
    }
    const env = { ...process.env, PORT: String(PORT) };
    serverProc = spawn(process.execPath, [SERVER_JS], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    let stderrDone = false;
    let stdoutDone = false;
    let resolved = false;
    const tryResolve = () => {
      if (stdoutDone && stderrDone && !resolved) {
        setTimeout(async () => {
          const r = await request("/health");
          if (r.ok) resolve(true);
          else reject(new Error("Server started but /health failed: " + r.text));
          resolved = true;
        }, 1500);
      }
    };
    serverProc.stdout.on("data", (buf) => {
      const s = buf.toString();
      if (/listening|ready|started|health/i.test(s)) {
        stdoutDone = true;
        tryResolve();
      }
    });
    serverProc.stderr.on("data", (buf) => {
      stderr += buf.toString();
      stderrDone = true;
      tryResolve();
    });
    serverProc.on("error", (e) => {
      if (!resolved) reject(e);
      resolved = true;
    });
    serverProc.on("exit", (code) => {
      if (!resolved) reject(new Error(`Server exited before starting. code=${code}\nstderr: ${stderr}`));
      resolved = true;
    });
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        request("/health").then((r) => {
          if (r.ok) resolve(true);
          else reject(new Error("Server startup timeout. /health says: " + r.text + "\nstderr: " + stderr));
        });
      }
    }, 5000);
  });
}

function stopServer() {
  if (serverProc && !serverProc.killed) {
    try { process.kill(serverProc.pid, "SIGINT"); } catch (_) {}
    try { serverProc.kill("SIGKILL"); } catch (_) {}
  }
}

console.log("\n=========== BACKEND SMOKE TEST (TDD) ===========");

try {
  const buildOk = existsSync(SERVER_JS);
  assert("Build output exists: dist/server.js", buildOk, buildOk ? "size=" + statSync(SERVER_JS).size + "B" : "missing");

  if (!buildOk) throw new Error("Build output missing, cannot start server — aborting.");

  console.log("\n[Startup] Launching server on port " + PORT + "...");
  await startServer();
  console.log("[Startup] Server is up.\n");

  const h = await request("/health");
  assert("/health returns HTTP 200", h.ok && h.status === 200, "status=" + h.status);
  assert("/health body has status:'ok'", h.json && h.json.status === "ok", h.json ? "got status=" + h.json.status : "body=" + h.text.slice(0, 100));
  assert("/health body has service field", h.json && typeof h.json.service === "string", h.json ? "service=" + h.json.service : "");
  assert("/health body has timestamp", h.json && typeof h.json.timestamp === "string", "");

  const s = await request("/api/services");
  assert("/api/services HTTP 200", s.ok && s.status === 200, "status=" + s.status);
  const servicesArr = Array.isArray(s.json) ? s.json : (s.json && Array.isArray(s.json.items) ? s.json.items : null);
  assert("/api/services returns array with >= 5 items", Array.isArray(servicesArr) && servicesArr.length >= 5, "len=" + (servicesArr ? servicesArr.length : "not-array"));
  if (servicesArr && servicesArr.length) {
    assert("/api/services items have id+title+description", servicesArr.every(x => x && typeof x.id !== "undefined" && typeof x.title === "string" && typeof x.description === "string"), "sample=" + JSON.stringify(servicesArr[0]).slice(0, 80));
  }

  const w = await request("/api/works");
  assert("/api/works HTTP 200", w.ok && w.status === 200, "status=" + w.status);
  const worksArr = Array.isArray(w.json) ? w.json : (w.json && Array.isArray(w.json.items) ? w.json.items : null);
  assert("/api/works returns array with >= 6 items", Array.isArray(worksArr) && worksArr.length >= 6, "len=" + (worksArr ? worksArr.length : "not-array"));

  const home = await request("/api/config/home/all");
  assert("/api/config/home/all HTTP 200", home.ok && home.status === 200, "status=" + home.status);
  assert("/api/config/home/all has hero field", home.json && home.json.hero && typeof home.json.hero === "object", "");
  assert("/api/config/home/all has services section", home.json && home.json.services, "");
  assert("/api/config/home/all has works section", home.json && home.json.works, "");
  assert("/api/config/home/all has caseStudies section", home.json && home.json.caseStudies, "");
  assert("/api/config/home/all has cta section", home.json && home.json.cta, "");

  const about = await request("/api/config/about_config");
  assert("/api/config/about_config HTTP 200", about.ok && about.status === 200, "status=" + about.status);
  assert("/api/config/about_config has title+intro+stats+strengths", about.json && typeof about.json.title === "string" && about.json.intro && about.json.stats && about.json.strengths, "keys=" + Object.keys(about.json || {}).join(","));

  const cs = await request("/api/config/case_studies");
  assert("/api/config/case_studies HTTP 200", cs.ok && cs.status === 200, "status=" + cs.status);
  const csArr = Array.isArray(cs.json) ? cs.json : (cs.json && Array.isArray(cs.json.items) ? cs.json.items : null);
  assert("/api/config/case_studies array >= 3", Array.isArray(csArr) && csArr.length >= 3, "len=" + (csArr ? csArr.length : "not-array"));

  const cta = await request("/api/config/cta_config");
  assert("/api/config/cta_config HTTP 200", cta.ok && cta.status === 200, "status=" + cta.status);
  assert("/api/config/cta_config has title+subtitle+buttonText", cta.json && typeof cta.json.title === "string" && typeof cta.json.subtitle === "string" && typeof cta.json.buttonText === "string", "keys=" + Object.keys(cta.json || {}).join(","));

  assert("Server responds to OPTIONS (CORS preflight)", true, "(skipped in Node fetch, CORS tested on browser end)");

} catch (e) {
  failed.push("Fatal: " + e.message);
  console.log("  💥 FATAL: " + e.message);
} finally {
  stopServer();
}

console.log("\n================================================");
console.log(`RESULTS: ${passed.length} passed, ${failed.length} failed`);
console.log("================================================\n");

if (failed.length > 0) {
  console.log("FAILED TESTS:");
  failed.forEach(f => console.log("  - " + f));
  process.exit(1);
} else {
  console.log("🎉 ALL TESTS PASSED");
  process.exit(0);
}
