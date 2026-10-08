import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The Muushig and Poker rules run in the browser (practice) and on the server
// (online) from two copies, because the server deploys from server/ alone.
// They must match byte for byte: edit src/utils/<game>/ and copy it to
// server/game/<game>/.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const COPIES = [
  ["muushig", ["engine.js", "ai.js"]],
  ["poker", ["hands.js", "pots.js", "engine.js", "ai.js", "table.js"]],
].flatMap(([game, files]) => files.map((file) => [game, file]));

describe.each(COPIES)("%s/%s", (game, file) => {
  it("is identical in the browser and on the server", () => {
    const client = fs.readFileSync(path.join(root, "src/utils", game, file), "utf8");
    const server = fs.readFileSync(path.join(root, "server/game", game, file), "utf8");
    expect(server).toBe(client);
  });
});
