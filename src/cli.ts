import * as cp from "node:child_process";
import * as vscode from "vscode";

/** Envelope shape written by gitwe's `--format json` (RFC-0004). */
export interface GitweEnvelope<T = unknown> {
  schemaVersion: 1;
  command: string;
  ok: boolean;
  data: T | null;
  warnings: string[];
  error: {
    code: string;
    message: string;
    hint?: string;
    files?: string[];
  } | null;
}

export class GitweCliError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly hint?: string,
    public readonly files?: string[],
    /** Raw stderr, kept for the "Show Output" action even when JSON parsing failed. */
    public readonly stderr?: string,
  ) {
    super(message);
    this.name = "GitweCliError";
  }
}

/** Thrown when gitwe itself could not be found / spawned at all. */
export class GitweNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitweNotFoundError";
  }
}

export interface RunOptions {
  cwd: string;
  /** Extra args appended after the base command, before --format json. */
  args?: string[];
  /** Abort a long-running command (e.g. if the user cancels a progress notification). */
  token?: vscode.CancellationToken;
}

let cachedBinary: { command: string; prefixArgs: string[] } | undefined;

function config() {
  return vscode.workspace.getConfiguration("gitwe");
}

/**
 * Resolve how to invoke gitwe: an explicit configured path, `gitwe` on PATH,
 * or `npx gitwe` as a last resort. Cached for the life of the extension host
 * (a "Reload Window" is cheap enough if the user installs gitwe mid-session).
 */
export async function resolveGitweBinary(
  cwd: string,
): Promise<{ command: string; prefixArgs: string[] }> {
  if (cachedBinary) return cachedBinary;

  const configured = config().get<string>("binaryPath", "").trim();
  if (configured) {
    cachedBinary = { command: configured, prefixArgs: [] };
    return cachedBinary;
  }

  if (await commandExists("gitwe", cwd)) {
    cachedBinary = { command: "gitwe", prefixArgs: [] };
    return cachedBinary;
  }

  if (
    config().get<boolean>("useNpxFallback", true) &&
    (await commandExists("npx", cwd))
  ) {
    cachedBinary = { command: "npx", prefixArgs: ["--yes", "gitwe"] };
    return cachedBinary;
  }

  throw new GitweNotFoundError(
    "Could not find the `gitwe` executable on PATH, and no `gitwe.binaryPath` is configured. " +
      "Install it with `npm install -g gitwe-ts` (or `@idmdakhi/gitwe`), or set `gitwe.binaryPath` in Settings.",
  );
}

export function forgetResolvedBinary(): void {
  cachedBinary = undefined;
}

function commandExists(bin: string, cwd: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = process.platform === "win32" ? "where" : "command -v";
    cp.exec(
      `${probe} ${bin}`,
      { cwd, shell: process.platform === "win32" ? undefined : "/bin/sh" },
      (err) => resolve(!err),
    );
  });
}

/**
 * Run a gitwe subcommand and parse its `--format json` envelope.
 * Resolves with `data` on success; rejects with {@link GitweCliError} on a
 * well-formed error envelope, or {@link GitweNotFoundError} if gitwe itself
 * is missing.
 */
export async function runGitweJson<T = unknown>(
  subcommand: string[],
  options: RunOptions,
): Promise<T> {
  const { command, prefixArgs } = await resolveGitweBinary(options.cwd);
  const args = [
    ...prefixArgs,
    ...subcommand,
    ...(options.args ?? []),
    "--format",
    "json",
    "--no-color",
  ];

  const { stdout, stderr, exitCode } = await execFile(
    command,
    args,
    options.cwd,
    options.token,
  );

  const envelope = tryParseEnvelope<T>(stdout);
  if (envelope) {
    if (envelope.ok) return (envelope.data as T) ?? (undefined as T);
    const err = envelope.error;
    throw new GitweCliError(
      err?.message ?? `gitwe ${subcommand.join(" ")} failed`,
      err?.code ?? "UNKNOWN",
      err?.hint,
      err?.files,
      stderr,
    );
  }

  // gitwe couldn't even produce a JSON envelope (e.g. crashed before parsing args).
  if (exitCode !== 0) {
    throw new GitweCliError(
      stderr.trim() || stdout.trim() || `gitwe ${subcommand.join(" ")} failed`,
      "UNKNOWN",
    );
  }
  return undefined as T;
}

/** Run a gitwe subcommand without --format json (used for `log`/`graph`, which are text-first). */
export async function runGitweText(
  subcommand: string[],
  options: RunOptions,
): Promise<string> {
  const { command, prefixArgs } = await resolveGitweBinary(options.cwd);
  const args = [
    ...prefixArgs,
    ...subcommand,
    ...(options.args ?? []),
    "--no-color",
  ];
  const { stdout, stderr, exitCode } = await execFile(
    command,
    args,
    options.cwd,
    options.token,
  );
  if (exitCode !== 0) {
    throw new GitweCliError(
      stderr.trim() || stdout.trim() || `gitwe ${subcommand.join(" ")} failed`,
      "UNKNOWN",
    );
  }
  return stdout;
}

