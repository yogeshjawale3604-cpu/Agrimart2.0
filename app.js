// Authentication state
let isLoggedIn = false;
let currentUser = null;
let globalCart = {};
window.allProducts = [];

// ─── Step 1: Detect the correct backend URL ────────────────────────────────
// Works on: localhost:3001 (node server.js direct), port 5500 (VS Code Go Live),
// and any cloud deployment (Render.com etc.)

// CRITICAL FIX: If the user double-clicks index.html (file://), cookies and image paths will break.
// Redirect them instantly to the proper local server URL.
if (window.location.protocol === 'file:') {
    window.location.replace('http://localhost:3001');
}

const API_BASE = (() => {
    const { hostname, port } = window.location;
    if (port === '3001') return '';                                  // Direct node server
    if (hostname === 'localhost' || hostname === '127.0.0.1') return 'http://localhost:3001'; // Go Live
    return '';                                                      // Cloud (same origin)
})();

// ─── Step 2: Helper for all API calls ─────────────────────────────────────
async function apiCall(endpoint, method = 'GET', body = null) {
    const config = {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'  // Always send session cookies
    };
    if (body) config.body = JSON.stringify(body);
    try {
        const res = await fetch(API_BASE + endpoint, config);
        return await res.json();
    } catch (e) {
        console.error('API Error:', e);
        return { success: false, error: e.message };
    }
}

// ─── Step 3: Session Restore on page load ────────────────────────────────
// Calls /api/auth/me on every page load to re-establish isLoggedIn state
// from the server session cookie. Without this, every refresh causes 401s.
async function restoreSession() {
    try {
        const data = await apiCall('/api/auth/me');
        if (data.loggedIn && data.user) {
            isLoggedIn = true;
            currentUser = data.user;
            updateAuthNav();
            // Restore cart from server
            const cartData = await apiCall('/api/cart');
            if (cartData.cart) {
                globalCart = {};
                cartData.cart.forEach(item => { globalCart[item.product_id] = item.quantity; });
            }
        }
    } catch(e) {
        console.log('Session restore skipped:', e.message);
    }
}

// Run session restore as soon as the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    restoreSession();
});



// Handle login flows
window.handlePhoneSubmit = async function(e) {
    e.preventDefault();
    const rawPhone = document.getElementById('login-phone').value;
    const phone = rawPhone.replace(/\D/g, ''); // Strip spaces or special chars
    
    const btn = e.target.querySelector('button');
    const feedback = document.getElementById('login-feedback-msg');
    
    if(phone.length === 10) {
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';
        btn.disabled = true;
        
        // Call backend to send OTP
        const res = await apiCall('/api/auth/send-otp', 'POST', { phone });
        
        btn.innerHTML = 'Get OTP';
        btn.disabled = false;
        
        if(res.success) {
            document.getElementById('phone-step').style.display = 'none';
            document.getElementById('otp-step').style.display = 'block';
            document.getElementById('display-phone').textContent = '+91 ' + phone;
            
            // Helpful UI feedback
            feedback.innerHTML = `<span style="color: #15803d; font-weight: 500;"><i class="fa-solid fa-check-circle"></i> SMS Sent!</span>`;
            
            // Auto focus OTP and auto-fill for local testing
            setTimeout(() => {
                const otpInput = document.getElementById('login-otp');
                otpInput.focus();
                // Auto-fill OTP in local environment to prevent users from getting stuck since we hid the 1234 hint
                if (window.location.protocol === 'file:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                    otpInput.value = '1234';
                }
            }, 100);
        } else {
            feedback.innerHTML = `<span style="color: #dc2626; font-weight: 500;"><i class="fa-solid fa-circle-exclamation"></i> Error sending OTP. Please try again.</span>`;
            resetLogin();
        }
    } else {
        feedback.innerHTML = `<span style="color: #dc2626; font-weight: 500;"><i class="fa-solid fa-circle-exclamation"></i> Must enter exactly 10 digits!</span>`;
    }
};

window.handleOtpSubmit = async function(e) {
    e.preventDefault();
    const phone = document.getElementById('login-phone').value;
    const otp = document.getElementById('login-otp').value;
    const btn = e.target.querySelector('button');
    const feedback = document.getElementById('login-feedback-msg');
    
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verifying...';
    btn.disabled = true;
    
    const res = await apiCall('/api/auth/verify-otp', 'POST', { phone, otp });
    
    btn.innerHTML = 'Verify & Login';
    btn.disabled = false;
    
    if(res.success) {
        isLoggedIn = true;
        currentUser = res.user;
        updateAuthNav();
        navigate('home');
        showMockSMS(`Welcome to Agrimart, ${currentUser.name}!`);
    } else {
        feedback.innerHTML = `<span style="color: #dc2626; font-weight: 500;"><i class="fa-solid fa-circle-exclamation"></i> ${res.message || 'Invalid OTP'}</span>`;
        document.getElementById('login-otp').value = '';
    }
};

window.resetLogin = function() {
    document.getElementById('otp-step').style.display = 'none';
    document.getElementById('phone-step').style.display = 'block';
    document.getElementById('login-otp').value = '';
    const feedback = document.getElementById('login-feedback-msg');
    if (feedback) feedback.innerHTML = `Login with your phone number to access Jalgaon's premium market.`;
};

window.logout = async function() {
    await apiCall('/api/auth/logout', 'POST');
    isLoggedIn = false;
    currentUser = null;
    updateAuthNav();
    navigate('login');
};

function updateAuthNav() {
    const navLinks = document.querySelector('.nav-links');
    
    // Remove existing dynamic links
    const existingDynamic = document.querySelectorAll('.dynamic-nav');
    existingDynamic.forEach(el => el.remove());
    
    if(isLoggedIn) {
        // Add Farmer Card and Cart links before auth nav
        const authNav = document.getElementById('auth-nav');
        
        const cardLi = document.createElement('li');
        cardLi.className = 'dynamic-nav';
        cardLi.innerHTML = `<a href="#farmer-card" onclick="navigate('farmer-card')"><i class="fa-solid fa-id-card"></i> Card</a>`;
        navLinks.insertBefore(cardLi, authNav);
        
        const cartLi = document.createElement('li');
        cartLi.className = 'dynamic-nav';
        cartLi.innerHTML = `<a href="#cart" onclick="navigate('cart')"><i class="fa-solid fa-cart-shopping"></i> Cart</a>`;
        navLinks.insertBefore(cartLi, authNav);

        if(authNav) authNav.innerHTML = `<a href="#" onclick="logout()" class="btn btn-secondary" style="padding: 0.5rem 1rem;">Logout</a>`;
    } else {
        const authNav = document.getElementById('auth-nav');
        if(authNav) authNav.innerHTML = `<a href="#login" onclick="navigate('login')" class="btn btn-primary" style="padding: 0.5rem 1rem; color: white;">Login</a>`;
    }
}

