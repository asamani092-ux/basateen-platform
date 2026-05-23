# Wave-1 — Test Checklist (5 roles × login × redirect)

## Preconditions

- [ ] `apps/web` builds (`npm run build`)
- [ ] Worker deployed or local mock auth for UI-only test
- [ ] Optional: `POST /api/setup/seed-users?key=...` for API-backed roles

## Mobile login (all roles)

| # | Mobile | Expected role | Expected redirect |
|---|--------|---------------|-------------------|
| 1 | 0500000001 | `general_manager` | `/admin/staff` |
| 2 | 0500000002 | `edu_supervisor` | `/edu-supervisor` |
| 3 | 0500000003 | `prog_supervisor` | `/prog-supervisor` |
| 4 | 0500000004 | `general_supervisor` | `/general-supervisor` |
| 5 | 0500000005 | `teacher` | `/teacher` |

For each row:

- [ ] Login shows «منصة بساتين» + large logo (no email/password mention)
- [ ] Login page accepts mobile only (no email/password fields)
- [ ] Invalid mobile shows error
- [ ] After login, lands on **home path** above
- [ ] Logout returns to `/login`

## Permission boundaries

| Action | teacher | edu_supervisor | prog_supervisor | general_supervisor | general_manager |
|--------|---------|----------------|-----------------|--------------------|-----------------|
| `/teacher` | ✅ | ❌ redirect | ❌ | ❌ | ❌ |
| `/edu-supervisor` | ❌ | ✅ | ❌ | ✅ | ❌ |
| `/edu-supervisor/yom-himma` | ❌ | ✅ | ❌ | ✅ | ❌ (ملخص في الإحصائيات فقط) |
| `/prog-supervisor` | ❌ | ❌ | ✅ | ✅ | ❌ |
| `/general-supervisor` | ❌ | ❌ | ❌ | ✅ | ❌ |
| `/admin/staff` | ❌ | ❌ | ❌ | ❌ | ✅ |
| `/admin/circles-setup` | ❌ | ❌ | ❌ | ❌ | ✅ |
| `/admin/statistics` | ❌ | ❌ | ❌ | ❌ | ✅ |
| `/admin/students` | ❌ | ✅ | ❌ | ✅ | ❌ |
| `/tv-live` (no login) | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/tv-live?key=…` (مفتاح يوم الهمة) | ✅ | ✅ | ✅ | ✅ | ✅ |
| زر «بث شاشة التلفاز» | ❌ | ❌ | ❌ | ✅ | ✅ |
| إنشاء جلسة يوم الهمة | ❌ | ✅ | ❌ | ✅ | ❌ (اطلاع فقط) |

## Legacy redirects

- [ ] `/dashboard` → correct home per role
- [ ] `/teacher` → `/teacher/daily-log`
- [ ] `/admin/students/import` → `/admin/students?tab=excel`

## UI kit compliance

- [ ] No new hex colors in page files (use `theme.css` / `design-system.ts`)
- [ ] RTL on all authenticated layouts
- [ ] `/tv-live` has **no** sidebar
- [ ] Tajawal font applied globally

## Preserved features

- [ ] Students list + Excel tab on `/admin/students`
- [ ] Transfers page `/admin/transfers`
- [ ] API token sync for staff roles (when Worker + seed available)
