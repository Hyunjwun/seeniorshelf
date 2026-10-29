# SeniorShelf — Supabase version

This package uses the latest uploaded SeniorShelf HTML and CSS (`index(2).html`, `style(2).css`) with a Supabase-backed JavaScript app. The visual design is preserved, with the missing seller listing/offer containers added so the database app can manage them.

## Files
- `index.html` — website pages and forms
- `style.css` — supplied design
- `script.js` — Supabase authentication, real listings, cart, checkout, offers, and post-checkout inbox
- `config.js` — public Supabase project URL and publishable key
- `supabase-schema.sql` — database tables, RLS, storage bucket, checkout and offer functions

## Setup
1. In your intended Supabase project, open **SQL Editor → New query**.
2. Paste all of `supabase-schema.sql` and run it. This is intended for a fresh project. Do not rerun on top of important production data without reviewing the SQL first.
3. In Supabase Authentication settings, configure the Site URL and Redirect URLs for your local test URL and deployed Vercel URL. If email confirmation is enabled, users must confirm their email before logging in.
4. Open `config.js` and confirm `SUPABASE_URL` and `SUPABASE_ANON_KEY` match the intended project. The publishable key is meant for frontend use; never put a service-role/secret key here.
5. Upload these files to the root of your GitHub repository. Keep your existing `assets/Logo.png` and `assets/favicon.png` files in an `assets/` folder, because the supplied HTML references them. If you do not have those assets, remove or replace those two `<img>`/favicon references.
6. Import the GitHub repository into Vercel and deploy as a static site. No build command is required.

## Important behavior and limitations
- No sample products are included. Products appear only after a seller uploads a real listing.
- Signup/login uses email and password.
- Product photos are uploaded to the `product-images` Supabase Storage bucket.
- Checkout records an order, reserves products, and creates conversations. It does **not** charge or collect real payments.
- Inbox conversations are created only after checkout succeeds.
- This is a client-side static app. Review policies and add proper payment/shipping flows before any real commercial launch.

## Local testing
Use VS Code Live Server or another local web server instead of opening `index.html` as a `file://` URL.
