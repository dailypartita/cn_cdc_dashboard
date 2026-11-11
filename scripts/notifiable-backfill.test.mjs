import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  BACKFILL_CSV,
  BACKFILL_DISEASES,
  BACKFILL_META,
  NOTIFIABLE_CSV,
  STONE_ZENG_CASES_URL,
  buildHistoricalRows,
  calendarMonths,
  isCompiledBackfillRow,
  mergeNotifiableBackfill,
  monthBefore,
  parseCsv,
  parseNotifiableCsv,
  parseUpstreamLinks,
  recordsToCsv,
  separateMislabeledMonths,
  seriesCoverage,
} from "./notifiable-backfill.mjs";

const CASES = `月份,登革热,流行性感冒,甲型H1N1流感,人感染高致病性禽流感
2004-01,0,,,
2004-04,1,12241,,
2005-04,2,5925,,
2009-02,3,,,0
2009-03,4,8015,,0
2009-04,0,6794,,0
2010-10,5,5323,17,0
2010-11,,,,
2010-12,6,6529,146,0
2013-10,7,9309,157,0
2013-11,8,12317,,0
2023-12,9,100,,0
2024-01,27,2988914,,0
`;

const DEATHS = `月份,登革热,流行性感冒,甲型H1N1流感,人感染高致病性禽流感
2004-01,0,,,
2004-04,0,,,
2005-04,0,,,
2009-02,0,,,
2009-03,0,0,,0
2009-04,0,,,0
2010-10,0,1,0,0
2010-11,,,,
2010-12,0,0,0,0
2013-10,0,0,0,0
2013-11,0,0,,0
2023-12,0,6,,0
2024-01,0,3,,0
`;

const README = `
### 年度数据
[<samp>2009</samp>](http://example.test/year)
### 月度数据
- <samp>2009</samp>:
    [<samp>03</samp>](http://www.nhc.gov.cn/jkj/2009-03.shtml)
  · [<samp>04</samp>](/jkj/s3578/2009-04.shtm)
- <samp>2010</samp>:
    [<samp>11</samp>](http://www.nhc.gov.cn/jkj/2010-11.shtml)
`;

