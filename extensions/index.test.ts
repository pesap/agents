import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";

function createAgent(dir: string, name: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "agent.yaml"),
    [
      `name: ${name}`,
      'version: "1.0.0"',
      `description: ${name} test agent`,
    ].join("\n"),
  );
}

test("install makes agents visible in list and remove all clears the registry", async () => {
  const originalHome = process.env.HOME;
  const homeDir = mkdtempSync(join(tmpdir(), "pi-gitagent-home-"));
  const repoDir = mkdtempSync(join(tmpdir(), "pi-gitagent-repo-"));
  const cwd = mkdtempSync(join(tmpdir(), "pi-gitagent-cwd-"));

  try {
    createAgent(join(repoDir, "alpha"), "alpha");
    createAgent(join(repoDir, "beta"), "beta");
    process.env.HOME = homeDir;

    const [{ default: initExtension }, registry] = await Promise.all([import("./index.js"), import("./registry.js")]);

    const commands = new Map<string, { handler: (args: string | undefined, ctx: unknown) => Promise<void> }>();
    const notifications: Array<{ message: string; type: string }> = [];
    const confirmations: Array<{ title: string; message: string }> = [];

    initExtension({
      on() {
        return undefined;
      },
      registerTool() {
        return undefined;
      },
      registerCommand(name: string, options: { handler: (args: string | undefined, ctx: unknown) => Promise<void> }) {
        commands.set(name, options);
      },
      appendEntry() {
        return undefined;
      },
      sendMessage() {
        return undefined;
      },
      sendUserMessage() {
        return undefined;
      },
      async setModel() {
        return false;
      },
    } as never);

    const gitagent = commands.get("gitagent");
    assert.ok(gitagent, "gitagent command should be registered");

    const ctx = {
      cwd,
      hasUI: true,
      ui: {
        notify(message: string, type: string) {
          notifications.push({ message, type });
        },
        setStatus() {
          return undefined;
        },
        async confirm(title: string, message: string) {
          confirmations.push({ title, message });
          return true;
        },
      },
      modelRegistry: {
        find() {
          return undefined;
        },
      },
    };

    await gitagent.handler(`install ${repoDir}`, ctx);
    assert.match(notifications.at(-1)?.message ?? "", /Installed 2 agents from/);
    notifications.length = 0;

    await gitagent.handler("list", ctx);
    const listMessage = notifications.at(-1)?.message ?? "";
    assert.match(listMessage, /Available agents:/);
    assert.match(listMessage, /Installed aliases:/);
    assert.match(listMessage, /\balpha\b/);
    assert.match(listMessage, /\bbeta\b/);
    assert.deepEqual(registry.readInstalledAgents().map((record: { name: string }) => record.name), ["alpha", "beta"]);
    notifications.length = 0;

    await gitagent.handler("remove all", ctx);
    assert.equal(confirmations.length, 1);
    assert.match(notifications.at(-1)?.message ?? "", /Removed all 2 installed agents\./);
    assert.deepEqual(registry.readInstalledAgents(), []);
    notifications.length = 0;

    await gitagent.handler("list", ctx);
    assert.equal(notifications.at(-1)?.message, "No agents found");
  } finally {
    process.env.HOME = originalHome;
    rmSync(homeDir, { recursive: true, force: true });
    rmSync(repoDir, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  }
});
