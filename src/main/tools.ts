import { promises as fs, constants } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import type { ToolCall, ToolDefinition } from "../shared/types";
const blocked =
  /(^|[\\/])(\.git|node_modules|\.env(?:\.[^\\/]*)?|\.ssh|\.aws|\.azure|\.gcloud|\.npmrc|\.netrc|\.git-credentials|\.pypirc|secrets?(?:\.[^\\/]*)?|[^\\/]+\.(?:pem|key|p12|pfx)|credentials?)([\\/]|$)/i;
export async function contained(root: string, relative: string, write = false) {
  if (
    !relative ||
    path.isAbsolute(relative) ||
    relative
      .split(/[\\/]/)
      .some(
        (p) =>
          p.includes(":") ||
          /[. ]$/.test(p) ||
          /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p),
      ) ||
    blocked.test(relative)
  )
    throw new Error("Path is not permitted");
  const base = await fs.realpath(root);
  const target = path.resolve(base, relative);
  const rel = path.relative(base, target);
  if (rel.startsWith("..") || path.isAbsolute(rel))
    throw new Error("Path escapes workspace");
  let current = base;
  for (const part of rel.split(path.sep)) {
    current = path.join(current, part);
    try {
      const info = await fs.lstat(current);
      if (info.isSymbolicLink() || (info.isFile() && info.nlink > 1))
        throw new Error("Linked files are not permitted");
    } catch (e) {
      if (
        write &&
        (e as NodeJS.ErrnoException).code === "ENOENT" &&
        current === target
      )
        break;
      throw e;
    }
  }
  return target;
}
export function redact(value: string, secrets: string[] = []) {
  let out = value;
  for (const secret of secrets)
    if (secret) out = out.split(secret).join("[REDACTED]");
  return out.replace(
    /(authorization|api[_-]?key|access[_-]?token|password|secret)\s*[:=]\s*[^\s,;]+/gi,
    "$1=[REDACTED]",
  );
}
export const definitions: ToolDefinition[] = [
  {
    name: "list_files",
    description: "List workspace files.",
    parameters: { type: "object", properties: { path: { type: "string" } } },
  },
  {
    name: "read_file",
    description: "Read a workspace text file.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
  },
  {
    name: "search_files",
    description: "Search workspace text with a literal string.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "write_file",
    description:
      "Preview and request approval before writing a workspace file.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" }, content: { type: "string" } },
      required: ["path", "content"],
    },
  },
  {
    name: "run_command",
    description:
      "Request approval for an exact shell command in the workspace.",
    parameters: {
      type: "object",
      properties: { command: { type: "string" } },
      required: ["command"],
    },
  },
];
async function files(
  root: string,
  relative = "",
  depth = 0,
): Promise<string[]> {
  if (depth > 8) return [];
  const dir = relative
    ? await contained(root, relative)
    : await fs.realpath(root);
  const result: string[] = [];
  for (const item of await fs.readdir(dir, { withFileTypes: true })) {
    const name = path.join(relative, item.name);
    if (blocked.test(name) || item.isSymbolicLink()) continue;
    if (item.isDirectory())
      result.push(...(await files(root, name, depth + 1)));
    else result.push(name);
    if (result.length > 2000) return result.slice(0, 2000);
  }
  return result;
}
export async function executeTool(
  call: ToolCall,
  root: string,
  signal: AbortSignal,
  approve: (summary: string, detail: string) => Promise<boolean>,
  secrets: string[] = [],
): Promise<string> {
  if (call.arguments.length > 200000)
    throw new Error("Tool arguments too large");
  const args = JSON.parse(call.arguments);
  const arg = (key: string, max = 100000) => {
    const v = args[key];
    if (typeof v !== "string" || v.length > max || v.includes("\0"))
      throw new Error("Invalid tool argument");
    return v;
  };
  if (signal.aborted) throw new Error("Cancelled");
  let result = "";
  if (call.name === "list_files")
    result = (await files(root, args.path || "")).join("\n");
  else if (call.name === "read_file") {
    const target = await contained(root, arg("path", 1000));
    if ((await fs.stat(target)).size > 1000000)
      throw new Error("File too large");
    result = await fs.readFile(target, "utf8");
    if (result.includes("\0"))
      throw new Error("Binary files are not permitted");
  } else if (call.name === "search_files") {
    const query = arg("query", 1000);
    const matches = [];
    for (const file of await files(root)) {
      if (signal.aborted) break;
      const target = await contained(root, file);
      if ((await fs.stat(target)).size > 200000) continue;
      const content = await fs.readFile(target, "utf8");
      if (content.includes("\0")) continue;
      if (content.includes(query)) matches.push(file);
      if (matches.length >= 100) break;
    }
    result = matches.join("\n");
  } else if (call.name === "write_file") {
    const relative = arg("path", 1000),
      content = arg("content");
    const target = await contained(root, relative, true);
    let original: Buffer | null = null;
    try {
      if ((await fs.stat(target)).size > 1000000)
        throw new Error("File too large");
      original = await fs.readFile(target);
      if (original.includes(0))
        throw new Error("Binary files are not permitted");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    const digest = (v: Buffer | null) =>
      v ? createHash("sha256").update(v).digest("hex") : null;
    if (
      !(await approve(
        `Write ${relative}`,
        `Original:\n${redact(original?.toString("utf8") || "(new file)", secrets)}\n\nProposed:\n${redact(content, secrets)}`,
      ))
    )
      return "Write denied";
    if (signal.aborted) throw new Error("Cancelled");
    await contained(root, relative, true);
    let current: Buffer | null = null;
    try {
      current = await fs.readFile(target);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    if (digest(current) !== digest(original))
      throw new Error("File changed after preview");
    const temp = path.join(
      path.dirname(target),
      `.harness-${randomUUID()}.tmp`,
    );
    const handle = await fs.open(
      temp,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
      0o600,
    );
    try {
      await handle.writeFile(content);
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await contained(root, relative, true);
      let final: Buffer | null = null;
      try {
        final = await fs.readFile(target);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
      if (digest(final) !== digest(original))
        throw new Error("File changed after preview");
      await fs.rename(temp, target);
    } finally {
      await fs.rm(temp, { force: true });
    }
    result = "File written";
  } else if (call.name === "run_command") {
    const command = arg("command", 4000);
    const cwd = await fs.realpath(root);
    if (
      !(await approve(
        "Run command",
        `Command: ${command}\nWorking directory: ${cwd}\nTimeout: 30 seconds; output limit: 64 KiB`,
      ))
    )
      return "Command denied";
    if (signal.aborted) throw new Error("Cancelled");
    result = await new Promise<string>((resolve, reject) => {
      const env: NodeJS.ProcessEnv = {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        COMSPEC: process.env.COMSPEC,
        TEMP: process.env.TEMP,
      };
      const child = spawn(command, {
        cwd,
        shell: true,
        windowsHide: true,
        env,
        detached: process.platform !== "win32",
      });
      let output = "";
      const kill = () => {
        if (child.pid) {
          if (process.platform === "win32")
            spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
              windowsHide: true,
              stdio: "ignore",
            });
          else
            try {
              process.kill(-child.pid, "SIGKILL");
            } catch {}
        }
      };
      const timer = setTimeout(kill, 30000);
      const receive = (data: Buffer) => {
        output += data.toString();
        if (output.length > 65536) {
          output = output.slice(0, 65536);
          kill();
        }
      };
      child.stdout.on("data", receive);
      child.stderr.on("data", receive);
      signal.addEventListener("abort", kill, { once: true });
      child.on("error", reject);
      child.on("close", (code) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", kill);
        resolve(`Exit ${code}\n${output}`);
      });
    });
  } else throw new Error("Unknown tool");
  return redact(result, secrets).slice(0, 65536);
}
export class StreamRedactor {
  private pending = "";
  constructor(private readonly secrets: string[]) {}
  push(chunk: string): string {
    this.pending += chunk;
    for (const secret of this.secrets)
      if (secret) this.pending = this.pending.split(secret).join("[REDACTED]");
    let retain = 0;
    for (const secret of this.secrets)
      for (let n = 1; n < secret.length && n <= this.pending.length; n++)
        if (this.pending.endsWith(secret.slice(0, n)))
          retain = Math.max(retain, n);
    const safe = this.pending.slice(0, this.pending.length - retain);
    this.pending = this.pending.slice(this.pending.length - retain);
    return safe;
  }
  flush(): string {
    const remaining = this.pending ? "[REDACTED]" : "";
    this.pending = "";
    return remaining;
  }
}
export function assertNoSecret(value: unknown, secrets: string[]): void {
  const stack: unknown[] = [value];
  let visited = 0;
  while (stack.length) {
    if (++visited > 100000) throw new Error("Provider metadata is too complex");
    const item = stack.pop();
    if (typeof item === "string") {
      if (secrets.some((secret) => secret && item.includes(secret)))
        throw new Error(
          "Provider metadata contained protected credential material",
        );
    } else if (item && typeof item === "object") {
      for (const [name, child] of Object.entries(item)) stack.push(name, child);
    }
  }
}