describe("historical notifiable backfill", () => {
  it("keeps reported zeros, skips blank months, and starts flu at the continuous series", () => {
    const historical = buildHistoricalRows({
      caseRows: parseCsv(CASES),
      deathRows: parseCsv(DEATHS),
      links: parseUpstreamLinks(README),
      beforeMonth: "2024-01",
    });
    const dengue = historical.filter((row) => row.disease === "登革热").map((row) => row.month);
    const flu = historical.filter((row) => row.disease === "流行性感冒");
    assert.deepEqual(dengue, [
      "2004-01",
      "2004-04",
      "2005-04",
      "2009-02",
      "2009-03",
      "2009-04",
      "2010-10",
      "2010-12",
      "2013-10",
      "2013-11",
      "2023-12",
    ]);
    assert.equal(historical.find((row) => row.month === "2004-01" && row.disease === "登革热").cases, 0);
    assert.equal(historical.find((row) => row.month === "2004-01" && row.disease === "登革热").deaths, 0);
    assert.deepEqual(
      flu.map((row) => row.month),
      ["2009-03", "2009-04", "2010-10", "2010-12", "2013-10", "2013-11", "2023-12"],
    );
    assert.equal(flu.find((row) => row.month === "2009-03").deaths, 0);
    assert.equal(flu.find((row) => row.month === "2009-04").deaths, null);
    assert.equal(flu.find((row) => row.month === "2009-03").disease_class, "丙类");
    assert.equal(historical.find((row) => row.disease === "登革热").disease_class, "乙类");
    assert.equal(
      historical.some((row) => row.disease === "甲型H1N1流感" || row.disease === "人感染高致病性禽流感"),
      false,
    );
    assert.equal(
      historical.some((row) => row.month === "2010-11" || row.month >= "2024-01" || row.month < "2004-01"),
      false,
    );
    assert.equal(flu.find((row) => row.month === "2009-03").source_url, "http://www.nhc.gov.cn/jkj/2009-03.shtml");
    assert.equal(
      flu.find((row) => row.month === "2009-04").source_url,
      "https://www.nhc.gov.cn/jkj/s3578/2009-04.shtm",
    );
    assert.equal(flu.find((row) => row.month === "2010-10").source_url, STONE_ZENG_CASES_URL);
  });

  it("does not let a compiled row replace an official CDC row", () => {
    const official = [
      {
        month: "2024-01",
        report_date: "2024-02-19",
        disease: "流行性感冒",
        disease_class: "丙类",
        row_kind: "disease",
        cases: 2988914,
        deaths: 3,
        source_url: "https://www.chinacdc.cn/jksj/jksj01/2024.html",
      },
      {
        month: "2024-01",
        report_date: "2024-02-19",
        disease: "手足口病",
        disease_class: "丙类",
        row_kind: "disease",
        cases: 10,
        deaths: 0,
        source_url: "https://www.chinacdc.cn/jksj/jksj01/2024.html",
      },
    ];
    const historical = [
      {
        month: "2024-01",
        report_date: "",
        disease: "流行性感冒",
        disease_class: "丙类",
        row_kind: "disease",
        cases: 1,
        deaths: 1,
        source_url: "http://www.nhc.gov.cn/should-not-win",
      },
      {
        month: "2009-03",
        report_date: "",
        disease: "流行性感冒",
        disease_class: "丙类",
        row_kind: "disease",
        cases: 8015,
        deaths: 0,
        source_url: "http://www.nhc.gov.cn/jkj/2009-03.shtml",
      },
    ];
    const merged = mergeNotifiableBackfill(
      official.map((row) => ({ ...row })),
      historical,
    );
    const flu = merged.find((row) => row.month === "2024-01" && row.disease === "流行性感冒");
    assert.equal(flu.cases, 2988914);
    assert.equal(flu.deaths, 3);
    assert.equal(flu.source_url, "https://www.chinacdc.cn/jksj/jksj01/2024.html");
    assert.equal(merged.filter((row) => row.disease === "手足口病").length, 1);
    assert.equal(merged.find((row) => row.month === "2009-03").cases, 8015);
    assert.deepEqual(
      merged.map((row) => row.month),
      ["2009-03", "2024-01", "2024-01"],
    );
    const again = mergeNotifiableBackfill(merged, historical);
    assert.equal(again.filter((row) => row.month === "2009-03").length, 1);
  });

  it("writes a blank death instead of zero and round-trips it", () => {
    const csv = recordsToCsv([
      {
        month: "2004-02",
        report_date: "",
        disease: "登革热",
        disease_class: "乙类",
        row_kind: "disease",
        cases: 1,
        deaths: null,
        source_url: "http://www.nhc.gov.cn/a",
      },
    ]);
    assert.match(csv, /^reference_date,target_end_date,month,report_date,disease,disease_class,row_kind,cases,deaths,source_url\n/);
    assert.match(csv, /2004-02-01,2004-02-29,2004-02,,登革热,乙类,disease,1,,http:\/\/www\.nhc\.gov\.cn\/a\n$/);
    const [row] = parseNotifiableCsv(csv);
    assert.equal(row.cases, 1);
    assert.equal(row.deaths, null);
  });

  it("keeps a one-month hole as a gap and starts the continuous flu series after long holes", () => {
    assert.deepEqual(calendarMonths("2010-10", "2010-12"), ["2010-10", "2010-11", "2010-12"]);
    const present = calendarMonths("2009-03", "2010-12").filter((month) => month !== "2010-11");
    const hole = seriesCoverage(
      present.map((month) => ({ month, disease: "流行性感冒", deaths: 0 })),
      "流行性感冒",
    );
    assert.equal(hole.continuous_from, "2009-03");
    assert.deepEqual(hole.gaps, ["2010-11"]);
    assert.equal(hole.deaths_missing, undefined);

    const sparse = seriesCoverage(
      [
        { month: "2004-04", disease: "流行性感冒", deaths: null },
        { month: "2005-04", disease: "流行性感冒", deaths: "" },
        { month: "2009-03", disease: "流行性感冒", deaths: 0 },
        { month: "2009-04", disease: "流行性感冒", deaths: 0 },
      ],
      "流行性感冒",
    );
    assert.equal(sparse.continuous_from, "2009-03");
    assert.deepEqual(sparse.gaps, ["2004-05/2005-03", "2005-05/2009-02"]);
    assert.deepEqual(sparse.deaths_missing, ["2004-04", "2005-04"]);
  });

  it("relabels the second 2010-10 row as November only when the bulletin totals match", () => {
    const cases = [
      { 月份: "2010-09", 甲乙丙类传染病总计: "1", 登革热: "1", 流行性感冒: "1" },
      { 月份: "2010-10", 甲乙丙类传染病总计: "509523", 登革热: "80", 流行性感冒: "4121" },
      { 月份: "2010-10", 甲乙丙类传染病总计: "527762", 登革热: "35", 流行性感冒: "5323" },
      { 月份: "2010-12", 甲乙丙类传染病总计: "1", 登革热: "6", 流行性感冒: "6529" },
    ];
    const deaths = [
      { 月份: "2010-09", 甲乙丙类传染病总计: "1", 登革热: "0", 流行性感冒: "0" },
      { 月份: "2010-10", 甲乙丙类传染病总计: "1254", 登革热: "0", 流行性感冒: "0" },
      { 月份: "2010-10", 甲乙丙类传染病总计: "1547", 登革热: "0", 流行性感冒: "1" },
      { 月份: "2010-12", 甲乙丙类传染病总计: "1", 登革热: "0", 流行性感冒: "0" },
    ];
    const fixed = separateMislabeledMonths(cases, deaths);
    assert.deepEqual(fixed.relabeled, [
      { labeled_as: "2010-10", month: "2010-11", cases_total: "527762", deaths_total: "1547" },
    ]);
    assert.deepEqual(fixed.unresolved, []);
    assert.equal(fixed.caseRows.filter((row) => row["月份"] === "2010-10")[0]["流行性感冒"], "4121");
    assert.equal(fixed.caseRows.filter((row) => row["月份"] === "2010-11")[0]["登革热"], "35");
    assert.equal(fixed.deathRows.filter((row) => row["月份"] === "2010-11")[0]["流行性感冒"], "1");

    const mismatched = separateMislabeledMonths(
      cases.map((row, index) => (index === 2 ? { ...row, 甲乙丙类传染病总计: "1" } : row)),
      deaths,
    );
    assert.deepEqual(mismatched.relabeled, []);
    assert.deepEqual(mismatched.unresolved, ["2010-10"]);
    assert.equal(mismatched.caseRows.some((row) => row["月份"] === "2010-10" || row["月份"] === "2010-11"), false);
  });
});

