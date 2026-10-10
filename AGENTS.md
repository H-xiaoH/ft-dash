## 领域术语

术语以仓库根目录的 `CONTEXT.md` 为准。

- 命名领域概念时（标识符、issue 标题、重构提案、测试名、界面文案），用 `CONTEXT.md` 里定义的词，不要用同义词。
- 表格里标了「**不要**写成…」的，就是明确排除的说法。
- 需要的新概念不在词汇表里，先判断是该复现已有说法，还是真有缺口——有缺口就先补 `CONTEXT.md`。

## Agent skills

### Issue tracker

Issues and specs are tracked as local Markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the default canonical triage labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context domain documentation. See `docs/agents/domain.md`.
