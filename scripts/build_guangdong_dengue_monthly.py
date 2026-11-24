#!/usr/bin/env python3
"""Build an official Guangdong monthly dengue case file.

Reads Guangdong CDC and Health Commission bulletin pages only.
Does not modify data/time-series.csv and does not fill missing months.
"""

from __future__ import annotations

import csv
import hashlib
import io
import re
import time
import zipfile
from dataclasses import dataclass, field
from datetime import date
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import Request, urlopen
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
RAW = DATA / "raw" / "guangdong_dengue_reports"
PROCESSED = DATA / "processed" / "guangdong_dengue_monthly.csv"
SOURCES = DATA / "metadata" / "guangdong_dengue_sources.csv"
DOC_DICT = ROOT / "docs" / "guangdong_monthly_data_dictionary.md"
DOC_QC = ROOT / "docs" / "guangdong_monthly_data_quality_report.md"
NATIONAL = DATA / "time-series.csv"

UA = {"User-Agent": "GZNL-dengue-research/1.0"}
W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
RETRIEVED = date.today().isoformat()

MONTH_WINDOW = re.compile(
    r"(20\d{2})年(\d{1,2})月（(?:\1年)?\2月1日"
)
ANNUAL_WINDOW = re.compile(
    r"(20\d{2})年（\1年1月1日[^）]{0,16}12月31日"
)
TITLE_MONTH = re.compile(r"(20\d{2})年(\d{1,2})月")
POST_ID = re.compile(r"post_(\d+)")


@dataclass
class Hit:
    month: str
    cases: int | None
    kind: str
    definition: str
    title: str
    url: str
    source_file: str
    source_page: str
    publish_date: str
    notes: str = ""
    confirmed: bool = False


@dataclass
class SourceRow:
    title: str
    publish_date: str
    url: str
    file_path: str
    months_covered: str
    extract_method: str
    verification_status: str
    notes: str = ""


def fetch_bytes(url: str) -> bytes:
    req = Request(url, headers=UA)
    with urlopen(req, timeout=40) as resp:
        return resp.read()


def clean(text: str) -> str:
    return re.sub(r"\s+", "", text.replace("\u00a0", "").replace("\xa0", ""))


def parse_int(text: str) -> int | None:
    token = clean(text).replace(",", "").replace("，", "")
    if re.fullmatch(r"\d+", token):
        return int(token)
    return None