function tryParseEnvelope<T>(stdout: string): GitweEnvelope<T> | undefined {
  const trimmed = stdout.trim();
  if (!trimmed.startsWith("{")) return undefined;
  try {
    const parsed = JSON.parse(trimmed) as GitweEnvelope<T>;
    if (parsed && parsed.schemaVersion === 1 && typeof parsed.ok === "boolean")
      return parsed;
  } catch {
    // fall through
  }
  return undefined;
}

/**
 * Quote a single argument the way the Microsoft C runtime parses argv,
 * so a manually-built `cmd.exe /c <command line>` string round-trips
 * arguments containing spaces/quotes correctly. Mirrors the algorithm
 * Node itself (and `cross-spawn`) use internally for `shell: true` on
 * Windows — see https://learn.microsoft.com/cpp/c-language/parsing-c-command-line-arguments.
 */
function quoteWindowsArg(arg: string): string {
  if (arg.length === 0) return '""';
  if (!/[ \t"]/.test(arg)) return arg;

  let result = '"';
  for (let i = 0; i <= arg.length; i++) {
    let backslashes = 0;
    while (i < arg.length && arg[i] === "\\") {
      i++;
      backslashes++;
    }
    if (i === arg.length) {
      result += "\\".repeat(backslashes * 2);
      break;
    } else if (arg[i] === '"') {
      result += "\\".repeat(backslashes * 2 + 1) + '"';
    } else {
      result += "\\".repeat(backslashes) + arg[i];
    }
  }
  return result + '"';
}

/**
 * On Windows, globally-installed npm binaries (including `gitwe` and `npx`)
 * are `.cmd`/`.ps1` shims, not `.exe` files. `where gitwe` finds them (it
 * shells out to cmd.exe, which honours PATHEXT), but a plain
 * `child_process.execFile('gitwe', ...)` does NOT apply PATHEXT resolution
 * and fails with ENOENT even though the shim is right there on PATH. Routing
 * through `cmd.exe /d /s /c` (with arguments quoted ourselves and
 * `windowsVerbatimArguments` so Node doesn't re-quote them) reproduces what
 * a real shell does. POSIX shims are plain executable files, so no such
 * workaround is needed there.
 */
function execFile(
  command: string,
  args: string[],
  cwd: string,
  token?: vscode.CancellationToken,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";

    const child =
      process.platform === "win32"
        ? cp.execFile(
            process.env.ComSpec || process.env.COMSPEC || "cmd.exe",
            [
              "/d",
              "/s",
              "/c",
              [command, ...args].map(quoteWindowsArg).join(" "),
            ],
            {
              cwd,
              maxBuffer: 1024 * 1024 * 16,
              windowsVerbatimArguments: true,
            },
            handleClose,
          )
        : cp.execFile(
            command,
            args,
            { cwd, maxBuffer: 1024 * 1024 * 16 },
            handleClose,
          );

    function handleClose(
      error: cp.ExecFileException | null,
      out: string,
      err: string,
    ): void {
      stdout = out;
      stderr = err;

      const notFoundOnWindows =
        process.platform === "win32" &&
        /is not recognized as an internal or external command/i.test(err);

      if ((error && error.code === "ENOENT") || notFoundOnWindows) {
        forgetResolvedBinary();
        reject(
          new GitweNotFoundError(
            `Could not run \`${command}\`. It was found on PATH but could not be executed — ` +
              `is it actually installed correctly? You can set an explicit path in the "gitwe.binaryPath" setting.`,
          ),
        );
        return;
      }
      const exitCode =
        typeof error?.code === "number" ? error.code : error ? 1 : 0;
      resolve({ stdout, stderr, exitCode });
    }

    const sub = token?.onCancellationRequested(() => {
      child.kill();
      reject(new Error("cancelled"));
    });
    child.on("close", () => sub?.dispose());
  });
}

// ---------------------------------------------------------------------------
// Typed payload shapes for the read-only commands the extension polls often.
// Mirrors src/cli/commands/{list,current,overview,types,doctor}.command.ts.
// ---------------------------------------------------------------------------

export interface GitweBranchSummary {
  branch: string;
  shortName: string;
  type: string;
}

export interface GitweListResult {
  type: string | null;
  pattern: string | null;
  branches: GitweBranchSummary[];
}

export interface GitweCurrentResult {
  branch: string | null;
  detached: boolean;
  type: string | null;
  shortName: string | null;
  base: string | null;
  target: string[] | null;
}

export interface GitweBranchTypeSummary {
  type: string;
  base: string;
  target: string[];
  count: number;
}

export interface GitweOverviewResult {
  workflowName: string;
  currentBranch: string | null;
  baseBranches: string[];
  branchTypes: GitweBranchTypeSummary[];
}

