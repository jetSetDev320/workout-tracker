# Workout Tracker

A mobile-first, local-first workout tracker built with plain HTML, CSS and JavaScript. It runs as a static site on GitHub Pages and stores training data in IndexedDB on the current browser and device. No account, backend, analytics or third-party runtime dependency.

## Features

- Multiple training programmes with active-programme switching.
- Workout days and exercise prescriptions: sets, rep ranges and target reps in reserve (RIR).
- Add, edit, remove and reorder workout days and exercises.
- Per-set logging for load, reps and RIR, with autosave and last-session load suggestions.
- Resume unfinished sessions, add/remove sets, session notes and a built-in rest timer.
- Double-progression guidance based on the last completed performance and target RIR.
- Exercise progress view: select an exercise, filter the date range, and chart top weight, reps or per-set volume.
- Set-by-set history and completed-session details.
- Body weight, waist, chest, upper-arm, thigh and hip measurements, including body-weight trend.
- JSON workout-plan import and full JSON backup/restore with validation and confirmation.
- Installable PWA shell with offline reopening after the first successful load.

## Use the app

Open **https://jetsetdev320.github.io/workout-tracker/**. On a phone, use the browser's **Add to Home Screen** or **Install** option.

## Run locally

Serve this directory from a local web server:

```bash
python -m http.server 8000
```

Open http://localhost:8000. Opening `index.html` directly as a `file://` URL is not supported because the app uses IndexedDB and a service worker.

## Plan import format

```json
{
  "format": "workout-tracker-plan",
  "version": 1,
  "programme": { "name": "My programme" },
  "days": [{
    "name": "Upper body",
    "exercises": [{
      "name": "Chest Press",
      "sets": 3,
      "min": 8,
      "max": 12,
      "rir": 2
    }]
  }]
}
```

## Data and privacy

All training data stays in IndexedDB in the current browser on the current device. There is no cloud sync between devices. Clearing browser site data can permanently erase it. Export backups regularly and store them separately. Storage persistence is requested where the browser supports it, but the browser decides whether to grant it.

## Deployment

GitHub Pages is configured to deploy from **GitHub Actions**. Every push to `main` runs the workflow in `.github/workflows/pages.yml`. No manual build step or framework installation is required; the repository root is uploaded as the static site.
