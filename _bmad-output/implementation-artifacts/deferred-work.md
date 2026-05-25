# Deferred work (implementation artifacts)

## Deferred from: code review of aix-245-backfill-project-attribution.md (2026-05-22)

- **Массовый `update_all` без колбэков/валидаций** — осознанный компромисс для `timeseries.tool_events`; не блокер AIX-245.
- **Timescale сжатые чанки** — операционный runbook (декомпрессия при необходимости); вне объёма текущего кода.
- **Частичный прогон при обрыве** — повторный запуск идемпотентен по условию `project_id IS NULL`; отдельный checkpoint не требовался спекой.
- **Стоимость `dry_run` (много COUNT)** — приемлемая цена за предсказуемость без записи; оптимизация при необходимости позже.
