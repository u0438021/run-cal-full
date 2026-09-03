# RUN|CAL Design System

## Brand

- Kinetic Orange `#FF5A1F`: primary action, active navigation, progress and role accents.
- Deep Black `#121212`: dark surfaces/text.
- Pure White `#FFFFFF`: light surfaces/text.
- Neutral greys: hierarchy, borders, secondary copy; define accessible tokens during implementation.
- Typography: Geist with system fallback.
- Style: minimal sport analytics—high signal, disciplined density, generous spacing, no decorative data noise.

## Semantic tokens

Create theme tokens for canvas, elevated surface, text primary/secondary, border, accent, focus, success, warning and danger. Do not hard-code light/dark colors inside components. Orange is an accent, not body-copy color. Meet WCAG AA contrast and visible focus requirements.

## Layout

- Mobile: single-column cards, sticky primary actions where helpful, bottom navigation, ≥44px touch targets.
- Tablet/desktop: collapsible dark sidebar, centered content grid, compact summary cards and two-column charts where readable.
- Charts: labels/units and accessible summaries; do not rely on color alone. Missing is `— / Not available`, never `0`.
- Maps: route is prominent on activity detail, compact on Home; privacy by default.

## Components

Buttons (primary orange, secondary, quiet, danger), fields, six-cell PIN, segmented control, cards, stat tiles, tabs/range selector, table/lap card, chart panel, empty/error/processing states, availability badge, source/quality badge, approval diff, role comment, notification badge, workspace/athlete switchers.

## Content

Use neutral, evidence-aware language: “Needs Review,” “Data unavailable,” “Insufficient data,” “Proposed change.” Avoid “bad athlete,” diagnostic language, or unsupported “optimal/safe/risk” labels.

