# Campus Connect Design System v1.0

Campus Connect uses a compact, accessible application language shared by current and future TIET modules. Import styles in this order: `theme.css`, `globals.css`, `components.css`, then `layout.css`.

## Foundation

- Brand: `--cc-primary`, `--cc-primary-dark`, `--cc-primary-soft`, and `--cc-primary-glow`.
- Surfaces: `--cc-background`, `--cc-surface`, `--cc-surface-soft`, `--cc-border`.
- Content: `--cc-text`, `--cc-muted`, `--cc-navy`.
- Accents: lavender, peach, lime, and mint are reserved for compact informational cards.
- Spacing follows the `--cc-space-1` through `--cc-space-8` scale. Radius, shadow, transition, focus, content-width, and z-index tokens are also centralized in `theme.css`.

The font stack is Inter, Plus Jakarta Sans, Segoe UI, then sans-serif. Body text is 13.5px on mobile and 14.5px on desktop. Use the title, section, and hero tokens rather than one-off sizes. Prefer weights 500–650.

## Components

`AppButton` supports `outlinePrimary` (the default), `solidPrimary`, `neutral`, `danger`, `ghost`, and `icon`. Submit buttons default to `solidPrimary`; use solid styling only for final save, submit, confirm, or approval actions.

Cards use `cc-card` plus a semantic variant: `cc-stat-card`, `cc-action-card`, `cc-hero-card`, or `cc-list-card`. Legacy `card` remains an alias during migration. `DashboardStatCard` accepts `tone="lavender|peach|lime|mint"`.

Inputs and selects use a 42px control height, compact labels, neutral borders, and the shared maroon focus ring. Keep helper and validation text directly associated with its field.

```jsx
<AppButton variant="outlinePrimary">Open module</AppButton>
<AppButton type="submit">Save changes</AppButton>
<DashboardStatCard icon={Building2} label="Societies" value={24} tone="lavender" />
```

## Navigation and responsive behavior

Mobile retains the rounded maroon header and fixed white bottom navigation with 44px minimum targets. Desktop switches at 769px to a fixed white 232px sidebar, compact top bar, and centered content capped by `--cc-content-max`. Product layouts should be checked at 360, 390, 768, 1024, and 1440px.

## Rules for future modules

Use tokens instead of raw repeated colors, spacing, radii, shadows, or z-index values. Keep pages light; reserve the navy-to-maroon treatment for a single hero or identity surface. Default actions are outlined, destructive actions use danger, and only final commits use solid primary. Preserve semantic HTML, visible focus, keyboard operation, 44px mobile targets, reduced-motion preferences, and horizontal-overflow safety.
