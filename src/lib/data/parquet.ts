import { parquetWriteBuffer } from "hyparquet-writer";
import { csvResponse, parquetResponse } from "@/lib/api/http";

const FLOAT_COLS = new Set(["ili_percent", "sari_percent", "share"]);
const INT_COLS = new Set(["report_week", "year", "week", "cases", "deaths", "sequences"]);

export function csvToParquet(csv: string): ArrayBuffer {
  const lines = csv.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  if (lines.length < 1) return parquetWriteBuffer({ columnData: [] });
  const header = lines[0].split(",").map((h) => h.trim());
  const columns = header.map((name) => ({
    name,
    data: [] as (string | number | null)[],
    type: FLOAT_COLS.has(name) ? "DOUBLE" : INT_COLS.has(name) ? "INT32" : "STRING",
  }));
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const values = line.split(",");
    for (let i = 0; i < columns.length; i++) {
      const raw = values[i] ?? "";
      const col = columns[i];
      if (col.type === "STRING") {
        col.data.push(raw);
      } else {
        const n = Number(raw);
        col.data.push(raw === "" || !Number.isFinite(n) ? null : n);
      }
    }
  }
  return parquetWriteBuffer({ columnData: columns });
}

export function tableFileResponse(csv: string, filename: string, format: "csv" | "parquet") {
  if (format === "parquet") {
    return parquetResponse(csvToParquet(csv), filename.replace(/\.csv$/i, ".parquet"));
  }
  return csvResponse(csv, filename);
}

export function fileFormat(name: string): "csv" | "parquet" {
  return /\.parquet$/i.test(name) ? "parquet" : "csv";
}
