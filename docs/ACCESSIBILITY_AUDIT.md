# Accessibility Audit

Date: 2026-06-18

Scope:
- App shell navigation, command palette and notification surfaces.
- Core domain screens in `web/src/screens`.
- Shared primitives and global CSS in `web/src/components` and `web/src/styles`.
- Source-level review plus existing smoke/build validation. No browser/assistive-technology lab pass was run in this iteration.

## Summary

Nova Studio has a usable semantic base for forms and many icon buttons already carry labels. The main accessibility risks are keyboard reachability for clickable non-button elements, inconsistent focus indication outside form fields, and missing dialog semantics on the command palette and notification panel.

## Strengths

- Form fields are generally wrapped by `Field`, so labels are visible and close to controls.
- Destructive icon-only actions often include `aria-label`, especially in proposal, knowledge and client detail sublists.
- The command palette supports arrow keys, Enter and Escape.
- Uploaded images use `alt` text through `Ph` or explicit `img` attributes in most inspected paths.
- Drawer close controls include an accessible label and Escape handling.

## Findings

### High Priority

1. Clickable `div` navigation is not keyboard reachable.
   Evidence: `Sidebar` nav items, project tabs, command palette rows, notification rows and several project cards use `div` with `onClick`.
   Impact: keyboard and switch users cannot reliably reach primary navigation and cards.
   Recommendation: use native `button`/`a` elements, or add `role`, `tabIndex`, and keyboard handlers only where native elements cannot be used.

2. Focus styles are incomplete for non-form controls.
   Evidence: CSS has focus treatment for `.input`, `.field input`, `.field textarea` and `.field select`, but not for `.btn`, `.nav-item`, `.proj-tab`, `.card[onClick]`, command rows or tweak controls.
   Impact: keyboard users can lose track of the active control.
   Recommendation: add a shared `:focus-visible` ring for buttons, links and custom interactive classes.

3. Modal/panel semantics are inconsistent.
   Evidence: `TweaksPanel` declares `role="dialog"`, while command palette, notification panel and `EditDrawer` rely mostly on visual scrims.
   Impact: screen readers may not receive dialog context or a reliable accessible name.
   Recommendation: add `role="dialog"`, `aria-modal="true"` and labelled headings to modal-like surfaces.

### Medium Priority

4. Search inputs need explicit accessible names.
   Evidence: global search and command palette search rely on placeholders.
   Impact: placeholder-only labels are weaker for assistive technology and disappear during entry.
   Recommendation: add `aria-label` or visible labels for search controls.

5. Some icon-only buttons rely on `title` instead of `aria-label`.
   Evidence: topbar command palette and tweaks buttons use `title`; notification and close buttons use `aria-label`.
   Impact: `title` is inconsistently announced and not enough for touch users.
   Recommendation: use `aria-label` for every icon-only command.

6. Graph interaction is partly pointer-only.
   Evidence: knowledge graph nodes are SVG groups with `onClick`.
   Impact: keyboard users can view the graph but cannot select nodes from the SVG.
   Recommendation: add a keyboard-accessible node list or make SVG nodes focusable with labels and Enter/Space handlers.

### Low Priority

7. Status and color-coded indicators need redundant text everywhere.
   Evidence: most status dots include text, but swatches and palette chips sometimes rely on color plus nearby copy.
   Impact: color-only meaning can be missed by low-vision users.
   Recommendation: keep visible text for semantic status and add titles/labels to decorative swatches where needed.

8. Reduced-motion preference is not explicitly handled.
   Evidence: animation classes and transition styles exist without a `prefers-reduced-motion` override.
   Impact: motion-sensitive users may see avoidable animation.
   Recommendation: add a global reduced-motion override for transitions and animations.

## Recommended Implementation Order

1. Convert app shell navigation/project tabs/cards from clickable `div` patterns to native controls.
2. Add global `:focus-visible` styling for buttons, links and custom interactive controls.
3. Add dialog semantics to command palette, notification panel and edit drawer.
4. Add `aria-label` to icon-only topbar controls and explicit labels for search inputs.
5. Make the knowledge graph selection path keyboard accessible.
6. Add `prefers-reduced-motion` CSS.

## Validation Follow-Up

After remediation, run:
- `npm run smoke`
- `npm run build`
- A keyboard-only walkthrough of project creation, project navigation, proposal export and presentation open/close.
- A screen-reader spot check for app shell navigation, edit drawer, command palette and notification panel.
