# OpsV v0.8 Agents

## Creative Agent
Responsible for narrative design, element creation, and shot design. Writes markdown specs that conform to the v0.8 frontmatter schema.

## Guardian Agent
Responsible for validation, consistency checks, and frontmatter schema enforcement. Ensures all documents pass `opsv validate` before proceeding.

## Runner Agent
Responsible for executing the production pipeline: circle creation, compilation, execution, and review. Operates the CLI commands in sequence.
