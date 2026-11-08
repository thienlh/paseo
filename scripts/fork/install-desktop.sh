#!/usr/bin/env bash
# Build the desktop app from this checkout and install it as /Applications/Paseo.app.
#
#   scripts/fork/install-desktop.sh            build, install, relaunch
#   scripts/fork/install-desktop.sh --no-launch
#   scripts/fork/install-desktop.sh --skip-build   reinstall the last build
#   scripts/fork/install-desktop.sh --yes      don't prompt before a daemon restart
#
# The build is ad-hoc signed, not notarized, and its updater points at a feed that
# doesn't exist, so official releases never replace it.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_DEST="/Applications/Paseo.app"
BACKUP_DIR="$HOME/.paseo-fork"
LAUNCH=1
BUILD=1
ASSUME_YES=0

for arg in "$@"; do
  case "$arg" in
    --no-launch) LAUNCH=0 ;;
    --skip-build) BUILD=0 ;;
    --yes | -y) ASSUME_YES=1 ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 2
      ;;
  esac
done

cd "$ROOT"

# Node: the repo pins a version in .tool-versions; CI builds with Node 22.
want_node="$(awk '$1 == "nodejs" { print $2 }' .tool-versions)"
want_major="${want_node%%.*}"
if [ "$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)" != "$want_major" ]; then
  if command -v mise >/dev/null 2>&1; then
    node_dir="$(cd "$HOME" && mise where "node@$want_node" 2>/dev/null || true)"
    if [ -z "$node_dir" ]; then
      (cd "$HOME" && mise install "node@$want_node")
      node_dir="$(cd "$HOME" && mise where "node@$want_node")"
    fi
    export PATH="$node_dir/bin:$PATH"
  else
    echo "Need Node $want_node (have $(node -v 2>/dev/null || echo none)). Install it or mise." >&2
    exit 1
  fi
fi

# Homebrew's libvips makes sharp compile from source; use its prebuilt binary.
export SHARP_IGNORE_GLOBAL_LIBVIPS=1

arch="$(uname -m)"
case "$arch" in
  arm64) builder_arch="--arm64"; out_dir="mac-arm64" ;;
  x86_64) builder_arch="--x64"; out_dir="mac" ;;
  *) echo "Unsupported arch: $arch" >&2; exit 1 ;;
esac
built_app="$ROOT/packages/desktop/release/$out_dir/Paseo.app"

if [ "$BUILD" = 1 ]; then
  if [ ! -f node_modules/.package-lock.json ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
    echo "→ Installing dependencies"
    npm ci
  fi

  echo "→ Building desktop app (node $(node -v), $(git rev-parse --short HEAD))"
  NODE_OPTIONS="--max-old-space-size=8192" npm run build:desktop -- \
    --mac dir "$builder_arch" --publish never \
    -c.mac.identity=null \
    -c.mac.notarize=false

  # electron-builder rejects a publish override from the CLI, so point the updater
  # at a feed that 404s after the fact. The updater treats a missing channel file
  # as "no update" and shows no error.
  cat >"$built_app/Contents/Resources/app-update.yml" <<'YAML'
provider: generic
url: https://raw.githubusercontent.com/thienlh/paseo/main/.no-desktop-updates/
updaterCacheDirName: paseo-updater
YAML
  codesign --force --deep --sign - "$built_app"
fi

if [ ! -d "$built_app" ]; then
  echo "No build at $built_app. Run without --skip-build." >&2
  exit 1
fi

new_version="$(defaults read "$built_app/Contents/Info.plist" CFBundleShortVersionString)"
old_version=""
if [ -d "$APP_DEST" ]; then
  old_version="$(defaults read "$APP_DEST/Contents/Info.plist" CFBundleShortVersionString 2>/dev/null || true)"
fi

# The desktop app restarts the daemon when its version differs from the running
# daemon's, which stops every running agent.
if [ -n "$old_version" ] && [ "$old_version" != "$new_version" ] &&
  lsof -nP -iTCP:6767 -sTCP:LISTEN >/dev/null 2>&1 && [ "$ASSUME_YES" = 0 ]; then
  echo "Version changes $old_version → $new_version. On launch the app restarts the daemon"
  echo "on :6767, which stops running agents."
  read -r -p "Continue? [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]] || exit 1
fi

if pgrep -xq Paseo; then
  echo "→ Quitting Paseo"
  osascript -e 'quit app "Paseo"' >/dev/null 2>&1 || true
  for _ in $(seq 1 30); do
    pgrep -xq Paseo || break
    sleep 0.5
  done
  if pgrep -xq Paseo; then
    echo "Paseo is still running. Quit it and re-run with --skip-build." >&2
    exit 1
  fi
fi

# Capture first: `codesign | grep -q` fails under pipefail when grep exits early.
signature="$(codesign -dv "$APP_DEST" 2>&1 || true)"
if [[ "$signature" == *"TeamIdentifier=99ZMJMKU9Y"* ]]; then
  mkdir -p "$BACKUP_DIR"
  # Zipped so Launch Services doesn't register a second sh.paseo.desktop bundle.
  echo "→ Backing up official app to $BACKUP_DIR/Paseo-official.zip"
  rm -f "$BACKUP_DIR/Paseo-official.zip"
  ditto -c -k --keepParent "$APP_DEST" "$BACKUP_DIR/Paseo-official.zip"
fi

echo "→ Installing $new_version to $APP_DEST"
rm -rf "$APP_DEST"
ditto "$built_app" "$APP_DEST"

if [ "$LAUNCH" = 1 ]; then
  open "$APP_DEST"
fi
echo "✓ Installed Paseo $new_version from $(git rev-parse --abbrev-ref HEAD)@$(git rev-parse --short HEAD)"
