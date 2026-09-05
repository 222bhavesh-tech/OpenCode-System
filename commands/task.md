# /task — Start Mission

## Purpose
Begin a new autonomous mission with full orchestration.

## Usage
```
/task <objective>
/task <objective> --priority <level>
/task <objective> --source <github|user|discovery>
```

## Flow
1. Parse objective
2. Create Mission Brief (from templates/mission-brief.md)
3. Commander receives brief
4. Commander initiates understanding phase
5. Commander creates task graph
6. Commander delegates to agents
7. Execution begins

## Output
- Mission ID created
- Task graph generated
- Agents assigned
- Execution started

## Examples
```
/task Fix the login timeout bug
/task Add dark mode toggle --priority HIGH
/task Implement user dashboard --source github
```
