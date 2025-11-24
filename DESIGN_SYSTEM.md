# Workfit Design System

Based on the Figma UI Kit, this design system provides a consistent visual language and component library for the Workfit fitness application.

## Color Palette

### Primary Colors

```css
--primary: #1F2937 (gray-900)
--primary-foreground: #FFFFFF
```
Used for: Main buttons, primary text, dark UI elements

### Secondary Colors

```css
--secondary: #6366F1 (indigo-600)
--secondary-foreground: #FFFFFF
```
Used for: Accent blue elements, secondary CTAs

### Accent Colors (Coral/Orange)

```css
--accent: #FF6B52
--accent-light: #FF8A73
--accent-dark: #E5533A
```
Used for: Links, checkboxes, highlights, "Forgot password" links, active states

### Coral Scale

```
50:  #FFF5F2
100: #FFE5DE
200: #FFCBBF
300: #FFB0A0
400: #FF8A73
500: #FF6B52 (default)
600: #E5533A
700: #CC3B22
800: #B22710
900: #991705
```

### Grayscale

```
50:  #F9FAFB
100: #F3F4F6
200: #E5E7EB
300: #D1D5DB
400: #9CA3AF
500: #6B7280
600: #4B5563
700: #374151
800: #1F2937
900: #111827
```

### Background Colors

- **Default**: `#FFFFFF` - Main background
- **Secondary**: `#F9FAFB` - Input fields, secondary backgrounds
- **Tertiary**: `#F3F4F6` - Subtle background variations

### Text Colors

- **Primary**: `#111827` - Main headings, body text
- **Secondary**: `#6B7280` - Subtitles, helper text
- **Tertiary**: `#9CA3AF` - Placeholder text
- **Inverse**: `#FFFFFF` - Text on dark backgrounds

### Status Colors

- **Success**: `#10B981` (green)
- **Error**: `#EF4444` (red)
- **Warning**: `#F59E0B` (amber)
- **Info**: `#3B82F6` (blue)

## Typography

### Font Sizes

```
xxs:  0.625rem (10px) - line height 0.75rem
xs:   0.75rem  (12px) - line height 1rem
sm:   0.875rem (14px) - line height 1.25rem
base: 1rem     (16px) - line height 1.5rem
lg:   1.125rem (18px) - line height 1.75rem
xl:   1.25rem  (20px) - line height 1.75rem
2xl:  1.5rem   (24px) - line height 2rem
3xl:  1.875rem (30px) - line height 2.25rem
4xl:  2.25rem  (36px) - line height 2.5rem
5xl:  3rem     (48px) - line height 1
```

### Font Weights

- **Normal**: 400 - Body text
- **Medium**: 500 - Subtle emphasis
- **Semibold**: 600 - Labels, links
- **Bold**: 700 - Headings, important labels

### Usage Guidelines

- **Headings**:
  - H1: `text-3xl font-bold` (30px)
  - H2: `text-2xl font-bold` (24px)
  - H3: `text-xl font-semibold` (20px)
- **Body**: `text-base` (16px)
- **Labels**: `text-base font-bold` (16px)
- **Helper Text**: `text-sm text-text-secondary` (14px)

## Spacing

### Custom Spacing Scale

```
18:  4.5rem  (72px)
88:  22rem   (352px)
128: 32rem   (512px)
```

### Standard Spacing

Use Tailwind's default spacing scale (4px increments):
- `p-2` = 8px
- `p-4` = 16px
- `p-6` = 24px
- `p-8` = 32px
- etc.

## Border Radius

```
none:    0
sm:      0.25rem  (4px)
default: 0.5rem   (8px)
md:      0.75rem  (12px)
lg:      1rem     (16px)
xl:      1.25rem  (20px)
2xl:     1.5rem   (24px)
3xl:     2rem     (32px)
full:    9999px
```

### Usage Guidelines

- **Input fields**: `rounded-xl` (20px)
- **Buttons**: `rounded-xl` to `rounded-2xl` (20-24px)
- **Cards**: `rounded-2xl` to `rounded-3xl` (24-32px)
- **Avatars/Pills**: `rounded-full`

## Components

### Button

```jsx
import { Button } from '@/components/workfit';

// Primary button
<Button variant="primary" size="md">
  Login
</Button>

// Other variants
<Button variant="secondary">Secondary</Button>
<Button variant="accent">Accent</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="link">Link</Button>

// With loading state
<Button isLoading>Loading...</Button>

// Full width
<Button fullWidth>Full Width</Button>

// With icon
<Button icon={<Icon />}>With Icon</Button>
```

