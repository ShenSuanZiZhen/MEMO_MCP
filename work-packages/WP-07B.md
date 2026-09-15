---
id: WP-07B
depends_on: [WP-07A]
gate: security
---
# WP-07B 隔离区、扫描与类型识别

> 执行协议：先运行 `./scripts/check-work-package-ready.sh WP-07B`，再阅读 `work-packages/00_全局开发约束.md` 与所有直接依赖的 evidence。全局约束优先于本包；未显示 READY 不得实现。

执行本工作包。阅读 DAT-003/004、NFR-SEC-003 及 WP-07A evidence。

## 目标结果
完成上传对象进入 quarantine、恶意扫描端口、magic-byte/格式允许列表和安全转移。

## 允许修改
upload worker、scanner port/dev adapter、对象存储 adapter、安全 fixture/tests。

## 禁止和非目标
不选生产扫描厂商、不解析正文、不自动放行扫描不可用对象。

## 实施要求
- 上传完成后对象只能在 quarantine；扫描 PASS 才可进入 parser 输入区；
- 扩展名、Content-Type 和 magic bytes 交叉校验；
- scanner 超时/异常关闭式拒绝并可重试；
- 日志不含文件内容或完整原名中的敏感信息。

## 可验证完成结果
- EICAR/恶意 fixture、伪扩展名、未知格式、scanner down 均不进入解析区；
- clean fixture 只转移一次；重复 activity 幂等；
- 安全测试、`pnpm verify` PASS；安全评审通过。

## 衔接输出
Evidence 提供 ScanResult、状态/错误码、quarantine 路径和生产 adapter port。

## 停止条件
需要真实恶意文件传播、默认放行或生产厂商选择时停止。
