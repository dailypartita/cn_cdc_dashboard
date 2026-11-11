import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  CNIC_BACKFILL_CSV,
  CNIC_CSV,
  ZENODO_EXTRACT,
  assembleCnicRows,
  blankCnicRow,
  cnicCoverage,
  isoWeekNumberFromDate,
  isoWeekRange,
  mergeCnicPreferIncoming,
  parseCnicCsv,
  parseReportText,
  recordsToCsv,
  weekKeyOf,
} from "./cnic-weekly.mjs";

const HTML_2016 = `
<p>发布时间：2016-10-31</p>
<p>2016年第41周，南方省份哨点医院报告的流感样病例占门急诊病例总数百分比（ILI%）为2.5%，低于前一周水平（2.9%）。</p>
<p>2016年第41周，北方省份哨点医院报告的ILI%为2.5%，低于前一周水平（2.9%）。</p>
<p>全国流感监测网络实验室共检测流感样病例监测标本5444份，流感病毒阳性标本287份（5.3%），其中，A型流感275份（95.8%），B型流感12份（4.2%）。</p>
<p>第41周，南方省份流感检测阳性率为9.1%，略高于前一周（8.9%）；北方省份流感检测阳性率为1.0%。</p>
<table>
<tr><td><p>检测数</p></td><td><p>2881</p></td><td><p>2563</p></td><td><p>5444</p></td></tr>
<tr><td><p>阳性数（%）</p></td><td><p>262(9.1%)</p></td><td><p>25(1.0%)</p></td><td><p>287(5.3%)</p></td></tr>
<tr><td><p>A型</p></td><td><p>250(95.4%)</p></td><td><p>25(100%)</p></td><td><p>275(95.8%)</p></td></tr>
<tr><td><p>季节性A(H3N2)</p></td><td><p>250(100%)</p></td><td><p>19(76.0%)</p></td><td><p>269(97.8%)</p></td></tr>
<tr><td><p>甲型(H1N1)</p></td><td><p>0(0)</p></td><td><p>6(24.0%)</p></td><td><p>6(2.2%)</p></td></tr>
<tr><td><p>A(unsubtyped)</p></td><td><p>0(0)</p></td><td><p>0(0)</p></td><td><p>0(0)</p></td></tr>
<tr><td><p>B型</p></td><td><p>12(4.6%)</p></td><td><p>0(0)</p></td><td><p>12(4.2%)</p></td></tr>
<tr><td><p>B未分系</p></td><td><p>2(16.7%)</p></td><td><p>0(0)</p></td><td><p>2(16.7%)</p></td></tr>
<tr><td><p>Victoria</p></td><td><p>7(58.3%)</p></td><td><p>0(0)</p></td><td><p>7(58.3%)</p></td></tr>
<tr><td><p>Yamagata</p></td><td><p>3(25.0%)</p></td><td><p>0(0)</p></td><td><p>3(25.0%)</p></td></tr>
</table>
`;

const PROSE_2012 = `
2012年第20周，南方省份哨点医院ILI%为3.4%，高于2012年第19周（3.3%）；北方省份哨点医院ILI%为2.6%，与2012年第19周（2.6%）持平。
2012年第20周，全国流感监测网络实验室共检测1112份标本，其中流感病毒阳性标本108份（9.7%）。
第20周，南方省份流感检测阳性率为11.0%；北方省份流感检测阳性率为1.9%。
`;

const SPLIT_2009 = `
第36周，南方片内科诊室ILI%（3.5%），超过其前各周水平；南方片儿内科监测诊室ILI%（7.2%）高于第35周（7.0%）。
第36周，北方片内科监测诊室ILI%（3.5%）；北方片儿内科监测诊室第36周（8.6%）。
南、北方片第36周标本检测阳性率分别为42.9%、18.1%。
`;

const NORTH_ZERO = `
2011年第40周，南方省份哨点医院ILI%为3.2%；北方省份哨点医院ILI%为3.4%。
南方省份流感检测阳性率为5.1%，与前一周（3.2%）相比有所上升；北方省份未检测到流感病毒阳性标本，与前一周（1.0%）相比有所下降。
`;

