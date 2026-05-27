/**
 * Build a 50-row synthetic XLSX for end-to-end testing.
 * Output: sample-data/quick.xlsx
 */
import * as XLSX from "xlsx";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "..", "sample-data", "quick.xlsx");

const headers = ["id", "gender", "age", "item1", "item2", "item3"];
const rows = [];
for (let i = 1; i <= 50; i++) {
  rows.push([
    i,
    i % 2 === 0 ? "F" : "M",
    18 + (i % 12),
    1 + ((i * 7) % 5),
    1 + ((i * 11) % 5),
    1 + ((i * 13) % 5),
  ]);
}
const aoa = [headers, ...rows];
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet(aoa);
XLSX.utils.book_append_sheet(wb, ws, "Responses");
const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
writeFileSync(out, buf);
console.log(`Wrote ${out}: ${rows.length} rows, ${headers.length} columns`);
