# SeniorShelf — QRIS + Admin Payment Flow

This package uses the latest supplied SeniorShelf HTML/CSS and the Supabase-backed JavaScript app. Existing layout is preserved, with a manual QRIS payment flow and an admin review dashboard added.

## Files
- `index.html` — website pages/forms
- `style.css` — supplied visual styling
- `script.js` — Supabase auth, real listings, cart, QRIS proof upload, orders, inbox, admin review and seller payout controls
- `config.js` — public Supabase URL/key and QRIS image path
- `payment-admin-migration.sql` — incremental SQL migration; run after your original `supabase-schema.sql`

## Before deploying
1. Make a backup of the Supabase project.
2. In Supabase **SQL Editor**, run `payment-admin-migration.sql` after the original schema is already installed.
3. In `config.js`, set `SUPABASE_URL` to the project URL (without `/rest/v1`) and `SUPABASE_ANON_KEY` to the project's publishable/anon key. Never use a `service_role` or secret key in frontend code.
4. Put your QRIS image at `assets/qris.png`. Keep your existing `assets/Logo.png` and `assets/favicon.png` if the HTML references them. The package does not include those personal image assets.
5. Create an account in SeniorShelf. In Supabase **Authentication → Users**, copy that account's UUID.
6. In Supabase SQL Editor, run this separate command, replacing the placeholder with your own account UUID:

   ```sql
   insert into public.admin_users(user_id)
   values ('YOUR-AUTH-USER-UUID')
   on conflict do nothing;
   ```

   Only promote the account you control. The admin dashboard is hidden for other users and database policies enforce admin access.
7. Deploy to Vercel. Set Supabase Auth Site URL and Redirect URLs to your actual Vercel domain.

## Payment flow
- Checkout creates an order and reserves the products; it does not collect money automatically.
- Buyer pays using the QRIS image and uploads a JPG/PNG/WebP screenshot (maximum 5 MB).
- The screenshot is stored in a private `payment-proofs` bucket.
- Admin must verify the actual transaction in the QRIS provider's app and then choose Verify or Reject in Admin.
- Order chat is created/unlocked only after payment is verified.
- Buyer can mark an order complete after receiving the item. Only then is a seller payout created for admin processing.
- Admin records a transfer reference before marking a seller payout complete.
- Admin can open Inbox and join order chats for support. These messages are visible to the buyer and seller in that order conversation.

## Important limitations
- QRIS static payment is **manual**, not automatically verified. Never trust an uploaded screenshot alone.
- Confirm that your QRIS provider permits receiving marketplace payments and transferring the proceeds to sellers. Holding/transmitting funds for others can have provider and legal requirements. Do not launch public real-money transactions until this is checked.
- Seller payouts are tracked manually; the website does not send bank transfers.
- The `payment-admin-migration.sql` migration is designed for the existing schema. Do not run the original full schema again on a live project without reviewing it.
- The JavaScript was syntax-checked, but this package has not been end-to-end tested against your live Supabase project. Test with low-risk test accounts/orders first.
