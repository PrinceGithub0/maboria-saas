# Sidebar Mock Usage

This mock adds a premium, calm sidebar for **Maboria Control** with a cohesive icon set.

## Files

- `icons/`:
  - `*.svg`: raw SVG assets (`24x24`, `stroke=currentColor`, `stroke-width=2`)
  - `*.tsx`: React icon components (PascalCase)
  - `index.ts`: exports all icons
- `components/Sidebar.tsx`: sidebar component using the icon set
- `components/Sidebar.css`: visual tokens + sidebar styles
- `components/App.tsx`: quick mock wrapper with an active item example

## Use in React

```tsx
import { App } from "./components/App";
```

Or mount only the sidebar:

```tsx
import { Sidebar } from "./components/Sidebar";

<Sidebar activeItem="automation-operations" />;
```

## Notes

- Icons are intentionally neutral in default state.
- Only the active row uses the accent color via CSS (`--accent`).
- To tune branding, edit tokens in `components/Sidebar.css`.
