# Participants table rows never wrap (decided 2026-11-19)

Problem: on the admin participants list, long registration codes, names and
organization names (e.g. "Synergie mondiale des jeunes pour la consolidation
de la paix et la sécurité") wrapped rows to three or four lines.

## Decision

Truncate, keep the columns. Chosen from a prototype of four directions.

- `DataList` takes `fixedLayout`: `table-layout: fixed`, widths from each
  column's `width`, no horizontal scroll. Columns without a width share what
  is left. Opt-in, so the other lists are unchanged.
- Participants widths: checkbox 44px, Participant 26%, Type 12%, Session 9%,
  Organization (the rest), Status 12%, Stage 13%, actions 104px.
- Every cell is one line. Long text is cut off with an ellipsis, and the full
  text is in a hover tooltip (`title`).
- The participant cell shows the name first and the code underneath in small
  tabular figures. Statuses read in sentence case ("In progress", "Collected") rather than capitals.
- With `fixedLayout`, row actions are 32px ghost icon buttons labelled for
  screen readers.

## Rejected

- **Dense** (one 44px line per row, code in its own column, status and stage
  merged as a dot plus text): fits the most rows, but drops the coloured badges
  and shrinks the photos.
- **Merged** (organization under the name, session under the type, stage under
  the status): names and organizations stay readable, but the table no longer
  matches the other admin lists and Organization loses its own column.
- Scrolling sideways instead of truncating: no horizontal scrollbar on this
  table.
