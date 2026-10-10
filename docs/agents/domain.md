# Domain Docs

This is a single-context repository.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root. `AGENTS.md` declares it the canonical vocabulary for domain concepts.
- **`GLOSSARY.md`** if it is introduced later.
- **`docs/adr/`** for architectural decisions relevant to the area being explored.

If any of these files do not exist, proceed silently. Create domain documentation lazily when a term or decision is actually resolved.

## File structure

```text
/
├── CONTEXT.md
├── GLOSSARY.md       ← optional future glossary
├── docs/adr/
└── src/
```

## Use the repository vocabulary

When naming a domain concept in an issue title, refactor proposal, hypothesis, or test name, use the terminology defined in `CONTEXT.md`. Do not introduce synonyms that the glossary explicitly excludes.

If a needed concept is missing, decide whether an existing term should be reused. If it is a genuine gap, update `CONTEXT.md` before using the new concept.

## Flag ADR conflicts

If an output contradicts an existing ADR, surface it explicitly rather than silently overriding it.
