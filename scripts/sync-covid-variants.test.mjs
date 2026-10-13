import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  claimedWeekSpan,
  discoverVariantLinks,
  isoWeekMonday,
  latestBulletinCoverageError,
  parseBulletin,
  unrecognizedBulletinError,
  variantCrawlBlocksSync,
} from "./sync-covid-variants.mjs";

const AUG_2026 = `
<html><body>
<h1>全国新型冠状病毒感染疫情情况（2026年8月）</h1>
<p>2026年第32周（2026年8月3日-8月9日）至第35周（2026年8月24日-8月30日），阳性率分别为21.7%、20.5%、18.2%、15.8%。</p>
<p>三、本土病例病毒变异监测情况。共报送17708例本土病例新冠病毒基因组有效序列。
第32周（2026年8月3日-2026年8月9日）至第35周（2026年8月24日-8月30日）PQ.16.1.1及其亚分支占比分别为90.6%、89.4%、86.9%、88.9%。
见图4。</p>
<p>文件附件：</p>
</body></html>
`;

const SEP_2026 = `
<html><body>
<h1>全国新型冠状病毒感染疫情情况（2026年9月）</h1>
<p>三、本土病例病毒变异监测情况。共报送9000例。
第36周（2026年8月31日-9月6日）至第39周（2026年9月21日-9月27日）PQ.16.1.1及其亚分支占比分别为80.1%、76.4%、71.2%、68.0%。
</p>
<p>建议公众保持防护。</p>
</body></html>
`;

function weeksOf(rows, lineage) {
  return rows.filter((row) => row.lineage === lineage).map((row) => row.week);
}

describe("covid variant bulletin parser", () => {
  it("parses the August 2026 bulletin through week 35", () => {
    const rows = parseBulletin(AUG_2026, "https://example.test/202609/t.html");
    const named = rows.filter((row) => row.lineage === "PQ.16.1.1及其亚分支");
    assert.deepEqual(
      named.map((row) => [row.week, row.week_start, row.share, row.month]),
      [
        [32, "2026-08-03", 90.6, "2026-08"],
        [33, "2026-08-10", 89.4, "2026-08"],
        [34, "2026-08-17", 86.9, "2026-08"],
        [35, "2026-08-24", 88.9, "2026-08"],
      ],
    );
    assert.equal(claimedWeekSpan(AUG_2026).label, "2026-W35");
    assert.equal(latestBulletinCoverageError(AUG_2026, rows), null);
  });

  it("parses a later bulletin past catalog week 2026-W35", () => {
    const rows = parseBulletin(SEP_2026, "https://example.test/202610/t.html");
    const named = rows.filter((row) => row.lineage === "PQ.16.1.1及其亚分支");
    assert.deepEqual(weeksOf(rows, "PQ.16.1.1及其亚分支"), [36, 37, 38, 39]);
    assert.deepEqual(
      named.map((row) => row.share),
      [80.1, 76.4, 71.2, 68],
    );
    assert.ok(named.every((row) => row.week_start > "2026-08-24"));
    assert.equal(named[0].week_start, isoWeekMonday(2026, 36));
    assert.equal(named.at(-1).week_start, isoWeekMonday(2026, 39));
    assert.equal(latestBulletinCoverageError(SEP_2026, rows), null);
  });

  it("keeps a share sentence that sits past the old 1800-character cut", () => {
    const html = `<html><body>
      <h1>全国新型冠状病毒感染疫情情况（2026年9月）</h1>
      <p>变异监测${"测".repeat(1900)}第36周至第39周NB.1.8.1及其亚分支占比分别为11%、22%、33%、44%。</p>
      <p>文件附件</p>
    </body></html>`;
    const rows = parseBulletin(html, "https://example.test/long.html");
    assert.deepEqual(weeksOf(rows, "NB.1.8.1及其亚分支"), [36, 37, 38, 39]);
  });

  it("parses a single-week 占比为 sentence", () => {
    const html = `<html><body>
      <h1>全国新型冠状病毒感染疫情情况（2026年9月）</h1>
      <p>变异监测情况第36周（2026年8月31日-9月6日）XFG及其亚分支占比为62.5%。</p>
    </body></html>`;
    const rows = parseBulletin(html, "https://example.test/one.html");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].lineage, "XFG及其亚分支");
    assert.equal(rows[0].week, 36);
    assert.equal(rows[0].share, 62.5);
    assert.ok(rows[0].week_start > "2026-08-24");
  });

  it("still binds 近4周 shares to the preceding week range", () => {
    const html = `<html><body>
      <h1>全国新型冠状病毒感染疫情情况（2024年7月）</h1>
      <p>第27周至第30周，流感样病例占比分别为4.9%、4.7%、4.5%、4.4%。</p>
      <p>变异监测情况。根据采样日期，近4周JN.1及其亚分支占比分别为60.6%、58.3%、55.2%、56.1%，XDV及其亚分支占比分别为38.8%、40.4%、43.6%、43.4%。</p>
      <p>文件附件</p>
    </body></html>`;
    const rows = parseBulletin(html, "https://example.test/202408/t.html");
    assert.deepEqual(weeksOf(rows, "JN.1及其亚分支"), [27, 28, 29, 30]);
    assert.deepEqual(weeksOf(rows, "XDV及其亚分支"), [27, 28, 29, 30]);
  });
});

