#!/usr/bin/env python3
"""
Quét toàn bộ thư mục IELTS HTML, sinh dữ liệu cho giao diện và phát hiện file trùng.

Chạy:  python tools/build_catalog.py

Kết quả:
  - data/tests.json       -> danh sách đề + metadata
  - data/duplicates.json  -> các nhóm file có nội dung trùng nhau
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path
from typing import Dict, List

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
TESTS_PATH = DATA_DIR / "tests.json"
DUPLICATES_PATH = DATA_DIR / "duplicates.json"

IGNORE_FILES = {"index.html"}
CHUNK_SIZE = 1024 * 1024  # 1 MB


def main() -> None:
  html_files = list(discover_html_files())
  if not html_files:
    print("Không tìm thấy file .html nào.", file=sys.stderr)
    sys.exit(1)

  DATA_DIR.mkdir(parents=True, exist_ok=True)

  entries: List[Dict[str, object]] = []
  hashes: Dict[str, List[str]] = {}

  for path in html_files:
    rel_path = path.relative_to(ROOT).as_posix()
    digest = compute_hash(path)
    meta = path.stat()
    entry = {
      "title": path.stem,
      "file": rel_path,
      "category": detect_category(path.name),
      "hash": digest,
      "size": meta.st_size,
      "modified": meta.st_mtime,
    }
    entries.append(entry)
    hashes.setdefault(digest, []).append(rel_path)

  entries.sort(key=lambda item: item["title"].lower())
  duplicates = [
    {"hash": h, "files": sorted(files)}
    for h, files in hashes.items()
    if len(files) > 1
  ]

  TESTS_PATH.write_text(json.dumps(entries, ensure_ascii=False, indent=2), encoding="utf-8")
  DUPLICATES_PATH.write_text(json.dumps(duplicates, ensure_ascii=False, indent=2), encoding="utf-8")

  print(f"Đã ghi {len(entries)} đề vào {TESTS_PATH.relative_to(ROOT)}")
  if duplicates:
    print(f"⚠️  Phát hiện {len(duplicates)} nhóm trùng, xem {DUPLICATES_PATH.relative_to(ROOT)}")
  else:
    print("Không tìm thấy file trùng.")


def discover_html_files():
  for path in ROOT.rglob("*.html"):
    if not path.is_file():
      continue
    if path.name in IGNORE_FILES:
      continue
    if "node_modules" in path.parts:
      continue
    yield path


def detect_category(filename: str) -> str:
  lower = filename.lower()
  if "listening" in lower:
    return "listening"
  if "reading" in lower:
    return "reading"
  if "writing" in lower:
    return "writing"
  return "other"


def compute_hash(path: Path) -> str:
  digest = hashlib.sha1()
  with path.open("rb") as fh:
    for chunk in iter(lambda: fh.read(CHUNK_SIZE), b""):
      digest.update(chunk)
  return digest.hexdigest()


if __name__ == "__main__":
  main()

