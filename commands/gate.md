# /gate — Evidence Gate

## Purpose
Run the verification evidence gate before completing a mission.

## Usage
```
/gate                    # Run full gate
/gate --category <cat>   # Run specific category
/gate --force            # Force gate even with failures
```

## Gate Categories

### Code Quality
- [ ] All tests pass
- [ ] Build succeeds
- [ ] Lint clean
- [ ] Type check clean
- [ ] No security vulnerabilities
- [ ] Code follows conventions

### Requirements
- [ ] All acceptance criteria met
- [ ] All features implemented
- [ ] No scope creep
- [ ] Documentation updated

### Architecture
- [ ] Architecture compliance
- [ ] No breaking changes
- [ ] Dependencies approved
- [ ] Performance acceptable

### Security
- [ ] Input validation
- [ ] Auth/authz enforced
- [ ] No secrets in code
- [ ] No injection vectors
- [ ] Dependencies audited

### Evidence
- [ ] Test results captured
- [ ] Build logs captured
- [ ] Screenshots (if UI)
- [ ] API responses (if API)
- [ ] Performance metrics

## Flow
1. Run verification checks
2. Collect evidence
3. Create evidence gate report (from templates/evidence-gate.md)
4. Present to Commander
5. Commander decides: PASS / FAIL / CONDITIONAL_PASS

## Output
- Evidence gate report created
- Evidence collected
- Commander decision made
- Mission status updated
