# Houseplant Tracker — UI Design References

These are **standalone HTML mockups**, not the running application. Open either file directly in a browser (no Docker, server, libraries, or network required).

- `screen-a-my-plants.html` — My Plants: search, filter chips, card gallery, location, condition, watering status, add-plant placeholder. The Monstera card links to Screen B.
- `screen-b-plant-details.html` — Plant Details: cover image, plant identity, watering shortcut, static species care guide, personal growing conditions, recent activities. Back link returns to Screen A.

Both screens include responsive layouts and an interactive **English / עברית** toggle with RTL support. The language selection is remembered in localStorage where permitted. Some actions show a "design preview only" notification; no data is saved.

## Architecture guidance for implementation

- Use React + TypeScript for the actual UI. These HTML files provide visual / layout references, not production source code.
- Plant instances, dates, notes, photos, and activity history: backend + SQLite + persistent photo storage.
- Species reference information: **pre-generated bilingual JSON**, loaded by the backend from the version-controlled read-only catalog; **no AI calls at runtime**.
- Common names should be primary display labels in the selected language; scientific names secondary.
- Include correct layout direction and localized UI strings throughout the implementation.
- The illustrations are vector artwork embedded into each HTML file so references are entirely offline-capable. Replace with the user's actual plant photos in the finished app.
- All sample care values and dates are illustrative, not authoritative botanical advice.
