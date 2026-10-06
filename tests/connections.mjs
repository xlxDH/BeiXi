import fs from "node:fs";
import ts from "typescript";
import assert from "node:assert/strict";
const source = fs.readFileSync(
  new URL("../src/connections.ts", import.meta.url),
  "utf8",
);
const js = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
const { segmentEntry, clipOwnLine, crossedMembers } = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64")
);
const rect = { x: 10, y: 10, width: 20, height: 20 };
assert.equal(segmentEntry({ x: 0, y: 20 }, { x: 40, y: 20 }, rect), 0.25);
assert.equal(segmentEntry({ x: 40, y: 20 }, { x: 0, y: 20 }, rect), 0.25);
assert.equal(segmentEntry({ x: 0, y: 0 }, { x: 40, y: 40 }, rect), 0.25);
assert.equal(segmentEntry({ x: 0, y: 9 }, { x: 40, y: 9 }, rect), null);
assert.equal(segmentEntry({ x: 0, y: 10 }, { x: 40, y: 10 }, rect), 0.25);
assert.deepEqual(clipOwnLine({ x: 0, y: 20 }, { x: 20, y: 20 }, rect), {
  x: 10,
  y: 20,
});
assert.deepEqual(clipOwnLine({ x: 20, y: 20 }, { x: 20, y: 20 }, rect), {
  x: 20,
  y: 20,
});
const bounds = [
  { id: 1, photo: rect, label: { x: 10, y: 40, width: 20, height: 10 } },
  {
    id: 2,
    photo: { x: 50, y: 10, width: 20, height: 20 },
    label: { x: 50, y: 40, width: 20, height: 10 },
  },
];
const own = { id: 1, start: { x: 0, y: 20 }, end: { x: 10, y: 20 } };
assert.deepEqual([...crossedMembers([own], bounds)], []);
const crossing = { id: 2, start: { x: 0, y: 20 }, end: { x: 40, y: 20 } };
assert.deepEqual([...crossedMembers([crossing, crossing], bounds)], [1]);
assert.equal(
  crossedMembers(
    [{ ...crossing, start: { x: 0, y: 45 }, end: { x: 40, y: 45 } }],
    bounds,
  ).has(1),
  true,
);
assert.deepEqual(
  [
    ...crossedMembers(
      [{ ...crossing, start: { x: 0, y: 70 }, end: { x: 40, y: 70 } }],
      bounds,
    ),
  ],
  [],
);
console.log(
  "PASS segment boundaries/reversal/diagonal, self clipping/exclusion, paired crossing, repeated crossing and dynamic restoration",
);
