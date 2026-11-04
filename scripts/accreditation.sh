#!/usr/bin/env bash
#
# Backup the accreditation database (schema + data) into a timestamped folder.
#
# Exits non-zero if ANY step fails or the dump cannot be proven complete.
# This is a gate: callers may treat exit 0 as "a verified backup exists".
#
# Credentials come from the environment. Either:
#   DATABASE_URL=postgres://user:pass@host:5432/dbname
# or the discrete vars:
#   PG_HOST, PG_USER, PG_PASSWORD, PG_DATABASE
#
# Usage:
#   ./scripts/accreditation.sh                 # dump + verify completeness
#   BACKUP_DIR=/tmp/b ./scripts/accreditation.sh
#   VERIFY_RESTORE_URL=postgres://... ./scripts/accreditation.sh   # + restore test

set -euo pipefail

# --- Credentials -------------------------------------------------------------
# Never hardcode credentials here. This file is tracked in git.

# Decode percent-escapes (%40 -> @), so both correctly-encoded URLs and the
# common unencoded case work. Only well-formed %HH triples are decoded, and
# existing backslashes are escaped first, so a literal '%' or '\' in a password
# passes through intact rather than being mangled by printf %b.
percent_decode() {
	local s="${1//\\/\\\\}"
	s="$(printf '%s' "$s" | sed -E 's/%([0-9A-Fa-f]{2})/\\x\1/g')"
	printf '%b' "$s"
}

if [[ -n "${DATABASE_URL:-}" ]]; then
	# Parse postgres://user:pass@host:port/db (strips any ?query suffix).
	# Split creds from host on the LAST '@': passwords frequently contain '@',
	# and splitting on the first one silently mis-parses the host.
	proto_stripped="${DATABASE_URL#*://}"
	creds="${proto_stripped%@*}"
	hostpath="${proto_stripped##*@}"
	PG_USER="${PG_USER:-$(percent_decode "${creds%%:*}")}"
	PG_PASSWORD="${PG_PASSWORD:-$(percent_decode "${creds#*:}")}"
	hostport="${hostpath%%/*}"
	PG_HOST="${PG_HOST:-${hostport%%:*}}"
	# Only treat the suffix as a port if one was actually specified.
	if [[ "$hostport" == *:* ]]; then
		PG_PORT="${PG_PORT:-${hostport##*:}}"
	fi
	dbname="${hostpath#*/}"
	PG_DATABASE="${PG_DATABASE:-${dbname%%\?*}}"
fi

: "${PG_HOST:?set PG_HOST or DATABASE_URL}"
: "${PG_USER:?set PG_USER or DATABASE_URL}"
: "${PG_PASSWORD:?set PG_PASSWORD or DATABASE_URL}"
: "${PG_DATABASE:?set PG_DATABASE or DATABASE_URL}"
PG_PORT="${PG_PORT:-5432}"

export PGPASSWORD="$PG_PASSWORD"

# --- Client tools ------------------------------------------------------------
# Resolve pg_dump rather than hardcoding a Homebrew path, then require its major
# version to MATCH the server.
#
# Both directions are unsafe here, for different reasons:
#
#   client < server  pg_dump cannot know the newer catalog and may silently
#                    produce an incomplete dump.
#
#   client > server  pg_dump emits SET commands for parameters the older server
#                    does not have, so the dump will not RESTORE. Verified: a
#                    v17 dump of this v16 server fails at line 11 with
#                    'unrecognized configuration parameter "transaction_timeout"'
#                    (a PG17-only GUC). The dump looks perfect otherwise.
#
# Dumping from a newer client is supported by PostgreSQL in general; the
# constraint here is that the RESTORE TARGET is this same v16 server. Matching
# the client to it is what makes the backup usable.

# Any libpq client can ask the server its version, so probe first, then pick the
# matching tools. Explicit PG_DUMP/PSQL always win — never override an operator.

PROBE_PSQL="${PSQL:-$(command -v psql || true)}"
if [[ ! -x "${PROBE_PSQL:-}" ]]; then
	for d in /opt/homebrew/opt/postgresql@*/bin /usr/local/opt/postgresql@*/bin; do
		[[ -x "$d/psql" ]] && { PROBE_PSQL="$d/psql"; break; }
	done
fi
[[ -x "${PROBE_PSQL:-}" ]] || { echo "Error: no psql found. Set PSQL." >&2; exit 1; }

server_major="$("$PROBE_PSQL" -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DATABASE" \
	-tAc 'SHOW server_version;' | grep -oE '^[0-9]+')"
[[ -n "$server_major" ]] || { echo "Error: could not determine server version." >&2; exit 1; }