const PDF_2026 = `
2026年第44周（2026年10月26日－2026年11月1日），南方省份哨点医院报告的ILI%为4.8%，高于前一周水平（4.5%）。
2026年第44周，北方省份哨点医院报告的ILI%为3.3%，高于前一周水平（3.0%）。
共检测20514份。南方省份检测到1796份流感病毒阳性标本。北方省份检测到756份流感病毒阳性标本。
全国共报告106起流感样病例暴发疫情。
检测数 10481 10033 20514
阳性数(%) 1796(17.1%) 756(7.5%) 2552(12.4%)
A型 1059(59.0%) 611(80.8%) 1670(65.4%)
A(H1N1)pdm09 341(32.2%) 514(84.1%) 855(51.2%)
A(H3N2) 718(67.8%) 97(15.9%) 815(48.8%)
A(unsubtyped) 0 0 0
B型 737(41.0%) 145(19.2%) 882(34.6%)
B未分系 0 0 0
Victoria 737(100.0%) 145(100.0%) 882(100.0%)
Yamagata 0 0 0
`;

describe("CNIC weekly report parser", () => {
  it("maps ISO week 2026-W44 onto the sentinel Monday", () => {
    assert.deepEqual(isoWeekRange(2026, 44), {
      reference_date: "2026-10-26",
      target_end_date: "2026-11-01",
    });
    assert.equal(isoWeekNumberFromDate("2026-10-26"), 44);
    assert.equal(weekKeyOf(2026, 44), "2026-W44");
  });

  it("reads the 2016 HTML table as south, north, and national counts", () => {
    const row = parseReportText(HTML_2016, { year: 2016, week: 41, extract: "cnic-html" });
    assert.equal(row.reference_date, "2016-10-10");
    assert.equal(row.ili_south, 2.5);
    assert.equal(row.ili_north, 2.5);
    assert.equal(row.positivity_south, 9.1);
    assert.equal(row.positivity_north, 1);
    assert.equal(row.positivity_national, 5.3);
    assert.equal(row.tests_national, 5444);
    assert.equal(row.positives_national, 287);
    assert.equal(row.h3_national, 269);
    assert.equal(row.h1_national, 6);
    assert.equal(row.h1_south, 0);
    assert.equal(row.bvic_national, 7);
    assert.equal(row.byam_national, 3);
    assert.equal(row.a_unsub_national, 0);
    assert.equal(row.ili_extract, "cnic-html");
    assert.equal(row.lab_extract, "cnic-html");
    assert.equal(row.publish_date, "2016-10-31");
  });

  it("reads prose-only weeks and does not treat clinic-split ILI% as 哨点医院 ILI%", () => {
    const prose = parseReportText(PROSE_2012, { year: 2012, week: 20, extract: "cnic-html" });
    assert.equal(prose.ili_south, 3.4);
    assert.equal(prose.ili_north, 2.6);
    assert.equal(prose.positivity_south, 11);
    assert.equal(prose.positivity_north, 1.9);
    assert.equal(prose.tests_national, 1112);
    assert.equal(prose.positives_national, 108);
    assert.equal(prose.positivity_national, 9.7);

    const early = parseReportText(SPLIT_2009, { year: 2009, week: 36, extract: "cnic-html" });
    assert.equal(early.ili_south, null);
    assert.equal(early.ili_north, null);
    assert.equal(early.positivity_south, 42.9);
    assert.equal(early.positivity_north, 18.1);
    assert.equal(early.ili_extract, "");
    assert.equal(early.lab_extract, "cnic-html");
  });

  it("reads paired and 诊室 ILI% as one south and one north value", () => {
    const paired = parseReportText(
      "2011年第14周，南、北方省份哨点医院ILI%分别为3.2%、3.3%。南方省份第14周流感检测阳性率为13.8%。北方省份第14周流感检测阳性率为7.9%。",
      { year: 2011, week: 14, extract: "cnic-html" },
    );
    assert.equal(paired.ili_south, 3.2);
    assert.equal(paired.ili_north, 3.3);
    assert.equal(paired.positivity_south, 13.8);
    assert.equal(paired.positivity_north, 7.9);
    const clinic = parseReportText(
      "2012年第43周，南方省份哨点医院报告的诊室ILI%为2.3%；北方省份哨点医院ILI%为2.9%。",
      { year: 2012, week: 43, extract: "cnic-html" },
    );
    assert.equal(clinic.ili_south, 2.3);
    assert.equal(clinic.ili_north, 2.9);
    const split = parseReportText(
      "南方省份哨点医院内科诊室ILI%（1.3%）；儿内科监测诊室ILI%（4.7%）。北方省份内科监测诊室ILI%（1.2%）。共检测3873份标本，其中流感病毒阳性标本850份，占21.9%。",
      { year: 2010, week: 13, extract: "cnic-html" },
    );
    assert.equal(split.ili_south, null);
    assert.equal(split.ili_north, null);
    assert.equal(split.positivity_national, 21.9);
  });

  it("accepts the 2013 wording that names 2005 sentinel hospitals", () => {
    const row = parseReportText(
      "2013年第10周，南方省份2005年设立的哨点医院报告的流感样病例占门急诊病例总数百分比（ILI%）为2.7%，高于前一周（2.4%）。2013年第10周，北方省份2005年设立的哨点医院ILI%为3.4%。共检测2164份标本，其中流感病毒阳性标本262份（12.1%）。南方省份流感检测阳性率为13.9%；北方省份流感检测阳性率为7.9%。",
      { year: 2013, week: 10, extract: "cnic-html" },
    );
    assert.equal(row.ili_south, 2.7);
    assert.equal(row.ili_north, 3.4);
    assert.equal(row.positivity_south, 13.9);
    assert.equal(row.positivity_national, 12.1);
  });

  it("keeps an explicit northern zero", () => {
    const row = parseReportText(NORTH_ZERO, { year: 2011, week: 40, extract: "cnic-html" });
    assert.equal(row.ili_south, 3.2);
    assert.equal(row.ili_north, 3.4);
    assert.equal(row.positivity_south, 5.1);
    assert.equal(row.positivity_north, 0);
    assert.equal(row.positives_north, 0);
  });

  it("derives national positivity when the report prints both counts", () => {
    const row = parseReportText(
      "共检测流感样病例监测标本6248份。南方省份检测到239份流感病毒阳性标本，均为B型。北方省份检测到19份流感病毒阳性标本。",
      { year: 2021, week: 30, extract: "cnic-pdf" },
    );
    assert.equal(row.tests_national, 6248);
    assert.equal(row.positives_south, 239);
    assert.equal(row.positives_north, 19);
    assert.equal(row.positives_national, 258);
    assert.equal(row.positivity_national, 4.1);
    assert.equal(row.positivity_south, null);
  });

  it("reads a PDF percent that has a space before the sign", () => {
    const row = parseReportText(
      "检测数 10720 9709 20429\n阳性数(%) 1933(18.0 %) 480(4.9%) 2413(11.8%)\n",
      { year: 2026, week: 43, extract: "cnic-pdf" },
    );
    assert.equal(row.positivity_south, 18);
    assert.equal(row.positivity_north, 4.9);
    assert.equal(row.positivity_national, 11.8);
    assert.equal(row.positives_national, 2413);
    assert.equal(row.tests_national, 20429);
  });

  it("reads a text-layer PDF table without using subtype percents as positivity", () => {
    const row = parseReportText(PDF_2026, { year: 2026, week: 44, extract: "cnic-pdf" });
    assert.equal(row.ili_south, 4.8);
    assert.equal(row.ili_north, 3.3);
    assert.equal(row.tests_south, 10481);
    assert.equal(row.tests_national, 20514);
    assert.equal(row.positivity_south, 17.1);
    assert.equal(row.positivity_north, 7.5);
    assert.equal(row.positivity_national, 12.4);
    assert.equal(row.positives_national, 2552);
    assert.equal(row.h1_national, 855);
    assert.equal(row.h3_national, 815);
    assert.equal(row.bvic_national, 882);
    assert.equal(row.byam_national, 0);
    assert.equal(row.outbreaks, 106);
    assert.equal(row.lab_extract, "cnic-pdf");
  });
});

