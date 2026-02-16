## Making a Contribution

### The Workflow

```bash
# 1. Fork the repo on GitHub

# 2. Clone your fork
git clone https://github.com/YOUR_USER/terraform-provider-aws.git
cd terraform-provider-aws

# 3. Add upstream remote
git remote add upstream https://github.com/hashicorp/terraform-provider-aws.git

# 4. Create a branch
git checkout -b fix-rds-timeout

# 5. Make your changes
# ... edit, test, verify ...

# 6. Run the project's tests
make test
# Or for specific tests:
go test ./internal/service/rds/... -run TestAccRDSInstance

# 7. Commit with DCO sign-off (if required)
git commit -s -m "Fix RDS instance creation timeout

The default timeout of 40m was too short for large instances.
Increased to 60m to match AWS documentation.

Fixes #12345"

# 8. Push and create PR
git push origin fix-rds-timeout
# Then create PR on GitHub
```

### Writing Good Commit Messages

```
[component]: Short summary (under 72 chars)

Explain WHY the change was made, not WHAT changed (the diff shows that).
Link to the issue: Fixes #12345

Signed-off-by: James Milne <james@example.com>
```

### Responding to Code Review

- **Don't take it personally** — reviews are about the code, not you
- **Address every comment** — even if just "Done" or "Good point, fixed"
- **Ask for clarification** if you don't understand a comment
- **Push new commits** (don't force-push during review)
- **Thank reviewers** — they're spending their time on your code

### Your First PR Checklist

- [ ] Read CONTRIBUTING.md
- [ ] Issue exists and is unassigned (or you commented first)
- [ ] Branch from latest main
- [ ] Changes are minimal and focused on one thing
- [ ] Tests pass locally
- [ ] New tests added for new behavior
- [ ] Commit message follows project conventions
- [ ] DCO sign-off if required
- [ ] PR description explains the why and links the issue
