# HelloAI UI Improvement Implementation Plan

Date: 2026-08-06
Baseline: `main` at `21d32620ec36c4efa7a1cd81774896f2f38448e2`
Target: WCAG 2.2 AA, responsive web and installed-PWA parity, preservation of the local-first and stateless-server architecture.

## Executive summary

The current application is substantially more mature than the historical audit baseline. It has a coherent responsive shell, accessible modal primitives, explicit loading/offline/PWA states, local backup validation, safe service-worker update behavior, and broad Playwright coverage. The latest `main` CI run completed successfully.

A fresh source review nevertheless verified several remaining defects concentrated in state transitions rather than visual styling. The highest-risk defects occur when conditions change after an action is initiated: edit/regenerate confirmation can proceed after generation becomes unavailable and can remove later messages before the failed request is discovered; switching to a text-only model can retain already queued image attachments; and the speech-action feature check is performed during render, which can produce different server and hydration markup. Additional lower-severity issues affect asynchronous dialog dismissal, image-only copy feedback, search progress semantics, and accessible conversation timestamps.

This plan separates verified defects from subjective enhancements. Implementation is deliberately targeted and does not replace the current visual identity or architecture.

## Current-state assessment

### Architecture and invariants

- Next.js App Router with a client-side orchestration boundary in `components/HelloAIApp.tsx`.
- IndexedDB for conversations, messages, and attachment blobs; localStorage for preferences.
- Stateless same-origin API routes forwarding requests to the configured gateway.
- Root-scoped service worker with an offline shell and explicit user-controlled updates.
- CSS token and module approach in `app/styles/` with responsive and reduced-motion rules.
- Vitest unit tests and Playwright cross-browser/PWA tests in GitHub Actions.

### Strengths worth preserving

- No-login, browser-local product model and clear privacy messaging.
- Explicit initialization, offline, setup-required, paused, error, streaming, and update states.
- Focus-trapped application dialogs with focus restoration.
- Bounded image processing and strict backup validation.
- Cross-browser responsive test matrix and console-error assertions.
- Capability-aware model metadata and disabled controls.
- User-controlled service-worker activation that protects drafts and active work.

### Baseline evidence

- Baseline commit: `21d32620ec36c4efa7a1cd81774896f2f38448e2`.
- GitHub Actions run `31069468790`: completed successfully on 2026-08-06.
- Vercel status on the baseline commit: success.
- The local execution environment could not resolve GitHub directly, so the source review and publication use the connected GitHub API. Local command results will not be claimed; PR CI is the authoritative executable validation gate.

## Verified issues

### DATA-001 — Destructive edit/regenerate race after availability changes

- **Classification:** Verified defect
- **Severity:** High
- **Complexity:** Small
- **Regression risk:** Medium
- **Affected files:** `components/HelloAIApp.tsx`, `e2e/app.spec.ts`
- **Evidence:** Generation availability is checked when the edit dialog opens and by the message-action disabled state, but `performEdit` and `performRegenerate` do not re-check it immediately before `deleteMessagesAfter`. A user can open a confirmation, lose connectivity or gateway availability, confirm, and remove later messages before generation fails.
- **User impact:** Loss of the later portion of a local conversation branch and an error response instead of the expected regenerated result.
- **Accessibility impact:** The failure is communicated, but the destructive state change is unexpected and not recoverable.
- **Recommended solution:** Revalidate `generationAvailable` at the beginning of each destructive operation, before any message mutation or deletion. Keep existing send-path checks as defense in depth.
- **Testing:** Playwright scenario that opens a destructive confirmation, transitions offline, confirms, and verifies later messages remain and an availability message is shown.
- **Acceptance criteria:** No message is changed or deleted when generation is unavailable at confirmation time.

### CAP-001 — Queued images survive a switch to a text-only model

- **Classification:** Verified defect
- **Severity:** High
- **Complexity:** Small
- **Regression risk:** Low
- **Affected files:** `components/HelloAIApp.tsx`, `components/ChatComposer.tsx`, `e2e/app.spec.ts`
- **Evidence:** The attachment control becomes disabled for a non-vision model, but `chooseModel` does not clear existing `pendingImages`, and `sendMessage` does not reject image parts for a non-vision model.
- **User impact:** A request can be serialized with image content for a model declared text-only, leading to avoidable gateway errors or undefined provider behavior.
- **Accessibility impact:** The visual control says “Text model” while hidden queued state contradicts the announced capability.
- **Recommended solution:** Revoke preview URLs and remove queued images when switching to a non-vision model, notify the user, and add a send-path capability guard.
- **Testing:** E2E model payload with vision and text-only models; attach an image, switch model, verify the attachment is removed and the composer reports text-only capability.
- **Acceptance criteria:** No image part can be sent using a model whose metadata has `vision: false`.

### UI-001 — Speech control markup can differ during hydration

- **Classification:** Verified defect
- **Severity:** Medium
- **Complexity:** Small
- **Regression risk:** Low
- **Affected files:** `components/ChatMessages.tsx`, `e2e/app.spec.ts`
- **Evidence:** `speechAvailable` is computed from `window` during render. Client components are pre-rendered, so server markup omits the action while the first browser render may include it.
- **User impact:** Potential hydration warning, recoverable rerender, and unstable action layout on initial load with existing assistant messages.
- **Accessibility impact:** Assistive technology can encounter a control inserted during hydration without an intentional state transition.
- **Recommended solution:** Initialize feature availability to `false` and update it after mount with an effect.
- **Testing:** Existing global console-warning assertion plus an E2E load with pre-seeded assistant content where practical.
- **Acceptance criteria:** Initial server and hydration markup are stable; the speech action appears only after mounted feature detection.

