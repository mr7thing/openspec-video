# Graph Report - .  (2026-06-02)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 24 nodes · 15 edges · 12 communities (3 shown, 9 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 1.0)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]

## God Nodes (most connected - your core abstractions)
1. `陆然` - 7 edges
2. `云璃` - 3 edges
3. `婚碑` - 3 edges
4. `玄微` - 2 edges
5. `天凤法相` - 2 edges
6. `Comic Creative Agent` - 2 edges
7. `Guardian Agent` - 2 edges
8. `Category: project` - 1 edges
9. `newproject` - 1 edges
10. `莫雨` - 1 edges

## Surprising Connections (you probably didn't know these)
- `newproject` --references--> `Category: project`  [EXTRACTED]
  videospec/project.md → videospec/_category_validate.yaml
- `Voice Director` --references--> `Comic Creative Agent`  [EXTRACTED]
  .agent/AGENTS.md → .agent/Creative-Agent.md
- `Comic Creative Agent` --calls--> `Guardian Agent`  [EXTRACTED]
  .agent/Creative-Agent.md → .agent/Guardian-Agent.md
- `Guardian Agent` --calls--> `Runner Agent`  [EXTRACTED]
  .agent/Guardian-Agent.md → .agent/Runner-Agent.md

## Import Cycles
- None detected.

## Communities (12 total, 9 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.38
Nodes (7): 云璃, 噬心咒, 天凤法相, 玄微, 莫雨, 陆然, 龙珠

### Community 1 - "Community 1"
Cohesion: 0.50
Nodes (4): Voice Director, Comic Creative Agent, Guardian Agent, Runner Agent

### Community 2 - "Community 2"
Cohesion: 0.67
Nodes (3): 婚碑, 海底妖族, 龙脉

## Knowledge Gaps
- **17 isolated node(s):** `Category: project`, `Category: shotlist`, `Category: comic_project`, `Category: comic_character`, `Category: comic_storyboard` (+12 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `陆然` connect `Community 0` to `Community 2`?**
  _High betweenness centrality (0.121) - this node is a cross-community bridge._
- **Why does `婚碑` connect `Community 2` to `Community 0`?**
  _High betweenness centrality (0.059) - this node is a cross-community bridge._
- **What connects `Category: project`, `Category: shotlist`, `Category: comic_project` to the rest of the system?**
  _17 weakly-connected nodes found - possible documentation gaps or missing edges._