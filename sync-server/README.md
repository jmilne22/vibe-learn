# vibe-learn Sync Server (PocketBase)

Optional backend for cross-device sync. Without this, everything
works offline via localStorage. With it, users sign in with GitHub
and their progress follows them across devices.

## Quick Start

```bash
# 1. Download PocketBase (single binary, ~25 MB)
#    Pick the right build for your platform:
#    https://github.com/pocketbase/pocketbase/releases/latest
#
#    Example (Linux amd64):
wget https://github.com/pocketbase/pocketbase/releases/latest/download/pocketbase_0.25.9_linux_amd64.zip
unzip pocketbase_0.25.9_linux_amd64.zip

# 2. Copy migrations into working directory
cp -r pb_migrations ./pb_migrations

# 3. Start PocketBase (auto-creates SQLite DB + applies migrations)
./pocketbase serve --http=0.0.0.0:8090
```

## Configure GitHub OAuth

1. Open the admin UI at `http://localhost:8090/_/`
2. Create an admin account on first visit
3. Go to **Settings → Auth providers → GitHub**
4. Enter your GitHub OAuth App credentials:
   - Create one at https://github.com/settings/developers
   - Authorization callback URL: `https://your-pb-domain.com/api/oauth2-redirect`
5. Go to **Settings → CORS** and add your static site's domain

## Build Courses with Sync

```bash
# Set the sync URL when building
VIBE_LEARN_SYNC_URL=https://pb.example.com npm run build

# Or per-course in course.yaml:
# course:
#   syncUrl: "https://pb.example.com"
```

## Data Storage

All sync data lives in a single SQLite file: `pb_data/data.db`.

Back it up with: `cp pb_data/data.db backup.db`

## Architecture

- One row per user per course per localStorage key
- Keys synced: progress, exercise-progress, srs, personal-notes,
  streaks, activity, last-module, focus-mode, timer-sound, and plugin keys
- Conflict resolution: last-writer-wins for most keys,
  per-entry merge for SRS and exercise progress
