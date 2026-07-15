import assert from "node:assert/strict";
import { unwrapArtifactValue } from "./artifactValue";

assert.equal(unwrapArtifactValue({ value: 3, mime_type: "application/json" }), 3);
assert.deepEqual(unwrapArtifactValue({ data: [1, 2] }), [1, 2]);
assert.equal(unwrapArtifactValue({ text: "result" }), "result");
assert.deepEqual(unwrapArtifactValue({ other: true }), { other: true });
assert.equal(unwrapArtifactValue(null), null);

console.log("artifact value tests passed");
