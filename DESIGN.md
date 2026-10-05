# Design Brief

## Direction

Mission Control — a dark, data-dense creative-ops control room where a multi-agent AI pipeline streams live, with a signal-orange tally accent marking anything active.

## Tone

Industrial/utilitarian executed with cinematic precision — a broadcast control room, not a consumer dashboard; density is the aesthetic.

## Differentiation

A signal-orange "tally light" accent (not the tech-standard cyan or violet) paired with a recessed monospace terminal surface, so every live state reads like an on-air indicator.

## Color Palette

| Token      | OKLCH         | Role   |
| ---------- | ------------- | ------ |
| background | 0.155 0.012 265 | near-black graphite canvas |
| foreground | 0.94 0.008 265 | primary text |
| card       | 0.195 0.014 265 | elevated panel surfaces |
| primary    | 0.7 0.19 42     | signal-orange accent / running / live |
| accent     | 0.7 0.19 42     | active nav + primary actions |
| muted      | 0.25 0.016 265  | secondary fills, inactive rails |
| terminal   | 0.115 0.012 265 | recessed log/terminal surface |
| success    | 0.68 0.16 152   | completed / approved |
| warning    | 0.76 0.15 78    | pending approval |
| destructive| 0.62 0.2 27     | halted / rejected |

## Typography

- Display: Space Grotesk — headings, wordmark, panel titles, stage names
- Body: DM Sans — UI labels, body copy, table cells
- Mono: Geist Mono — logs, timestamps, IDs, token counts, status codes
- Scale: hero `text-4xl md:text-6xl font-bold tracking-tight`, h2 `text-xl md:text-2xl font-bold tracking-tight`, label `text-[11px] font-semibold tracking-widest uppercase`, body `text-sm`, data `text-sm font-mono font-tabular`

## Elevation & Depth

Panels sit on `bg-card` with a 1px `border-border` and `shadow-panel`; the terminal recesses below the card plane with `shadow-inset-terminal`; modals/popovers use `shadow-elevated` — depth via layering, never glow.

## Structural Zones

| Zone    | Background       | Border      | Notes                                             |
| ------- | ---------------- | ----------- | ------------------------------------------------- |
| Header  | bg-card          | border-b    | wordmark + role chip + sign-out; sticky top       |
| Sidebar | bg-sidebar       | border-r    | active item: orange left-border + accent tint     |
| Content | bg-background    | —           | `grid-mesh` texture; sections alternate bg-muted/30 |
| Panels  | bg-card          | border      | dense right-rail telemetry cards                  |
| Footer  | bg-muted/40      | border-t    | build/version + status summary                    |

## Spacing & Rhythm

Compact 8px base grid; panels use `p-3`/`p-4`, section gaps `gap-4`, page padding `px-4 md:px-6`; density stays high on desktop and stacks to single column under `md`.

## Component Patterns

- Buttons: 6px radius, solid `bg-primary` for primary, ghost/outline for secondary, `hover:brightness-110`, 150ms
- Cards: 6px radius, `bg-card` + `border-border` + `shadow-panel`, no rounding excess
- Badges: pill, tinted background at 15% + full-strength text per status token; running badge pulses
- Terminal: `bg-terminal` + `shadow-inset-terminal`, mono log lines with colored level prefixes

## Motion

- Entrance: panels `animate-fade-up` 350ms staggered; log lines `animate-log-in` 180ms
- Hover: `transition-smooth` 300ms on borders/backgrounds; no scale bounce
- Decorative: `animate-status-pulse` on running badges, `animate-live-blink` on LIVE dot, subtle `animate-scan` on active pipeline node

## Constraints

- Dark mode is the primary theme; light mode is a tuned counterpart, never a plain inversion
- No purple/cyan gradients, no neon glow shadows, no rounded-everything, no raw hex in components
- All color via semantic tokens; status colors consumed through `text-status-*` / badge tokens only
- Respect `doNotBuild`: no media-generation UI, no collaboration/workspaces, no export bundles

## Signature Detail

The status system: each pipeline stage badge carries its own OKLCH semantic token, and the running stage pulses like a broadcast tally light — status color is the interface's spine.