// ==========================================
// TOAST NOTIFICATION (showMockSMS)
// ==========================================
window.showMockSMS = function(message) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<i class="fa-solid fa-bell" style="margin-right:8px;"></i>${message}`;
    container.appendChild(toast);
    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 3500);
};

// App specific functions
window.addToCart = async function(productId) {
    if(!isLoggedIn) return navigate('login');
    const res = await apiCall('/api/cart/add', 'POST', { productId });
    if(res.success) {
        showMockSMS('Item added to your cart!');
        if (state.currentPage === 'buy') loadBuyData(); // Refresh UI
    } else {
        showMockSMS(res.error || res.message);
    }
};

window.updateQty = async function(productId, change) {
    if(!isLoggedIn) return;
    const currentQty = globalCart[productId] || 0;
    const newQty = currentQty + change;
    
    const res = await apiCall('/api/cart/update', 'POST', { productId, quantity: newQty });
    if(res.success) {
        if (state.currentPage === 'buy') loadBuyData(); // Refresh UI
    } else {
        showMockSMS(res.error || res.message);
    }
};

window.handleSellSubmit = async function(e) {
    e.preventDefault();
    if(!isLoggedIn) return navigate('login');
    
    const crop_type = document.getElementById('sell-crop').value;
    const quantity = document.getElementById('sell-qty').value;
    const unit = document.getElementById('sell-unit').value;
    const expected_price = document.getElementById('sell-price').value;
    
    const res = await apiCall('/api/sell', 'POST', { 
        crop_type: `${crop_type} (${unit})`, 
        quantity, 
        expected_price 
    });
    if(res.success) {
        showMockSMS(`Sell Request Received! Tracking ID: ${res.trackingId}`);
        if (res.order) {
            document.getElementById('success-modal-msg').innerHTML = `Sell Request Received!<br><strong style="color:var(--primary-color)">Tracking ID: ${res.trackingId}</strong>`;
            document.getElementById('btn-download-bill').onclick = () => window.generateInvoice(res.order, 'Sell Request');
            document.getElementById('success-modal').classList.add('active');
        } else {
            navigate('orders');
        }
    } else {
        showMockSMS(res.error || res.message);
    }
};

window.handleFarmerCardUpdate = async function(e) {
    e.preventDefault();
    const name = document.getElementById('fc-name').value;
    const village = document.getElementById('fc-village').value;
    const land_size = document.getElementById('fc-land').value;
    const crops_grown = document.getElementById('fc-crops').value;
    
    const res = await apiCall('/api/user/farmer-card', 'POST', { name, village, land_size, crops_grown });
    if(res.success) {
        showMockSMS('Farmer Card details updated successfully!');
        // Update local state
        currentUser.name = name;
        currentUser.village = village;
        currentUser.land_size = land_size;
        currentUser.crops_grown = crops_grown;
        render(); // re-render
    } else {
        showMockSMS(res.error || res.message);
    }
};

window.checkout = function(method) {
    if(!isLoggedIn) return navigate('login');
    if(method === 'online') {
        const totalText = document.getElementById('cart-total').textContent;
        const exactAmount = totalText.replace('Total: ', '').replace('₹', '').trim();
        document.getElementById('pay-amount-display').textContent = `₹${exactAmount}`;
        
        // Generate Dynamic UPI QR Code for the specific exactAmount
        const upiString = `upi://pay?pa=chaudhariagrimart@sbi&pn=Chaudhari%20Agrimart&am=${exactAmount}&cu=INR`;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(upiString)}`;
        
        document.getElementById('dynamic-qr-image').src = qrUrl;
        document.getElementById('dynamic-qr-image').style.display = 'block';
        document.getElementById('qr-loading-icon').style.display = 'none';

        document.getElementById('payment-gateway-modal').classList.add('active');
        selectPayOption('qr', document.querySelector('.pay-option-btn'));
    } else {
        executeCheckout('cash');
    }
};

window.executeCheckout = async function(method) {
    const res = await apiCall('/api/checkout', 'POST', { paymentMethod: method });
    if(res.success) {
        document.getElementById('payment-gateway-modal').classList.remove('active');
        showMockSMS(`Order Confirmed! Tracking ID: ${res.trackingId}`);
        if (res.order) {
            document.getElementById('success-modal-msg').innerHTML = `Payment Confirmed!<br><strong style="color:var(--primary-color)">Tracking ID: ${res.trackingId}</strong>`;
            document.getElementById('btn-download-bill').onclick = () => window.generateInvoice(res.order, 'Purchase');
            document.getElementById('success-modal').classList.add('active');
        } else {
            navigate('orders');
        }
    } else {
        showMockSMS(res.error || res.message);
    }
};

window.processMockPayment = function() {
    const btn = document.getElementById('btn-process-payment');
    const originalText = btn.textContent;
    btn.textContent = 'Processing...';
    btn.disabled = true;
    
    setTimeout(() => {
        btn.textContent = originalText;
        btn.disabled = false;
        executeCheckout('online');
    }, 1500);
};

window.selectPayOption = function(view, element) {
    document.querySelectorAll('.pay-option-btn').forEach(btn => btn.classList.remove('selected'));
    document.querySelectorAll('.pay-view').forEach(v => v.style.display = 'none');
    
    element.classList.add('selected');
    document.getElementById(`pay-view-${view}`).style.display = 'block';
};

let trackMapInstance = null;

// ============================================================
// AGRIMART FIXED SHOP COORDINATES (Jalgaon Bus Stand area)
// ============================================================
const AGRIMART_COORDS = [21.0077, 75.5626];
const AGRIMART_ADDRESS = 'Agrimart, Near Bus Stand, Jalgaon - 425001';

// Mobile hamburger menu toggle
window.toggleMenu = function() {
    document.querySelector('.nav-links').classList.toggle('active');
};

