# Stride Design System

The reference images establish a visual direction, not content or brand assets to copy. Stride adapts their shared qualities—editorial typography, extreme contrast, acid-lime emphasis, modular cards, and tactile pill controls—to running analytics.

## Principles

1. **Performance at a glance.** One dominant number or message per card; supporting detail stays secondary.
2. **Editorial, not clinical.** Oversized greetings and concise human language sit beside precise units and confidence labels.
3. **Lime means action or progress.** It is reserved for primary actions, selected navigation, positive emphasis, and chart focus—not every decoration.
4. **Evidence stays visible.** AI and projections always expose confidence, coverage, or an evidence action.
5. **Mobile is primary.** Core tasks fit thumb reach; dense analytics progressively expand on larger screens.

## Foundations

| Token | Value | Use |
|---|---:|---|
| Ink | `#090909` | App background and strong controls |
| Raised ink | `#171717` | Dark cards and chart surfaces |
| Paper | `#F2F2EE` | Light cards and neutral actions |
| Acid lime | `#C8FF22` | Primary action, selection, positive data |
| Signal yellow | `#FFE85A` | Running-power feature card only |
| Muted | `#A8AAA5` | Secondary labels |
| Divider | `#30302D` | Dark-surface boundaries |

Typography uses Manrope for display/numerals and DM Sans for UI/body copy. Display headings use tight tracking and compact line height. Numeric values should use tabular figures when they update in place.

Radii: 16px controls, 24px metric cards, 34px feature panels, and fully rounded pills. Use a 4px base spacing system with primary intervals of 8, 12, 16, 24, 32, 48, and 64px.

## Components

- **Metric tile:** label/trend at top; dominant value/unit at bottom. Lime, paper, or raised-ink variants.
- **Insight panel:** lime background, one human headline, short evidence-based explanation, confidence/evidence access.
- **Power panel:** signal-yellow only, critical power as the dominant number, W/kg and Stryd coverage beneath.
- **Segmented control:** dark capsule with one paper selection; minimum 44px touch target.
- **Primary action:** paper pill on dark backgrounds; lime may be used for the singular page action.
- **Navigation:** compact desktop rail; floating paper bottom bar on mobile; selected item is high contrast.
- **Charts:** minimal grid, direct labels, lime primary series and paper comparison series. Never rely on color alone.

## Screen guidance

- **Login:** centered paper panel on ink; wordmark, username field, six separate PIN positions, one lime continue action. Errors are generic and inline.
- **Dashboard:** editorial greeting, horizontal mobile metric cards, AI insight, load/form, power, recent run.
- **Activity:** route or treadmill context first; key pace/HR/power summary; synchronized charts; laps in a compact list.
- **Projection:** current fitness and 30-day outcome dominate; baseline, conservative, and build scenarios use patterned or labeled series.

## Accessibility

- Maintain WCAG AA contrast and visible keyboard focus.
- Touch targets are at least 44×44px.
- Charts require textual summaries, direct labels, and non-color distinctions.
- Respect reduced-motion settings; avoid decorative motion in data views.
- Lime-on-paper is not suitable for small text; pair lime with ink.