export interface GitweTypeDefinition {
  name: string;
  prefix: string;
  base: string;
  /** Always an array in gitwe ≥ 0.40 (toArray applied). */
  target: string[];
  aliases: string[] | null;
}

export interface GitweTypesResult {
  types: GitweTypeDefinition[];
}

export type GitweFindingSeverity = "ok" | "warning" | "error";

export interface GitweDoctorFinding {
  severity: GitweFindingSeverity;
  id: string;
  message: string;
  fixable: boolean;
}

export interface GitweDoctorResult {
  ok: boolean;
  workflow: string;
  currentBranch: string | null;
  findings: GitweDoctorFinding[];
  fixed?: string[];
}

/** Convenience helpers bound to a single workspace/repository root. */
export class GitweRepo {
  constructor(public readonly cwd: string) {}

  list(type?: string, pattern?: string, token?: vscode.CancellationToken) {
    const args = [type, pattern].filter((v): v is string => !!v);
    return runGitweJson<GitweListResult>(["list", ...args], {
      cwd: this.cwd,
      token,
    });
  }

  current(token?: vscode.CancellationToken) {
    return runGitweJson<GitweCurrentResult>(["current"], {
      cwd: this.cwd,
      token,
    });
  }

  overview(token?: vscode.CancellationToken) {
    return runGitweJson<GitweOverviewResult>(["overview"], {
      cwd: this.cwd,
      token,
    });
  }

  types(token?: vscode.CancellationToken) {
    return runGitweJson<GitweTypesResult>(["types"], { cwd: this.cwd, token });
  }

  doctor(fix: boolean, token?: vscode.CancellationToken) {
    const args = fix ? ["--fix", "--yes"] : [];
    return runGitweJson<GitweDoctorResult>(["doctor"], {
      cwd: this.cwd,
      args,
      token,
    });
  }

  validate(token?: vscode.CancellationToken) {
    return runGitweJson<{
      valid: boolean;
      issues: Array<{ path: string; message: string }>;
    }>(["validate"], {
      cwd: this.cwd,
      token,
    });
  }

  start(
    type: string,
    name: string,
    base: string | undefined,
    extraArgs: string[] = [],
  ) {
    const args = [type, name, ...(base ? [base] : []), ...extraArgs];
    return runGitweJson(["start", ...args], { cwd: this.cwd });
  }

  finish(name: string | undefined, extraArgs: string[] = []) {
    return runGitweJson(["finish", ...(name ? [name] : []), ...extraArgs], {
      cwd: this.cwd,
    });
  }

  update(name: string | undefined, extraArgs: string[] = []) {
    return runGitweJson(["update", ...(name ? [name] : []), ...extraArgs], {
      cwd: this.cwd,
    });
  }

  sync(extraArgs: string[] = []) {
    return runGitweJson(["sync", ...extraArgs], { cwd: this.cwd });
  }

  pull(extraArgs: string[] = []) {
    return runGitweJson(["pull", ...extraArgs], { cwd: this.cwd });
  }

  publish(name: string | undefined, extraArgs: string[] = []) {
    return runGitweJson(["publish", ...(name ? [name] : []), ...extraArgs], {
      cwd: this.cwd,
    });
  }

  deleteBranch(name: string | undefined, extraArgs: string[] = []) {
    return runGitweJson(["delete", ...(name ? [name] : []), ...extraArgs], {
      cwd: this.cwd,
    });
  }

  rename(newName: string) {
    return runGitweJson(["rename", newName], { cwd: this.cwd });
  }

  track(typeOrBranch: string, name?: string) {
    return runGitweJson(["track", typeOrBranch, ...(name ? [name] : [])], {
      cwd: this.cwd,
    });
  }

  checkout(typeOrBranch: string, name?: string) {
    return runGitweJson(["checkout", typeOrBranch, ...(name ? [name] : [])], {
      cwd: this.cwd,
    });
  }

  tag(name: string | undefined, extraArgs: string[] = []) {
    return runGitweJson(["tag", ...(name ? [name] : []), ...extraArgs], {
      cwd: this.cwd,
    });
  }

  rebase(name: string | undefined, extraArgs: string[] = []) {
    return runGitweJson(["rebase", ...(name ? [name] : []), ...extraArgs], {
      cwd: this.cwd,
    });
  }

  abort() {
    return runGitweJson(["abort"], { cwd: this.cwd });
  }

  init(extraArgs: string[]) {
    return runGitweJson(["init"], {
      cwd: this.cwd,
      args: [...extraArgs, "--defaults"],
    });
  }

  graph(root?: string) {
    return runGitweText(["graph", ...(root ? ["--root", root] : [])], {
      cwd: this.cwd,
    });
  }

  log(extraArgs: string[] = []) {
    return runGitweText(["log", ...extraArgs], { cwd: this.cwd });
  }
}