describe("silent variant stall", () => {
  it("flags a bulletin whose week range was not turned into shares", () => {
    const html = `<html><body>
      <h1>全国新型冠状病毒感染疫情情况（2026年9月）</h1>
      <p>变异监测情况第36周至第39周PQ.16.1.1及其亚分支占比依次为80%、76%、71%、68%。</p>
    </body></html>`;
    const rows = parseBulletin(html, "https://example.test/202610/t.html");
    assert.equal(rows.length, 0);
    const error = latestBulletinCoverageError(html, rows, "https://example.test/202610/t.html");
    assert.match(error, /claims 2026-W39/);
    assert.match(error, /stop at none/);
    assert.equal(variantCrawlBlocksSync({ crawl: "skipped", error }), true);
  });

  it("does not block a crawl that already covers the claimed week", () => {
    const rows = parseBulletin(AUG_2026, "https://example.test/202609/t.html");
    assert.equal(latestBulletinCoverageError(AUG_2026, rows), null);
    assert.equal(variantCrawlBlocksSync({ crawl: "ok", error: null }), false);
  });

  it("does not block an unrelated fetch failure", () => {
    assert.equal(
      variantCrawlBlocksSync({
        crawl: "skipped",
        error: "https://www.chinacdc.cn/jksj/xgbdyq/ -> HTTP 503",
      }),
      false,
    );
  });

  it("recognizes a bulletin link that is not prefixed with ./", () => {
    const html = `
      <a href="202610/t20261012_1.html">全国新型冠状病毒感染疫情情况（2026年9月）<span>2026-10-12</span></a>
      <a href="../../mzsm/202410/t20241028_302192.html">版权与免责声明</a>
    `;
    const links = discoverVariantLinks(html, "https://www.chinacdc.cn/jksj/xgbdyq/");
    assert.deepEqual(
      links.map((link) => [link.month, link.url]),
      [["2026-09", "https://www.chinacdc.cn/jksj/xgbdyq/202610/t20261012_1.html"]],
    );
    assert.equal(unrecognizedBulletinError(html, "https://www.chinacdc.cn/jksj/xgbdyq/"), null);
  });

  it("fails when the listing shows a newer month without a fetchable href", () => {
    const html = `
      <a href="./202609/t20260918_1840296.html">全国新型冠状病毒感染疫情情况（2026年8月）</a>
      <a href="javascript:void(0)">全国新型冠状病毒感染疫情情况（2026年9月）</a>
    `;
    const error = unrecognizedBulletinError(html, "https://www.chinacdc.cn/jksj/xgbdyq/");
    assert.match(error, /2026-09/);
    assert.match(error, /no fetchable link/);
    assert.equal(variantCrawlBlocksSync({ crawl: "skipped", error }), true);
  });
});
