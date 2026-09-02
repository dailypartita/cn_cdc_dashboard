# 中国疾控结构化数据库（非官方开源项目）

把中国 CDC 公开发布的传染病月报、急性呼吸道哨点周报、新冠疫情通报整理成可交互图表，并提供 CSV / Parquet 与只读 API。

本站由社区维护，**不是中国 CDC 官方网站**。引用请以 [中国 CDC 健康数据](https://www.chinacdc.cn/jksj/) 原文为准。原始数据知识产权属于中国疾病预防控制中心，仅供非商业研究使用。

- 主页：`/`（法定传染病、哨点监测、新冠）
- CSV：`/csv`（`/data` 会跳转到这里）
- API 说明：`/api-docs`

欢迎在 [预测竞技场](https://dailypartita.github.io/China-COVID-19-Forecast-Dashboard/) 提交预测。

## 项目结构

应用代码在 `src/`，根目录只留配置、数据和同步脚本。

```
src/
  app/                   Next.js 路由：首页、CSV、API、下载
  components/            页面组件与图表
  lib/                   链接、病原体目录、读盘与解析
scripts/                 同步、抽取、校正
data/                    存档 CSV、快照、校正补丁、catalog.json
.github/workflows/       每周五自动入库
```

`package.json`、`next.config.ts`、`tsconfig.json` 必须放在仓库根目录，Next.js 才会识别。`AGENTS.md` / `CLAUDE.md` 由 `next dev` 自动生成，删了会再出现。

哨点 11 病原体周序列、法定传染病月报、新冠流行株周占比均由本仓库从中国 CDC 公开页面抽取。新冠 ILI 阳性率另有 2022 年 12 月起的长序列。入库后的 CSV 就是图表、下载和目录日期的唯一来源。

## 本地运行

```bash
npm install
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。

```bash
npm run build
npm start
```

## 数据同步

GitHub Action 每周五 12:00（Asia/Shanghai）跑 `sync-data`：抽哨点周报表1、法定传染病月报、新冠流行株，校正后写入 `data/catalog.json` 并提交。Vercel 随提交重建后，首页图、CSV 下载、目录后的最新期会一起换成新数据。没有新周报时不产生空提交。哨点抽取失败则整次任务失败，站点继续用上次存档。

```bash
npm run sync-data            # 完整入库（哨点 + 法定传染病 + 流行株）
npm run sync-sentinel        # 只抽哨点周报表1
npm run sync-data:local      # 不重新下载，只重建快照和 catalog
npm run sync-notifiable      # 只抽法定传染病月报
npm run sync-covid-variants  # 只抽新冠流行株周占比
npm run qa-data              # 不重新下载，只重跑校正与校验
npm run write-catalog        # 按当前 CSV 重写 catalog.json
```

若站点不跟 GitHub 自动部署，把 Vercel Deploy Hook 配成仓库密钥 `VERCEL_DEPLOY_HOOK`。

同步后会套用 `data/corrections/` 里已核对的官方表1 / 月报补丁，并自动处理两类复发错误：哨点单周变成邻周约 10 倍（OCR 丢掉小数点），以及月报数字带空格（`10 84`）或合计行对不上分病原。2025 年 W14–W22 的 11 病原体周序列按官方月报回写入主表。上游若已修好，补丁不会覆盖。

## 下载

同一路径把 `.csv` 换成 `.parquet` 即可。

| 路径 | 说明 |
| --- | --- |
| `GET /download/cncdc_surveillance_all.csv` | 11 病原体主表 |
| `GET /download/cncdc_surveillance_covid19.csv` | 新冠阳性率（ILI 自 2022-12，SARI 自 2024-11） |
| `GET /download/notifiable_all.csv` | 法定传染病分病原月报 |
| `GET /download/covid_variants.csv` | 新冠主要流行株周占比 |
| `GET /download/snapshots/{week}.csv` | 哨点单周快照，如 `2026-W34.csv` |
| `GET /download/notifiable/{month}.csv` | 法定传染病单月快照，如 `2026-07.csv` |
| `GET /download/charts/{id}.csv` | 与首页各图对应的完整序列 |

```python
import pandas as pd
df = pd.read_csv("http://localhost:3000/download/cncdc_surveillance_all.csv")
df = pd.read_parquet("http://localhost:3000/download/cncdc_surveillance_all.parquet")
```

## API

只读、免密钥、开放 CORS。默认 JSON，加 `format=csv` 或 `format=parquet` 可改格式。说明页：`/api-docs`。

| 路径 | 说明 |
| --- | --- |
| `GET /api/v1/surveillance` | 哨点长表。`pathogen`、`start`、`end` |
| `GET /api/v1/latest` | 最新周（表1 结构，含较上周） |
| `GET /api/v1/status` | 各数据集最新期 |
| `GET /api/v1/weeks` | 监测周列表 |
| `GET /api/v1/pathogens` | 哨点病原体目录 |
| `GET /api/v1/notifiable` | 法定传染病长表。`disease` / `class` / `start` / `end` |
| `GET /api/v1/covid-variants` | 流行株长表。`lineage` / `start` / `end` |

```bash
curl "http://localhost:3000/api/v1/surveillance?pathogen=sars-cov-2&start=2026-01-01&format=csv"
curl "http://localhost:3000/api/v1/latest"
```

## 未收录

周报图1（ILI 占门急诊就诊比例）、表2（南北方）、表3（年龄组）尚未进入主表。
