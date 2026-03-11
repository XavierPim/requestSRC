# Manual Smoke Checklist

- Table sorting persists and returns consistent ordering while moving between pages.
- Sort icon displays `▲` or `▼` on the active sorted column.
- `Previous` is disabled on the first page and `Next` is disabled on the last page.
- Page indicator shows `Page X of Y (N logs)` and updates after sorting/paging.
- Graph updates every 5 seconds in graph view without duplicate series growth.
- Switching `Group By` and `Time Range` rebuilds the chart datasets correctly.
- Graph no-data message appears when no points exist and chart is removed cleanly.
- Returning data after a no-data period recreates the chart without stale datasets.