describe("CNIC backfill merge", () => {
  it("lets an official value replace Zenodo and keeps weeks the crawl did not return", () => {
    const zenodo = [
      {
        ...parseReportText("南方省份哨点医院ILI%为1.0%。北方省份哨点医院ILI%为1.1%。", {
          year: 2019,
          week: 7,
          extract: ZENODO_EXTRACT,
        }),
        ili_extract: ZENODO_EXTRACT,
        source_url: "https://example.test/zenodo",
      },
      parseReportText("南方省份哨点医院ILI%为2.5%。北方省份哨点医院ILI%为2.5%。", {
        year: 2016,
        week: 41,
        extract: ZENODO_EXTRACT,
        source_url: "https://example.test/2016",
      }),
    ];
    zenodo[1].ili_extract = ZENODO_EXTRACT;
    const official = [
      parseReportText("南方省份哨点医院ILI%为4.0%。北方省份哨点医院ILI%为3.4%。", {
        year: 2019,
        week: 7,
        extract: "cnic-html",
        source_url: "https://ivdc.chinacdc.cn/2019w07.htm",
      }),
    ];
    const merged = mergeCnicPreferIncoming(zenodo, official);
    const week = merged.find((row) => row.year === 2019 && row.week === 7);
    assert.equal(week.ili_south, 4);
    assert.equal(week.ili_north, 3.4);
    assert.equal(week.ili_extract, "cnic-html");
    assert.equal(week.source_url, "https://ivdc.chinacdc.cn/2019w07.htm");
    assert.equal(
      merged.some((row) => row.year === 2016 && row.week === 41 && row.ili_south === 2.5),
      true,
    );
  });

  it("does not let a null in a short crawl erase a stored ILI%", () => {
    const backfill = [
      parseReportText(HTML_2016, { year: 2016, week: 41, extract: "cnic-html", source_url: "https://ivdc.chinacdc.cn/2016" }),
    ];
    const fresh = [
      { ...blankCnicRow({ year: 2016, week: 41, extract: "cnic-html" }), outbreaks: 4 },
      parseReportText(PDF_2026, { year: 2026, week: 44, extract: "cnic-pdf", source_url: "https://ivdc.chinacdc.cn/2026" }),
    ];
    const merged = assembleCnicRows({ backfill, existing: [], fresh });
    const old = merged.find((row) => row.year === 2016);
    const latest = merged.find((row) => row.year === 2026);
    assert.equal(old.ili_south, 2.5);
    assert.equal(old.positivity_national, 5.3);
    assert.equal(old.outbreaks, 4);
    assert.equal(old.ili_extract, "cnic-html");
    assert.equal(latest.ili_south, 4.8);
    assert.equal(latest.positivity_national, 12.4);
    const again = assembleCnicRows({ backfill: merged, existing: [], fresh: [] });
    assert.equal(again.length, 2);
    assert.equal(again.find((row) => row.year === 2016).ili_south, 2.5);
  });

  it("round-trips explicit zeros", () => {
    const row = parseReportText(NORTH_ZERO, { year: 2011, week: 40, extract: "cnic-html" });
    const [parsed] = parseCnicCsv(recordsToCsv([row]));
    assert.equal(parsed.positivity_north, 0);
    assert.equal(parsed.positives_north, 0);
    assert.equal(parsed.ili_south, 3.2);
  });
});