// Geocode a free-text address within Jalgaon using Nominatim
async function geocodeAddress(address) {
    try {
        const query = encodeURIComponent(address + ', Jalgaon, Maharashtra, India');
        const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`;
        const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
        const data = await res.json();
        if (data && data[0]) {
            return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
        }
    } catch(e) { /* fallback below */ }
    // Fallback: slight offset from Agrimart if geocoding fails
    return [21.0077 + (Math.random() * 0.04 - 0.02), 75.5626 + (Math.random() * 0.04 - 0.02)];
}

window.handleTrackSubmit = async function(e) {
    e.preventDefault();
    const trackId = document.getElementById('track-id').value.toUpperCase().trim();
    const userAddress = (document.getElementById('track-user-address') || {}).value || '';

    if (!trackId) return showMockSMS('Please enter a valid Tracking ID');

    const trackRes = await apiCall(`/api/track/${trackId}`);
    if (!trackRes.success) {
        return showMockSMS('Tracking ID not found');
    }

    const order = trackRes.order;
    const isBuy = trackRes.type === 'Buy';

    // Show the Download Bill button
    const btnBill = document.getElementById('track-download-bill-btn');
    if (btnBill) {
        btnBill.style.display = 'block';
        btnBill.onclick = () => window.generateInvoice(order, isBuy ? 'Purchase' : 'Sell Request');
    }

    // --- Update address banner ---
    const toAddrEl = document.getElementById('track-to-addr');
    if (toAddrEl) toAddrEl.textContent = userAddress || 'Your Delivery Address, Jalgaon';

    document.getElementById('track-display-id').textContent = `Order ${trackId}`;

    // --- Estimate pickup & delivery times based on order creation ---
    const orderDate = new Date(order.created_at);
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const fmtTime = (d) => d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const fmtDay  = (d) => `${days[d.getDay()]}, ${d.toLocaleDateString('en-IN', { day:'numeric', month:'short' })}`;

    const pickupEl = document.getElementById('track-pickup');
    const etaEl    = document.getElementById('track-eta');
    
    if (isBuy) {
        document.getElementById('track-pickup-label').innerHTML = '📦 Expected Pickup: <strong id="track-pickup" style="color: var(--primary-color);">—</strong>';
        document.getElementById('track-eta-label').innerHTML = '🚚 Expected Delivery: <strong id="track-eta" style="color: var(--primary-color);">—</strong>';
        const pickupTime = new Date(orderDate.getTime() + 2 * 60 * 60 * 1000); // +2 hours
        // Distance-based delivery gap of 4 to 5 days
        const gapDays = 4 + Math.floor(Math.random() * 2); 
        const deliveryTime = new Date(orderDate.getTime() + gapDays * 24 * 60 * 60 * 1000); 
        
        const newPickupEl = document.getElementById('track-pickup');
        const newEtaEl = document.getElementById('track-eta');
        if (newPickupEl) newPickupEl.textContent = `${fmtDay(pickupTime)} at ${fmtTime(pickupTime)}`;
        if (newEtaEl) newEtaEl.textContent = `${fmtDay(deliveryTime)} at ${fmtTime(deliveryTime)}`;
    } else {
        document.getElementById('track-pickup-label').innerHTML = '🚜 Expected Pickup: <strong id="track-pickup" style="color: var(--primary-color);">—</strong>';
        document.getElementById('track-eta-label').innerHTML = '📋 Status: <strong id="track-eta" style="color: var(--primary-color);">—</strong>';
        // Sell pickup gap of 1 to 2 days
        const pickupGapDays = 1 + Math.floor(Math.random() * 2);
        const sellPickup = new Date(orderDate.getTime() + pickupGapDays * 24 * 60 * 60 * 1000);
        
        const newPickupEl = document.getElementById('track-pickup');
        const newEtaEl = document.getElementById('track-eta');
        if (newPickupEl) newPickupEl.textContent = `${fmtDay(sellPickup)} at 10:00 AM`;
        if (newEtaEl) newEtaEl.textContent = `Pending Inspection`;
    }

    const now = new Date();
    const orderAgeMs = now.getTime() - orderDate.getTime();
    const hoursSinceOrder = orderAgeMs / (1000 * 60 * 60);
    const isOutForDelivery = isBuy && hoursSinceOrder > 24; // Mock logic: out for delivery after 1 day

    const isDelivered = trackId.includes('DONE') || trackId.includes('DEL');

    // --- Timeline ---
    const timelineContainer = document.getElementById('track-timeline-container');
    if (timelineContainer) {
        if (isBuy) {
            let timelineHTML = `
                <div style="position:relative; margin-bottom:20px;">
                    <div style="position:absolute; left:-26px; width:10px; height:10px; background:var(--primary-color); border:2px solid var(--primary-color); border-radius:50%;"></div>
                    <h4 style="margin:0; color:var(--primary-color);"><i class="fa-solid fa-check-circle"></i> Order Confirmed</h4>
                    <p style="font-size:0.85rem; color:#666; margin:0;">${fmtDay(orderDate)} at ${fmtTime(orderDate)}</p>
                </div>
            `;

            if (isOutForDelivery && !isDelivered) {
                timelineHTML += `
                <div style="position:relative; margin-bottom:20px;">
                    <div style="position:absolute; left:-26px; width:10px; height:10px; background:white; border:2px solid var(--primary-color); border-radius:50%; box-shadow:0 0 0 3px rgba(46,125,50,0.2); animation:pulse 2s infinite;"></div>
                    <h4 style="margin:0; color:var(--primary-color);">🚚 Out for Delivery</h4>
                    <p style="font-size:0.85rem; color:#666; margin:0;">Driver is on the way to your address!</p>
                </div>
                `;
            } else if (!isDelivered) {
                timelineHTML += `
                <div style="position:relative; margin-bottom:20px;">
                    <div style="position:absolute; left:-26px; width:10px; height:10px; background:white; border:2px solid var(--primary-color); border-radius:50%; box-shadow:0 0 0 3px rgba(46,125,50,0.2); animation:pulse 2s infinite;"></div>
                    <h4 style="margin:0; color:var(--primary-color);">⚙️ Processing</h4>
                    <p style="font-size:0.85rem; color:#666; margin:0;">Preparing your order for dispatch. It will be shipped soon.</p>
                </div>
                `;
            }

            timelineHTML += `
                <div style="position:relative; opacity:${isDelivered?'1':'0.4'};">
                    <div style="position:absolute; left:-26px; width:10px; height:10px; background:${isDelivered?'var(--primary-color)':'white'}; border:2px solid ${isDelivered?'var(--primary-color)':'#ccc'}; border-radius:50%;"></div>
                    <h4 style="margin:0; color:${isDelivered?'var(--primary-color)':'#666'};">📦 Delivered</h4>
                    <p style="font-size:0.85rem; color:#666; margin:0;">${isDelivered?'Package delivered successfully.':'Awaiting drop-off at your address.'}</p>
                </div>
            `;
            timelineContainer.innerHTML = timelineHTML + `<style>@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(46,125,50,0.4)}70%{box-shadow:0 0 0 10px rgba(46,125,50,0)}100%{box-shadow:0 0 0 0 rgba(46,125,50,0)}}</style>`;
        } else {
            const sellPickupStr = document.getElementById('track-pickup').textContent.replace(' at 10:00 AM', '');
            timelineContainer.innerHTML = `
                <div style="position:relative; margin-bottom:20px;">
                    <div style="position:absolute; left:-26px; width:10px; height:10px; background:var(--primary-color); border:2px solid var(--primary-color); border-radius:50%;"></div>
                    <h4 style="margin:0; color:var(--primary-color);"><i class="fa-solid fa-check-circle"></i> Sell Request Received</h4>
                    <p style="font-size:0.85rem; color:#666; margin:0;">${fmtDay(orderDate)} at ${fmtTime(orderDate)}</p>
                </div>
                <div style="position:relative; opacity:${isDelivered?'1':'1'};">
                    <div style="position:absolute; left:-26px; width:10px; height:10px; background:white; border:2px solid var(--primary-color); border-radius:50%; box-shadow:0 0 0 3px rgba(46,125,50,0.2); animation:pulse 2s infinite;"></div>
                    <h4 style="margin:0; color:var(--primary-color);">🚜 Scheduled for Pickup</h4>
                    <p style="font-size:0.85rem; color:#666; margin:0;">Expected Pickup Date: <strong>${sellPickupStr}</strong>. An agent will arrive for inspection.</p>
                </div>
                <style>@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(46,125,50,0.4)}70%{box-shadow:0 0 0 10px rgba(46,125,50,0)}100%{box-shadow:0 0 0 0 rgba(46,125,50,0)}}</style>
            `;
        }
    }

    document.getElementById('track-result').style.display = 'block';

    // --- MAP: Geocode FIRST, then build map so fitBounds works correctly ---
    // Show a loading indicator in the map container while geocoding
    const mapDiv = document.getElementById('track-map');
    if (mapDiv) mapDiv.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;background:#f0fdf4;"><i class="fa-solid fa-spinner fa-spin fa-2x" style="color:#15803d;"></i><span style="margin-left:12px;color:#15803d;font-weight:600;">Loading live map...</span></div>';

    showMockSMS('Locating your delivery address on map...');
    const destCoords = await geocodeAddress(userAddress || 'Jalgaon City');

    // Destroy previous map instance if any, clear spinner
    if (trackMapInstance) { trackMapInstance.remove(); trackMapInstance = null; }
    if (mapDiv) mapDiv.innerHTML = '';

    // ✅ Use CORRECT midpoint between shop & destination (was using shop coord twice!)
    const centerLat = (AGRIMART_COORDS[0] + destCoords[0]) / 2;
    const centerLng = (AGRIMART_COORDS[1] + destCoords[1]) / 2;
    trackMapInstance = L.map('track-map').setView([centerLat, centerLng], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(trackMapInstance);

    // Shop marker (green)
    const shopIcon = L.divIcon({
        html: '<div style="background:#15803d;color:white;padding:5px 10px;border-radius:20px;font-size:12px;font-weight:700;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.35);">🏪 Agrimart</div>',
        className: '', iconAnchor: [44, 20]
    });
    L.marker(AGRIMART_COORDS, { icon: shopIcon }).addTo(trackMapInstance)
        .bindPopup(`<b>📦 Pickup Point</b><br>${AGRIMART_ADDRESS}`).openPopup();

    // Delivery marker (orange)
    const destIcon = L.divIcon({
        html: '<div style="background:#ea580c;color:white;padding:5px 10px;border-radius:20px;font-size:12px;font-weight:700;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.35);">🏠 You</div>',
        className: '', iconAnchor: [22, 20]
    });
    L.marker(destCoords, { icon: destIcon }).addTo(trackMapInstance)
        .bindPopup(`<b>🏠 Delivery Address</b><br>${userAddress || 'Your location, Jalgaon'}`);

    // Draw animated dashed route line between shop and destination
    const routeLine = L.polyline([AGRIMART_COORDS, destCoords], {
        color: '#15803d',
        weight: 5,
        opacity: 0.9,
        dashArray: '12, 8'
    }).addTo(trackMapInstance);

    // Live Moving Marker (like Blinkit / BigBasket)
    if (!isDelivered && isBuy) {
        const truckIcon = L.divIcon({
            html: '<div style="background:white; border-radius:50%; padding:8px; box-shadow:0 4px 10px rgba(0,0,0,0.3); border: 2px solid #15803d; text-align: center;"><i class="fa-solid fa-truck-fast" style="color:#15803d; font-size:1.4rem;"></i></div>',
            className: '', iconAnchor: [20, 20]
        });
        
        const movingTruck = L.marker(AGRIMART_COORDS, { icon: truckIcon }).addTo(trackMapInstance);
        
        if (isOutForDelivery) {
            movingTruck.bindPopup(`<b>🚚 Out for Delivery!</b><br>Driver is on the way.`).openPopup();
            let progress = 0;
            const animateTruck = () => {
                progress += 0.001; // Slower, smoother movement
                if (progress > 1) progress = 0; // Loop the animation
                const lat = AGRIMART_COORDS[0] + (destCoords[0] - AGRIMART_COORDS[0]) * progress;
                const lng = AGRIMART_COORDS[1] + (destCoords[1] - AGRIMART_COORDS[1]) * progress;
                movingTruck.setLatLng([lat, lng]);
                requestAnimationFrame(animateTruck);
            };
            animateTruck();
        } else {
            movingTruck.bindPopup(`<b>⚙️ Processing</b><br>Getting packed at Agrimart.`).openPopup();
            // Just pulse the truck marker to show it's alive but waiting
            movingTruck.getElement().style.animation = 'pulse 2s infinite';
        }
    }

    // ✅ fitBounds now works correctly — both coords are real & different
    trackMapInstance.fitBounds(routeLine.getBounds(), { padding: [50, 50] });
    setTimeout(() => trackMapInstance && trackMapInstance.invalidateSize(), 250);

    // --- Order Items ---
    const orderItemsDiv = document.getElementById('track-order-items');
    if (!orderItemsDiv) return;
    
    if (isBuy) {
        orderItemsDiv.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px dashed #e5e7eb; padding-bottom:5px;">
                <div>
                    <div style="font-weight:500;">${order.items_summary}</div>
                </div>
                <div style="font-weight:600; color:var(--primary-color);">₹${order.total_amount}</div>
            </div>
        `;
    } else {
        orderItemsDiv.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px dashed #e5e7eb; padding-bottom:5px;">
                <div>
                    <div style="font-weight:500;">${order.crop_type}</div>
                    <div style="font-size:0.85rem; color:#666;">Qty: ${order.quantity}</div>
                </div>
                <div style="font-weight:600; color:var(--primary-color);">₹${order.expected_price * Number(String(order.quantity).split(' ')[0])}</div>
            </div>
        `;
    }
};

const state = {
    currentPage: 'home'
};

function navigate(pageId) {
    state.currentPage = pageId;
    if (window.location.hash !== `#${pageId}`) {
        window.location.hash = pageId;
    }
    
    // Close mobile menu if open FIRST so UI responds instantly
    document.querySelector('.nav-links').classList.remove('active');
    
    render();
    
    // Update active nav link
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.classList.remove('active');
        if(link.getAttribute('href') === `#${pageId}`) {
            link.classList.add('active');
        }
    });
}