**Variants:**
- `primary` - Dark gray/black background (#1F2937)
- `secondary` - Indigo background (#6366F1)
- `accent` - Coral/orange background (#FF6B52)
- `outline` - White with border
- `ghost` - Transparent with hover
- `link` - Text only with underline

**Sizes:**
- `sm` - Small (padding: 8px 16px)
- `md` - Medium (padding: 12px 24px) - default
- `lg` - Large (padding: 16px 32px)

### Input

```jsx
import { Input } from '@/components/workfit';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';

// Basic input
<Input
  label="Email"
  placeholder="Your email"
  type="email"
/>

// With icon
<Input
  label="Email"
  icon={Mail}
  placeholder="Your email"
/>

// With right icon (e.g., password toggle)
<Input
  label="Password"
  icon={Lock}
  rightIcon={showPassword ? EyeOff : Eye}
  onRightIconClick={() => setShowPassword(!showPassword)}
  type={showPassword ? "text" : "password"}
/>

// With error
<Input
  label="Email"
  error="Please enter a valid email"
/>
```

### Checkbox

```jsx
import { Checkbox } from '@/components/workfit';

<Checkbox
  label="Remember me"
  checked={rememberMe}
  onChange={(e) => setRememberMe(e.target.checked)}
/>
```

The checkbox uses the coral/orange accent color (#FF6B52) when checked.

### Link

```jsx
import { Link } from '@/components/workfit';

// Accent link (coral/orange)
<Link variant="accent">Forgot password?</Link>

// Primary link
<Link variant="primary">Learn more</Link>

// Different sizes
<Link size="sm">Small link</Link>
<Link size="base">Base link</Link>
<Link size="lg">Large link</Link>
```

## Layout Patterns

### Mobile Auth Screen

```jsx
<div className="min-h-screen bg-white flex flex-col">
  {/* Status Bar */}
  <div className="flex justify-between items-center px-6 pt-3 pb-2">
    <span className="text-base font-semibold">9:41</span>
    {/* Status icons */}
  </div>

  {/* Back Button */}
  <div className="px-4 pt-2 pb-6">
    <button className="w-10 h-10">
      {/* Back arrow */}
    </button>
  </div>

  {/* Content */}
  <div className="flex-1 px-6 pb-8 overflow-y-auto">
    {/* Form content */}
  </div>

  {/* Bottom Indicator */}
  <div className="flex justify-center pb-2">
    <div className="w-32 h-1 bg-gray-900 rounded-full" />
  </div>
</div>
```

### Form Layout

```jsx
<form className="space-y-6">
  <div className="mb-10">
    <h1 className="text-3xl font-bold text-gray-900 mb-2">
      Heading
    </h1>
    <p className="text-gray-500 text-base">
      Subtitle
    </p>
  </div>

  <Input label="Email" />
  <Input label="Password" type="password" />

  <div className="flex items-center justify-between pt-2">
    <Checkbox label="Remember me" />
    <Link variant="accent">Forgot password?</Link>
  </div>

  <Button fullWidth variant="primary">
    Submit
  </Button>
</form>
```

## Usage in Tailwind

All design tokens are available as Tailwind classes:

```jsx
// Colors
<div className="bg-primary text-primary-foreground">
<div className="bg-accent text-white">
<div className="text-text-secondary">

// Coral scale
<div className="bg-coral-500 hover:bg-coral-600">

// Typography
<h1 className="text-3xl font-bold">
<p className="text-base text-text-secondary">

// Spacing & Borders
<div className="p-6 rounded-2xl border border-gray-200">
```

## Migration Guide

To migrate existing components to the new design system:

1. **Replace color classes:**
   - `bg-purple-600` → `bg-primary`
   - `bg-blue-600` → `bg-secondary`
   - Links: `text-purple-600` → `text-accent`

2. **Update component imports:**
   ```jsx
   import { Button, Input, Checkbox, Link } from '@/components/workfit';
   ```

3. **Use design tokens:**
   - Instead of arbitrary colors, use the defined palette
   - Apply consistent border radius (`rounded-xl`, `rounded-2xl`)
   - Use spacing scale (p-4, p-6, mb-3, etc.)

4. **Follow typography guidelines:**
   - Headings: `font-bold`
   - Labels: `font-bold`
   - Links: `font-semibold`
   - Body: default weight

## Best Practices

1. **Consistency**: Always use design tokens rather than arbitrary values
2. **Accessibility**: Maintain color contrast ratios (WCAG AA minimum)
3. **Mobile-first**: Design for mobile, enhance for desktop
4. **Touch targets**: Minimum 44x44px for interactive elements
5. **Loading states**: Always show loading indicators on async actions
6. **Error handling**: Provide clear, actionable error messages
7. **Focus states**: Ensure keyboard navigation is visible and intuitive

## Resources

- Figma File: [Workfit - UI Kit](https://www.figma.com/design/ZUsAFlgJfbfGkNNzr4L5hh/Workfit---UI-Kit)
- Tailwind Config: `frontend/tailwind.config.js`
- Components: `frontend/src/components/workfit/`
