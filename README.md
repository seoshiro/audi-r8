# Audi R8 · Four Rings. One Form.

[Open the live demo](https://seoshiro.github.io/audi-r8/)

An independent portfolio concept. A single scroll-driven sequence turns liquid metal into an Audi R8, followed by an interactive wind tunnel. Hold the car to strengthen the stream; release to detach the vortex.

**Local preview:** serve the complete release directory over HTTP (for example, `python -m http.server 8000`). A fresh source checkout does not include all motion files. For the complete build, use the `github-pages` artifact while it is available in a successful [Pages workflow run](https://github.com/seoshiro/audi-r8/actions/workflows/pages.yml), or reproduce that workflow’s packaging step locally.

GitHub Actions stages the site, retrieves the missing public media, checks every SHA-256 digest in `pages-release.sha256`, and deploys the resulting artifact to GitHub Pages. The published site serves the packaged files directly. It includes Russian and English, keyboard controls, and a reduced-motion mode.

The motion footage was generated in Higgsfield and edited for this project. Audi and the four rings identify the car; this site is not affiliated with or endorsed by Audi.
