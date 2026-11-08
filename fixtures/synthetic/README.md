# Test-only synthetic fixtures

These files are **not** College Football Data responses and **not** real scores, teams, or ranks.

School names are fictional on purpose. Sanitized copies of the authenticated reads were not exported into this draft. Adapters are checked against the published schema and the shapes described in the authenticated findings (null scores, deprecated roster year, fraction percentages, poll weeks that omit CFP, January games that stay on the prior season).

`bundle.json` is the raw-shaped input. `normalized-view.json` is built from it by `npm run build:fixture` and is the only file the browser can load, behind an explicit test-mode banner.