# Auto-pin a client matching the server. The default pg_dump on PATH is often a
# newer major (e.g. 17 here), which produces a dump this v16 server cannot
# restore. Prefer a version-matched client when one is installed rather than
# making every caller remember to export PG_DUMP.
matched_bin=""
for d in "/opt/homebrew/opt/postgresql@${server_major}/bin" \
         "/usr/local/opt/postgresql@${server_major}/bin"; do
	if [[ -x "$d/pg_dump" && -x "$d/psql" ]] && "$d/pg_dump" --version >/dev/null 2>&1; then
		matched_bin="$d"
		break
	fi
done

auto_pinned=false
if [[ -z "${PG_DUMP:-}" ]]; then
	if [[ -n "$matched_bin" ]]; then
		PG_DUMP="$matched_bin/pg_dump"
		auto_pinned=true
	else
		PG_DUMP="$(command -v pg_dump || true)"
	fi
fi
if [[ -z "${PSQL:-}" ]]; then
	PSQL="${matched_bin:+$matched_bin/psql}"
	PSQL="${PSQL:-$(command -v psql || true)}"
fi

[[ -x "${PG_DUMP:-}" ]] || { echo "Error: pg_dump not found. Set PG_DUMP." >&2; exit 1; }
[[ -x "${PSQL:-}" ]] || { echo "Error: psql not found. Set PSQL." >&2; exit 1; }

# Report the client actually in use, by its real version — never by the version
# we hoped to find.
client_major="$("$PG_DUMP" --version | grep -oE '[0-9]+' | head -1)"
if [[ "$auto_pinned" == true ]]; then
	echo "Auto-selected v${client_major} client to match server: $PG_DUMP"
else
	echo "Using pg_dump v${client_major}: $PG_DUMP"
fi

if [[ "$client_major" != "$server_major" ]]; then
	echo "Error: pg_dump is v${client_major} but the server is v${server_major}." >&2
	if (( client_major > server_major )); then
		echo "       A v${client_major} dump will NOT restore into a v${server_major} server: it emits SET" >&2
		echo "       commands for parameters that do not exist there (e.g. transaction_timeout)." >&2
		echo "       The dump would look complete and be unusable." >&2
	else
		echo "       A v${client_major} client cannot read a v${server_major} catalog and may produce a" >&2
		echo "       silently incomplete dump." >&2
	fi
	echo "" >&2
	echo "       No working v${server_major} client was found to auto-select. Install one:" >&2
	echo "         brew install postgresql@${server_major}" >&2
	echo "       or point at an existing install:" >&2
	echo "         export PG_DUMP=/path/to/postgresql@${server_major}/bin/pg_dump" >&2
	echo "         export PSQL=/path/to/postgresql@${server_major}/bin/psql" >&2
	exit 1
fi

# --- Destination -------------------------------------------------------------
# One timestamped folder per run, so a backup is atomic to keep or discard.

BACKUP_ROOT="${BACKUP_DIR:-$HOME/Backups/database/accreditation}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="$BACKUP_ROOT/$TIMESTAMP"
mkdir -p "$DEST"

SCHEMA_FILE="$DEST/schema.sql"
DATA_FILE="$DEST/data.sql"
FULL_FILE="$DEST/backup.sql"
MANIFEST="$DEST/manifest.json"

echo "Backing up ${PG_DATABASE}@${PG_HOST}:${PG_PORT} (server v${server_major}) -> $DEST"

# pg_dump writes this sentinel as its final line. Its presence is the only
# reliable proof the dump ran to completion rather than being truncated.
COMPLETE_MARKER='-- PostgreSQL database dump complete'

assert_complete() {
	local file="$1" label="$2"
	# '--' is required: the marker begins with '--' and grep would otherwise
	# parse it as an option.
	if ! grep -qF -- "$COMPLETE_MARKER" "$file"; then
		echo "Error: ${label} dump is incomplete (no completion marker). Aborting." >&2
		exit 1
	fi
	if [[ ! -s "$file" ]]; then
		echo "Error: ${label} dump is empty. Aborting." >&2
		exit 1
	fi
}

# Strip only psql meta-commands and the dump HEADER comment.
# Deliberately does NOT strip the trailing completion marker: it is matched
# exactly ("...dump$"), so "...dump complete" survives. That line is how a
# truncated dump is detected downstream.
filter_dump() {
	grep -v -E '^\\restrict|^\\unrestrict|^-- PostgreSQL database dump$' "$1"
}

# --- Dump --------------------------------------------------------------------

