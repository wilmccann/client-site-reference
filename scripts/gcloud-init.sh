#!/usr/bin/env bash
# Point gcloud at this site's GCP project and region, so every later command
# (gcloud run ..., gcloud logging ..., Antigravity CLI) targets the right place.
# Safe to re-run. Works in Cloud Shell and on a laptop with the gcloud CLI.
#
#   bash scripts/gcloud-init.sh
#
# On a laptop this sets up a named gcloud configuration, "my-site", and never
# changes whichever configuration is active, so other projects are left alone.
# The repo's .gcloud-config file names that configuration. Select it with
# `export CLOUDSDK_ACTIVE_CONFIG_NAME=my-site`, or from a shell hook that reads
# .gcloud-config on `cd`. See README.md, "Deploying your own copy".
set -euo pipefail

PROJECT_ID="YOUR_GCP_PROJECT_ID"
REGION="us-central1"
CONFIG="my-site"   # must match .gcloud-config

if [[ "${CLOUD_SHELL:-}" == "true" ]]; then
  # Cloud Shell is its own environment; just set up whichever configuration it's using.
  CONFIG="$(gcloud config configurations list --filter=is_active=true --format='value(name)')"
else
  if ! gcloud config configurations describe "$CONFIG" >/dev/null 2>&1; then
    gcloud config configurations create "$CONFIG" --no-activate
  fi
  if [[ -z "$(gcloud config get account --configuration "$CONFIG" 2>/dev/null)" ]]; then
    ACCOUNT="$(gcloud config get account 2>/dev/null)"
    if [[ -z "$ACCOUNT" ]]; then
      echo "No signed-in account found. Run: gcloud auth login   then re-run this script." >&2
      exit 1
    fi
    gcloud config set account "$ACCOUNT" --configuration "$CONFIG"
  fi
fi

gcloud config set project "$PROJECT_ID" --configuration "$CONFIG"
gcloud config set run/region "$REGION" --configuration "$CONFIG"
gcloud config set artifacts/location "$REGION" --configuration "$CONFIG"

# Application Default Credentials are what client libraries and AI agents
# (e.g. Antigravity CLI's Google Cloud tools) use; keep their quota project in sync.
# Cloud Shell hands out tokens without an ADC file, and set-quota-project needs the file.
ADC_FILE="${CLOUDSDK_CONFIG:-$HOME/.config/gcloud}/application_default_credentials.json"
if [[ -f "$ADC_FILE" ]] && gcloud auth application-default print-access-token >/dev/null 2>&1; then
  gcloud auth application-default set-quota-project "$PROJECT_ID" --quiet ||
    echo "Could not set the ADC quota project. gcloud commands are unaffected." >&2
elif [[ "${CLOUD_SHELL:-}" == "true" ]]; then
  : # Cloud Shell's built-in credentials need no setup.
else
  echo
  echo "NOTE: Application Default Credentials are missing or expired, so their quota project"
  echo "was not set. gcloud and Claude Code don't need them. Only if you run Antigravity CLI"
  echo "on this computer: gcloud auth application-default login   then re-run this script."
fi

echo
echo "gcloud configuration \"$CONFIG\" targets:"
gcloud config configurations describe "$CONFIG" \
  --format="table[box](properties.core.account,properties.core.project,properties.run.region)"
echo
echo "Sanity check (should list my-site):"
CLOUDSDK_ACTIVE_CONFIG_NAME="$CONFIG" gcloud run services list --format="table(metadata.name,status.url)" ||
  echo "Could not list services. Check that the account above has access to $PROJECT_ID."
