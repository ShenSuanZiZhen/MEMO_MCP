---
id: WP-08B
depends_on: [WP-08A]
gate: none
---
# WP-08B PDF 解析与切块

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-08B`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 DAT-004、用户流程 PDF 部分失败规则及 WP-08A evidence。

## 目标结果
在既有沙箱内解析文本型 PDF，形成页级定位、稳定 chunk 和部分失败结果。

## 允许修改
PDF parser adapter、PDF fixture/golden、必要的 parser worker 配置。

## 禁止和非目标
不做 OCR、表单填写、脚本/附件执行、不更改通用 normalized model。

## 实施要求
- 页码和段落来源稳定；空页/损坏页精确报告；
- 页面/对象/展开大小和解析时间受限；
- metadata 清洗，禁止外部路径/嵌入动作进入输出；
- 成功页保留，失败页可单独重试/排除。

## 可验证完成结果
- 正常、多页、空页、损坏、加密、超限 fixture 有 golden/负例；
- 同文件重复处理 ID/digest 稳定；
- `pnpm verify:affected` PASS。

## 衔接输出
Evidence 记录支持/不支持 PDF 类型、页级错误和 fixture 许可来源。

## 停止条件
必须加入 OCR/密码破解或绕开沙箱限制时停止。