echo "Dumping schema..."
if ! "$PG_DUMP" -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DATABASE" \
	--schema-only --no-owner --no-acl > "$DEST/.schema.raw"; then
	echo "Error: schema dump failed" >&2
	exit 1
fi
assert_complete "$DEST/.schema.raw" "schema"
filter_dump "$DEST/.schema.raw" > "$SCHEMA_FILE"
rm -f "$DEST/.schema.raw"

echo "Dumping data..."
if ! "$PG_DUMP" -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DATABASE" \
	--data-only --column-inserts > "$DEST/.data.raw"; then
	echo "Error: data dump failed" >&2
	exit 1
fi
assert_complete "$DEST/.data.raw" "data"
filter_dump "$DEST/.data.raw" > "$DATA_FILE"
rm -f "$DEST/.data.raw"

echo "Creating combined backup..."
cat "$SCHEMA_FILE" "$DATA_FILE" > "$FULL_FILE"
assert_complete "$FULL_FILE" "combined"

# --- Row counts --------------------------------------------------------------
# Row counts let a restore be checked against what was actually dumped.

# ORDER BY is load-bearing: json_object_agg does not guarantee key order, and
# the source/restored counts are compared as strings. Without it, an identical
# restore reports a spurious mismatch.
count_rows_query="
	SELECT coalesce(json_object_agg(table_name, cnt ORDER BY table_name), '{}'::json)
	FROM (
		SELECT c.relname AS table_name,
		       (xpath('/row/c/text()', query_to_xml(
		           format('SELECT count(*) AS c FROM %I.%I', n.nspname, c.relname),
		           false, true, '')))[1]::text::bigint AS cnt
		FROM pg_class c
		JOIN pg_namespace n ON n.oid = c.relnamespace
		WHERE n.nspname = 'public' AND c.relkind = 'r'
	) t;
"

echo "Collecting row counts..."
row_counts="$("$PSQL" -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DATABASE" -tAc "$count_rows_query")"

# --- Optional restore verification -------------------------------------------
# A dump that has never been restored is a hypothesis, not a backup.
# Set VERIFY_RESTORE_URL to a THROWAWAY database; it will be overwritten.
# Runs BEFORE the manifest is written, so restoreVerified records what actually
# happened rather than what was requested.

restore_verified=false

if [[ -n "${VERIFY_RESTORE_URL:-}" ]]; then
	echo "Verifying restore into scratch database..."
	if ! "$PSQL" "$VERIFY_RESTORE_URL" -v ON_ERROR_STOP=1 -q -f "$FULL_FILE" > /dev/null; then
		echo "Error: restore verification FAILED. Do not trust this backup." >&2
		exit 1
	fi

	restored_counts="$("$PSQL" "$VERIFY_RESTORE_URL" -tAc "$count_rows_query")"

	if [[ "$restored_counts" != "$row_counts" ]]; then
		echo "Error: row counts differ after restore. Backup is NOT trustworthy." >&2
		echo "  source:   $row_counts" >&2
		echo "  restored: $restored_counts" >&2
		exit 1
	fi
	restore_verified=true
	echo "Restore verified: row counts match."
fi

# --- Manifest ----------------------------------------------------------------
# Records only non-secret facts. Never write connection strings here; they
# carry passwords and this file lives on disk beside the dump.

git_sha="$(git -C "$(dirname "${BASH_SOURCE[0]}")/.." rev-parse HEAD 2>/dev/null || echo 'unknown')"

cat > "$MANIFEST" <<EOF
{
  "timestamp": "$TIMESTAMP",
  "database": "$PG_DATABASE",
  "host": "$PG_HOST",
  "port": $PG_PORT,
  "serverMajor": $server_major,
  "clientMajor": $client_major,
  "gitSha": "$git_sha",
  "files": {
    "schema": "schema.sql",
    "data": "data.sql",
    "combined": "backup.sql"
  },
  "sizeBytes": {
    "schema": $(wc -c < "$SCHEMA_FILE" | tr -d ' '),
    "data": $(wc -c < "$DATA_FILE" | tr -d ' '),
    "combined": $(wc -c < "$FULL_FILE" | tr -d ' ')
  },
  "rowCounts": $row_counts,
  "restoreVerified": $restore_verified
}
EOF

echo ""
echo "Backup complete: $DEST"
echo "  schema.sql    $(wc -c < "$SCHEMA_FILE" | tr -d ' ') bytes"
echo "  data.sql      $(wc -c < "$DATA_FILE" | tr -d ' ') bytes"
echo "  backup.sql    $(wc -c < "$FULL_FILE" | tr -d ' ') bytes"
echo "  manifest.json"
