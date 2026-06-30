#!/usr/bin/env bash
# macOS: bấm đúp file này để chụp ảnh website → tải lên → ghi link (Windows dùng enrich.bat).
# Chạy chung logic với enrich.sh để không trùng lặp.
cd "$(dirname "$0")" || exit 1
bash ./enrich.sh "$@"