class HtmlTables(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.skip = 0
        self.in_table = 0
        self.in_cell = False
        self.cell: list[str] = []
        self.row: list[str] | None = None
        self.rows: list[list[str]] | None = None
        self.context: list[str] = []
        self.tables: list[tuple[str, list[list[str]]]] = []

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag in {"script", "style"}:
            self.skip += 1
            return
        if self.skip:
            return
        if tag == "table":
            if self.in_table == 0:
                self.rows = []
            self.in_table += 1
        elif tag == "tr" and self.in_table:
            self.row = []
        elif tag in {"td", "th"} and self.row is not None:
            self.in_cell = True
            self.cell = []

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style"} and self.skip:
            self.skip -= 1
            return
        if self.skip:
            return
        if tag in {"td", "th"} and self.in_cell:
            self.row.append(" ".join("".join(self.cell).split()))
            self.in_cell = False
        elif tag == "tr" and self.row is not None:
            if any(cell.strip() for cell in self.row):
                self.rows.append(self.row)
            self.row = None
        elif tag == "table" and self.in_table:
            self.in_table -= 1
            if self.in_table == 0 and self.rows is not None:
                ctx = re.sub(r"\s+", " ", "".join(self.context))[-500:]
                self.tables.append((ctx, self.rows))
                self.rows = None
                self.context = []

    def handle_data(self, data: str) -> None:
        if self.skip:
            return
        if self.in_cell:
            self.cell.append(data)
        elif self.in_table == 0:
            self.context.append(data)


def docx_blocks(data: bytes) -> list[tuple[str, list[list[str]]]]:
    root = ET.fromstring(zipfile.ZipFile(io.BytesIO(data)).read("word/document.xml"))
    body = root.find(f"{{{W_NS}}}body")
    blocks: list[tuple[str, list[list[str]]]] = []
    context: list[str] = []
    if body is None:
        return blocks
    for child in list(body):
        if child.tag == f"{{{W_NS}}}p":
            texts = [t.text or "" for t in child.iter(f"{{{W_NS}}}t")]
            context.append("".join(texts))
        elif child.tag == f"{{{W_NS}}}tbl":
            rows = []
            for tr in child.findall(f"{{{W_NS}}}tr"):
                cells = []
                for tc in tr.findall(f"{{{W_NS}}}tc"):
                    texts = [t.text or "" for t in tc.iter(f"{{{W_NS}}}t")]
                    cells.append("".join(texts).strip())
                if any(cells):
                    rows.append(cells)
            blocks.append((re.sub(r"\s+", " ", "".join(context))[-500:], rows))
            context = []
    return blocks


SPLIT_CASES = re.compile(
    r"登革热本地病例(\d+)例、境外输入病例(\d+)例(?:，省外输入病例(\d+)例)?"
)
ALL_IMPORTED = re.compile(
    r"(?:疟疾、)?登革热(?:确诊)?病例均?为境外输入|登革热、疟疾病例均为境外输入"
)
PARTIAL_LOCAL = re.compile(r"报告(\d+)例登革热本地病例")


def visible_text(html: str) -> str:
    text = html.replace("&nbsp;", " ").replace("\u00a0", " ")
    text = re.sub(r"<script[\s\S]*?</script>", " ", text, flags=re.I)
    text = re.sub(r"<style[\s\S]*?</style>", " ", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", "", text)


def footnote(text: str) -> str:
    idx = text.find("注：")
    if idx < 0:
        idx = text.find("注:")
    if idx < 0:
        return ""
    tail = text[idx : idx + 900]
    for stop in ("健康广东", "网站主办单位", "ICP备案"):
        cut = tail.find(stop)
        if cut > 0:
            tail = tail[:cut]
            break
    return tail


def docx_text(data: bytes) -> str:
    root = ET.fromstring(zipfile.ZipFile(io.BytesIO(data)).read("word/document.xml"))
    text = "".join(node.text or "" for node in root.iter(f"{{{W_NS}}}t"))
    return re.sub(r"\s+", "", text)


def dengue_sentences(note: str) -> str:
    return "。".join(part for part in note.split("。") if "登革热" in part)


def composition(note: str, cases: int | None) -> tuple[str, str]:
    """Definition clause and trace note. Only dengue sentences count."""
    extra = ""
    if "法定传染病病种变更为40种" in note:
        extra = "脚注说明法定传染病目录按2025年修订版调整为40种，登革热仍在表内，未见单独修订登革热统计"
    focused = dengue_sentences(note)

    def pack(clause: str, detail: str = "") -> tuple[str, str]:
        return clause, " ".join(part for part in (detail, extra) if part)

    if not focused:
        return pack("表内未分列本地与输入")
    match = SPLIT_CASES.search(focused)
    if match:
        local, imported = int(match.group(1)), int(match.group(2))
        other = int(match.group(3)) if match.group(3) else 0
        total = local + imported + other
        detail = f"脚注分项：本地{local}，境外输入{imported}"
        if other:
            detail += f"，省外输入{other}"
        if cases is not None and total == cases:
            detail += "，分项合计与本期发病数一致"
        elif cases is not None:
            detail += f"，分项合计{total}，与本期发病数{cases}不一致，月表仍采用本期发病数"
        return pack("脚注分列本地与输入", detail)
    if ALL_IMPORTED.search(focused):
        return pack("脚注写明登革热均为境外输入", "脚注：登革热病例均为境外输入")
    partial = PARTIAL_LOCAL.search(focused)
    if partial:
        number = int(partial.group(1))
        if cases is not None and number == cases:
            return pack("脚注写明均为本地病例", f"脚注：{number}例登革热本地病例，与本期发病数一致")
        remain = ""
        if cases is not None:
            remain = f"，其余{cases - number}例未说明，未把差额记为输入病例"
        return pack("脚注未给出完整本地与输入分项", f"脚注只写明{number}例登革热本地病例{remain}")
    return pack("表内未分列本地与输入")


def build_definition(text: str, cases: int | None) -> tuple[str, str]:
    note = footnote(text)
    parts = ["当月报告发病数"]
    if "中国疾病预防控制信息系统" in note:
        parts.append("中国疾病预防控制信息系统")
    if "系统默认的统计规则为按现住址" in note:
        parts.append("按现住址统计")
    if "不包括港澳台和外籍" in note or "不含港澳台和外籍" in note:
        parts.append("不含港澳台和外籍")
    if "临床病例和确诊病例" in note or "确诊和临床诊断" in note or "临床诊断病例" in note:
        parts.append("含临床诊断和确诊病例")
    if "不包括病原携带者" in note or "不含病原携带者" in note:
        parts.append("不含病原携带者")
    clause, extra = composition(note, cases)
    parts.append(clause)
    return "；".join(parts), extra


def annual_note(rows: list[list[str]]) -> str | None:
    if not rows:
        return None
    head = "".join(clean(cell) for row in rows[:3] for cell in row)
    if "同期" not in head or "本期发病" in head:
        return None
    years = re.findall(r"20\d{2}年", "".join(rows[0]))
    for row in rows:
        if not any(clean(cell) == "登革热" for cell in row):
            continue
        values = [parse_int(cell) for cell in row[1:]]
        values = [value for value in values if value is not None]
        if not values:
            return "全年对照表含登革热行，但未读出整数，未写入月表"
        bits = []
        for index, number in enumerate(values[:2]):
            label = years[index] if index < len(years) else f"对照列{index + 1}"
            bits.append(f"{label}登革热发病数{number}")
        return "全年对照表未写入月表：" + "；".join(bits)
    return "全年对照表未找到登革热行，未写入月表"


def window_before(context: str) -> tuple[str, str] | None:
    """Return (kind, YYYY-MM or YYYY) for the last explicit window."""
    annual = list(ANNUAL_WINDOW.finditer(context))
    monthly = list(MONTH_WINDOW.finditer(context))
    last_annual = annual[-1].start() if annual else -1
    last_monthly = monthly[-1].start() if monthly else -1
    if last_monthly < 0 and last_annual < 0:
        return None
    if last_monthly > last_annual:
        year, month = monthly[-1].group(1), int(monthly[-1].group(2))
        return "monthly", f"{year}-{month:02d}"
    return "annual", annual[-1].group(1)


def dengue_from_table(rows: list[list[str]]) -> tuple[int | None, str]:
    header_idx = None
    for i, row in enumerate(rows[:4]):
        joined = "".join(row)
        if "发病" in joined and ("病种" in joined or "疾病" in joined):
            header_idx = i
            break
    if header_idx is None:
        return None, "no-header"
    header = [clean(cell) for cell in rows[header_idx]]
    if any("同期" in cell for cell in header):
        kind = "annual"
    elif any("本期发病" in cell for cell in header):
        kind = "monthly"
    else:
        kind = "unknown"
    case_idx = None
    for i, cell in enumerate(header):
        if "本期发病" in cell or cell == "发病数":
            case_idx = i
            break
    target = None
    for row in rows[header_idx + 1 :]:
        if any(clean(cell) == "登革热" for cell in row):
            target = row
            break
    if target is None or case_idx is None or case_idx >= len(target):
        return None, kind
    return parse_int(target[case_idx]), kind


def prose_zero(text: str) -> bool:
    return bool(re.search(r"除[^。]{0,180}登革热[^。]{0,80}无发病", text))


def crawl() -> list[tuple[str, str, str, str]]:
    found: list[tuple[str, str, str, str]] = []
    listings = []
    for i in [0, *range(2, 27)]:
        name = "index.html" if i == 0 else f"index_{i}.html"
        listings.append(("https://wsjkw.gd.gov.cn/zwyw_yqxx/" + name, "wsjkw"))
    listings.append(("https://cdcp.gd.gov.cn/zwgk/sjfb/index.html", "cdcp"))
    listings.append(("https://cdcp.gd.gov.cn/zwgk/yqxx/index.html", "cdcp"))
    for url, _site in listings:
        try:
            html = fetch_bytes(url).decode("utf-8", "replace")
        except Exception as exc:
            print(f"listing fail {url}: {exc}")
            continue
        time.sleep(0.3)
        for href, title in re.findall(r'<a href="(https://[^"]+)" title="([^"]+)"', html):
            if "传染病" not in title or "突发" in title:
                continue
            if "post_" not in href:
                continue
            found.append((href, title, "", url))
    # Publish dates sit in the listing markup, not always inside the same tag.
    dated: list[tuple[str, str, str, str]] = []
    seen: set[str] = set()
    for href, title, _pub, listing in found:
        if href in seen:
            continue
        seen.add(href)
        dated.append((href, title, "", listing))
    # Second pass: attach the listing time by title.
    pub_by_title: dict[str, str] = {}
    for url, _site in listings:
        try:
            html = fetch_bytes(url).decode("utf-8", "replace")
        except Exception:
            continue
        for title, pub in re.findall(
            r'title="([^"]*传染病[^"]*)"[\s\S]{0,180}?class="time">(\d{4}-\d{2}-\d{2})',
            html,
        ):
            pub_by_title.setdefault(title, pub)
        time.sleep(0.2)
    return [(h, t, pub_by_title.get(t, ""), listing) for h, t, _, listing in dated]


def save_raw(url: str, payload: bytes, suffix: str) -> Path:
    RAW.mkdir(parents=True, exist_ok=True)
    post = POST_ID.search(url)
    stem = post.group(1) if post else hashlib.sha256(url.encode()).hexdigest()[:12]
    path = RAW / f"{stem}{suffix}"
    # Avoid clobbering a different attachment that shares the post id.
    if path.exists() and path.read_bytes() != payload:
        digest = hashlib.sha256(payload).hexdigest()[:8]
        path = RAW / f"{stem}_{digest}{suffix}"
    path.write_bytes(payload)
    return path


def extract_page(url: str, title: str, publish_date: str) -> tuple[list[Hit], SourceRow]:
    html_bytes = fetch_bytes(url)
    time.sleep(0.35)
    html = html_bytes.decode("utf-8", "replace")
    page_text = visible_text(html)
    found_date = re.search(r"时间[:：](20\d{2}-\d{2}-\d{2})", page_text)
    if found_date:
        publish_date = found_date.group(1)
    html_path = save_raw(url, html_bytes, ".html")
    rel_html = html_path.relative_to(ROOT).as_posix()
    parser = HtmlTables()
    parser.feed(html)
    hits: list[Hit] = []
    notes: list[str] = []
    methods: list[str] = []

    def add_hit(month: str, cases: int | None, page: str, src: str, source_text: str) -> None:
        if month is None or cases is None:
            return
        definition, extra = build_definition(source_text, cases)
        hits.append(
            Hit(
                month=month,
                cases=cases,
                kind="monthly",
                definition=definition,
                title=title,
                url=url,
                source_file=src,
                source_page=page,
                publish_date=publish_date,
                notes=extra,
                confirmed=False,
            )
        )

    def monthly_window(ctx: str, rows: list[list[str]], fallback_text: str) -> str | None:
        window = window_before(ctx) or window_before(fallback_text) or window_before(title)
        if window and window[0] == "monthly":
            return window[1]
        months = TITLE_MONTH.findall(title)
        if len(months) == 1 and any("本期发病" in "".join(row) for row in rows[:3]):
            return f"{months[0][0]}-{int(months[0][1]):02d}"
        return None

    for ctx, rows in parser.tables:
        excluded = annual_note(rows)
        if excluded:
            notes.append(excluded)
            methods.append("annual-excluded")
            continue
        month = monthly_window(ctx, rows, page_text)
        if month is None:
            continue
        cases, table_kind = dengue_from_table(rows)
        if table_kind != "monthly":
            continue
        add_hit(month, cases, "HTML统计表", rel_html, page_text)
        if cases is not None:
            methods.append("html-table")

    origin = "https://cdcp.gd.gov.cn" if "cdcp.gd.gov.cn" in url else "https://wsjkw.gd.gov.cn"
    for n, href in enumerate(re.findall(r'href="([^"]+\.docx)"', html, flags=re.I), start=1):
        if href.startswith("http"):
            doc_url = href
        elif href.startswith("/"):
            doc_url = origin + href
        else:
            doc_url = origin + "/" + href
        try:
            payload = fetch_bytes(doc_url)
        except Exception as exc:
            notes.append(f"附件下载失败 {doc_url}: {exc}")
            continue
        time.sleep(0.35)
        doc_path = save_raw(doc_url, payload, f"_{n}.docx")
        rel_doc = doc_path.relative_to(ROOT).as_posix()
        try:
            blocks = docx_blocks(payload)
            plain_doc = docx_text(payload)
        except Exception as exc:
            notes.append(f"附件无法解析 {rel_doc}: {exc}")
            continue
        doc_text = " ".join(ctx for ctx, _rows in blocks)
        for ctx, rows in blocks:
            excluded = annual_note(rows)
            if excluded:
                notes.append(excluded)
                methods.append("annual-excluded")
                continue
            month = monthly_window(ctx, rows, doc_text)
            if month is None:
                continue
            cases, table_kind = dengue_from_table(rows)
            if table_kind != "monthly":
                continue
            add_hit(month, cases, f"DOCX附件{n}", rel_doc, plain_doc)
            if cases is not None:
                methods.append("docx-table")

    if not any(h.kind == "monthly" for h in hits) and prose_zero(html):
        months = TITLE_MONTH.findall(title)
        if len(months) == 1:
            hits.append(
                Hit(
                    month=f"{months[0][0]}-{int(months[0][1]):02d}",
                    cases=0,
                    kind="monthly",
                    definition=build_definition(page_text, 0)[0],
                    title=title,
                    url=url,
                    source_file=rel_html,
                    source_page="正文无发病声明",
                    publish_date=publish_date,
                    notes="正文写明登革热无发病",
                )
            )
            methods.append("prose-zero")

    for hit in hits:
        text = Path(ROOT / hit.source_file).read_bytes()
        if hit.source_file.endswith(".html"):
            plain = re.sub(r"<[^>]+>", " ", text.decode("utf-8", "replace"))
        else:
            plain = " ".join(ctx + " " + " ".join(" ".join(r) for r in rows) for ctx, rows in docx_blocks(text))
        plain = re.sub(r"\s+", " ", plain)
        hit.confirmed = any(
            re.match(rf"\D{{0,40}}{hit.cases}(?:\D|$)", plain[match.end() :])
            for match in re.finditer("登革热", plain)
        )

    status = "extracted_monthly" if hits else "no_dengue_figure"
    if any("全年" in n for n in notes) and hits:
        status = "extracted_monthly"
    elif any("全年" in n for n in notes):
        status = "annual_excluded"
    covered = sorted({h.month for h in hits})
    source = SourceRow(
        title=title,
        publish_date=publish_date,
        url=url,
        file_path=rel_html,
        months_covered=";".join(covered),
        extract_method="+".join(sorted(set(methods))) or "none",
        verification_status=status,
        notes=" ".join(notes),
    )
    return hits, source


def month_span(start: str, end: str) -> list[str]:
    year, month = map(int, start.split("-"))
    last_y, last_m = map(int, end.split("-"))
    out = []
    while (year, month) <= (last_y, last_m):
        out.append(f"{year}-{month:02d}")
        month += 1
        if month == 13:
            month = 1
            year += 1
    return out


def compress_months(months: list[str]) -> str:
    if not months:
        return "无"

    def nxt(value: str) -> str:
        year, month = map(int, value.split("-"))
        month += 1
        if month == 13:
            year, month = year + 1, 1
        return f"{year}-{month:02d}"

    spans: list[str] = []
    start = prev = months[0]
    for month in months[1:]:
        if month == nxt(prev):
            prev = month
            continue
        spans.append(start if start == prev else f"{start}至{prev}")
        start = prev = month
    spans.append(start if start == prev else f"{start}至{prev}")
    return "、".join(spans)


def write_docs(rows: list[dict[str, str]], sources: list[SourceRow], conflicts: list[str]) -> None:
    DOC_DICT.parent.mkdir(parents=True, exist_ok=True)
    valued = [r for r in rows if r["cases"] != ""]
    missing = [r for r in rows if r["quality_status"] == "missing"]
    defs = sorted({r["case_definition"] for r in valued})
    peaks = sorted(valued, key=lambda r: int(r["cases"]), reverse=True)[:8]
    DOC_DICT.write_text(
        """# 广东省登革热月度数据字典

本文件说明 `data/processed/guangdong_dengue_monthly.csv`。数据只来自广东省卫生健康委员会和广东省疾病预防控制中心公开发布的法定传染病月报。全国序列 `data/time-series.csv` 没有参与填补。

| 字段 | 含义 |
|---|---|
| month | 统计月，YYYY-MM |
| location | GD，广东省全省 |
| cases | 该月报告发病数。缺失月留空，不用 0、插值或全国数代替 |
| case_definition | 从该月统计表及其表注读到的口径。没有原文的缺失月留空 |
| source_title | 官方页面标题 |
| source_url | 官方页面 URL |
| source_file | 仓库内保存的原始 HTML 或 DOCX |
| source_page | HTML统计表、DOCX附件或正文无发病声明 |
| retrieved_at | 抓取日期 |
| quality_status | verified、verified_zero、conflict、missing、unconfirmed |
| notes | 脚注中的本地/输入分项、目录调整、交叉来源或其他限制 |

`cases` 只取统计表「本期发病数」。它是当月报告发病数，不是年初累计，也不是本地或输入的某一项。

`case_definition` 只采用对整张表有效的表注，例如「系统默认的统计规则为按现住址」「不包括港澳台和外籍」「统计临床病例和确诊病例」「不包括病原携带者」。只针对新冠或疟疾的语句不会套到登革热上。

表注如果写明登革热均为境外输入，或给出本地、境外输入、省外输入的分项，分项数字写入 `notes`，`cases` 仍是表内合计。分项加总与本期发病数不一致时，保留本期发病数，并在 `notes` 写明差额，不改数字。

只提到部分病例、没有给完整分项时，不把差额猜成输入或本地。全年对照表只记在来源清单的备注里，不进入 `cases`。
""",
        encoding="utf-8",
    )
    lines = [
        "# 广东省登革热月度数据质量报告",
        "",
        f"抓取日期：{RETRIEVED}",
        "",
        "## 范围",
        "",
        f"- 有病例数的月份：{len(valued)}",
        f"- 起止：{valued[0]['month'] if valued else '无'} 至 {valued[-1]['month'] if valued else '无'}",
        f"- 该区间内缺失月份：{len(missing)}",
        f"- 官方来源条目：{len(sources)}",
        f"- 数值冲突：{len(conflicts)}",
        "",
        "## 检查",
        "",
        "1. 同一月份在输出中只有一行。冲突月的 `cases` 留空。",
        "2. 非空 `cases` 均为非负整数，并在原始 HTML 或 DOCX 的「登革热」附近再次匹配到同一数字。匹配失败的月份改为 unconfirmed，不写入病例数。",
        "3. 月份在首个有效月和最后有效月之间逐月列出。",
        f"4. 缺失月份：{('、'.join(r['month'] for r in missing)) if missing else '无'}。",
        "5. 发病数最高的月份：",
        "",
    ]
    for row in peaks:
        lines.append(f"   - {row['month']}: {row['cases']}")
    lines += [
        "",
        "6. 口径只摘表注里对整张表有效的语句。只针对新冠、疟疾或其他病种的语句不写入登革热口径。",
        "",
        "### 实际读到的口径",
        "",
    ]
    for item in defs:
        lines.append(f"- {item}")
    lines += [
        "",
        "7. 逐条核验方式：从已保存的原始文件中，在「登革热」后 40 个非数字字符内查找该病例数。未通过的不进入病例数字段。",
        "",
        "## 表注里的统计范围",
        "",
        f"- 写明来自中国疾病预防控制信息系统：{compress_months([r['month'] for r in valued if '中国疾病预防控制信息系统' in r['case_definition']])}。",
        f"- 写明全表按现住址：{compress_months([r['month'] for r in valued if '按现住址统计' in r['case_definition']])}。",
        f"- 写明不包括港澳台和外籍：{compress_months([r['month'] for r in valued if '不含港澳台和外籍' in r['case_definition']])}。",
        f"- 写明含临床诊断和确诊：{compress_months([r['month'] for r in valued if '含临床诊断和确诊病例' in r['case_definition']])}。",
        f"- 写明不含病原携带者：{compress_months([r['month'] for r in valued if '不含病原携带者' in r['case_definition']])}。",
        "",
        "2023年9月至2024年1月的表注里，「按现住址」只出现在新冠病毒感染的说明中，因此这几个月的登革热口径不写按现住址。",
        "",
        "## 本地病例与输入病例",
        "",
        f"- 表注写明登革热均为境外输入：{compress_months([r['month'] for r in valued if '均为境外输入' in r['case_definition']])}。",
        f"- 表注给出可加总的分项：{compress_months([r['month'] for r in valued if '脚注分列本地与输入' in r['case_definition']])}。",
        f"- 表注只提到部分病例：{compress_months([r['month'] for r in valued if '未给出完整' in r['case_definition']])}。",
        f"- 表内没有分列：{compress_months([r['month'] for r in valued if '表内未分列本地与输入' in r['case_definition']])}。",
        "",
        "`cases` 始终是本期发病数。分项写在 `notes`，没有用分项替换合计，也没有把未说明的差额补成另一类病例。",
        "",
        "## 高峰之后的月份",
        "",
        "下列相邻月份在高峰后明显下降，符合当月发病、不符合年初累计：",
        "",
    ]
    by_month = {r["month"]: r["cases"] for r in valued}
    for year in (2023, 2024, 2025):
        keys = [f"{year}-{month:02d}" for month in range(8, 13) if f"{year}-{month:02d}" in by_month]
        if keys:
            lines.append("- " + "，".join(f"{key} {by_month[key]}" for key in keys))
    lines += [
        "",
        "## 没有纳入月表的资料",
        "",
    ]
    annual = [s for s in sources if s.verification_status == "annual_excluded" or "全年" in s.notes]
    if not annual:
        lines.append("- 无")
    for src in annual:
        lines.append(f"- {src.title}：{src.notes or src.verification_status}（{src.url}）")
    wsjkw_n = sum(1 for src in sources if "wsjkw.gd.gov.cn" in src.url)
    cdcp_n = sum(1 for src in sources if "cdcp.gd.gov.cn" in src.url)
    lines += [
        "",
        "## 来源数量",
        "",
        f"来源清单共 {len(sources)} 条页面，其中卫生健康委 {wsjkw_n} 条，疾控局 {cdcp_n} 条。",
        "有病例数的月份少于页面数，是因为 2026 年的月报同时出现在卫生健康委页面和疾控局的两个栏目，数字一致后合并成一行。",
        "",
        "## 建模可用性",
        "",
    ]
    if not valued:
        lines.append("没有可用月度数字，不能做 AR(21)。")
    else:
        present = {r["month"] for r in valued}
        span = month_span(valued[0]["month"], valued[-1]["month"])
        best = (0, "", "")
        current = 0
        start = ""
        for key in span:
            if key in present:
                if current == 0:
                    start = key
                current += 1
                if current > best[0]:
                    best = (current, start, key)
            else:
                current = 0
        longest = best[0]
        lines.append(
            f"最长连续段是 {best[1]} 至 {best[2]}，共 {longest} 个月。"
            "2021-06 和 2021-07 位于 2021-08 至 2021-11 缺口之前，不能与后面的月份连成一条无缺口序列。"
        )
        lines.append("")
        lines.append(
            f"这 {longest} 个月多于 AR(21) 所需的 21 阶，可以在这段内估计系数，并留出后面的月份做滚动验证。"
            "缺口月份保持空白，不能用 0、插值、全国数或全年发病数的差额填入。"
        )
        lines.append("")
        lines.append(
            "卫生健康委疫情栏目从 2021 年 6 月起才能找到逐月公报，栏目最后一页没有更早的月报，也没有 2021 年 8 月至 11 月。"
            "因此这不是 2004 年至今的完整序列，也不能做跨多个大流行年的长期稳定性验证。"
            "可以做有限的月度 AR(21) 试建模，不适合当作完整历史样本。"
        )
    lines.append("")
    if conflicts:
        lines.append("## 冲突")
        lines.append("")
        lines.extend(f"- {item}" for item in conflicts)
        lines.append("")
    DOC_QC.write_text("\n".join(lines), encoding="utf-8")


def audit(rows: list[dict[str, str]], sources: list[SourceRow]) -> None:
    by = {row["month"]: row for row in rows}
    months = [row["month"] for row in rows]
    if months != sorted(set(months)):
        raise SystemExit("duplicate or unsorted months")
    for row in rows:
        if row["cases"] == "":
            continue
        if not re.fullmatch(r"\d+", row["cases"]) or int(row["cases"]) < 0:
            raise SystemExit(f"invalid cases {row['month']}={row['cases']}")
    checks = [
        by["2021-06"]["cases"] == "1" and "境外输入" in by["2021-06"]["case_definition"],
        "按现住址" not in by["2023-09"]["case_definition"] and by["2023-09"]["cases"] == "650",
        by["2024-04"]["cases"] == "17" and "境外输入" in by["2024-04"]["case_definition"],
        by["2024-05"]["cases"] == "35" and "本地12" in by["2024-05"]["notes"],
        by["2024-06"]["cases"] == "53" and "本地29" in by["2024-06"]["notes"] and "境外输入24" in by["2024-06"]["notes"],
        by["2024-07"]["cases"] == "233" and "省外输入2" in by["2024-07"]["notes"],
        by["2024-08"]["cases"] == "1220" and "本地1185" in by["2024-08"]["notes"],
        by["2024-10"]["cases"] == "8425" and "按现住址" in by["2024-10"]["case_definition"],
        by["2025-04"]["cases"] == "15" and "只写明1例" in by["2025-04"]["notes"],
        "40种" in by["2025-09"]["notes"],
        by["2026-09"]["cases"] == "155" and "病原携带者" in by["2026-09"]["case_definition"],
        by["2022-01"]["cases"] == "0",
        by["2021-08"]["quality_status"] == "missing" and by["2021-08"]["cases"] == "",
        not any(row["month"].startswith("2021") and row["cases"] == "17" for row in rows),
        any("2021年登革热发病数17" in src.notes and "2020年登革热发病数58" in src.notes for src in sources),
        any(src.publish_date == "2021-07-16" and "post_3347405" in src.url for src in sources),
    ]
    if not all(checks):
        raise SystemExit(f"audit failed: {checks}")


def national_fingerprint() -> str | None:
    """Optional guard from the dengue-models repo; absent here is fine."""
    if not NATIONAL.exists():
        return None
    return hashlib.sha256(NATIONAL.read_bytes()).hexdigest()


def main() -> None:
    before = national_fingerprint()
    pages = crawl()
    print(f"bulletins {len(pages)}")
    all_hits: list[Hit] = []
    sources: list[SourceRow] = []
    for url, title, pub, _listing in pages:
        try:
            hits, source = extract_page(url, title, pub)
        except Exception as exc:
            print(f"FAIL {url}: {exc}")
            sources.append(
                SourceRow(title, pub, url, "", "", "none", "fetch_failed", str(exc))
            )
            continue
        all_hits.extend(hits)
        sources.append(source)
        print(f"{title[:28]} -> {[ (h.month, h.cases, h.confirmed) for h in hits ]}")

    by_month: dict[str, list[Hit]] = {}
    for hit in all_hits:
        if hit.kind != "monthly":
            continue
        by_month.setdefault(hit.month, []).append(hit)

    conflicts: list[str] = []
    accepted: dict[str, dict[str, str]] = {}
    for month, hits in sorted(by_month.items()):
        confirmed = [h for h in hits if h.confirmed and h.cases is not None]
        values = {h.cases for h in confirmed}
        if len(values) == 1:
            ranked = sorted(
                enumerate(confirmed),
                key=lambda item: (
                    0 if "中国疾病预防控制信息系统" in item[1].definition else 1,
                    0 if "按现住址统计" in item[1].definition else 1,
                    item[0],
                ),
            )
            hit = ranked[0][1]
            others = sorted({h.url for h in confirmed if h.url != hit.url})
            notes = hit.notes
            if others:
                notes = (notes + " " if notes else "") + "一致来源：" + "；".join(others)
            status = "verified_zero" if hit.cases == 0 else "verified"
            accepted[month] = {
                "month": month,
                "location": "GD",
                "cases": str(hit.cases),
                "case_definition": hit.definition,
                "source_title": hit.title,
                "source_url": hit.url,
                "source_file": hit.source_file,
                "source_page": hit.source_page,
                "retrieved_at": RETRIEVED,
                "quality_status": status,
                "notes": notes.strip(),
            }
        elif len(values) > 1:
            detail = "；".join(f"{h.url}={h.cases}" for h in confirmed)
            conflicts.append(f"{month}: {detail}")
            accepted[month] = {
                "month": month,
                "location": "GD",
                "cases": "",
                "case_definition": "",
                "source_title": hits[0].title,
                "source_url": hits[0].url,
                "source_file": hits[0].source_file,
                "source_page": hits[0].source_page,
                "retrieved_at": RETRIEVED,
                "quality_status": "conflict",
                "notes": detail,
            }
        else:
            accepted[month] = {
                "month": month,
                "location": "GD",
                "cases": "",
                "case_definition": "",
                "source_title": hits[0].title,
                "source_url": hits[0].url,
                "source_file": hits[0].source_file,
                "source_page": hits[0].source_page,
                "retrieved_at": RETRIEVED,
                "quality_status": "unconfirmed",
                "notes": "页面存在，但原始文本未能复核到登革热病例数",
            }

    if accepted:
        span = month_span(min(accepted), max(accepted))
        for month in span:
            accepted.setdefault(
                month,
                {
                    "month": month,
                    "location": "GD",
                    "cases": "",
                    "case_definition": "",
                    "source_title": "",
                    "source_url": "",
                    "source_file": "",
                    "source_page": "",
                    "retrieved_at": RETRIEVED,
                    "quality_status": "missing",
                    "notes": "官方月报栏目未找到该月登革热发病数，未补 0、未插值、未使用全国数据",
                },
            )
    rows = [accepted[k] for k in sorted(accepted)]
    audit(rows, sources)
    PROCESSED.parent.mkdir(parents=True, exist_ok=True)
    SOURCES.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "month", "location", "cases", "case_definition", "source_title", "source_url",
        "source_file", "source_page", "retrieved_at", "quality_status", "notes",
    ]
    with PROCESSED.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    with SOURCES.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["title", "publish_date", "url", "file_path", "months_covered", "extract_method", "verification_status", "notes"],
        )
        writer.writeheader()
        for src in sources:
            writer.writerow(src.__dict__)
    write_docs(rows, sources, conflicts)
    after = national_fingerprint()
    if before is not None and before != after:
        raise SystemExit("refusing to finish: data/time-series.csv changed")
    valued = sum(1 for r in rows if r["cases"] != "")
    print(f"months_with_cases={valued} rows={len(rows)} sources={len(sources)} conflicts={len(conflicts)}")
    print(f"wrote {PROCESSED}")


if __name__ == "__main__":
    main()
