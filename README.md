# Binderly

Binderly is a lightweight Pokemon card collection tracker built as a static frontend.

The card catalog loads English and Japanese sets from the public TCGdex API in batches. If the catalog source is unavailable, the app falls back to a small built-in sample catalog.

## Run locally

From this directory, start any static file server:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080` in a browser. Wishlist changes are saved in the browser with `localStorage`.
