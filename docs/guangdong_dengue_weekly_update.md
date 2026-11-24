# 广东省登革热数据：每周如何更新

## 先说清楚：病例是「月报」，检查可以「每周」

广东省公开的登革热病例来自**法定传染病月报**（卫健委 / 疾控局疫情概况），不是周报。  
因此：

- **病例粒度**：月度（YYYY-MM）
- **建议检查节奏**：每周跑一次「有没有新月报」
- **真正写入新数字**：通常每月中下旬，上一个月的月报发布后才会变

不要把周检查理解成「每周会有新的周病例数」——目前这些公开源没有广东省级登革热周序列。

## 主文件

| 文件 | 用途 |
|---|---|
| `data/processed/guangdong_dengue_monthly_cleaned_2004_present.csv` | **清洗后的历史主表**（建模优先用这个） |
| `data/processed/guangdong_dengue_monthly.csv` | 近年官方月报逐条核验结果 |
| `scripts/update_guangdong_dengue_weekly_check.py` | 每周一键：拉月报 + 重建清洗表 |

## 每周操作（推荐）

在本仓库根目录 `cn_cdc_dashboard/`：

```bash
pip install -r requirements-guangdong-dengue.txt
npm run sync-guangdong-dengue
# 或：python3 scripts/update_guangdong_dengue_weekly_check.py
```

日常同步已并入 `npm run sync-data` / GitHub Actions `sync-data.yml`（每天 UTC 16:00）。

成功后还会导出 `data/export/guangdong_dengue_monthly.csv`，并由 Actions 推送到 Forecast Dashboard 的 `pages/resources/guangdong_dengue_monthly.csv`（专页 `guangdong-dengue.html`）。

脚本会依次：

1. 运行 `scripts/build_guangdong_dengue_monthly.py`  
   从广东省卫健委 / 疾控局公开月报抓取并核验登革热「本期发病数」
2. 运行 `scripts/build_guangdong_dengue_cleaned_history.py`  
   把官方月报合并进 2004 年起的清洗历史表

### 每周看什么

1. 清洗表末尾 `month` 是否多出新月（例如从 `2026-09` 变成 `2026-10`）
2. 新月 `quality_status` 是否为 `verified` / `verified_zero`
3. `cases` 是否为空：空表示月报未找到或未核验通过，**不要手填 0**

### 建议排期

| 时间 | 做什么 |
|---|---|
| 每周一（或任意固定日） | 跑 `update_guangdong_dengue_weekly_check.py` |
| 每月 15–25 日前后 | 重点看「上月」月报是否已出；未出则继续空着 |
| 新月 `verified` 后 | 再跑预测 / 提交 hub（若当周有提交任务） |

官方栏目：

- https://wsjkw.gd.gov.cn/zwyw_yqxx/
- https://cdcp.gd.gov.cn/ （疫情信息 / 数据发布）

## 清洗表口径（`cases` 取值优先级）

重建脚本：`scripts/build_guangdong_dengue_cleaned_history.py`

1. **官方月报**（`guangdong_dengue_monthly.csv` 非空）— 最高优先  
2. **Zenodo 2016–2024** — 仅当官方缺失，且月份 ≥ 2022-01（公卫数据中心此后基本停更）  
3. **phsciencedata** — 更早历史（约 2004–2021）；与 Zenodo 重叠时优先 phsci（2020 年合计与官方年报 58 例一致）  
4. 仍无来源 → `cases` 留空，`quality_status=missing`（不插值、不用全国数代替）

字段说明：

| 字段 | 含义 |
|---|---|
| `month` | YYYY-MM |
| `location` | GD |
| `cases` | 清洗后主序列；空=缺失 |
| `source_primary` | `official_bulletin` / `zenodo_2016_2024` / `phsciencedata` |
| `quality_status` | 质量标记 |
| `cases_phsci` / `cases_zenodo` / `cases_official` | 三源原始对照，便于审计 |
| `source_url` | 主来源链接 |
| `notes` | 脚注、分源差异等 |

## 不要再指望自动更新的源

| 源 | 状态 |
|---|---|
| 公共卫生科学数据中心 | 有效约到 **2021-12**，之后导出多为空，**不必每周重下** |
| Zenodo `10.5281/zenodo.18391003` | 静态到 **2024-12**，只作历史对照 |

历史重下（偶尔维护，非每周）：

```bash
python scripts/download_phsciencedata_dengue.py --start-year 2004 --end-year 2021
python scripts/extract_phsci_guangdong_dengue.py
python scripts/crosscheck_phsci_zenodo.py
python scripts/build_guangdong_dengue_cleaned_history.py
```

## 与全国 hub 序列的关系

- `data/time-series.csv` 是 **全国** hub 目标（`mo inc dengue cases`），不是广东表  
- 广东清洗表**不会**写回 `time-series.csv`  
- 更新广东数据后，若要刷新全国模型，需按 hub / `run.sh` 另走全国流程

## 故障排查

| 现象 | 处理 |
|---|---|
| 新月仍是 `missing` | 月报可能未发；过几天再跑。勿手补 |
| `conflict` / `unconfirmed` | 看 `guangdong_dengue_monthly.csv` 的 `notes`，核对原文后再改抓取逻辑 |
| 抓取超时 | 重跑；检查官网是否改版（栏目 URL） |
| 清洗表未变 | 确认 `build_guangdong_dengue_monthly.py` 已成功写出 processed 月报 |

## 一句话流程

**每周跑一次更新脚本 → 只在官方新月报核验通过后才有新 `cases` → 用清洗 CSV 做后续分析/建模。**
