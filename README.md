# 中国疾控结构化数据库（非官方开源项目）

把中国 CDC 公开发布的传染病月报、急性呼吸道哨点周报、新冠疫情通报整理成可交互图表，并提供 CSV。

本站由社区维护，**不是中国 CDC 官方网站**。引用请以 [中国 CDC 健康数据](https://www.chinacdc.cn/jksj/) 原文为准。原始数据知识产权属于中国疾病预防控制中心，仅供非商业研究使用。

- 站点：[https://dailypartita.github.io/cn_cdc_dashboard/](https://dailypartita.github.io/cn_cdc_dashboard/)
- 主页：`/`（法定传染病、哨点监测、新冠）
- CSV：`/csv/`（`/data/` 会跳转到这里）

## 预测竞技场

同源哨点数据也用于 [预测竞技场](https://dailypartita.github.io/China-COVID-19-Forecast-Dashboard/)：基于 [Hubverse](https://hubverse.io/) 的交互式预测与评估平台，展示并比较多家模型对中国门急诊流感样病例（ILI）中 SARS-CoV-2 阳性率的概率预测。欢迎按周提交预测，并在站点上查看各模型与评估排名。说明见 [GitHub](https://github.com/dailypartita/China-COVID-19-Forecast-Dashboard)。

## 项目结构

应用代码在 `src/`，根目录只留配置、数据和同步脚本。

```
src/
  app/                   Next.js 路由：首页、CSV 下载页
  components/            页面组件与图表
  lib/                   链接、病原体目录、读盘与解析
scripts/                 同步、抽取、校正、静态文件准备、Airflow 入库
data/                    存档 CSV、快照、校正补丁、catalog.json、历史回补
airflow/dags/            每周入库 DAG
.github/workflows/       推送后构建 GitHub Pages；手动入库备份
```

`package.json`、`next.config.ts`、`tsconfig.json` 必须放在仓库根目录，Next.js 才会识别。`AGENTS.md` / `CLAUDE.md` 由 `next dev` 自动生成，删了会再出现。

哨点 11 病原体周序列、法定传染病月报、新冠流行株周占比均由本仓库从中国 CDC 公开页面抽取。新冠 ILI 阳性率另有 2022 年 12 月起的长序列。登革热（2004 年 1 月起）和流行性感冒（2009 年 3 月起）在官方月报覆盖之前的月份，另从 [stone-zeng/china-infectious-diseases](https://github.com/stone-zeng/china-infectious-diseases) 补入，见下文。入库后的 CSV 就是图表、下载和目录日期的唯一来源。

## 本地运行

```bash
npm install
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。`predev` 会把 `data/` 拷到 `public/download/`。

静态导出（与 GitHub Pages 相同）：

```bash
npm run build
npx serve out
```

## 同步流水线

1. **GitHub Actions** `sync-data.yml` 每天 UTC 16:00（上海时间 00:00）跑 `node scripts/sync-data.mjs`，从中国 CDC 公开页入库。哨点周报在周四约 20:30（上海）发布；原先只在周二/五/日 UTC 06:00 触发，周四新周要等到周五，而 Actions 还会把该档推迟数小时，所以上午目录仍停在上一周。列表上的最新周次已经在表里时，没有新期次则不改 `catalog.json`、不空提交。也可在 Actions 里手动跑 **Sync China CDC data**。
2. **GitHub Actions** `pages.yml` 在 `main` 每次推送后 `next build`（`output: "export"`），把 `out/` 发布到 GitHub Pages。

哨点列表上的最新周次没有进入表1，或最新一期解析失败，整次任务失败，站点继续用上次存档。法定传染病月报失败，以及流行株的网络错误，会在 Actions 里标 warning，不阻断已成功的哨点提交。流行株最新公报的周次没解析出来时，整次任务失败。

GitHub 跑在境外 IP，访问 `chinacdc.cn` 偶尔会慢或失败。若更稳，可把 Airflow DAG 链到国内 worker 当备份（周五 12:00 Asia/Shanghai；调度器为 UTC 时 cron 为 `0 4 * * 5`）：

```bash
export CDC_DASHBOARD_ROOT=/path/to/cn_cdc_dashboard
ln -s "$CDC_DASHBOARD_ROOT/airflow/dags/cn_cdc_dashboard_weekly.py" "$AIRFLOW_HOME/dags/"
```

Worker 需要 Node 18+、git，以及能推这个仓库的凭据（SSH deploy key 或 HTTPS token）。仓库 **Settings → Pages → Source** 选 **GitHub Actions**。

```bash
npm run sync-data            # 完整入库（哨点 + 法定传染病 + 流行株）
npm run sync-sentinel        # 只抽哨点周报表1
npm run sync-data:local      # 不重新下载，只重建快照；无新期次不写 catalog
npm run sync-notifiable      # 只抽法定传染病月报，并合并已提交的历史回补
npm run backfill-notifiable  # 从 stone-zeng 刷新登革热、流感历史月报
npm run sync-cnic            # 只抽国家流感中心最近周报，并合并已提交的历史周
npm run backfill-cnic        # 重爬 CNIC 周报目录，并用 Zenodo 填空
npm run sync-covid-variants  # 只抽新冠流行株周占比
npm run qa-data              # 不重新下载，只重跑校正与校验
npm run write-catalog        # 按当前 CSV 重写 catalog.json
npm run prepare-static       # 仅生成 public/download
```

同步后会套用 `data/corrections/` 里已核对的官方表1 / 月报补丁，并自动处理两类复发错误：哨点单周变成邻周约 10 倍（OCR 丢掉小数点），以及月报数字带空格（`10 84`）或合计行对不上分病原。2025 年 W14–W22 的 11 病原体周序列按官方月报回写入主表。上游若已修好，补丁不会覆盖。

## 下载

站点根为 `https://dailypartita.github.io/cn_cdc_dashboard`。下载目前只提供 CSV。

| 路径 | 说明 |
| --- | --- |
| `GET /download/cncdc_surveillance_all.csv` | 11 病原体主表 |
| `GET /download/cncdc_surveillance_covid19.csv` | 新冠阳性率（ILI 自 2022-12，SARI 自 2024-11） |
| `GET /download/notifiable_all.csv` | 法定传染病分病原月报（登革热、流感含 2024 年前历史） |
| `GET /download/covid_variants.csv` | 新冠主要流行株周占比 |
| `GET /download/cnic_influenza_weekly.csv` | 国家流感中心 ILI% 与 ILI 标本流感检测阳性率 |
| `GET /download/snapshots/{week}.csv` | 哨点单周快照，如 `2026-W34.csv` |
| `GET /download/notifiable/{month}.csv` | 法定传染病单月快照，如 `2026-07.csv` |
| `GET /download/charts/{id}.csv` | 与首页各图对应的完整序列 |

```python
import pandas as pd
df = pd.read_csv("https://dailypartita.github.io/cn_cdc_dashboard/download/cncdc_surveillance_all.csv")
```

## 历史月报（登革热、流行性感冒）

2024 年 1 月起的法定传染病月报仍从中国 CDC 页面抽取，一种病一行，全国总数，不含港澳台，也没有分省。更早的月份只补了两种病，整理自 [stone-zeng/china-infectious-diseases](https://github.com/stone-zeng/china-infectious-diseases)（CC0）收录的国家卫健委 / 疾控局月报。本仓库不拷贝该项目的其余病种。

| 病种 | 类别 | 写入范围 | 缺口 |
| --- | --- | --- | --- |
| 登革热 | 乙类 | 2004-01 起，直到官方月报开始的前一个月 | 无。2010-11 在来源里被标成第二个 2010-10，已按公报总计改回 |
| 流行性感冒 | 丙类 | 连续月序列自 2009-03 起，直到官方月报开始的前一个月 | 同上。2004-04（发病 12241，死亡空）和 2005-04（发病 5925，死亡空）是连续序列之前的散点，没有写入 |

2013 年 11 月起，甲型 H1N1 流感并入丙类流行性感冒，不再单独列报。2009-04 至 2013-10 的「甲型H1N1流感」没有加进流行性感冒。人感染高致病性禽流感、人感染 H7N9 禽流感、人感染新亚型流感仍按原病名单独列出。哨点周报里的「流感病毒」阳性率是另一套序列，不用月报发病数去填，也不把月报拆成周。

重叠月份保留中国 CDC 的发病数、死亡数、病名和 `source_url`。历史行的 `source_url` 是 stone-zeng README 所引的该月公报；相对链接按 `https://www.nhc.gov.cn` 补全。stone-zeng 的月表把 2010 年 11 月和 2010 年 10 月都写成 `2010-10`：发病总计 509523、死亡 1254 的一行是 10 月，发病总计 527762、死亡 1547 的一行是 11 月公报，脚本只在这个签名吻合时改回 `2010-11`。其它重复月份会整月舍弃，不挑一行。`data/backfill/notifiable-flu-dengue.csv` 只存这些历史行。`scripts/sync-notifiable.mjs` 每次写 `notifiable_all.csv` 时把该文件合并回去：已经存在的 `(month, disease)` 不覆盖。因此下一次成功的官方同步不会丢掉这段历史。

刷新历史段（需要能访问 GitHub）：

```bash
npm run backfill-notifiable
```

脚本会重新下载 stone-zeng 的 `data/monthly-cases.csv`、`data/monthly-deaths.csv` 和 README 链接，重写 `data/backfill/`，再与当前官方行合并，并更新 `catalog.json`。来源里发病数为空的月份会跳过；死亡数为空则留空，不写成 0。

## 国家流感中心周报（ILI%、检测阳性率）

第 2 节哨点「流感病毒」核酸阳性率只覆盖多病原周报，从 2024 年第 46 周起。更早的流感活动在第 4 节，来自[国家流感中心流感监测周报](https://ivdc.chinacdc.cn/cnic/zyzx/lgzb/)（旧目录 [lgzx/zyzx/lgzb](https://ivdc.chinacdc.cn/lgzx/zyzx/lgzb/) 回到 2009 年第 36 周）。这是另一套指标：

- **ILI%**：南方、北方哨点医院流感样病例占门急诊就诊总数的百分比。周报还把内科、儿内科分开写的早期周次没有并进这两列。
- **检测阳性率**：ILI 标本里流感病毒阳性的百分比，分南方、北方和全国。不是 11 病原体哨点表里的「流感病毒」阳性率，也不是法定传染病月报的发病数。

首页默认仍是近 52 周。选「全部」才看到整段。`catalog.json` 的 `cnic.ili` / `cnic.positivity` 写着起止周和缺周。

HTML 或 PDF 里能读到的数字优先。读不到的格子用 [Zenodo 10.5281/zenodo.22784835](https://doi.org/10.5281/zenodo.22784835)（Zhao, Quanjingbo，CC BY 4.0，整理自 2016 年第 38 周至 2026 年第 36 周的 CNIC 周报）填空，不覆盖原文已经有的字段。2026 年第 37 周及以后若页面只有摘要，脚本用 PDF 文本补 ILI% 和实验室表。2021–2022 年有些周报把全国检测数和南北方阳性数写在正文里，阳性率只出现在图上；这时全国阳性率用阳性数除以检测数，四舍五入到 0.1 个百分点。南北方阳性率仍然只在正文或表里印了百分比时才写入。WHO FluNet 的中国毒株数和这套哨点检测数不是同一分母，没有画进这张图。

`data/backfill/cnic-influenza-weekly.csv` 是这段历史。`scripts/sync-cnic.mjs` 每次写主表时先放回这个文件，再叠最近列表里新解析出的非空字段。因此下一次官方同步即使只看到最新几十周，也不会丢掉更早的周。空值不会把已有数字擦掉。

```bash
npm run backfill-cnic
```

需要能访问 `ivdc.chinacdc.cn` 和 Zenodo。从 PDF 抽文字需要 `pdftotext`（Poppler）。GitHub Actions 的同步任务会安装它。

## 新冠阳性率没有更早的同口径周序列

门急诊 ILI 新冠核酸阳性率从 2022 年第 49 周（2022-12-05）起，与公开周报开始按这一口径报告的时间一致。没有找到更早的同一哨点 ILI 核酸阳性率周序列，所以没有把 2020–2022 年的每日确诊数并进阳性率图。流行株周占比仍是另一张表。

## 未收录

多病原哨点周报的图1（ILI 占门急诊就诊比例）、表2（南北方）、表3（年龄组）尚未进入 11 病原体主表。国家流感中心的南北方 ILI% 在单独的周序列里，见上一节。
