# Completion Pass — Reproduction Notes

## BUG 1 — Archive export
**Before:** Export semester archive → `Cannot read properties of undefined (reading 'start_date')`.
**After:** Uses `adminDeptSemesterExportAllJson()`; succeeds even when semester dates are null.

## BUG 2 — Staff role change
**Before:** Change teacher → track_supervisor; circle still shows them as teacher (not «غير مسندة»).
**After:** `clearStaffGroupAssignments` runs on role change; circle shows unassigned immediately.

## BUG 3 — Student assignment scope
**Before:** Student without `stage_id` sees all circles/tracks.
**After:** Stage required before placement options; migration `062` backfills `stage_id` where derivable.

## BUG 4 — Memorization display
**Before:** Raw face count prominent; breakdown in faint small text.
**After:** Readable breakdown (أجزاء/أحزاب/أوجه) shown as primary banner above numeric input.

## BUG 5 — Attendance false green
**Before:** UTC midnight flipped `has_record` vs write path (Riyadh +3).
**After:** Unified `todayRiyadhIso()` O(1) on all attendance read/write paths.

## Phase C — Orphan pages
- `TeacherHubPage` → `TeacherPlansPage` (no «قريباً»).
- `/edu-dept/students/:studentId` → `StudentProfilePage` with id from route.

## Phase D — Security
- Production boot blocked without `JWT_SECRET` + `SETUP_KEY`.
- Default password login blocked until change via `/api/auth/change-password`.
- `/tv-live` + `/api/tv/summary` require `TV_ACCESS_TOKEN` (or yom-himma `key`).
- `/api/health` reports `migrations.pending`.

## Migrations (production)
```bash
./scripts/d1-remote-migrate.sh apply-pending
# or individually: 060, 061, 062, 063
```