async function render() {
    const appContent = document.getElementById('app-content');
    
    // Removed artificial loading spinner to prevent UI jank. Content generation is synchronous.

    const templateId = `tmpl-${state.currentPage}`;
    const template = document.getElementById(templateId);
    
    if (template) {
        appContent.innerHTML = template.innerHTML;
        
        if (state.currentPage === 'farmer-card') {
            loadFarmerCardData();
        } else if (state.currentPage === 'cart') {
            loadCartData();
        } else if (state.currentPage === 'buy') {
            loadBuyData();
        } else if (state.currentPage === 'orders') {
            loadOrdersData();
        }
        
    } else {
        appContent.innerHTML = `
            <div class="container" style="padding: 100px 20px; text-align: center;">
                <h2>Page Under Construction</h2>
                <p>The ${state.currentPage} page is coming soon.</p>
                <button class="btn btn-primary" style="margin-top: 20px;" onclick="navigate('home')">Return Home</button>
            </div>
        `;
    }
}

async function loadFarmerCardData() {
    const res = await apiCall('/api/auth/me');
    if(res.loggedIn && res.user) {
        document.getElementById('display-fc-name').textContent = res.user.name || 'Farmer';
        document.getElementById('display-fc-phone').textContent = '+91 ' + res.user.phone;
        document.getElementById('display-fc-village').textContent = res.user.village || 'Not specified';
        
        // Populate Farmer ID number
        const fcIdEl = document.getElementById('display-fc-id');
        if (fcIdEl) fcIdEl.textContent = String(res.user.id).padStart(3, '0');
        
        document.getElementById('fc-name').value = res.user.name || '';
        document.getElementById('fc-village').value = res.user.village || '';
        document.getElementById('fc-land').value = res.user.land_size || '';
        document.getElementById('fc-crops').value = res.user.crops_grown || '';
        
        // Generate real QR
        const qrContent = encodeURIComponent(`Farmer: ${res.user.name}\nPhone: ${res.user.phone}\nVillage: ${res.user.village || 'N/A'}`);
        const qrCodeImg = document.getElementById('fc-qr-code');
        if (qrCodeImg) {
            qrCodeImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${qrContent}&color=ffffff&bgcolor=15803d&margin=5`;
        }
    }
}

async function loadCartData() {
    const res = await apiCall('/api/cart');
    const cartContainer = document.getElementById('cart-items-container');
    const checkoutArea = document.getElementById('checkout-area');
    
    if(!res.cart || res.cart.length === 0) {
        cartContainer.innerHTML = '<p style="text-align:center; padding: 40px;">Your cart is empty.</p>';
        checkoutArea.style.display = 'none';
        return;
    }
    
    let total = 0;
    cartContainer.innerHTML = res.cart.map(item => {
        total += item.price * item.quantity;
        return `
        <div style="display: flex; gap: 20px; border-bottom: 1px solid #eee; padding: 15px 0;">
            <img src="${item.image_url}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 8px;">
            <div style="flex: 1;">
                <h4 style="margin: 0 0 5px 0;">${item.name}</h4>
                <div style="color: var(--text-light)">₹${item.price} x ${item.quantity} ${item.unit}</div>
            </div>
            <div style="font-weight: 600;">₹${item.price * item.quantity}</div>
        </div>
        `;
    }).join('');
    
    document.getElementById('cart-total').textContent = `Total: ₹${total}`;
    checkoutArea.style.display = 'block';
}

window.loadBuyData = async function() {
    const categories = {
        'Fertilizers': document.getElementById('cat-fertilizers'),
        'Seeds': document.getElementById('cat-seeds'),
        'Tools': document.getElementById('cat-tools'),
        'Pesticides': document.getElementById('cat-pesticides')
    };

    // Inject beautiful loading spinners
    Object.values(categories).forEach(el => el && (el.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px;"><i class="fa-solid fa-circle-notch fa-spin fa-2x" style="color:var(--primary-color);"></i><p style="margin-top:15px; color:#666; font-weight:500;">Loading Catalog...</p></div>'));
    
    try {
        if (isLoggedIn) {
            const cartRes = await apiCall('/api/cart');
            globalCart = {};
            if (cartRes.cart) {
                cartRes.cart.forEach(item => {
                    globalCart[item.product_id] = item.quantity;
                });
            }
        }

        const res = await apiCall('/api/products');
        if(res.products) {
            window.allProducts = res.products;
            renderProducts(window.allProducts);
        }
    } catch(e) {
        Object.values(categories).forEach(el => el && (el.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: red; padding: 20px;"><i class="fa-solid fa-triangle-exclamation"></i> Failed to connect. Please try again.</div>'));
    }
};

window.renderProducts = function(products) {
    const categories = {
        'Fertilizers': document.getElementById('cat-fertilizers'),
        'Seeds': document.getElementById('cat-seeds'),
        'Tools': document.getElementById('cat-tools'),
        'Pesticides': document.getElementById('cat-pesticides')
    };
    
    Object.values(categories).forEach(el => el && (el.innerHTML = ''));

    products.forEach(p => {
        const container = categories[p.category];
        if(container) {
            const qty = globalCart[p.id] || 0;
            let actionHtml = '';
            
            if (qty > 0) {
                actionHtml = `
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: auto; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 5px;">
                        <button onclick="updateQty(${p.id}, -1)" style="flex: 1; height: 35px; border-radius: 5px; background: white; border: 1px solid #ccc; cursor: pointer; font-size: 1.2rem; font-weight: bold; color: #166534; transition: var(--transition);" onmouseover="this.style.background='#e5e7eb'" onmouseout="this.style.background='white'">-</button>
                        <span style="font-weight: bold; font-size: 1.1rem; color: #15803d; text-align: center; min-width: 30px;">${qty}</span>
                        <button onclick="updateQty(${p.id}, 1)" style="flex: 1; height: 35px; border-radius: 5px; background: var(--primary-color); border: none; cursor: pointer; font-size: 1.2rem; font-weight: bold; color: white; transition: var(--transition);" onmouseover="this.style.background='#1B5E20'" onmouseout="this.style.background='var(--primary-color)'">+</button>
                    </div>
                `;
            } else {
                actionHtml = `<button class="btn btn-primary" style="margin-top:auto; width: 100%; border-radius: 8px;" onclick="addToCart(${p.id})"><i class="fa-solid fa-cart-plus"></i> Add to Cart</button>`;
            }

            container.innerHTML += `
                <div style="background-color: var(--bg-color); padding: 2rem; border-radius: 12px; display: flex; flex-direction: column; transition: transform 0.3s ease, box-shadow 0.3s ease; box-shadow: var(--shadow);" onmouseover="this.style.transform='translateY(-5px)'; this.style.boxShadow='var(--shadow-hover)';" onmouseout="this.style.transform='none'; this.style.boxShadow='var(--shadow)';">
                    <img src="${p.image_url}" alt="${p.name}" style="width: 100%; height: 160px; object-fit: cover; border-radius: 8px; margin-bottom: 15px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
                    <h3 style="margin-bottom: 5px; font-size: 1.2rem;">${p.name}</h3>
                    <p style="margin-bottom: 15px; font-size: 0.85rem; color: #666; flex-grow: 1;">Premium ${p.category}</p>
                    <div style="font-weight: 800; color: var(--primary-color); margin-bottom: 15px; font-size: 1.4rem;">₹${p.price} <span style="font-size: 0.9rem; font-weight: 500; color: #666;">/ ${p.unit}</span></div>
                    ${actionHtml}
                </div>
            `;
        }
    });

    // Check if any category is completely empty and hide title if so
    document.querySelectorAll('.features-grid').forEach(grid => {
        if (!grid.innerHTML.trim()) {
            grid.previousElementSibling.style.display = 'none'; // hide h3
        } else {
            grid.previousElementSibling.style.display = 'inline-block'; // show h3
        }
    });
};

window.filterProducts = function() {
    const term = document.getElementById('buy-search-input').value.toLowerCase();
    const filtered = window.allProducts.filter(p => p.name.toLowerCase().includes(term) || p.category.toLowerCase().includes(term));
    renderProducts(filtered);
};

// Handle Browser Back Button and Initial Load
window.addEventListener('hashchange', () => {
    const hash = window.location.hash.substring(1);
    if (hash && hash !== state.currentPage) {
        navigate(hash);
    }
});

// Initialize app based on current hash or default to home on start
window.addEventListener('DOMContentLoaded', () => {
    const initialHash = window.location.hash.substring(1) || 'home';
    navigate(initialHash);
});

// ==========================================
// MY ORDERS LOGIC
// ==========================================
window.loadOrdersData = async function() {
    const ordersContainer = document.getElementById('orders-list-container');
    if (!ordersContainer) return;
    
    ordersContainer.innerHTML = '<p style="text-align:center; padding: 20px;"><i class="fa-solid fa-spinner fa-spin"></i> Loading activity...</p>';
    
    try {
        const [ordersRes, sellRes] = await Promise.all([
            apiCall('/api/orders'),
            apiCall('/api/sell-orders')
        ]);
        
        let allActivity = [];
        if (ordersRes.orders) {
            ordersRes.orders.forEach(o => allActivity.push({...o, _type: 'Buy'}));
        }
        if (sellRes.sell_orders) {
            sellRes.sell_orders.forEach(o => allActivity.push({...o, _type: 'Sell'}));
        }
        
        // Sort chronologically (newest first)
        allActivity.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        
        if (allActivity.length > 0) {
            ordersContainer.innerHTML = allActivity.map(order => {
                const d = new Date(order.created_at);
                const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                
                const isBuy = order._type === 'Buy';
                const badgeColor = isBuy ? '#dbeafe' : '#fce7f3';
                const badgeText = isBuy ? '#1e40af' : '#9d174d';
                
                // Keep properties readable for generating invoice
                const strOrder = encodeURIComponent(JSON.stringify(order));
                
                return `
                <div style="background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; box-shadow: var(--shadow); display: flex; flex-wrap: wrap; gap: 15px; justify-content: space-between; align-items: center;">
                    <div style="flex: 1; min-width: 250px;">
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 5px;">
                            <span style="background: ${badgeColor}; color: ${badgeText}; padding: 4px 8px; border-radius: 20px; font-size: 0.75rem; font-weight: 700;">${isBuy ? 'PURCHASE' : 'SELL REQUEST'}</span>
                            <h3 style="margin: 0; font-size: 1.1rem; color: var(--primary-color);">${order.tracking_id}</h3>
                            <span style="background: ${order.status.includes('Delivered') || order.status.includes('Complete') ? '#dcfce7' : '#fef9c3'}; color: ${order.status.includes('Delivered') || order.status.includes('Complete') ? '#166534' : '#854d0e'}; padding: 4px 8px; border-radius: 20px; font-size: 0.75rem; font-weight: 600;">${order.status}</span>
                        </div>
                        <p style="margin: 0 0 10px 0; color: #666; font-size: 0.9rem;">${dateStr}</p>
                        <p style="margin: 0; font-weight: 500;"><i class="fa-solid fa-box"></i> ${isBuy ? order.items_summary : 'Crop: ' + order.crop_type + ' (Qty: ' + order.quantity + ')'}</p>
                    </div>
                    <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 10px; min-width: 140px;">
                        <div style="font-size: 1.2rem; font-weight: 700;">₹${isBuy ? order.total_amount : order.expected_price * Number(String(order.quantity).split(' ')[0])}</div>
                        <div style="display: flex; gap: 10px; width: 100%;">
                            <button class="btn btn-secondary" onclick="generateInvoice(JSON.parse(decodeURIComponent('${strOrder}')), '${isBuy ? 'Purchase' : 'Sell Request'}')" style="padding: 8px 10px; font-size: 0.9rem; flex: 1;" title="Download Bill">
                                <i class="fa-solid fa-file-invoice"></i> Bill
                            </button>
                            ${isBuy ? `
                            <button class="btn btn-primary" onclick="navigate('track'); setTimeout(()=>{ const el=document.getElementById('track-id'); if(el){el.value='${order.tracking_id}'; handleTrackSubmit({preventDefault:()=>{}});} }, 300);" style="padding: 8px 10px; font-size: 0.9rem; flex: 1;" title="Track Order">
                                <i class="fa-solid fa-location-arrow"></i> Track
                            </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
                `;
            }).join('');
        } else {
            ordersContainer.innerHTML = `
                <div style="text-align: center; padding: 40px; background: white; border-radius: 12px; border: 1px dashed #ccc;">
                    <i class="fa-solid fa-box-open" style="font-size: 3rem; color: #ccc; margin-bottom: 15px;"></i>
                    <h3>No history yet</h3>
                    <p style="color: #666; margin-bottom: 20px;">Buy or sell items to see your history here.</p>
                    <button class="btn btn-primary" onclick="navigate('buy')">Start Shopping</button>
                </div>
            `;
        }
    } catch (e) {
        ordersContainer.innerHTML = '<p style="text-align:center; padding: 20px; color: red;">Failed to load activity.</p>';
    }
};

