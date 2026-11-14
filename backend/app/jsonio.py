"""Small, dependency-free helpers for safe JSON file I/O."""
from __future__ import annotations

import json
import logging
import os
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger("coursecompass.jsonio")


def atomic_write_json(path: Path, data: Any, *, indent: int | None = 2) -> None:
    """Write JSON atomically: temp file in the same folder, fsync, then os.replace.

    os.replace is atomic on Windows and POSIX when source and target are on the same
    volume, so readers never observe a half-written file. On Windows the replace can
    briefly fail if another process (e.g. antivirus) holds the target, so retry.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as fh:
            json.dump(data, fh, ensure_ascii=False, indent=indent, default=str)
            fh.write("\n")
            fh.flush()
            os.fsync(fh.fileno())
        try:
            os.chmod(tmp_name, 0o644)  # mkstemp creates 0600; keep data files readable like normal files
        except OSError:  # pragma: no cover
            pass
        last_error: OSError | None = None
        for attempt in range(6):
            try:
                os.replace(tmp_name, path)
                return
            except PermissionError as exc:  # pragma: no cover - Windows file locking
                last_error = exc
                time.sleep(0.05 * (attempt + 1))
        if last_error:  # pragma: no cover
            raise last_error
    finally:
        if os.path.exists(tmp_name):
            try:
                os.remove(tmp_name)
            except OSError:  # pragma: no cover
                pass


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def backup_corrupt_file(path: Path) -> Path | None:
    """Move an unreadable JSON file aside (never delete user data silently)."""
    if not path.exists():
        return None
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%f")
    backup = path.with_name(f"{path.stem}.corrupt-{stamp}{path.suffix}")
    try:
        os.replace(path, backup)
        logger.warning("Unreadable JSON file %s moved to %s", path.name, backup.name)
        return backup
    except OSError:  # pragma: no cover
        logger.exception("Could not back up corrupt file %s", path.name)
        return None


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()
