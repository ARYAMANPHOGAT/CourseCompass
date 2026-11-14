"""Initialise and validate local data. Called by setup.bat; safe to run repeatedly.

    python -m app.setup_check
"""
from __future__ import annotations

import sys

from .config import Settings
from .preprocessing import run_preprocessing


def main() -> int:
    settings = Settings()
    print("[check] CourseCompass data check")
    if not settings.processed_catalog.exists():
        if settings.raw_csv.exists():
            print("[check] Processed catalog missing - running preprocessing from the raw CSV ...")
            report = run_preprocessing(settings.raw_csv, settings.processed_catalog, settings.preprocess_report)
            print(f"[check] {report['input_rows']} rows -> {report['output_records']} courses")
        else:
            print("[check] No processed catalog and no raw CSV: the bundled SAMPLE catalog will be used.")
    from .services import AppServices  # imported late so preprocessing above runs first

    services = AppServices(settings)
    kind = services.catalog.source_kind
    print(f"[check] Catalog: {len(services.catalog)} records ({'SAMPLE data' if kind == 'sample' else 'Coursera dataset'})")
    for note in services.catalog.load_notes:
        print(f"[check]   note: {note}")
    print(f"[check] Synthetic demo cohort: {services.cohort['meta'].get('n_users')} learners ({services.cohort_status})")
    if services.get_evaluation() is None:
        print("[check] Computing offline evaluation (a few seconds) ...")
        services.run_evaluation()
    print("[check] Evaluation report ready")
    print(f"[check] User data folder ready: {services.settings.user_data_dir.name}/ ({len(services.repo.FILES)} JSON files)")
    if services.repo.recovered_files:
        print(f"[check] Recovered unreadable files (originals kept as *.corrupt-*.json): {services.repo.recovered_files}")
    print("[check] OK")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # pragma: no cover - surfaced to setup.bat
        print(f"[check] FAILED: {exc.__class__.__name__}: {exc}", file=sys.stderr)
        raise SystemExit(1)