// ==========================================
// INVOICE LOGIC
// ==========================================
window.generateInvoice = function(order, typeName) {
    // Live date, time and day
    const orderDate = new Date(order.created_at || Date.now());
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const dayName = days[orderDate.getDay()];
    const dateStr = orderDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
    const timeStr = orderDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    document.getElementById('inv-date').textContent = `${dayName}, ${dateStr}`;
    const invTimeEl = document.getElementById('inv-time');
    if (invTimeEl) invTimeEl.textContent = timeStr;

    document.getElementById('inv-id').textContent = order.tracking_id;
    document.getElementById('inv-title').textContent = typeName + ' INVOICE';

    document.getElementById('inv-customer-name').textContent = currentUser ? currentUser.name : 'Farmer';
    document.getElementById('inv-customer-phone').textContent = currentUser ? '+91 ' + currentUser.phone : 'N/A';

    document.getElementById('inv-payment-status').textContent = 'Confirmed';
    if (typeName === 'Sell Request') {
        document.getElementById('inv-payment-method').textContent = 'Awaiting Inspection';
        document.getElementById('inv-payment-status').textContent = 'Pending';
        document.getElementById('inv-items').textContent = order.crop_type + ' - ' + order.quantity + ' Quintals';
        let multiplier = Number(String(order.quantity).split(' ')[0]) || 0;
        let extPrice = order.expected_price * multiplier;
        document.getElementById('inv-total').textContent = '\u20b9' + extPrice;
        document.getElementById('inv-subtotal').textContent = '\u20b9' + extPrice;
        document.getElementById('inv-grand-total').textContent = '\u20b9' + extPrice;
    } else {
        document.getElementById('inv-payment-method').textContent = String(order.payment_method).toUpperCase();
        document.getElementById('inv-items').textContent = order.items_summary;
        document.getElementById('inv-total').textContent = '\u20b9' + order.total_amount;
        document.getElementById('inv-subtotal').textContent = '\u20b9' + order.total_amount;
        document.getElementById('inv-grand-total').textContent = '\u20b9' + order.total_amount;
    }

    const container = document.getElementById('invoice-template');
    html2canvas(container, { scale: 2, backgroundColor: '#ffffff' }).then(canvas => {
        const link = document.createElement('a');
        link.download = `Agrimart-${typeName.replace(' ', '')}-${order.tracking_id}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        showMockSMS('Bill Downloaded!');
    });
};

// ==========================================
// FARMER CARD DOWNLOAD LOGIC
// ==========================================
window.downloadFarmerCard = function() {
    const cardElement = document.getElementById('farmer-card-element');
    if (!cardElement) {
        showMockSMS("Error: Farmer Card element is missing.");
        return;
    }
    
    const originalBorderRadius = cardElement.style.borderRadius;
    const originalBoxShadow = cardElement.style.boxShadow;
    
    // Temporarily remove shadow for cleaner PNG edges
    cardElement.style.boxShadow = 'none';
    
    html2canvas(cardElement, {
        scale: 3, // Very high resolution for printing
        backgroundColor: null, // Transparent background matches border radius
        logging: false,
        useCORS: true // Allow rendering external font icons if needed
    }).then(canvas => {
        // Restore styles
        cardElement.style.boxShadow = originalBoxShadow;
        
        const imageURL = canvas.toDataURL("image/png");
        const a = document.createElement('a');
        a.href = imageURL;
        a.download = `Agrimart_Farmer_ID_${document.getElementById('display-fc-name').textContent.replace(/\s+/g, '_')}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showMockSMS("Farmer ID Card downloaded to your device!");
    }).catch(err => {
        console.error("Error generating card image:", err);
        cardElement.style.boxShadow = originalBoxShadow;
        showMockSMS("Failed to generate ID card image.");
    });
};

