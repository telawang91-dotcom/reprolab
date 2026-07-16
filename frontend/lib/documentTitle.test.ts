import { strict as assert } from "node:assert";
import { displayDocumentTitle } from "./documentTitle";

assert.equal(displayDocumentTitle({ title: "435", filename: "xps/in3d_xps_reference_style.pdf" }), "in3d xps reference style");
assert.equal(displayDocumentTitle({ title: "from pathlib import Path", filename: "xps/plot_in2se3_xps.py" }), "plot in2se3 xps");
assert.equal(displayDocumentTitle({ title: "真实实验说明", filename: "notes.txt" }), "真实实验说明");
assert.equal(displayDocumentTitle({ title: "data/results.csv", filename: "data/results.csv" }), "results");
assert.equal(displayDocumentTitle({ title: "sample.spe: 20260515 (acq: unk)", filename: "xps/sample-2.pdf" }), "sample 2");

console.log("documentTitle: 5 cases passed");
