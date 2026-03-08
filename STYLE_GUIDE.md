# Unbound Styling Guide

This guide documents the current visual system used in the app so new UI work stays consistent with existing screens and components.

## 1) Design Foundation

### Tech stack

- Tailwind CSS v4 with inline `@theme` tokens in `frontend/src/index.css`
- `tw-animate-css` for utility animations
- `tailwind-scrollbar` plugin plus custom scrollbar utilities
- `cn()` helper (`clsx` + `tailwind-merge`) for class composition

### Typography

- Primary font: `Geist` (`body { font-family: "Geist", sans-serif; }`)
- Monospace font: `Geist Mono` (used for code via markdown code blocks)
- Typical sizing scale used across app:
    - Labels/meta: `text-[11px]`, `text-xs`
    - Body/UI copy: `text-sm`
    - Primary section/page titles: `text-lg`, `text-xl`

### Color tokens

Defined in `frontend/src/index.css`:

- `--color-dark-50 ... --color-dark-950` (neutral dark scale)
- `--color-primary-50 ... --color-primary-900` (light neutral accent scale)

Practical mapping in UI:

- App backgrounds: `dark-950` (outer shell), `dark-900` / `dark-850` / `dark-800` (surfaces)
- Borders/dividers: `dark-600`
- Default text: `dark-100` / `dark-50`
- Muted/supporting text: `dark-200` / `dark-300`
- Accent/interactive highlights: `primary-400` (indicators)
- Destructive: red scale (`red-300`, `red-400`, `red-500`) used directly for warnings/actions
- Success/info chips: emerald scale (`emerald-100` / `emerald-300` / `emerald-400`)

### Radius, borders, depth

- Core radius: `rounded-md` (default everywhere)
- Border style: `border border-dark-600`
- Shadows are subtle (`shadow-sm`) on floating surfaces (menus, popovers, modals)

### Motion

- Short transitions preferred: `duration-150` to `duration-300`
- Primary motion types:
    - Hover/focus color transitions
    - Fade/zoom entry on floating layers
    - Width/height transitions for collapsible panels
- Streaming/thinking shimmer effect via `.wave-text` (`wave-shimmer` keyframes)

## 2) Global Layout Patterns

### App shell

- Root app background: `bg-dark-900 text-white`
- Chat shell uses full viewport height: `h-screen`
- Left rail:
    - Expanded desktop width: `312px`
    - Collapsed desktop width: `60px` / `w-14` within sidebar
    - Mobile drawer width: `max-w-[312px]`

### Content width

- Conversation content container: `max-w-3xl` (up to `3xl:max-w-4xl`)
- Auth forms: `max-w-sm`
- Settings content: `max-w-2xl`

### Layering and overlays

- Mobile sidebar overlay/backdrop: `z-40` and `bg-black/50 backdrop-blur-sm`
- Sidebar panel on mobile: `z-50`
- Floating primitives:
    - Menus/Select popups: `z-50` or `z-10`
    - Modal backdrop/content: `z-50`

## 3) Component Conventions

### Buttons

From `Button` primitive:

- Base: `h-8`, `rounded-md`, `text-sm font-medium`, inline-flex center
- Variants:
    - `primary`: `bg-primary-50 text-dark-900 hover:bg-primary-400`
    - `default`: `bg-dark-700 text-white hover:bg-dark-600`
    - `ghost`: transparent base, dark hover
- Disabled: `data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed`

Usage guidance:

- Use `primary` for main action in a group
- Use `ghost` for secondary/lightweight actions
- Keep icon-only buttons square (`size-8`, `p-0`) unless context requires otherwise

### Inputs

`Input` and `PasswordInput` style:

- Container: `bg-dark-800 rounded-md px-2`
- Text: `text-sm text-white`
- Placeholder: `text-dark-200`
- Optional left/right sections for icons/actions

Rules:

- Preserve compact vertical rhythm (`py-1.5`)
- Use border wrappers (`border-dark-600`) only when needed by context (menus/inline edits)

### Select, Menu, Popover, Tooltip, Modal

- Floating surfaces are dark cards:
    - `bg-dark-800`
    - `border border-dark-600`
    - `rounded-md`
    - `shadow-sm`
    - animate in/out with fade+zoom
