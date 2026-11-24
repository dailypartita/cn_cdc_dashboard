# 广东省登革热月度数据字典

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
