## Summary

<!-- One or two sentences. Add the motivation when no issue is linked. -->

## Linked issues

<!-- Use a closing keyword so the issue closes on merge. Cross-repo works:
     Closes allfitone/allfitone-docs#5 -->

Closes #

## Changes

<!-- A specific bullet list. Skip only for a trivial pull request. -->

-

## How to verify

<!-- Numbered steps a reviewer can repeat, not a report of what you ran.
     Name the edge cases you checked. -->

1.

## Screenshots / Recordings

<!-- Required for any UI change, mobile and desktop.
     Delete this whole section for a non-UI pull request. -->

| Before | After |
| ------ | ----- |
|        |       |

## Deployment notes

<!-- Tick what applies and explain it below.
     Delete this whole section when none apply. -->

- [ ] Database migration — the database deploy is dispatched by hand, merging does not ship it
- [ ] New or changed environment variable
- [ ] New dependency
- [ ] Deploy order matters
- [ ] Cache invalidation
- [ ] Breaking change for a consumer

## Checklist

- [ ] Title follows Conventional Commits, with a scope from `commitlint.config.js`
- [ ] Branch is named `type/short-description`
- [ ] One concern in this pull request
- [ ] I reviewed my own diff
- [ ] Tests added or updated for the behaviour that changed
- [ ] Documentation updated, or the change needs none
- [ ] No secrets and no debug leftovers
- [ ] Accessibility checked, for a UI change
