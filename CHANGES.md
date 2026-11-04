# What changed

1. Spam protection (api/_guard.js, zelle.js, quote.js, checkout.js)
   - Each visitor can only try a few times in a row (Zelle 5, checkout 10, price quote 20 per 10 minutes).
   - Zelle sends at most 20 order alerts per hour in total, and a repeat of the same order (same phone and total within 10 minutes) does not text Brenda a second time. These two use the existing orders table, so no new database setup is needed. If the database is asleep, orders still go through.
   - For a stronger limit, also turn on rate limiting in Vercel (Project > Firewall).
2. Delivery price now matches what the customer was shown (_uber.js, quote.js, checkout.js, zelle.js, index.html)
   - The price quoted at checkout is signed and held for 15 minutes, and that exact price is charged.
   - The page also sends the total the customer saw. If the server's total is different, nothing is charged or sent: the page shows the new total and asks the customer to check it. For Zelle it goes back to the details screen first, so nobody sends the wrong amount.
3. One courier per order (dispatch.js)
   - The button turns itself off after the first tap, and the server only lets one request go ahead for each order, even from two phones or two servers at once.
4. One shop name (_menu.js and everything that sends a message)
   - Texts, emails, the courier booking and the courier page now use SHOP_NAME (default "test1"). To rename the shop in messages, add SHOP_NAME in Vercel > Settings > Environment Variables and redeploy. The name shown on the website itself (top bar, tab title, footer) is still in public/index.html.