- Interactive items highlight with `bg-dark-700` and text shifts to `white`

Rules:

- Keep spacing dense and consistent (generally `px-2..3`, `py-1..1.5`)
- Use `text-xs` for utility menus/tooltips, `text-sm` for richer content
- Prefer subtle backdrop blur for modal overlays

### Selection controls

- `Switch`:
    - Off: `bg-dark-800`
    - On: `bg-primary-100`
    - Thumb inverts to dark when checked
- `Checkbox`:
    - Base: `bg-dark-800 border-dark-600`
    - Checked/indeterminate: `bg-primary-100 border-primary-100`

## 4) Chat Experience Styling

### Message presentation

- User messages align right and use contained bubble:
    - `rounded-md border border-dark-600 bg-dark-850`
    - Body text `text-sm leading-6 text-dark-50`
- Assistant messages render as markdown blocks without heavy bubble chrome
- Metadata rows are muted (`text-[11px] text-dark-300`) and compact

### Streaming and status signals

- Thinking/tool-progress labels use `.wave-text`
- Error messages are red and concise (`text-red-400` with warning icon)
- "Back to bottom" control appears only when scrolled up

### Input dock

- Input surface: `bg-dark-850 border-dark-600 rounded-md`
- Drag-over accent: `border-primary-500 ring-primary-500/30`
- Attachments shown as compact chips (`bg-dark-700`, rounded-md)
- Context meter color thresholds:
    - Normal: `primary-400`
    - Warning: `amber-400`
    - Critical: `red-400`

### Sidebar

- Sidebar base: `bg-dark-900 border-r border-dark-600`
- Active nav item: `bg-dark-700 text-dark-50`
- Inactive nav item: `text-dark-100` with dark hover background

## 5) Markdown and Rich Content

Markdown styling conventions:

- Paragraphs: `text-sm leading-7 text-dark-100`
- Headers: `text-dark-50` with descending weight/size by level
- Inline code: dark chip + accent text (`bg-dark-700 text-primary-300`)
- Code blocks:
    - Container border `dark-600`, rounded-lg
    - Header strip with language + copy action
    - Syntax theme is dark; code font is Geist Mono
- Links: `text-primary-400 underline` with lighter hover
- Blockquotes: left accent border `primary-400`, muted italic text
- Tables: dark bordered cells with dark header row

## 6) Interaction and Accessibility Baselines

- Cursor behavior globally normalized:
    - clickable elements show pointer
    - disabled elements show not-allowed
- Keyboard escape handling is implemented for transient UI (sidebar/modal/image viewer/context patterns)
- Focus styles are generally subtle/minimal; maintain keyboard reachability even with low-contrast visual focus
- Text contrast strategy:
    - high-emphasis text on dark backgrounds uses `dark-50`/white
    - supporting text uses `dark-200`/`dark-300`

## 7) Utility Classes and Shared Effects

- Scrollbars:
    - global slim scrollbar defaults
    - `.scrollbar-custom` and `.scrollbar-auto` for targeted behavior
    - `.hide-scrollbar` for visually hidden but scrollable areas
- Text shimmer utility: `.wave-text`
- Selection color tuned for dark theme via `::selection`

## 8) Do / Don't Rules for New UI

### Do

- Use tokenized dark/primary classes instead of ad-hoc hex values
- Reuse shared primitives from `frontend/src/components/ui`
- Match existing radius (`rounded-md`), border (`dark-600`), and spacing density
- Keep transitions short and understated
- Prefer `cn()` for conditional class composition

### Don't

- Introduce bright/saturated accents outside existing semantic usage without design review
- Mix incompatible radii/border weights in the same feature area
- Build one-off control styles when a UI primitive already exists
- Add heavy shadows, long animations, or high-motion effects in core workflows

## 9) File-Level Sources of Truth

- Theme tokens and global utilities: `frontend/src/index.css`
- Primitive UI components: `frontend/src/components/ui/*`
- Chat layout and interactions: `frontend/src/features/chat/components/*`
- Markdown rendering styles: `frontend/src/components/markdown/*`
- Auth/settings page implementations: `frontend/src/features/auth/components/*`, `frontend/src/routes/_chat.settings.tsx`

When in doubt, mirror the nearest existing pattern rather than inventing a new one.
