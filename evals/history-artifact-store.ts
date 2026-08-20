import { open, readFile, rename, rm, stat, writeFile, type FileHandle } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

export function historyDirectoryForRuns(runsDir: string, suiteDirectory: string): string {
  const latest = findAncestorNamed(resolve(runsDir), "latest");
  return latest === undefined
    ? join(runsDir, "history")
    : join(dirname(latest), "history", suiteDirectory);
}

export async function readValidatedJsonIfExists<T>(
  path: string,
  validate: (value: unknown) => asserts value is T
): Promise<T | undefined> {
  try {
    const text = await readFile(path, "utf8");
    const value = JSON.parse(text) as unknown;
    validate(value);
    return value;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return undefined;
    throw error;
  }
}

export async function atomicWriteText(path: string, content: string): Promise<void> {
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temporaryPath, content, "utf8");
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

export async function withHistoryFileLock<T>(
  path: string,
  operation: () => Promise<T>
): Promise<T> {
  const handle = await acquireHistoryLock(path);
  try {
    return await operation();
  } finally {
    await handle.close();
    await rm(path, { force: true });
  }
}

function findAncestorNamed(path: string, name: string): string | undefined {
  let current = path;
  while (true) {
    if (basename(current) === name) return current;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

async function acquireHistoryLock(path: string): Promise<FileHandle> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      const handle = await open(path, "wx");
      try {
        await handle.writeFile(`${process.pid} ${new Date().toISOString()}\n`, "utf8");
        return handle;
      } catch (error) {
        await handle.close();
        await rm(path, { force: true });
        throw error;
      }
    } catch (error) {
      if (!isNodeError(error) || error.code !== "EEXIST") throw error;
      if (await isStaleLock(path)) {
        await rm(path, { force: true });
        continue;
      }
      await delay(25);
    }
  }

  throw new Error(`Timed out waiting for history lock at ${path}.`);
}

async function isStaleLock(path: string): Promise<boolean> {
  try {
    const metadata = await stat(path);
    return Date.now() - metadata.mtimeMs > 30_000;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return false;
    throw error;
  }
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