describe("committed CNIC series", () => {
  it("keeps a weekly flu history earlier than the 2024-W46 sentinel line", () => {
    const rows = parseCnicCsv(readFileSync(CNIC_CSV, "utf8"));
    const backfill = parseCnicCsv(readFileSync(CNIC_BACKFILL_CSV, "utf8"));
    const coverage = cnicCoverage(rows);
    assert.ok(coverage.ili.reference_date <= "2012-01-02");
    assert.equal(coverage.ili.last_key, "2026-W44");
    assert.ok(coverage.ili.weeks >= 700);
    assert.ok(coverage.positivity.reference_date <= "2012-01-02");
    assert.equal(coverage.positivity.last_key, "2026-W44");
    const latest = rows.find((row) => row.year === 2026 && row.week === 44);
    assert.equal(latest.reference_date, "2026-10-26");
    assert.equal(latest.ili_south, 4.8);
    assert.equal(latest.ili_north, 3.3);
    assert.equal(latest.positivity_south, 17.1);
    assert.equal(latest.positivity_north, 7.5);
    assert.equal(latest.positivity_national, 12.4);
    assert.equal(latest.h1_national, 855);
    assert.equal(latest.byam_national, 0);
    const week41 = rows.find((row) => row.year === 2016 && row.week === 41);
    assert.equal(week41.ili_south, 2.5);
    assert.equal(week41.positivity_national, 5.3);
    assert.equal(week41.tests_national, 5444);
    const restored = assembleCnicRows({
      backfill,
      existing: rows.filter((row) => row.year === 2026),
      fresh: [],
    });
    assert.equal(restored.find((row) => row.year === 2016 && row.week === 41).ili_south, 2.5);
    assert.equal(restored.find((row) => row.year === 2026 && row.week === 44).ili_south, 4.8);
  });

  it("does not rewrite the sentinel or COVID ILI files", () => {
    const sentinel = readFileSync(new URL("../data/cncdc_surveillance_all.csv", import.meta.url), "utf8");
    const covid = readFileSync(new URL("../data/cncdc_surveillance_covid19.csv", import.meta.url), "utf8");
    const sentinelDates = [...sentinel.matchAll(/^(\d{4}-\d{2}-\d{2}),/gm)].map((match) => match[1]);
    const covidLines = covid.trim().split(/\n/).slice(1);
    assert.equal(sentinelDates.sort()[0], "2024-11-11");
    assert.equal(covidLines.at(-1).startsWith("2022-12-05,2022-12-11,49,新型冠状病毒,9.7,"), true);
    assert.equal(covid.includes("2022-11-"), false);
  });
});
