# test1: online ordering with Stripe and order texts

What this does: customers build an order on the site, pay on Stripe's secure page (Apple Pay or card), and you get a text with the full order as soon as the payment goes through.

Files
- public/index.html : the website (menu, cart, checkout form)
- api/checkout.js : starts the Stripe payment and re-checks prices on the server
- api/webhook.js : Stripe tells this a payment worked, and it texts you the order
- api/_menu.js : the prices the server trusts
- api/_text.js : the wording of the text you receive
- api/config.js, api/orders.js, api/_supabase.js : accounts and order history (step 6)
- supabase/schema.sql : the orders table, run once in Supabase (step 6)

## Setup (about an hour, plus waiting for text approval)

### 1. Stripe
1. Make an account at stripe.com and finish "Activate payments" (business and bank details).
2. In the dashboard, open Developers > API keys and copy the Secret key. Start with the TEST key (starts with sk_test).
3. Under Settings > Payment methods, make sure cards and Apple Pay are on. On Stripe's own checkout page, Apple Pay shows up as the first choice for customers on iPhone, iPad or Mac (Safari) who have a card in Wallet, and no domain setup is needed. To test Apple Pay yourself, use one of those devices.

### 2. Twilio (sends the text to your phone)
1. Make an account at twilio.com and buy a phone number. A toll-free number is the simplest.
2. US carriers require new numbers to be registered or verified before app texts are delivered. Twilio's console walks you through it (toll-free verification, or A2P 10DLC for a local number). Approval can take days. Until it is approved, texts may be blocked.
3. Copy your Account SID, Auth Token and the Twilio phone number.

### 3. Put the site online (Vercel, free plan)
1. Make a free account at vercel.com and a free account at github.com.
2. On GitHub, create a new repository and upload everything in this folder (keep the api and public folders).
3. On Vercel choose Add New > Project, pick that repository, and deploy.
4. In the Vercel project open Settings > Environment Variables and add these (see .env.example):
   - STRIPE_SECRET_KEY : your Stripe secret key
   - TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
   - TWILIO_FROM : your Twilio number, like +18885551234
   - OWNER_PHONE : +18329770178
   - STRIPE_WEBHOOK_SECRET : added in the next step
5. Note your site address, like https://something.vercel.app

### 4. Connect Stripe to the site
1. In Stripe go to Developers > Webhooks > Add endpoint.
2. Endpoint URL: your site address followed by /api/webhook
3. Events: checkout.session.completed and checkout.session.async_payment_succeeded
4. Copy the Signing secret (starts with whsec_) into STRIPE_WEBHOOK_SECRET in Vercel, then redeploy (Deployments > the latest one > Redeploy).

### 5. Test, then go live
1. With the test key, order something and pay with card 4242 4242 4242 4242, any future date, any CVC.
2. You should see the thank-you message and get the text.
3. For real orders: switch Stripe to live mode, put the live secret key in Vercel, make a new webhook endpoint in live mode, update STRIPE_WEBHOOK_SECRET, and redeploy.

While Twilio approval is pending, you can still turn on emails for successful payments in your Stripe settings so you do not miss orders.

### 6. Accounts, guest checkout and order history (optional, Supabase)
Customers can log in, create an account, or check out as a guest, and logged-in customers see their past orders under "Account". Skip this step and the site keeps working as guest-only checkout (no login buttons show).
1. Make a free account at supabase.com and create a project.
2. Open SQL Editor, paste everything from supabase/schema.sql, and run it.
3. Under Authentication, in the Email sign-in settings, turn OFF "Confirm email" so customers can order right after signing up. If you leave it on, Supabase's built-in email sending is very limited, so you would need to set up your own email service.
4. Under Authentication > URL Configuration, set the Site URL to your site address.
5. Under Project Settings > API, copy the Project URL, the anon (or publishable) key, and the service_role (or secret) key. Add these in Vercel > Settings > Environment Variables, then redeploy:
   - SUPABASE_URL
   - SUPABASE_ANON_KEY
   - SUPABASE_SERVICE_KEY : keep this one private. It is only used on the server.

Good to know:
- An order shows in someone's history only if they were logged in when they paid. Guest orders are not added later.
- There is no "forgot password" button yet. You can send a reset email from Supabase > Authentication > Users.
- Brenda's order text works the same for guests and account holders.

## Good to know
- Changing a price or dish: edit it in BOTH api/_menu.js (the price customers are charged) and the MENU list near the bottom of public/index.html (what customers see).
- Cards and Apple Pay both work. Apple Pay is a way of paying by card, so Stripe cannot turn on Apple Pay while turning cards off.
- Zelle is not available through Stripe. Do not collect orders through Apple Cash either: Apple's terms do not allow it for business use.
- This does not add sales tax or a delivery fee. Ask your accountant about Texas sales tax on prepared food. Stripe Tax is one option.
- Stripe takes 2.9% + 30 cents per card payment, with no monthly fee.
