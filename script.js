/* SeniorShelf — Supabase-backed application
   Configure SUPABASE_URL and SUPABASE_ANON_KEY in config.js before running. */
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const LEVELS = ["SD", "SMP", "SMA", "SMK", "University"];
const CATEGORIES = ["Uniforms", "Books", "Stationery", "Bags", "Other"];

let supabaseClient = null;
let currentUser = null;
let profile = null;
let isAdmin = false;
let activeOrderId = null;
let activeRole = "buyer";
let currentPage = "landing";
let authMode = "login";
let products = [];
let cart = [];
let chats = [];
let selectedPhoto = null;
let currentDetailId = null;
let activeLevel = "All";
let activeChat = null;
let messageChannel = null;
let toastTimer;

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
}
function money(n) { return "Rp" + Number(n || 0).toLocaleString("id-ID"); }
function notify(message) {
  const t = $("#toast"); if (!t) return;
  t.textContent = message; t.classList.add("show"); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3000);
}
function getClient() {
  if (!window.supabase?.createClient) throw new Error("Supabase library did not load. Check your internet connection.");
  if (!window.SENIORSHELF_CONFIG?.SUPABASE_URL || !window.SENIORSHELF_CONFIG?.SUPABASE_ANON_KEY || window.SENIORSHELF_CONFIG.SUPABASE_URL.includes("YOUR_")) {
    throw new Error("Add your Supabase project URL and anon key to config.js first.");
  }
  if (!supabaseClient) supabaseClient = window.supabase.createClient(
    window.SENIORSHELF_CONFIG.SUPABASE_URL,
    window.SENIORSHELF_CONFIG.SUPABASE_ANON_KEY
  );
  return supabaseClient;
}
function showError(error, fallback = "Something went wrong. Please try again.") {
  console.error(error);
  const message = error?.message || fallback;
  if (/Invalid login credentials/i.test(message)) notify("Email or password is incorrect.");
  else if (/Email not confirmed/i.test(message)) notify("Check your email to confirm your account, then log in.");
  else if (/config.js|Supabase library/i.test(message)) notify(message);
  else notify(message.length > 150 ? fallback : message);
}
function setBusy(button, busy, label) {
  if (!button) return;
  if (busy) { button.dataset.originalText = button.textContent; button.disabled = true; button.textContent = label || "PLEASE WAIT…"; }
  else { button.disabled = false; button.textContent = button.dataset.originalText || button.textContent; delete button.dataset.originalText; }
}
function setPage(name) {
  if (!currentUser && name !== "landing") { openAuth("login"); return; }
  if (name === "sell" && activeRole !== "seller") { notify("Switch to Seller mode to list items."); return; }
  if (name === "admin" && !isAdmin) { notify("Admin access only."); return; }
  if (name === "inbox") activeChat = null;
  currentPage = name;
  $$(".page").forEach(p => p.classList.add("hidden"));
  const target = $("#" + name + "Page"); if (target) target.classList.remove("hidden");
  $$(".nav-link").forEach(b => b.classList.toggle("active", b.dataset.page === name));
  if (name === "home") loadProducts();
  if (name === "cart") loadCart();
  if (name === "inbox") loadInbox();
  if (name === "level") loadProfile();
  if (name === "sell") loadSellerData();
  if (name === "orders") loadMyOrders();
  if (name === "admin") loadAdminDashboard();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function renderAccount() {
  const logged = !!currentUser;
  document.body.classList.toggle("logged-out", !logged);
  $("#navigation").classList.toggle("hidden", !logged);
  $("#accountLinks").classList.toggle("hidden", logged);
  $("#userTools").classList.toggle("hidden", !logged);
  $("#switchRole").textContent = activeRole.toUpperCase() + " ↻";
  $$(".seller-only").forEach(b => b.classList.toggle("hidden", activeRole !== "seller"));
  const adminNav = $("#adminNav"); if (adminNav) adminNav.classList.toggle("hidden", !isAdmin);
  $("#cartCount").textContent = cart.length;
  $("#inboxCount").textContent = chats.length;
}
function openAuth(mode) {
  authMode = mode; const signup = mode === "signup";
  $("#authTitle").innerHTML = signup ? "Join the <em>shelf.</em>" : "Come on <em>in.</em>";
  $("#authIntro").textContent = signup ? "Make an account and find your community." : "Your next good find is waiting.";
  $("#nameWrap").classList.toggle("hidden", !signup);
  $("#roleWrap").classList.toggle("hidden", !signup);
  $("#authName").required = signup;
  $("#authPassword").minLength = 8;
  $("#authPassword").placeholder = "At least 8 characters";
  $("#authSubmit").textContent = signup ? "CREATE ACCOUNT ↗" : "LOGIN ↗";
  $("#authSwitch").innerHTML = signup
    ? 'Already have an account? <button type="button" id="switchToLogin">Login ↗</button>'
    : 'New here? <button type="button" id="switchToSignup">Make an account ↗</button>';
  $("#authModal").classList.remove("hidden");
  setTimeout(() => $("#authUsername").focus(), 50);
}
function closeAuth() { $("#authModal").classList.add("hidden"); $("#authForm").reset(); }

async function loadProfileData() {
  const sb = getClient();
  const { data, error } = await sb.from("profiles").select("id, display_name, active_role, school_level, grade, semester").eq("id", currentUser.id).single();
  if (error) throw error;
  profile = data; activeRole = data.active_role || "buyer";
}
function mapProduct(row) {
  return {
    id: row.id, name: row.name, category: row.category, level: row.school_level,
    grade: row.grade || "", condition: row.condition, price: Number(row.price), desc: row.description || "",
    sellerId: row.seller_id, seller: row.profiles?.display_name || "SeniorShelf seller",
    image: row.image_path ? getClient().storage.from("product-images").getPublicUrl(row.image_path).data.publicUrl : "",
    status: row.status, createdAt: row.created_at
  };
}
async function loadProducts() {
  const grid = $("#productGrid"); if (!grid) return;
  grid.innerHTML = '<p class="empty-state">Loading real listings…</p>';
  try {
    const sb = getClient();
    const { data, error } = await sb.from("products").select("*, profiles:profiles!products_seller_id_fkey(display_name)").eq("status", "active").order("created_at", { ascending: false });
    if (error) throw error;
    products = (data || []).map(mapProduct);
    renderProducts();
  } catch (error) { grid.innerHTML = ''; showError(error, "Could not load listings."); }
}
function renderProducts() {
  const query = ($("#searchInput").value || "").toLowerCase().trim();
  const category = $("#categoryFilter").value; const level = $("#levelFilter").value;
  const filtered = products.filter(p => [p.name,p.category,p.level,p.seller,p.desc].join(" ").toLowerCase().includes(query)
    && (category === "All" || p.category === category)
    && (level === "All" || p.level === level)
    && (activeLevel === "All" || p.level === activeLevel));
  $("#resultCount").textContent = `${filtered.length} ITEMS`;
  $("#emptyProducts").classList.toggle("hidden", filtered.length > 0);
  $("#productGrid").innerHTML = filtered.map(p => `
    <article class="product-card">
      <div class="product-photo" data-detail="${p.id}" role="button" tabindex="0">
        ${p.image ? `<img src="${escapeHTML(p.image)}" alt="${escapeHTML(p.name)}">` : `<div class="product-art">${escapeHTML(p.category)}</div>`}
        <span class="product-tag">${escapeHTML(p.condition)}</span>
        <button class="save-item" data-add="${p.id}" aria-label="Add to cart">＋</button>
      </div>
      <div class="product-info"><div class="product-category">${escapeHTML(p.category)} / ${escapeHTML(p.level)}</div>
        <h3 class="product-name" data-detail="${p.id}">${escapeHTML(p.name)}</h3>
        <div class="product-meta">Listed by ${escapeHTML(p.seller)}</div>
        <div class="product-bottom"><span class="product-price">${money(p.price)}</span><button class="mini-add" data-add="${p.id}">ADD +</button></div>
      </div>
    </article>`).join("");
}
async function addToCart(id) {
  try {
    const sb = getClient(); const p = products.find(x => x.id === id);
    if (!p) return;
    if (p.sellerId === currentUser.id) { notify("You cannot add your own listing to your cart."); return; }
    const { error } = await sb.from("cart_items").insert({ user_id: currentUser.id, product_id: p.id });
    if (error && error.code !== "23505") throw error;
    await loadCart(false); renderAccount(); notify(error ? "This item is already in your cart." : "Added to your cart!");
  } catch (error) { showError(error, "Could not add this item to cart."); }
}
async function loadCart(render = true) {
  try {
    const sb = getClient();
    const { data, error } = await sb.from("cart_items").select("product_id, products:products!cart_items_product_id_fkey(*, profiles:profiles!products_seller_id_fkey(display_name))").eq("user_id", currentUser.id).order("created_at", { ascending: false });
    if (error) throw error;
    cart = (data || []).filter(x => x.products?.status === "active").map(x => mapProduct(x.products));
    renderAccount(); if (render) renderCart();
  } catch (error) { showError(error, "Could not load your cart."); }
}
function renderCart() {
  if (!cart.length) { $("#cartItems").innerHTML = '<div class="empty-panel">Your cart is empty.<br>Go find something good on the shelf.</div>'; $("#cartSummary").innerHTML = ""; return; }
  $("#cartItems").innerHTML = cart.map(p => `<div class="list-row"><div class="list-thumb">${p.image ? `<img src="${escapeHTML(p.image)}" alt="">` : escapeHTML(p.category)}</div><div class="list-details"><strong>${escapeHTML(p.name)}</strong><p>${escapeHTML(p.level)} · ${escapeHTML(p.condition)}</p><strong>${money(p.price)}</strong></div><button class="row-action" data-remove="${p.id}">REMOVE</button></div>`).join("");
  const total = cart.reduce((sum,p) => sum + p.price, 0);
  $("#cartSummary").innerHTML = `<strong>Order total: ${money(total)}</strong><p class="product-meta">Checkout creates an order. Pay by QRIS and wait for admin verification before chat unlocks.</p><button class="solid-button" id="checkout">CONTINUE TO QRIS PAYMENT ↗</button>`;
}
async function removeFromCart(id) {
  try { const { error } = await getClient().from("cart_items").delete().eq("user_id", currentUser.id).eq("product_id", id); if (error) throw error; await loadCart(); }
  catch (error) { showError(error, "Could not remove this item."); }
}
async function checkout() {
  if (!cart.length) return;
  const button = $("#checkout"); setBusy(button, true, "PLACING ORDER…");
  try {
    const { data, error } = await getClient().rpc("checkout_cart", { product_ids: cart.map(p => p.id) });
    if (error) throw error;
    activeOrderId = data;
    await loadCart(false); renderAccount();
    notify("Order created. Complete QRIS payment and submit proof for admin review.");
    showPaymentPage(data);
  } catch (error) { showError(error, "Could not place the order. Refresh your cart and try again."); }
  finally { setBusy(button, false); }
}

async function refreshAdminStatus() {
  if (!currentUser) { isAdmin=false; return; }
  try { const {data,error}=await getClient().from("admin_users").select("user_id").eq("user_id",currentUser.id).maybeSingle(); if(error) throw error; isAdmin=!!data; } catch(error) { isAdmin=false; console.warn("Admin check unavailable until migration is applied.",error.message); }
}
function ensureCommercePages() {
  const nav = $("#navigation");
  if (nav && !$("#ordersNav")) {
    const ordersBtn = document.createElement("button"); ordersBtn.id="ordersNav"; ordersBtn.dataset.page="orders"; ordersBtn.className="nav-link"; ordersBtn.textContent="My Orders ↗"; nav.insertBefore(ordersBtn, nav.querySelector('[data-page="sell"]'));
    ordersBtn.addEventListener("click", () => setPage("orders"));
    const adminBtn = document.createElement("button"); adminBtn.id="adminNav"; adminBtn.dataset.page="admin"; adminBtn.className="nav-link hidden"; adminBtn.textContent="Admin ↗"; nav.appendChild(adminBtn);
    adminBtn.addEventListener("click", () => setPage("admin"));
  }
  const main = document.querySelector("main");
  if (main && !$("#paymentPage")) {
    main.insertAdjacentHTML("beforeend", `
      <section id="paymentPage" class="page hidden">
        <button class="back-button" data-back="cart">← BACK TO CART</button>
        <div class="page-heading"><div><p class="eyebrow">ORDER PAYMENT</p><h1>Pay by <em>QRIS.</em></h1><p>Order <span id="paymentOrderId"></span></p></div></div>
        <div class="commerce-panel"><div id="qrisDisplay" class="qris-placeholder">Your QRIS image will appear here after you add it to the project.</div><p>Pay the exact order total using your payment app. Upload a screenshot below, then wait for admin verification. A screenshot is not proof of a successful transaction by itself.</p><div id="paymentOrderTotal" class="commerce-total"></div><form id="paymentProofForm"><label>Payment screenshot<input id="paymentProofFile" type="file" accept="image/png,image/jpeg,image/webp" required></label><button class="solid-button" type="submit">SUBMIT FOR REVIEW ↗</button></form><p class="product-meta">Never upload a screenshot containing your PIN, password, or other sensitive credentials.</p></div>
      </section>
      <section id="ordersPage" class="page hidden"><button class="back-button" data-back="home">← BACK TO HOME</button><div class="page-heading"><div><p class="eyebrow">ORDER HISTORY</p><h1>My <em>orders.</em></h1></div></div><div id="myOrdersList" class="list-panel"></div></section>
      <section id="adminPage" class="page hidden"><div class="page-heading"><div><p class="eyebrow">SENIORSHELF CONTROL DESK</p><h1>Admin <em>dashboard.</em></h1><p>Verify payments manually and record seller transfers.</p></div></div><div class="section-label"><span>PAYMENT REVIEW</span><span>CHECK THE REAL QRIS TRANSACTION</span></div><div id="adminPayments" class="list-panel"></div><div class="section-label"><span>SELLER PAYOUTS</span><span>ONLY AFTER ORDER COMPLETION</span></div><div id="adminPayouts" class="list-panel"></div><div class="section-label"><span>ORDER CHATS</span><span>ADMIN SUPPORT ACCESS</span></div><p class="product-meta">Open Inbox to join a conversation related to a paid order. Messages are visible to the buyer and seller in that order chat.</p></section>`);
  }
}
async function showPaymentPage(orderId) {
  ensureCommercePages();
  activeOrderId = orderId;
  const { data, error } = await getClient().from("orders").select("id,total_amount,payment_status").eq("id", orderId).single();
  if (error) { showError(error, "Could not load order payment."); return; }
  $("#paymentOrderId").textContent = data.id;
  $("#paymentOrderTotal").textContent = `Total to pay: ${money(data.total_amount)}`;
  const qrisUrl = window.SENIORSHELF_CONFIG?.QRIS_IMAGE_URL || "assets/qris.jpeg";
  $("#qrisDisplay").innerHTML = `<img src="${escapeHTML(qrisUrl)}" alt="SeniorShelf QRIS payment code" onerror="this.remove(); this.parentElement.textContent='Add your QRIS image as assets/qris.png, then redeploy.';" style="max-width:100%;max-height:360px;object-fit:contain">`;
  setPage("payment");
}
async function loadMyOrders() {
  const box = $("#myOrdersList"); if (!box || !currentUser) return;
  try {
    const { data, error } = await getClient().from("orders").select("id,total_amount,status,payment_status,created_at,completed_at").eq("buyer_id",currentUser.id).order("created_at",{ascending:false});
    if(error) throw error;
    if(!data?.length){box.innerHTML='<div class="empty-panel">You have no orders yet.</div>';return;}
    box.innerHTML=data.map(o=>`<div class="list-row"><div class="list-details"><strong>Order ${escapeHTML(o.id.slice(0,8))}</strong><p>${new Date(o.created_at).toLocaleString()} · Payment: ${escapeHTML(o.payment_status)}</p><strong>${money(o.total_amount)}</strong></div>${['pending','rejected'].includes(o.payment_status)?`<button class="row-action" data-pay-order="${o.id}">PAY / RESUBMIT PROOF</button>`:''}${o.payment_status==='paid' && o.status!=='completed'?`<button class="row-action" data-complete-order="${o.id}">I RECEIVED IT</button>`:''}${o.status==='completed'?'<span class="product-meta">Completed</span>':''}</div>`).join('');
  } catch(error){showError(error,'Could not load your orders.');}
}
async function submitPaymentProof(event) {
  event.preventDefault(); if(!activeOrderId || !currentUser) return;
  const file=$("#paymentProofFile").files?.[0]; if(!file) return notify('Choose a payment screenshot first.');
  if(!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size>5*1024*1024) return notify('Use JPG, PNG, or WebP under 5 MB.');
  const button=event.submitter; setBusy(button,true,'UPLOADING…');
  try {
    const path=`${currentUser.id}/${activeOrderId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
    const {error:uploadError}=await getClient().storage.from('payment-proofs').upload(path,file,{upsert:true,contentType:file.type}); if(uploadError) throw uploadError;
    const {error}=await getClient().rpc('submit_payment_proof',{p_order_id:activeOrderId,p_proof_path:path}); if(error) throw error;
    notify('Proof submitted. Your order is waiting for admin review.'); setPage('orders');
  } catch(error){showError(error,'Could not submit payment proof.');}
  finally{setBusy(button,false);}
}
async function loadAdminDashboard() {
  if(!isAdmin) return;
  try {
    const sb=getClient();
    const {data:payments,error:payErr}=await sb.from('payments').select('id,order_id,buyer_id,amount,proof_path,status,submitted_at,admin_note').eq('status','review').order('submitted_at',{ascending:true}); if(payErr) throw payErr;
    const payBox=$('#adminPayments');
    if(!payments?.length) payBox.innerHTML='<div class="empty-panel">No payments waiting for review.</div>';
    else {
      const rows=await Promise.all(payments.map(async p=>{const {data:urlData}=await sb.storage.from('payment-proofs').createSignedUrl(p.proof_path,300);return {...p,proofUrl:urlData?.signedUrl||''};}));
      payBox.innerHTML=rows.map(p=>`<div class="list-row admin-row"><div class="list-details"><strong>Order ${escapeHTML(p.order_id.slice(0,8))}</strong><p>Buyer ${escapeHTML(p.buyer_id.slice(0,8))} · ${new Date(p.submitted_at).toLocaleString()}</p><strong>${money(p.amount)}</strong>${p.proofUrl?`<p><a href="${escapeHTML(p.proofUrl)}" target="_blank" rel="noopener">Open payment screenshot ↗</a></p>`:'<p>Could not load proof image.</p>'}<input data-admin-note="${p.id}" placeholder="Optional review note" maxlength="1000"></div><button class="row-action" data-review-payment="${p.id}" data-decision="verified">VERIFY</button><button class="row-action" data-review-payment="${p.id}" data-decision="rejected">REJECT</button></div>`).join('');
    }
    const {data:payouts,error:payoutErr}=await sb.from('seller_payouts').select('id,order_id,seller_id,amount,status,created_at').eq('status','pending').order('created_at',{ascending:true}); if(payoutErr) throw payoutErr;
    const payoutBox=$('#adminPayouts');
    payoutBox.innerHTML=!payouts?.length?'<div class="empty-panel">No seller payouts pending. Payouts appear after the buyer marks the order completed.</div>':payouts.map(p=>`<div class="list-row"><div class="list-details"><strong>Order ${escapeHTML(p.order_id.slice(0,8))}</strong><p>Seller ${escapeHTML(p.seller_id.slice(0,8))}</p><strong>${money(p.amount)}</strong><input data-payout-ref="${p.id}" placeholder="Transfer reference / note" maxlength="200"></div><button class="row-action" data-complete-payout="${p.id}">MARK TRANSFERRED</button></div>`).join('');
  } catch(error){showError(error,'Could not load admin dashboard. Ensure your admin account is set up in Supabase.');}
}
async function adminReviewPayment(id,decision) {
  const note=$(`[data-admin-note="${id}"]`)?.value||'';
  try{const {error}=await getClient().rpc('admin_review_payment',{p_payment_id:id,p_decision:decision,p_note:note});if(error)throw error;notify(decision==='verified'?'Payment verified. Order chat is now unlocked.':'Payment rejected. Buyer can submit proof again.');await loadAdminDashboard();await loadInbox();}
  catch(error){showError(error,'Could not update payment review.');}
}
async function adminCompletePayout(id) {
  const ref=$(`[data-payout-ref="${id}"]`)?.value.trim()||''; if(!ref) return notify('Enter a transfer reference or short note first.');
  try{const {error}=await getClient().rpc('admin_complete_payout',{p_payout_id:id,p_transfer_reference:ref});if(error)throw error;notify('Seller payout marked completed.');await loadAdminDashboard();}
  catch(error){showError(error,'Could not update seller payout.');}
}
async function buyerCompleteOrder(id) {
  if(!confirm('Confirm that you have received the item? This will make the seller payout eligible for admin processing.')) return;
  try{const {error}=await getClient().rpc('buyer_mark_order_completed',{p_order_id:id});if(error)throw error;notify('Order completed. Admin can now process the seller payout.');await loadMyOrders();}
  catch(error){showError(error,'Could not complete order.');}
}

async function loadInbox() {
  try {
    const { data, error } = await getClient().from("conversations")
      .select("id, created_at, buyer_id, seller_id, product_id, order_items:order_items!conversations_order_item_id_fkey(product_name, price), buyer:profiles!conversations_buyer_id_fkey(display_name), seller:profiles!conversations_seller_id_fkey(display_name), products:products!conversations_product_id_fkey(name)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    chats = (data || []).map(c => ({...c, product: c.order_items?.product_name || c.products?.name || "Order item", sellerName: c.seller?.display_name || "Seller", buyerName: c.buyer?.display_name || "Buyer", otherName: isAdmin ? `${c.buyer?.display_name || "Buyer"} ↔ ${c.seller?.display_name || "Seller"}` : (c.buyer_id === currentUser.id ? (c.seller?.display_name || "Seller") : (c.buyer?.display_name || "Buyer"))}));
    renderAccount(); if (currentPage === "inbox") renderInbox();
  } catch (error) { showError(error, "Could not load your inbox."); }
}
function renderInbox() {
  if (activeChat) { renderChat(activeChat); return; }
  if (!chats.length) { $("#inboxContent").innerHTML = '<div class="empty-panel">Your inbox is quiet for now.<br>After placing an order, your seller conversations will appear here.</div>'; return; }
  $("#inboxContent").innerHTML = chats.map(c => `<div class="list-row"><div class="list-thumb">✳</div><div class="list-details"><strong>${escapeHTML(c.product)}</strong><p>Chat with: ${escapeHTML(c.otherName)} · Order placed</p></div><button class="row-action" data-chat="${c.id}">OPEN CHAT</button></div>`).join("");
}
async function openChat(id) {
  activeChat = chats.find(c => c.id === id); if (!activeChat) return;
  if (messageChannel) { getClient().removeChannel(messageChannel); messageChannel = null; }
  await renderChat(activeChat);
  messageChannel = getClient().channel("messages-" + activeChat.id)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${activeChat.id}` }, payload => {
      if (currentPage === "inbox" && activeChat?.id === payload.new.conversation_id) loadMessages(activeChat.id);
    }).subscribe();
}
async function renderChat(chat) {
  $("#inboxContent").innerHTML = `<div class="chat-panel"><button class="back-button" id="backToInbox">← ALL CONVERSATIONS</button><div class="chat-heading"><strong>${escapeHTML(chat.product)}</strong><p>Conversation with ${escapeHTML(chat.otherName)}</p></div><div id="messageList" class="message-list">Loading messages…</div><form id="messageForm" class="message-form"><input id="messageInput" maxlength="2000" required placeholder="Write a message…" aria-label="Message"><button class="solid-button" type="submit">SEND ↗</button></form></div>`;
  await loadMessages(chat.id);
}
async function loadMessages(conversationId) {
  try {
    const { data, error } = await getClient().from("messages").select("id, sender_id, body, created_at").eq("conversation_id", conversationId).order("created_at", { ascending: true });
    if (error) throw error;
    const box = $("#messageList"); if (!box || !activeChat || activeChat.id !== conversationId) return;
    box.innerHTML = (data || []).length ? data.map(m => `<div class="message-bubble ${m.sender_id === currentUser.id ? "mine" : "theirs"}"><p>${escapeHTML(m.body)}</p><small>${m.sender_id === currentUser.id ? "You" : escapeHTML(activeChat.otherName)} · ${new Date(m.created_at).toLocaleString()}</small></div>`).join("") : '<p class="empty-panel">Say hello to start the conversation.</p>';
    box.scrollTop = box.scrollHeight;
  } catch (error) { showError(error, "Could not load messages."); }
}
async function sendMessage(event) {
  event.preventDefault(); const input = $("#messageInput"); const body = input.value.trim();
  if (!body || !activeChat) return;
  const button = event.submitter; setBusy(button, true, "SENDING…");
  try {
    const { error } = await getClient().from("messages").insert({ conversation_id: activeChat.id, sender_id: currentUser.id, body });
    if (error) throw error; input.value = ""; await loadMessages(activeChat.id);
  } catch (error) { showError(error, "Message could not be sent."); }
  finally { setBusy(button, false); }
}
async function loadSellerData() {
  if (!currentUser || activeRole !== "seller") return;
  await Promise.all([loadMyListings(), loadSellerOffers()]);
}
async function loadMyListings() {
  const box = $("#myListings"); if (!box) return;
  try {
    const { data, error } = await getClient().from("products").select("id,name,category,school_level,condition,price,description,status,image_path,created_at").eq("seller_id", currentUser.id).order("created_at", { ascending: false });
    if (error) throw error;
    if (!data?.length) { box.innerHTML = '<div class="empty-panel">You have not listed any items yet.</div>'; return; }
    box.innerHTML = data.map(p => {
      const image = p.image_path ? getClient().storage.from("product-images").getPublicUrl(p.image_path).data.publicUrl : "";
      const canToggle = ["active", "unavailable"].includes(p.status);
      const actions = canToggle
        ? `<button class="row-action" data-edit-product="${p.id}" data-name="${escapeHTML(p.name)}" data-price="${p.price}" data-description="${escapeHTML(p.description || "")}">EDIT</button><button class="row-action" data-toggle-product="${p.id}" data-status="${p.status === "active" ? "unavailable" : "active"}">${p.status === "active" ? "PAUSE LISTING" : "RELIST"}</button><button class="row-action" data-delete-product="${p.id}" data-image="${escapeHTML(p.image_path || "")}">DELETE</button>`
        : `<span class="product-meta">${escapeHTML(p.status.toUpperCase())}</span>`;
      return `<div class="list-row"><div class="list-thumb">${image ? `<img src="${escapeHTML(image)}" alt="">` : escapeHTML(p.category)}</div><div class="list-details"><strong>${escapeHTML(p.name)}</strong><p>${escapeHTML(p.school_level)} · ${escapeHTML(p.condition)} · ${escapeHTML(p.status)}</p><strong>${money(p.price)}</strong></div><div class="seller-row-actions">${actions}</div></div>`;
    }).join("");
  } catch (error) { showError(error, "Could not load your listings."); }
}
async function loadSellerOffers() {
  const box = $("#sellerOffers"); if (!box) return;
  try {
    const { data, error } = await getClient().from("offers").select("id,amount,status,created_at, products:products!offers_product_id_fkey(name,price), buyer:profiles!offers_buyer_id_fkey(display_name)").eq("seller_id", currentUser.id).order("created_at", { ascending: false });
    if (error) throw error;
    if (!data?.length) { box.innerHTML = '<div class="empty-panel">No offers yet. Buyer offers will appear here.</div>'; return; }
    box.innerHTML = data.map(o => `<div class="list-row"><div class="list-details"><strong>${escapeHTML(o.products?.name || "Listing")}</strong><p>From ${escapeHTML(o.buyer?.display_name || "Buyer")} · Listed at ${money(o.products?.price)}</p><strong>${money(o.amount)}</strong><p>Status: ${escapeHTML(o.status.toUpperCase())}</p></div>${o.status === "pending" ? `<div class="seller-row-actions"><button class="row-action" data-offer-status="accepted" data-offer="${o.id}">ACCEPT</button><button class="row-action" data-offer-status="rejected" data-offer="${o.id}">DECLINE</button></div>` : ""}</div>`).join("");
  } catch (error) { showError(error, "Could not load offers."); }
}
async function respondToOffer(id, status) {
  try {
    const { error } = await getClient().rpc("respond_to_offer", { p_offer_id: id, p_status: status });
    if (error) throw error;
    await loadSellerOffers(); notify(status === "accepted" ? "Offer accepted." : "Offer declined.");
  } catch (error) { showError(error, "Could not update offer status."); }
}
async function editListing(button) {
  const id = button.dataset.editProduct;
  const name = prompt("Item name:", button.dataset.name || "");
  if (name === null) return;
  if (!name.trim() || name.trim().length > 80) { notify("Name must be between 1 and 80 characters."); return; }
  const priceText = prompt("Price in rupiah:", button.dataset.price || "");
  if (priceText === null) return;
  const price = Number(priceText);
  if (!Number.isFinite(price) || price < 1000) { notify("Enter a valid price of at least Rp1,000."); return; }
  const description = prompt("Description:", button.dataset.description || "");
  if (description === null) return;
  try {
    const { error } = await getClient().from("products").update({ name: name.trim(), price, description: description.trim(), updated_at: new Date().toISOString() }).eq("id", id).eq("seller_id", currentUser.id);
    if (error) throw error;
    await loadMyListings(); await loadProducts(); notify("Listing updated.");
  } catch (error) { showError(error, "Could not edit listing."); }
}
async function toggleListing(id, status) {
  try {
    const { error } = await getClient().from("products").update({ status, updated_at: new Date().toISOString() }).eq("id", id).eq("seller_id", currentUser.id);
    if (error) throw error;
    await loadMyListings(); await loadProducts(); notify(status === "active" ? "Listing is live again." : "Listing paused.");
  } catch (error) { showError(error, "Could not update listing."); }
}
async function deleteListing(id, imagePath) {
  if (!confirm("Delete this listing permanently?")) return;
  try {
    const { error } = await getClient().from("products").delete().eq("id", id).eq("seller_id", currentUser.id);
    if (error) throw error;
    if (imagePath) await getClient().storage.from("product-images").remove([imagePath]);
    await loadMyListings(); await loadProducts(); notify("Listing deleted.");
  } catch (error) { showError(error, "Could not delete listing. Reserved items cannot be deleted."); }
}

