---
id: WP-11C
depends_on: [WP-11B]
gate: api
---
# WP-11C 单项重跑与不可变报告

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-11C`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 TST-003/004、PUB-001 及 WP-11B evidence。

## 目标结果
实现失败用例单项重跑、历史结果追加和绑定 digest 的不可变脱敏测试报告。

## 允许修改
test application/repository/report builder、API、fixture/tests。

## 禁止和非目标
不修改旧 TestRun 事实、不把正文/Secret 放报告、不自动判定审核通过。

## 实施要求
- rerun 创建 attempt，保留此前结果和 suite 完整性；
- report 含版本、时间、结果、request/trace 安全引用和 report digest；
- 提交资格只接受同 definitionDigest 的最新完整 PASS suite；
- 报告写后不可更新。

## 可验证完成结果
- 单项重跑不删除成功/失败历史；改 Definition 后旧报告不可用于提交；
- 报告敏感扫描无正文/Secret/查询；UPDATE 被数据库拒绝；
- `pnpm verify` PASS；API 评审通过。

## 衔接输出
Evidence 提供 attempt/report schema、提交资格查询和报告 digest 算法。

## 停止条件
需要覆盖历史、放宽必测或报告必须保存正文时停止。
