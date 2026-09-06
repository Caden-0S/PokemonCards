# Binderly

Binderly is a lightweight Pokemon card collection tracker built as a static frontend.

The card catalog loads English and Japanese sets from the public TCGdex API in batches. If the catalog source is unavailable, the app falls back to a small built-in sample catalog.

## Run locally

From this directory, start the app server:

```bash
npm start
```

Then open `http://localhost:8080` in a browser. Wishlist changes are saved in the browser with `localStorage`.

## eBay pricing

Collection value uses the latest matching sold listing returned by eBay Marketplace Insights. Configure the server with eBay application credentials before starting it:

```bash
EBAY_CLIENT_ID=your-client-id EBAY_CLIENT_SECRET=your-client-secret npm start
```

Credentials stay on the server and are never sent to the browser. Without them, cards remain usable but eBay values show as unavailable.

Google sign-in uses OAuth on the server. Set the Google OAuth web-client credentials and register `http://localhost:8080/auth/google/callback` as an authorized redirect URI:

```bash
GOOGLE_CLIENT_ID=your-google-client-id GOOGLE_CLIENT_SECRET=your-google-client-secret npm start
```

The Google client secret is only read by `server.js`; it is never embedded in the frontend.

Google accounts keep their display name, wishlist, owned card IDs, and PSA grades in `.data/users.json`, keyed by Google’s account ID. The `.data` directory is ignored by Git and should be backed up or replaced with a database for production deployments.