// ==========================================
// CROP DOCTOR – TEXT-BASED ADVISORY ENGINE
// ==========================================
const cropAdviceDB = {
    yellow: {
        title: 'Nitrogen / Iron Deficiency',
        icon: '🌿',
        problem: 'Yellowing of leaves (Chlorosis) is caused by Nitrogen deficiency, Iron deficiency, overwatering, or root rot.',
        steps: ['Check soil moisture – avoid waterlogging', 'Apply Urea (46% N) @ 15–20 kg/acre or DAP @ 10 kg/acre', 'Use Ferrous Sulphate (FeSO₄) 0.5% spray if Iron-deficient', 'Ensure proper drainage in the field'],
        fertilizers: ['Urea 46% N – 1 bag/acre', 'DAP (Di-ammonium Phosphate)', 'Ferrous Sulphate (FeSO₄) for foliar spray']
    },
    powder: {
        title: 'Powdery Mildew (Fungal Disease)',
        icon: '🍄',
        problem: 'White powdery coating on leaves is Powdery Mildew caused by Erysiphe spp. Spreads in humid conditions.',
        steps: ['Spray Wettable Sulphur 80% WP @ 3g/litre', 'Apply Hexaconazole 5% EC or Propiconazole 25% EC', 'Avoid overhead irrigation – use drip if possible', 'Remove and destroy heavily infected leaves'],
        fertilizers: ['Wettable Sulphur 80% WP', 'Hexaconazole 5% EC', 'Propiconazole 25% EC (Tilt)']
    },
    wilt: {
        title: 'Fusarium / Verticillium Wilt',
        icon: '🥀',
        problem: 'Wilting during afternoon indicates Fusarium or Verticillium wilt – soil-borne fungal disease attacking roots.',
        steps: ['Drench soil with Carbendazim 50% WP @ 2g/litre at root zone', 'Apply Trichoderma viride bio-fungicide @ 250g/acre with compost', 'Avoid replanting same crop for 2 seasons', 'Deep plough to improve soil aeration'],
        fertilizers: ['Carbendazim 50% WP (Bavistin)', 'Trichoderma viride (bio-fungicide)', 'Potassium Humate for root health']
    },
    holes: {
        title: 'Leaf-Eating Caterpillars / Bollworm',
        icon: '🐛',
        problem: 'Holes in leaves indicate caterpillars, armyworms, or bollworms. Common in Cotton and Soyabean.',
        steps: ['Spray Chlorpyrifos 20% EC @ 2ml/litre', 'Use Emamectin Benzoate 5% SG @ 0.5g/litre for serious attacks', 'Install pheromone traps @ 1/acre', 'Pick and destroy egg masses manually early on'],
        fertilizers: ['Chlorpyrifos 20% EC', 'Emamectin Benzoate 5% SG (Proclaim)', 'Spinosad 45% SC (organic option)']
    },
    stunted: {
        title: 'Nutrient Deficiency or Nematode Attack',
        icon: '📉',
        problem: 'Stunted growth is caused by N/P/K/Zinc deficiency or root-knot nematode infestation in soil.',
        steps: ['Apply Carbofuran 3G @ 8–10 kg/acre in soil for nematodes', 'Spray NPK 19:19:19 @ 3g/litre foliar every 10 days', 'Add Zinc Sulphate @ 5 kg/acre to soil', 'Test soil pH and correct with lime if acidic'],
        fertilizers: ['NPK 19:19:19 (Water Soluble)', 'Zinc Sulphate (ZnSO₄)', 'Carbofuran 3G (nematicide)', 'Micronutrient mixture']
    },
    spot: {
        title: 'Leaf Spot / Blight Disease',
        icon: '🔴',
        problem: 'Brown/black spots indicate Alternaria Leaf Spot or Cercospora – fungal diseases in humid weather.',
        steps: ['Spray Mancozeb 75% WP @ 2.5g/litre every 10–14 days', 'Use Copper Oxychloride 50% WP @ 3g/litre', 'Avoid wetting foliage during irrigation', 'Apply Propiconazole for severe cases'],
        fertilizers: ['Mancozeb 75% WP (Indofil M-45)', 'Copper Oxychloride 50% WP', 'Propiconazole 25% EC (Tilt)']
    },
    curl: {
        title: 'Leaf Curl Virus / Thrips Attack',
        icon: '🌀',
        problem: 'Curling or rolling leaves is caused by Leaf Curl Virus from whiteflies/aphids, or Thrips attack.',
        steps: ['Spray Imidacloprid 17.8% SL @ 0.3ml/litre', 'Apply Thiamethoxam 25% WG @ 0.3g/litre', 'Remove and burn infected plants', 'Spray Neem Oil 1500 ppm @ 5ml/litre preventively'],
        fertilizers: ['Imidacloprid 17.8% SL (Confidor)', 'Thiamethoxam 25% WG (Actara)', 'Organic Neem Oil 1500 ppm']
    },
    burn: {
        title: 'Fertilizer Burn / Heat Stress',
        icon: '🔥',
        problem: 'Brown leaf tips/edges are caused by excess fertilizer salt, herbicide drift, or extreme heat/drought stress.',
        steps: ['Irrigate field immediately to leach out excess salts', 'Spray plain water to wash chemical residues', 'Avoid applying fertilizer during high temperatures', 'Use Potassium Silicate foliar spray for stress'],
        fertilizers: ['Potassium Silicate (stress protector)', 'Humic Acid granules', 'Reduce fertilizer dose 25% next cycle']
    }
};

