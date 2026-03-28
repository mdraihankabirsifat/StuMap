# StuMap

StuMap is a simple student search and map viewer for Bangladesh.

You can:
- Search students by `id`, `name`, `thana`, or `addrress`
- Click a student to zoom to the matching upazila polygon
- Add a new student from the sidebar form

## Tech Stack

- HTML, CSS, Vanilla JavaScript
- Leaflet.js for map rendering
- GeoJSON for upazila boundaries

## Project Files

- `index.html` - App layout
- `style.css` - UI design
- `app.js` - Search, filtering, map sync, and add-student logic
- `students.json` - Student dataset
- `bangladesh.geojson` - Main upazila polygon source used for accurate map focus

## Data Model

Each student object uses this structure:

```json
{
  "id": "2405001",
  "name": "Tofayel Ahmed",
  "thana": "Brahmanpara",
  "addrress": "East Chandipur, Malapara, Brahmanpara, Cumilla"
}
```

Note: The field name is intentionally `addrress` (same as current project data).

## How It Works

1. App loads `students.json` and `bangladesh.geojson`.
2. It builds an index of upazila names from `NAME_4` in the GeoJSON.
3. Search uses `filter()` to match against student fields.
4. Results are rendered using `map()` in the sidebar.
5. On click, the map:
   - resolves thana name (with alias candidates if needed)
   - highlights the matched polygon
   - fits map bounds to that area
   - drops a marker at computed geometry center

## Run Locally

Because this app uses `fetch()`, run it via a local server (not double-click file open).

### Option A: Python

```bash
cd StuMap
python -m http.server 5500
```

Then open:

`http://localhost:5500`

### Option B: VS Code Live Server

- Install the Live Server extension
- Right-click `index.html`
- Click **Open with Live Server**

## Customization

- Update student entries in `students.json`
- Refine alias mapping in `app.js` (`THANA_ALIAS_CANDIDATES`) for unmatched name variations
- Adjust map style colors in `app.js` inside `L.geoJSON(..., { style })`

## Known Notes

- If a new thana is not found in `bangladesh.geojson`, the app shows a status warning after add.
- Keep thana names consistent with Bangladesh upazila naming to maximize auto-match accuracy.
