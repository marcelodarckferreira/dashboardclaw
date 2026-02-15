# PLAN: Compact Header & Compose Layout (Mobile-Friendly)

## Problem
- New Session and Send buttons consume excessive space, especially on mobile.
- Layout is not mobile-friendly.
- Queue button is rarely used and clutters the UI.

## Goals
1. Move **New Session** to the top-right header, immediately to the right of the focus-mode toggle.
2. Replace the large **New Session** button with a compact icon-only button ("New Note" style).
3. Move the **Send** button **inside** `field chat-compose__field`.
4. Replace the text "Send" label with a simple icon (up arrow / enter key / paper plane).
5. While the agent is responding, the Send button becomes a **Stop** button (icon + behavior).
6. Remove visible **Queue** button/functionality from the main UI (underlying logic can remain for now).

## UX / Behavior Design

### Header
- Keep existing **focus-mode toggle** button as-is.
- Add an icon-only **New Session** button directly to its right:
  - Class: `btn btn--sm btn--icon` (matching focus toggle style).
  - Icon: "New Note" style sprite (document-with-plus or notepad).
  - Tooltip/title: `"New session"`.
- Remove the existing large New Session button from the main content area.

### Compose Area
- Within `field chat-compose__field`:
  - Input takes up most of the horizontal space.
  - Add a right-aligned **primary icon button** for Send.
  - Text label "Send" is removed; only the icon is shown.
- Behavior:
  - **Idle state:**
    - Icon: up-arrow/plane/enter symbol.
    - `aria-label="Send message"`.
    - Enabled only when there is non-empty text in the input.
  - **Streaming state:**
    - Icon switches to **Stop** (square or X).
    - `aria-label="Stop response"`.
    - Clicking stops the current agent response.

### Queue Functionality
- Remove the **Queue** button (and any associated visible UI) from the compose area.
- Underlying queue logic may remain in state/handlers for now but no longer surfaced in the primary UI.

## Implementation Steps

1. **Locate Components**
   - Find the header component that renders the focus-mode toggle button.
   - Find the component that renders the New Session button.
   - Find the chat compose component that uses `chat-compose__field` and renders Send/Queue.
   - Identify state flags that indicate:
     - A request/response is currently streaming (e.g., `isStreaming` / `isRunning`).
     - Any queue/secondary send modes.

2. **Header Refactor**
   - Extract the existing New Session button logic (handler for starting a new session).
   - Render a new icon-only button next to the focus-mode toggle in the header:
     - Use the same button size + style classes as the focus toggle.
     - Hook up the New Session handler.
   - Remove the old New Session button from its original location.

3. **Compose Refactor**
   - In `chat-compose__field`:
     - Ensure a flex layout that allows: `[textarea][icon-button]` on one line.
     - Add a right-side icon-only button wired to the send handler.
   - Remove the existing Send + Queue button group.
   - Preserve keyboard behavior:
     - Enter → send; Shift+Enter → newline (or match current behavior).

4. **Send ↔ Stop State Machine**
   - Use the existing streaming/active state (e.g., `isStreaming`):
     - When **not** streaming:
       - Show Send icon.
       - onClick → send handler.
     - When streaming:
       - Show Stop icon.
       - onClick → stop handler.
   - Remove any separate Stop button instances from the UI.

5. **Queue Cleanup**
   - Remove Queue button and references from the compose component.
   - If necessary, gate remaining queue-related logic behind a feature flag or keep it inactive for now.

6. **Responsive & Styling**
   - Verify layout on:
     - Mobile/narrow widths: header icons remain on a single line; compose bar stays compact.
     - Desktop: spacing feels proportional; no excess vertical padding.
   - Use existing design system classes where possible; minimize new, custom CSS.

7. **Accessibility**
   - Ensure all new icon-only buttons have:
     - Accessible `aria-label`.
     - `title` for tooltips.
     - Visible focus outlines for keyboard navigation.

8. **Testing & Cleanup**
   - Update any tests or snapshots that depend on old button text or positions.
   - Manually test:
     - Starting a new session from the header button.
     - Sending messages via click and keyboard.
     - Stopping streaming responses with the new Stop behavior.
     - Mobile viewport behavior (DevTools responsive mode).
