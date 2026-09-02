import { NextResponse } from "next/server";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, max-age=300, s-maxage=3600",
};

export function jsonResponse(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: CORS_HEADERS });
}

export function csvResponse(body: string, filename: string) {
  const ascii = /^[\x20-\x7E]+$/.test(filename) ? filename : "download.csv";
  return new NextResponse(body, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}

export function parquetResponse(body: ArrayBuffer, filename: string) {
  const name = filename.replace(/\.csv$/i, ".parquet");
  const ascii = /^[\x20-\x7E]+$/.test(name) ? name : "download.parquet";
  return new NextResponse(body, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/vnd.apache.parquet",
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    },
  });
}

export function optionsResponse() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