describe("committed flu and dengue history", () => {
  it("matches the continuous source months and leaves the official series untouched", () => {
    const backfill = parseNotifiableCsv(readFileSync(BACKFILL_CSV, "utf8"));
    const all = parseNotifiableCsv(readFileSync(NOTIFIABLE_CSV, "utf8"));
    const meta = JSON.parse(readFileSync(BACKFILL_META, "utf8"));
    assert.equal(meta.official_coverage_starts, "2024-01");
    assert.deepEqual(meta.source_months_missing, []);
    assert.deepEqual(meta.unresolved_duplicate_months, []);
    assert.deepEqual(meta.relabeled_months, [
      { labeled_as: "2010-10", month: "2010-11", cases_total: "527762", deaths_total: "1547" },
    ]);
    assert.deepEqual(meta.overlap_mismatches, []);
    assert.deepEqual(
      meta.omitted_sparse_influenza.map((row) => row.month),
      ["2004-04", "2005-04"],
    );
    assert.ok(meta.omitted_sparse_influenza.every((row) => row.deaths == null && row.cases > 0));
    const lastHistorical = monthBefore(meta.official_coverage_starts);
    for (const spec of BACKFILL_DISEASES) {
      const months = backfill.filter((row) => row.disease === spec.disease).map((row) => row.month);
      const expected = calendarMonths(spec.continuous_from, lastHistorical).filter(
        (month) => !meta.source_months_missing.includes(month),
      );
      assert.deepEqual(months, expected);
    }
    assert.equal(backfill.some((row) => row.month >= "2024-01"), false);
    assert.equal(backfill.filter((row) => row.month === "2010-11").length, 2);
    assert.ok(backfill.every((row) => isCompiledBackfillRow(row)));
    assert.ok(backfill.every((row) => row.cases != null && row.deaths != null));
    assert.equal(all.some((row) => row.month === "2010-11" && row.disease === "登革热"), true);
    const octFlu = all.find((row) => row.month === "2010-10" && row.disease === "流行性感冒");
    const novFlu = all.find((row) => row.month === "2010-11" && row.disease === "流行性感冒");
    const octDengue = all.find((row) => row.month === "2010-10" && row.disease === "登革热");
    const novDengue = all.find((row) => row.month === "2010-11" && row.disease === "登革热");
    assert.equal(octFlu.cases, 4121);
    assert.equal(octFlu.deaths, 0);
    assert.equal(novFlu.cases, 5323);
    assert.equal(novFlu.deaths, 1);
    assert.equal(octDengue.cases, 80);
    assert.equal(novDengue.cases, 35);
    assert.equal(all.some((row) => row.disease === "流行性感冒" && row.month < "2009-03"), false);

    for (const disease of ["流行性感冒", "登革热"]) {
      const official = all.filter((row) => row.disease === disease && row.month >= "2024-01");
      assert.ok(official.some((row) => row.month === "2026-09"));
      assert.ok(official.every((row) => row.source_url.includes("chinacdc.cn") && !isCompiledBackfillRow(row)));
    }
    const other = all.filter(
      (row) => row.disease !== "登革热" && row.disease !== "流行性感冒" && row.row_kind === "disease",
    );
    assert.ok(other.every((row) => row.month >= "2024-01"));
    assert.equal(
      all.some((row) => /禽流感|新亚型|H1N1/.test(row.disease) && isCompiledBackfillRow(row)),
      false,
    );
  });

  it("is what the next official sync merges back in", () => {
    const backfill = parseNotifiableCsv(readFileSync(BACKFILL_CSV, "utf8"));
    const all = parseNotifiableCsv(readFileSync(NOTIFIABLE_CSV, "utf8"));
    const official = all.filter((row) => !isCompiledBackfillRow(row));
    const merged = mergeNotifiableBackfill(
      official.map((row) => ({ ...row })),
      backfill,
    );
    assert.equal(merged.length, all.length);
    const key = (row) => `${row.month}|${row.disease}`;
    const before = new Map(all.map((row) => [key(row), row]));
    for (const row of merged) {
      const original = before.get(key(row));
      assert.ok(original, key(row));
      assert.equal(row.cases, original.cases);
      assert.equal(row.deaths, original.deaths);
      assert.equal(row.source_url, original.source_url);
      assert.equal(row.disease_class, original.disease_class);
    }
    assert.equal(recordsToCsv(all), readFileSync(NOTIFIABLE_CSV, "utf8"));
  });
});
