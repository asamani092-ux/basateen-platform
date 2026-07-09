# بساتين — Design Tokens

مصدر الحقيقة: [`visual-refresh/project/Basatin Design System.dc.html`](../visual-refresh/project/Basatin%20Design%20System.dc.html)

## Core Palette

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `primary` | `#1e3a8a` | `#2563eb` | الأزرار والروابط الرئيسية |
| `primary-hover` | `#172e6d` | `#3b82f6` | حالة تحويم الأساسي |
| `primary-foreground` | `#ffffff` | `#ffffff` | نص فوق الأساسي |
| `background` | `#e7edf5` | `#0a1628` | خلفية الصفحة |
| `foreground` | `#0f172a` | `#eef3fb` | النص الأساسي |
| `card` | `#ffffff` | `#132337` | خلفية البطاقات |
| `card-foreground` | `#0f172a` | `#eef3fb` | نص داخل البطاقات |
| `secondary` | `#dbe7fb` | `#1c3a5e` | ثانوي — خلفيات هادئة |
| `secondary-foreground` | `#1e3a8a` | `#bfd4f2` | نص فوق الثانوي |
| `muted` | `#eef2f8` | `#172c44` | خلفية مكتومة |
| `muted-foreground` | `#526077` | `#93a4bd` | نص ثانوي/تلميحات |
| `accent` | `#e6eefb` | `#1c3a5e` | تمييز خفيف |
| `accent-foreground` | `#1e3a8a` | `#bfd4f2` | نص فوق التمييز |
| `border` | `#c2cfe0` | `#21395a` | حدود العناصر |
| `input` | `#b9c8dc` | `#24405f` | حدود الحقول |
| `input-background` | `#f5f8fc` | `#0f2033` | خلفية الحقول |
| `ring` | `#1e3a8a` | `#3b82f6` | حلقة التركيز |
| `destructive` | `#f43f5e` | `#fb7185` | حذف / خطر |

## Semantic Status

| Token | Light | Dark |
|-------|-------|------|
| `success` | `#15803d` | `#4ade80` |
| `success-surface` | `#dcfce7` | `#0f2e1c` |
| `success-foreground` | `#166534` | `#86efac` |
| `warning` | `#b45309` | `#fbbf24` |
| `warning-surface` | `#fef3c7` | `#3a2a0a` |
| `warning-foreground` | `#92400e` | `#fcd34d` |
| `info` | `#0369a1` | `#38bdf8` |
| `info-surface` | `#e0f2fe` | `#082f42` |
| `info-foreground` | `#075985` | `#7dd3fc` |

## Attendance

| Token | Light | Dark | Surface Light | Surface Dark |
|-------|-------|------|---------------|--------------|
| `attendance-present` | `#15803d` | `#4ade80` | `#dcfce7` | `#0f2e1c` |
| `attendance-absent` | `#dc2626` | `#f87171` | `#fee2e2` | `#3a1212` |
| `attendance-excused` | `#b45309` | `#fbbf24` | `#fef3c7` | `#3a2a0a` |

## Typography

Font families: **Tajawal** (UI), **IBM Plex Mono** (code).

| Scale | Size | Weight | Line height |
|-------|------|--------|-------------|
| `title` | 30px | 700 | 1.25 |
| `section` | 20px | 700 | 1.35 |
| `body` | 16px | 400 | 1.6 |
| `data` | 15px | 500 | 1.5 |
| `caption` | 13px | 500 | 1.4 |

## Spacing

4px ladder: `space-1` 4px · `space-2` 8px · `space-3` 12px · `space-4` 16px · `space-6` 24px · `space-8` 32px

Row density: compact 44px (8×12 padding) · comfortable 52px (12×16 padding)

Touch targets: **≥ 44px** for buttons and inputs.

## Radius

| Token | Value |
|-------|-------|
| `sm` | 8px |
| `md` / `--radius` | 12px (0.75rem) |
| `lg` | 16px |
| `3xl` | 24px |
| `full` | 999px |

Cards use `rounded-3xl` (24px).

## Elevation

| Level | Light | Dark |
|-------|-------|------|
| e1 | `0 1px 2px rgba(15,23,42,.06)` | `0 1px 2px rgba(0,0,0,.4)` |
| e2 | `0 2px 8px rgba(15,23,42,.08)` | `0 2px 10px rgba(0,0,0,.45)` |
| e3 | `0 8px 24px rgba(15,23,42,.10)` | `0 10px 28px rgba(0,0,0,.5)` |
| e4 | `0 16px 40px rgba(15,23,42,.14)` | `0 20px 48px rgba(0,0,0,.6)` |