async function loadProfile() {
  if (!profile) return;
  $("#profileLevel").value = profile.school_level || "SMA";
  $("#profileGrade").value = profile.grade || "";
  $("#profileSemester").value = profile.semester || "";
}
async function uploadListing(event) {
  event.preventDefault();
  if (!currentUser || activeRole !== "seller") { notify("Switch to Seller mode first."); return; }
  if (!selectedPhoto) { notify("Please add a product photo."); return; }
  const button = event.submitter; setBusy(button, true, "PUBLISHING…");
  let imagePath = null;
  try {
    const sb = getClient(); const file = selectedPhoto;
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    imagePath = `${currentUser.id}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await sb.storage.from("product-images").upload(imagePath, file, { cacheControl: "3600", upsert: false, contentType: file.type });
    if (uploadError) throw uploadError;
    const { error } = await sb.from("products").insert({ seller_id: currentUser.id, name: $("#itemName").value.trim(), category: $("#itemCategory").value, school_level: $("#itemLevel").value, grade: $("#itemGrade").value.trim(), condition: $("#itemCondition").value, price: Number($("#itemPrice").value), description: $("#itemDescription").value.trim(), image_path: imagePath, status: "active" });
    if (error) { await sb.storage.from("product-images").remove([imagePath]); throw error; }
    selectedPhoto = null; $("#sellForm").reset(); $("#photoPreview").textContent = "＋";
    $("#categoryFilter").value = "All"; $("#levelFilter").value = "All"; $("#searchInput").value = ""; activeLevel = "All";
    await loadProducts(); setPage("home"); notify("Your real listing has been published!");
  } catch (error) { showError(error, "Could not publish listing. Check the photo and database setup."); }
  finally { setBusy(button, false); }
}
async function sendOffer(event) {
  event.preventDefault(); const p = products.find(x => x.id === currentDetailId); const amount = Number($("#offerAmount").value);
  if (!p) return;
  if (p.sellerId === currentUser.id) { notify("You cannot make an offer on your own item."); return; }
  if (!Number.isFinite(amount) || amount < 1000 || amount >= p.price) { notify("Enter an offer between Rp1,000 and the listed price."); return; }
  const button = event.submitter; setBusy(button, true, "SENDING…");
  try {
    const { error } = await getClient().from("offers").insert({ product_id: p.id, buyer_id: currentUser.id, seller_id: p.sellerId, amount, status: "pending" });
    if (error) throw error;
    $("#offerBox").classList.add("hidden"); notify("Offer sent to the seller for approval.");
  } catch (error) { showError(error, "Could not send offer."); }
  finally { setBusy(button, false); }
}
function showDetail(id) {
  const p = products.find(x => x.id === id); if (!p) return; currentDetailId = p.id;
  $("#productDetail").innerHTML = `<div class="detail-layout"><div class="detail-image">${p.image ? `<img src="${escapeHTML(p.image)}" alt="${escapeHTML(p.name)}">` : `<div class="product-art">${escapeHTML(p.category)}</div>`}</div><div class="detail-copy"><p class="eyebrow">${escapeHTML(p.category)} / ${escapeHTML(p.level)}</p><h1>${escapeHTML(p.name)}</h1><div class="detail-price">${money(p.price)}</div><p>Condition: ${escapeHTML(p.condition)}<br>School level: ${escapeHTML(p.level)}<br>Grade: ${escapeHTML(p.grade || "Not specified")}<br>Seller: ${escapeHTML(p.seller)}</p><p>${escapeHTML(p.desc || "No description provided.")}</p><div class="detail-actions"><button class="solid-button" type="button" data-add="${p.id}">ADD TO CART ↗</button><button class="row-action" type="button" id="makeOffer">MAKE AN OFFER</button></div><form class="offer-box hidden" id="offerBox"><label for="offerAmount">YOUR OFFER (RP)<input id="offerAmount" type="number" min="1000" max="${Math.max(1000,p.price-1)}" step="1000" required placeholder="Enter your price"></label><div class="offer-box-actions"><button class="solid-button" type="submit">SEND OFFER ↗</button><button class="row-action" type="button" id="cancelOffer">CANCEL</button></div><p class="offer-help">Your offer is a proposal only. The seller must approve it.</p></form><p class="product-meta">Only seller-listed items appear here. Chat unlocks after an order is placed.</p></div></div>`;
  setPage("detail");
}
async function initializeSession() {
  try {
    const sb = getClient(); const { data: { session }, error } = await sb.auth.getSession(); if (error) throw error;
    if (!session?.user) { currentUser = null; profile = null; activeRole = "buyer"; renderAccount(); setPage("landing"); return; }
    currentUser = session.user; await loadProfileData(); await refreshAdminStatus(); ensureCommercePages(); await loadCart(false); await loadInbox(); renderAccount(); setPage("home");
  } catch (error) { renderAccount(); setPage("landing"); showError(error, "Could not connect to SeniorShelf database."); }
}

// Auth form uses Supabase Auth. Email confirmation may be required by project settings.
$("#authForm").addEventListener("submit", async event => {
  event.preventDefault(); const button = $("#authSubmit"); setBusy(button, true, "PLEASE WAIT…");
  const email = $("#authUsername").value.trim().toLowerCase(); const password = $("#authPassword").value;
  try {
    const sb = getClient();
    if (authMode === "signup") {
      const displayName = $("#authName").value.trim(); const role = $("#authRole").value;
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { display_name: displayName, active_role: role } } });
      if (error) throw error;
      if (!data.user) throw new Error("Could not create account.");
      if (!data.session) { closeAuth(); notify("Account created. Confirm your email, then log in."); return; }
      const { error: profileError } = await sb.from("profiles").upsert({ id: data.user.id, display_name: displayName, active_role: role, school_level: "SMA" });
      if (profileError) throw profileError;
      currentUser = data.user; await loadProfileData(); await refreshAdminStatus(); ensureCommercePages();
    } else {
      const { data, error } = await sb.auth.signInWithPassword({ email, password }); if (error) throw error;
      currentUser = data.user; await loadProfileData(); await refreshAdminStatus(); ensureCommercePages();
    }
    closeAuth(); await loadCart(false); await loadInbox(); renderAccount(); setPage("home"); notify("Welcome to SeniorShelf!");
  } catch (error) { showError(error, "Could not sign in. Check your email and password."); }
  finally { setBusy(button, false); }
});

$("#switchRole").addEventListener("click", async () => {
  if (!currentUser || !profile) return;
  const next = activeRole === "buyer" ? "seller" : "buyer";
  try {
    const { error } = await getClient().from("profiles").update({ active_role: next }).eq("id", currentUser.id); if (error) throw error;
    activeRole = next; profile.active_role = next; renderAccount(); notify("Switched to " + next.toUpperCase() + " mode."); setPage(next === "seller" ? "sell" : "home");
  } catch (error) { showError(error, "Could not switch role."); }
});
$("#logout").addEventListener("click", async () => {
  try { if (messageChannel) getClient().removeChannel(messageChannel); await getClient().auth.signOut(); }
  catch (error) { showError(error, "Could not log out."); }
  currentUser = null; profile = null; isAdmin = false; products = []; cart = []; chats = []; activeRole = "buyer"; activeChat = null; renderAccount(); setPage("landing"); notify("Logged out.");
});
$("#landingLogin").onclick = () => openAuth("login"); $("#landingSignup").onclick = () => openAuth("signup"); $("#headerLogin").onclick = () => openAuth("login"); $("#headerSignup").onclick = () => openAuth("signup");
$("#authSwitch").addEventListener("click", e => { if (e.target.id === "switchToSignup") openAuth("signup"); if (e.target.id === "switchToLogin") openAuth("login"); });
$$('[data-close="auth"]').forEach(el => el.addEventListener("click", closeAuth));
document.addEventListener("keydown", e => { if (e.key === "Escape") closeAuth(); });
$$('[data-page]').forEach(button => button.addEventListener("click", () => { activeLevel = "All"; setPage(button.dataset.page); }));
$$('[data-back]').forEach(button => button.addEventListener("click", () => setPage(button.dataset.back)));
$("#brand").addEventListener("click", e => { e.preventDefault(); if (currentUser) setPage("home"); });
$("#searchInput").addEventListener("input", renderProducts); $("#categoryFilter").addEventListener("change", renderProducts);
$("#levelFilter").addEventListener("change", () => { activeLevel = "All"; renderProducts(); });
$("#productGrid").addEventListener("click", e => { const add = e.target.closest("[data-add]"); const detail = e.target.closest("[data-detail]"); if (add) { e.stopPropagation(); addToCart(add.dataset.add); } else if (detail) showDetail(detail.dataset.detail); });
$("#productGrid").addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-detail]")) { e.preventDefault(); showDetail(e.target.dataset.detail); } });
$("#cartItems").addEventListener("click", e => { const remove = e.target.closest("[data-remove]"); if (remove) removeFromCart(remove.dataset.remove); });
$("#cartSummary").addEventListener("click", e => { if (e.target.id === "checkout") checkout(); });
$("#inboxContent").addEventListener("click", e => { if (e.target.closest("#backToInbox")) { if (messageChannel) getClient().removeChannel(messageChannel); messageChannel = null; activeChat = null; renderInbox(); return; } const btn = e.target.closest("[data-chat]"); if (btn) openChat(btn.dataset.chat); });
$("#inboxContent").addEventListener("submit", e => { if (e.target.id === "messageForm") sendMessage(e); });
$("#myListings").addEventListener("click", e => {
  const edit = e.target.closest("[data-edit-product]"); const toggle = e.target.closest("[data-toggle-product]"); const del = e.target.closest("[data-delete-product]");
  if (edit) editListing(edit);
  if (toggle) toggleListing(toggle.dataset.toggleProduct, toggle.dataset.status);
  if (del) deleteListing(del.dataset.deleteProduct, del.dataset.image);
});
$("#sellerOffers").addEventListener("click", e => { const btn = e.target.closest("[data-offer-status]"); if (btn) respondToOffer(btn.dataset.offer, btn.dataset.offerStatus); });
$$('[data-level]').forEach(button => button.addEventListener("click", () => { activeLevel = button.dataset.level; $("#levelFilter").value = activeLevel; $("#searchInput").value = ""; setPage("home"); }));
$("#saveProfile").addEventListener("click", async () => {
  try { const patch = { school_level: $("#profileLevel").value, grade: $("#profileGrade").value.trim(), semester: $("#profileSemester").value ? Number($("#profileSemester").value) : null }; const { error } = await getClient().from("profiles").update(patch).eq("id", currentUser.id); if (error) throw error; profile = {...profile,...patch}; notify("School info saved!"); }
  catch (error) { showError(error, "Could not save school info."); }
});
$("#itemPhoto").addEventListener("change", e => {
  const file = e.target.files?.[0]; if (!file) return;
  if (!file.type.startsWith("image/")) { notify("Please select an image."); e.target.value = ""; return; }
  if (file.size > 5 * 1024 * 1024) { notify("Choose a photo under 5 MB."); e.target.value = ""; return; }
  selectedPhoto = file; const reader = new FileReader(); reader.onload = () => { $("#photoPreview").innerHTML = `<img src="${reader.result}" alt="Product preview">`; }; reader.readAsDataURL(file);
});
$("#sellForm").addEventListener("submit", uploadListing);
$("#productDetail").addEventListener("click", e => { if (e.target.closest("[data-add]")) addToCart(e.target.closest("[data-add]").dataset.add); if (e.target.closest("#makeOffer")) { $("#offerBox")?.classList.remove("hidden"); $("#offerAmount")?.focus(); } if (e.target.closest("#cancelOffer")) $("#offerBox")?.classList.add("hidden"); });
$("#productDetail").addEventListener("submit", e => { if (e.target.id === "offerBox") sendOffer(e); });

// Add lightweight chat styling without replacing the original visual system.
const chatStyle = document.createElement("style");
chatStyle.textContent = `.chat-panel{padding:12px 0 24px}.chat-heading{padding:18px 0;border-bottom:1px solid var(--line)}.chat-heading p{font-size:11px;color:var(--muted)}.message-list{height:min(48vh,480px);min-height:220px;overflow:auto;display:flex;flex-direction:column;gap:10px;padding:18px 0}.message-bubble{max-width:78%;padding:11px 13px;border:1px solid var(--line);background:#fffdf7;overflow-wrap:anywhere}.message-bubble p{font-size:12px;line-height:1.6;white-space:pre-wrap}.message-bubble small{display:block;margin-top:6px;color:var(--muted);font:9px 'DM Mono',monospace}.message-bubble.mine{align-self:flex-end;background:var(--blue-light)}.message-bubble.theirs{align-self:flex-start}.message-form{display:flex;gap:10px}.message-form input{flex:1;min-width:0;border:1px solid #d3d6ce;padding:12px;background:#fffdf7;font:12px 'DM Sans',sans-serif}.message-form button:disabled{opacity:.6}.fine-print{font-size:10px;color:var(--muted);margin-top:14px}`;
chatStyle.textContent += `.commerce-panel{max-width:680px;margin:0 auto;padding:24px;border:1px solid var(--line);background:#fffdf7;display:grid;gap:16px}.qris-placeholder{min-height:220px;display:grid;place-items:center;border:1px dashed #9aa7b2;padding:22px;text-align:center;color:var(--muted);background:#f6f5ee}.commerce-panel p{font-size:12px;line-height:1.7}.commerce-total{font-size:22px;font-weight:700}.commerce-panel label{display:grid;gap:8px;font:11px \"DM Mono\",monospace}.commerce-panel input,.admin-row input,.list-row input{padding:10px;border:1px solid var(--line);background:white;min-width:0}.admin-row{align-items:flex-start;flex-wrap:wrap}.admin-row .list-details{min-width:220px;flex:1}.hidden{display:none!important}`;
document.head.appendChild(chatStyle);

document.addEventListener("click", e => {
  const pay=e.target.closest("[data-pay-order]"); if(pay){showPaymentPage(pay.dataset.payOrder);return;}
  const done=e.target.closest("[data-complete-order]"); if(done){buyerCompleteOrder(done.dataset.completeOrder);return;}
  const review=e.target.closest("[data-review-payment]"); if(review){adminReviewPayment(review.dataset.reviewPayment,review.dataset.decision);return;}
  const payout=e.target.closest("[data-complete-payout]"); if(payout){adminCompletePayout(payout.dataset.completePayout);return;}
});
document.addEventListener("submit", e => { if(e.target.id==="paymentProofForm") submitPaymentProof(e); });
ensureCommercePages();
renderAccount();
initializeSession();
