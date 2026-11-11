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

## 未收录

周报图1（ILI 占门急诊就诊比例）、表2（南北方）、表3（年龄组）尚未进入主表。