### UX-001 — Async dialogs remain dismissible with Escape while work is pending

- **Classification:** Verified defect
- **Severity:** Medium
- **Complexity:** Small
- **Regression risk:** Low
- **Affected files:** `lib/use-modal-dialog.ts`, `components/ActionDialog.tsx`, `components/PwaInstallDialog.tsx`
- **Evidence:** Backdrop and visible buttons are disabled while submitting/working, but the shared Escape handler always calls `onClose`.
- **User impact:** A dialog can disappear while a destructive storage operation or browser installation prompt is still pending, obscuring completion and allowing conflicting actions.
- **Accessibility impact:** Focus can be restored to the invoking control while the modal operation remains active.
- **Recommended solution:** Add a dismissibility option to the modal hook and suppress Escape closure while pending. Add `aria-busy` to pending dialogs.
- **Testing:** Component or E2E assertion that Escape does not close a pending dialog.
- **Acceptance criteria:** Pending modal operations cannot be dismissed by backdrop, buttons, or Escape.

### UX-002 — Image-only messages expose a misleading Copy action

- **Classification:** Verified defect
- **Severity:** Low
- **Complexity:** Small
- **Regression risk:** Low
- **Affected files:** `components/ChatMessages.tsx`
- **Evidence:** Copy is rendered for every message, but `messageText` is empty for an image-only message; the handler then reports success after writing an empty string.
- **User impact:** Misleading success feedback and possible clipboard replacement with empty content.
- **Accessibility impact:** The accessible action name promises content that does not exist.
- **Recommended solution:** Render Copy only when extracted text is non-empty.
- **Testing:** Component/E2E assertion for image-only message action set.
- **Acceptance criteria:** Image-only messages do not offer a text-copy action.

### A11Y-001 — Search progress lacks a reliable live status role

- **Classification:** Verified defect
- **Severity:** Low
- **Complexity:** Small
- **Regression risk:** Low
- **Affected files:** `components/ConversationSidebar.tsx`
- **Evidence:** The spinner has an accessible label on a generic span, but no `role="status"` or live-region semantics.
- **User impact:** Screen-reader users may not know that delayed local search is in progress.
- **Recommended solution:** Give the spinner status semantics and hidden descriptive text without creating repeated announcements.
- **Testing:** Locator/role assertion in keyboard search coverage.
- **Acceptance criteria:** Search progress is exposed as a polite status and disappears when complete.

### A11Y-002 — Conversation timestamps expose only abbreviated visual text

- **Classification:** Verified defect
- **Severity:** Low
- **Complexity:** Small
- **Regression risk:** Low
- **Affected files:** `components/ConversationSidebar.tsx`
- **Evidence:** Sidebar dates show only time or month/day and are not represented by a `time` element with the full machine-readable date.
- **User impact:** Ambiguous dates across years and reduced context for assistive-technology users.
- **Recommended solution:** Use `time dateTime` with a full localized accessible label while retaining the compact visual format.
- **Testing:** DOM assertion for `dateTime` and accessible label.
- **Acceptance criteria:** Every conversation timestamp exposes its complete date and time programmatically.

## Subjective enhancements considered

The following are not verified defects and are deferred:

- Replacing the native `details/summary` conversation menu with a custom roving-focus menu. The current control is keyboard operable; a custom menu would add complexity without a demonstrated blocker.
- Major visual restyling, new color palettes, or brand replacement. The present hierarchy and identity are coherent.
- Virtualizing the message list. Current usage is personal/local and no measured performance threshold demonstrates that virtualization is necessary.
- Adding analytics, cloud sync, authentication, or a backend database. These conflict with product invariants.
- Adding visual snapshot baselines in this patch. This remains useful future work but should follow explicit baseline approval.

## Prioritized implementation sequence

1. Guard edit/regenerate mutations against last-moment availability changes (`DATA-001`).
2. Reconcile queued attachments when model capability changes and add send-path defense (`CAP-001`).
3. Stabilize mounted browser-feature detection (`UI-001`).
4. Make pending modal operations non-dismissible and announce busy state (`UX-001`).
5. Correct copy, search-status, and timestamp semantics (`UX-002`, `A11Y-001`, `A11Y-002`).
6. Add regression coverage and run the full CI matrix.
7. Review the final diff for secrets, debug output, unrelated churn, privacy regressions, and service-worker/cache changes.

## Validation approach

Required executable gates:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
PLAYWRIGHT_PRODUCTION=1 npm run test:e2e
npm audit --audit-level=high
npm run check
```

GitHub Actions is authoritative in this environment and must complete both `validate` and `e2e` successfully. Manual/source-level verification will cover keyboard focus, offline transitions, image capability changes, responsive action visibility, light/dark parity, and PWA update/install flows. No merge is permitted with pending, skipped, unavailable, or failing required checks.

## Final acceptance criteria

- All verified High issues are fixed.
- No destructive edit/regenerate mutation occurs after generation availability is lost.
- Text-only models cannot receive queued image parts.
- No hydration warning is produced by speech-action detection.
- Pending modal work cannot be dismissed with Escape.
- Search progress and compact timestamps have correct programmatic semantics.
- Lint, TypeScript, unit tests, production build, dependency audit, combined check, and cross-browser Playwright all pass.
- The final diff contains no credentials, temporary artifacts, debug statements, unrelated dependency changes, or changes to the local-first/privacy architecture.

## Deferred or rejected recommendations

- Physical-device install-sheet verification remains a release-certification activity because OS-controlled UI cannot be fully automated in headless browsers.
- Live gateway smoke testing is deferred unless test credentials are explicitly available; automated tests must not consume shared provider quota.
- Durable global rate limiting remains deployment infrastructure work and is outside this UI remediation scope.
