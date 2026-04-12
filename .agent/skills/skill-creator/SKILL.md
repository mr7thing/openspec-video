---
name: skill-creator
description: Create, analyze, and grade OpsV skills. Use this skill when working with skill definitions, creating new skills, or evaluating skill quality.
---

# Skill Creator Skill

This skill provides tools for managing OpsV skills - the reusable, modular capabilities that agents use to perform tasks.

## When to Use This Skill

Use this skill when:
- Creating a new skill for the OpsV framework
- Analyzing an existing skill for quality or completeness
- Comparing multiple skills to choose the best one for a task
- Grading skill performance or documentation quality

## Skill Structure

A well-formed OpsV skill consists of:

1. **SKILL.md** - The main definition file containing:
   - Name and description
   - When to use the skill
   - Required inputs and expected outputs
   - Step-by-step workflow
   - Error handling guidance

2. **Supporting Files** (optional):
   - `agents/` - Agent-specific configurations
   - `references/` - Documentation or schema references
   - `templates/` - Reusable templates

## Workflow for Creating a Skill

1. **Define the Purpose**:
   - What task will this skill perform?
   - Which agents will use it?
   - What are the inputs and outputs?

2. **Create the SKILL.md**:
   - Follow the standard format
   - Include clear, actionable steps
   - Document all parameters and options

3. **Validate the Skill**:
   - Use the skill-creator tools to analyze
   - Check for completeness
   - Ensure consistency with other skills

4. **Test the Skill**:
   - Run the skill in a test scenario
   - Verify all steps work as expected
   - Check error handling

5. **Document and Publish**:
   - Add to the skills registry
   - Update documentation
   - Announce availability

## Integration with Agents

Skills are invoked by agents based on:
- The agent's role and responsibilities
- The current task requirements
- The user's explicit requests

Agents use skills through the `use_skill` capability, passing:
- `skill_name`: The identifier for the skill
- `parameters`: Required inputs for the skill

## Quality Standards

A high-quality skill should be:
- **Complete**: All necessary information is provided
- **Clear**: Instructions are unambiguous
- **Consistent**: Follows framework conventions
- **Testable**: Can be verified to work correctly
- **Maintainable**: Easy to update and improve

## References

- [OpsV Agent Architecture](../ARCHITECTURE.md)
- [Skill Template](SKILL.template.md)
- [Best Practices Guide](../BEST_PRACTICES.md)