function matchCropAdvice(situation) {
    const s = situation.toLowerCase();
    if (s.includes('yellow') || s.includes('pale') || s.includes('chloro')) return cropAdviceDB.yellow;
    if (s.includes('powder') || s.includes('white coat') || s.includes('white dust')) return cropAdviceDB.powder;
    if (s.includes('wilt') || s.includes('droop') || s.includes('collapse')) return cropAdviceDB.wilt;
    if (s.includes('hole') || s.includes('eaten') || s.includes('caterpillar') || s.includes('worm') || s.includes('boll')) return cropAdviceDB.holes;
    if (s.includes('stunt') || s.includes('slow grow') || s.includes('not growing') || s.includes('small plant')) return cropAdviceDB.stunted;
    if (s.includes('spot') || s.includes('blight') || s.includes('brown mark') || s.includes('black mark')) return cropAdviceDB.spot;
    if (s.includes('curl') || s.includes('roll') || s.includes('twist') || s.includes('aphid') || s.includes('whitefly')) return cropAdviceDB.curl;
    if (s.includes('burn') || s.includes('tip dry') || s.includes('edge brown') || s.includes('scorch')) return cropAdviceDB.burn;
    return null;
}

window.handleCropDoctorSubmit = function(e) {
    e.preventDefault();
    const crop      = document.getElementById('cd-crop').value.trim();
    const stageEl   = document.getElementById('cd-stage');
    const stageVal  = stageEl ? stageEl.options[stageEl.selectedIndex].text : 'Vegetative';
    const situation = document.getElementById('cd-situation').value.trim();
    const soil      = document.getElementById('cd-soil').value.trim();
    const resultDiv = document.getElementById('crop-doctor-result');
    if (!resultDiv) return;

    resultDiv.style.display = 'block';
    resultDiv.innerHTML = `<div style="text-align:center; padding:30px;"><i class="fa-solid fa-circle-notch fa-spin fa-2x" style="color:var(--primary-color);"></i><p style="margin-top:15px; color:#666;">Analyzing crop situation...</p></div>`;

    setTimeout(() => {
        const advice = matchCropAdvice(situation);

        if (!advice) {
            resultDiv.innerHTML = `
            <div style="background:white; border-radius:14px; padding:25px; box-shadow:var(--shadow); border-left:5px solid var(--primary-color);">
                <h3 style="color:var(--primary-color); margin-bottom:10px;">🌱 General Advisory for ${crop}</h3>
                <p style="color:#444; margin-bottom:15px;">No specific disease detected. General care plan for <strong>${crop}</strong> at <em>${stageVal}</em> stage:</p>
                <ul style="padding-left:20px; color:#555; line-height:2;">
                    <li>Spray NPK 19:19:19 @ 3g/litre as foliar spray every 10 days</li>
                    <li>Ensure adequate irrigation – avoid overwatering and drought stress</li>
                    <li>Use Neem Oil 1500 ppm @ 5ml/litre as preventive spray</li>
                    <li>Check for pest activity early morning and evening</li>
                    <li>${soil ? 'Soil/weather noted: <em>' + soil + '</em>. Monitor moisture carefully.' : 'Get soil tested for pH and nutrients.'}</li>
                </ul>
                <div style="background:#f0fdf4; border-radius:8px; padding:12px; margin-top:15px;">
                    <strong style="color:#15803d;">💡 Tip:</strong> Visit Agrimart Jalgaon for expert advice. Call: <a href="tel:+919552961621" style="color:var(--primary-color);">+91 9552961621</a>
                </div>
            </div>`;
            return;
        }

        const stepsHtml = advice.steps.map(s => `<li style="margin-bottom:8px;">${s}</li>`).join('');
        const fertHtml  = advice.fertilizers.map(f => `<span style="display:inline-block; background:#dcfce7; color:#166534; padding:4px 10px; border-radius:20px; font-size:0.85rem; margin:4px 4px 4px 0;">${f}</span>`).join('');

        resultDiv.innerHTML = `
        <div style="background:white; border-radius:14px; padding:25px; box-shadow:var(--shadow); border-left:5px solid var(--primary-color);">
            <div style="display:flex; align-items:center; gap:12px; margin-bottom:15px;">
                <span style="font-size:2.5rem;">${advice.icon}</span>
                <div>
                    <h3 style="margin:0; color:var(--primary-color);">${advice.title}</h3>
                    <p style="margin:2px 0 0; color:#666; font-size:0.9rem;">Crop: <strong>${crop}</strong> &nbsp;|&nbsp; Stage: <strong>${stageVal}</strong>${soil ? ' &nbsp;|&nbsp; Soil: <em>' + soil + '</em>' : ''}</p>
                </div>
            </div>
            <div style="background:#fff7ed; border:1px solid #fed7aa; border-radius:8px; padding:12px; margin-bottom:18px;">
                <strong style="color:#9a3412;">⚠️ Problem Identified:</strong>
                <p style="margin:5px 0 0; color:#555;">${advice.problem}</p>
            </div>
            <h4 style="margin-bottom:10px; color:#333;">✅ Treatment Steps:</h4>
            <ol style="padding-left:20px; color:#444; line-height:1.8; margin-bottom:18px;">${stepsHtml}</ol>
            <h4 style="margin-bottom:10px; color:#333;">🧪 Recommended Products (Available at Agrimart):</h4>
            <div style="margin-bottom:20px;">${fertHtml}</div>
            <div style="background:#f0fdf4; border-radius:8px; padding:12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                <span style="color:#15803d;"><strong>💊 Need these products?</strong> Visit Agrimart Jalgaon or call us</span>
                <a href="tel:+919552961621" class="btn btn-primary" style="padding:8px 18px; font-size:0.9rem;">📞 +91 9552961621</a>
            </div>
        </div>`;
    }, 900);
};
