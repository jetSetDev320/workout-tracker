# Workout Tracker

A mobile-first workout tracker designed for GitHub Pages. It uses plain HTML, CSS and JavaScript with IndexedDB for local storage. No backend, account, analytics or third-party runtime dependency.

## Features

- Create multiple programmes and workout days.
- Add, edit and remove exercises with set, rep-range and target-RIR prescriptions.
- Log weight, reps and RIR per set; entries autosave locally.
- Resume unfinished sessions and review completed sessions.
- View exercise-level recorded set history.
- Import a plan JSON file and export a full JSON backup.
- Service-worker app-shell cache for offline reopening after the first visit.

## Run locally

Serve this directory from a local web server, for example:

```bash
python -m http.server 8000
```

Open http://localhost:8000. Opening `index.html` directly as a `file://` URL is not supported.

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

## Privacy and backups

All workout data is stored in IndexedDB in the current browser on the current device. There is no cloud sync. Clearing browser site data can permanently erase it. Export backups regularly and store them somewhere separate from the device. Browser persistent-storage requests are best-effort; the browser decides whether to grant them.

## GitHub Pages

In **Settings → Pages**, choose **Deploy from a branch**, select branch `main` and folder `/ (root)`, then save. GitHub will publish the static app at `https://jetsetdev320.github.io/workout-tracker/`. The GitHub connection used here cannot change the repository's Pages setting, so this one-time setting must be enabled in the repository UI.
