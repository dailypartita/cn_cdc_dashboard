import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bulletinWeekKey,
  discoverLinks,
  sentinelCoverageError,
  unrecognizedSentinelWeekError,
  weekKeyFromTitle,
} from "./sync-sentinel.mjs";

const BASE = "https://www.chinacdc.cn/jksj/jksj04_14275/";

const LISTING = `
<ul>
  <li><a href="./202611/t20261105_1842736.html" target="_blank">全国急性呼吸道传染病哨点监测情况（2026年第44周）</a></li>
  <li><a href="./202610/t20261029_1842566.html" target="_blank"><span>全国急性呼吸道传染病哨点监测情况（2026年第43周）</span></a></li>
  <li><a href='./202610/t20261022_1842412.html'>全国急性呼吸道传染病哨点监测情况（2026年第42周）</a></li>
</ul>
`;

function row(year, week) {
  return { year, report_week: week, reference_date: "2026-10-26", pathogen: "流感病毒" };
}

describe("sentinel listing coverage", () => {
  it("reads the live anchor shape, nested titles, and single-quoted hrefs", () => {
    const links = discoverLinks(LISTING, BASE);
    assert.deepEqual(
      links.map((link) => weekKeyFromTitle(link.title)),
      ["2026-W44", "2026-W43", "2026-W42"],
    );
    assert.equal(
      links[0].href,
      "https://www.chinacdc.cn/jksj/jksj04_14275/202611/t20261105_1842736.html",
    );
    assert.equal(unrecognizedSentinelWeekError(LISTING, BASE), null);
  });

  it("fails when the newest week is named but not inside a bulletin link", () => {
    const html = `
      <p>全国急性呼吸道传染病哨点监测情况（2026年第44周）</p>
      <a href="./202610/t20261029_1842566.html">全国急性呼吸道传染病哨点监测情况（2026年第43周）</a>
    `;
    assert.match(
      unrecognizedSentinelWeekError(html, BASE),
      /2026-W44 but no fetchable bulletin link/,
    );
  });

  it("fails when parsed rows stop behind the listing week", () => {
    const rows = [row(2026, 43)];
    const error = sentinelCoverageError("2026-W44", rows, "https://example.test/w44.html");
    assert.match(error, /listing has 2026-W44 but parsed rows stop at 2026-W43/);
    assert.match(error, /w44\.html/);
    assert.equal(bulletinWeekKey(row(2026, 44)), "2026-W44");
  });

  it("passes when the listing week is in the parsed rows", () => {
    assert.equal(sentinelCoverageError("2026-W44", [row(2026, 43), row(2026, 44)]), null);
  });
});
