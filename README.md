# ArchSym

This folder is a stripped project-page scaffold derived from the local `nerfies.github.io` repository.

## What it keeps

- The broad Nerfies page rhythm: hero, teaser, main demo block, results-first content, method, BibTeX.
- Bulma and Font Awesome from the original page.
- A simple custom stylesheet and script for a blank but usable starting point.

## What it removes

- Nerfies-specific videos, carousel logic, interpolation widget, and related-links content.
- Analytics and third-party demo dependencies that are not useful for this paper.

## Suggested next step

Replace the placeholder viewer in `index.html` with your Three.js scene:

- one shared point cloud
- per-scene tabs
- per-method plane visibility toggles
- point-size and plane-opacity controls

The main files to edit are:

- `index.html`
- `static/css/index.css`
- `static/js/index.js`

If you publish a derivative that still substantially borrows from Nerfies, keep the footer attribution and review the original license in `nerfies.github.io/README.md`.
