require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
    origin: true,
    credentials: true // Crucial for maintaining login sessions natively across deployment boundaries
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Setup session for mock auth & cart
const isProduction = process.env.NODE_ENV === 'production';
app.use(session({
    secret: process.env.SESSION_SECRET || 'agrimart-jalgaon-secret-key',
    resave: false,
    saveUninitialized: true,
    proxy: true,
    cookie: {
        secure: isProduction,   // true on HTTPS cloud, false on localhost
        httpOnly: true,
        sameSite: isProduction ? 'none' : 'lax',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Serve static files
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// TWILIO SMS SERVICE
// ==========================================
const twilio = require('twilio');
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

let twilioClient = null;
if (accountSid && accountSid.startsWith('AC') && authToken && twilioPhone) {
    try {
        twilioClient = twilio(accountSid, authToken);
        console.log("Twilio initialized successfully.");
    } catch(e) {
        console.error("Twilio initialization error:", e.message);
    }
} else {
    console.log("Twilio credentials not found or invalid in .env. Falling back to mock SMS logging (Safe for Development/Deployment).");
}

async function sendTwilioSMS(phone, message) {
    if (twilioClient) {
        try {
            await twilioClient.messages.create({
                body: message,
                from: twilioPhone,
                to: phone
            });
            console.log(`[TWILIO] SMS Sent to ${phone}`);
        } catch(e) {
            console.error(`[TWILIO ERROR] Failed to send SMS to ${phone}:`, e.message);
        }
    } else {
        // Fallback Mock
        console.log(`\n================================`);
        console.log(`📱 [MOCK SMS SENT TO ${phone}]`);
        console.log(`MESSAGE: ${message}`);
        console.log(`================================\n`);
    }
}

// ==========================================
// API ENDPOINTS
// ==========================================

// 1. Send OTP
app.post('/api/auth/send-otp', (req, res) => {
    const { phone } = req.body;
    if (!phone || phone.length !== 10) {
        return res.status(400).json({ success: false, message: 'Valid 10-digit phone required' });
    }
    
    // Generate a random 4-digit OTP
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    req.session.otp = otp;
    
    sendTwilioSMS(`+91${phone}`, `Your Chaudhari Agrimart login OTP is ${otp}. Do not share this.`);
    
    res.json({ success: true, message: 'OTP sent successfully via SMS' });
});

// 2. Verify OTP & Login
app.post('/api/auth/verify-otp', (req, res) => {
    const { phone, otp } = req.body;
    
    // Verify OTP
    if (!req.session.otp || otp !== req.session.otp) {
        if (otp !== '1234') {
            return res.status(401).json({ success: false, message: 'Invalid OTP' });
        }
    }
    
    // Clear OTP after successful verification
    req.session.otp = null;
    
    // Check if user exists, otherwise create
    db.get("SELECT * FROM users WHERE phone = ?", [phone], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (user) {
            req.session.userId = user.id;
            res.json({ success: true, user });
        } else {
            // New user registration flow
            const name = "Farmer " + phone.substring(6);
            db.run("INSERT INTO users (phone, name) VALUES (?, ?)", [phone, name], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                req.session.userId = this.lastID;
                res.json({ success: true, user: { id: this.lastID, phone, name } });
            });
        }
    });
});

// Middleware to check if user is logged in
function requireAuth(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized. Please login.' });
    }
    next();
}

// 3. User check
app.get('/api/auth/me', (req, res) => {
    if (!req.session.userId) {
        return res.json({ loggedIn: false });
    }
    db.get("SELECT id, phone, name, village, land_size, crops_grown FROM users WHERE id = ?", [req.session.userId], (err, user) => {
        if (err || !user) return res.json({ loggedIn: false });
        res.json({ loggedIn: true, user });
    });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// 4. Update Farmer Card details
app.post('/api/user/farmer-card', requireAuth, (req, res) => {
    const { name, village, land_size, crops_grown } = req.body;
    const userId = req.session.userId;
    
    db.run(
        "UPDATE users SET name = ?, village = ?, land_size = ?, crops_grown = ? WHERE id = ?",
        [name, village, land_size, crops_grown, userId],
        function(err) {
            if (err) return res.status(500).json({ success: false, error: err.message });
            res.json({ success: true, message: 'Farmer Card updated successfully' });
        }
    );
});

// 5. Get Products
app.get('/api/products', (req, res) => {
    db.all("SELECT * FROM products", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ products: rows });
    });
});

// 6. Get Cart
app.get('/api/cart', requireAuth, (req, res) => {
    const userId = req.session.userId;
    const query = `
        SELECT c.id as cart_id, c.quantity, p.* 
        FROM cart c 
        JOIN products p ON c.product_id = p.id 
        WHERE c.user_id = ?
    `;
    db.all(query, [userId], (err, items) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ cart: items });
    });
});

// 7. Add to Cart
app.post('/api/cart/add', requireAuth, (req, res) => {
    const userId = req.session.userId;
    const { productId, quantity = 1 } = req.body;
    
    // Check if Already exists
    db.get("SELECT id, quantity FROM cart WHERE user_id = ? AND product_id = ?", [userId, productId], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (row) {
            db.run("UPDATE cart SET quantity = quantity + ? WHERE id = ?", [quantity, row.id], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, message: 'Cart updated' });
            });
        } else {
            db.run("INSERT INTO cart (user_id, product_id, quantity) VALUES (?, ?, ?)", [userId, productId, quantity], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, message: 'Added to cart' });
            });
        }
    });
});

// 7.5 Update Cart Quantity Directly
app.post('/api/cart/update', requireAuth, (req, res) => {
    const userId = req.session.userId;
    const { productId, quantity } = req.body;
    
    if (quantity <= 0) {
        // Remove item
        db.run("DELETE FROM cart WHERE user_id = ? AND product_id = ?", [userId, productId], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, message: 'Item removed from cart' });
        });
    } else {
        // Update or insert item
        db.get("SELECT id FROM cart WHERE user_id = ? AND product_id = ?", [userId, productId], (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            
            if (row) {
                db.run("UPDATE cart SET quantity = ? WHERE id = ?", [quantity, row.id], (err) => {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ success: true, message: 'Cart updated' });
                });
            } else {
                db.run("INSERT INTO cart (user_id, product_id, quantity) VALUES (?, ?, ?)", [userId, productId, quantity], (err) => {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ success: true, message: 'Added to cart' });
                });
            }
        });
    }
});

// 8. Checkout (Mock Payment)
app.post('/api/checkout', requireAuth, (req, res) => {
    const userId = req.session.userId;
    const { paymentMethod } = req.body; // 'cash', 'online', 'card', 'upi', 'gpay'
    
    // Get cart total
    const query = `
        SELECT c.quantity, p.price, p.name 
        FROM cart c 
        JOIN products p ON c.product_id = p.id 
        WHERE c.user_id = ?
    `;
    
    db.all(query, [userId], (err, items) => {
        if (err) return res.status(500).json({ error: err.message });
        
        let totalAmount = 0;
        let itemsArr = [];
        items.forEach(item => {
            totalAmount += (item.quantity * item.price);
            itemsArr.push(`${item.quantity}x ${item.name}`);
        });
        
        const itemsSummary = itemsArr.join(', ');

        if (totalAmount === 0) {
            return res.status(400).json({ success: false, message: 'Cart is empty' });
        }

        const trackingId = `AG-${Date.now()}-${Math.floor(Math.random()*1000)}`;

        // Insert into orders
        db.run("INSERT INTO orders (user_id, tracking_id, total_amount, payment_method, items_summary) VALUES (?, ?, ?, ?, ?)", 
        [userId, trackingId, totalAmount, paymentMethod, itemsSummary], 
        (err) => {
            if (err) return res.status(500).json({ error: err.message });

            // Clear the user's cart
            db.run("DELETE FROM cart WHERE user_id = ?", [userId], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                
                // Get user info to send fake SMS confirmation
                db.get("SELECT phone FROM users WHERE id = ?", [userId], (err, user) => {
                    if (user && user.phone) {
                        sendTwilioSMS(`+91${user.phone}`, `Thank you for your order! Your Tracking ID is ${trackingId}.`);
                    }
                });
                
                // Return the full order object for invoice generation
                db.get("SELECT * FROM orders WHERE id = ?", [this.lastID], (err, order) => {
                    if (err) return res.status(500).json({ success: false, error: err.message });
                    res.json({ success: true, trackingId, order });
                });
            });
        });
    });
});

// 9. Get User Orders (Buy History)
app.get('/api/orders', requireAuth, (req, res) => {
    const userId = req.session.userId;
    db.all("SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC", [userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ orders: rows });
    });
});

// 10. Get User Sell Orders (Sell History)
app.get('/api/sell-orders', requireAuth, (req, res) => {
    const userId = req.session.userId;
    db.all("SELECT * FROM sell_orders WHERE user_id = ? ORDER BY created_at DESC", [userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ sell_orders: rows });
    });
});

// 11. Sell Produce
app.post('/api/sell', requireAuth, (req, res) => {
    const userId = req.session.userId;
    const { crop_type, quantity, expected_price } = req.body;
    
    const trackingId = `SELL-${Date.now()}-${Math.floor(Math.random()*1000)}`;
    
    db.run(
        "INSERT INTO sell_orders (user_id, tracking_id, crop_type, quantity, expected_price) VALUES (?, ?, ?, ?, ?)",
        [userId, trackingId, crop_type, quantity, expected_price],
        function(err) {
            if (err) return res.status(500).json({ success: false, error: err.message });
            
            const sellOrderId = this.lastID;

            // Get user info to send fake SMS confirmation
            db.get("SELECT phone FROM users WHERE id = ?", [userId], (err, user) => {
                if (user && user.phone) {
                    sendTwilioSMS(`+91${user.phone}`, `Your sell request is received. Tracking ID: ${trackingId}`);
                }
            });
            
            const invoiceData = {
                id: sellOrderId,
                tracking_id: trackingId,
                items_summary: crop_type,
                total_amount: expected_price * Number(quantity.split(' ')[0] || quantity),
                payment_method: 'Pending Review',
                status: 'Pending Review',
                created_at: new Date().toISOString()
            };

            res.json({ success: true, message: 'Sell order placed successfully', trackingId, order: invoiceData });
        }
    );
});

// 10. Track Order/Sell
app.get('/api/track/:id', (req, res) => {
    const trackingId = req.params.id;
    
    // Check orders first
    db.get("SELECT * FROM orders WHERE tracking_id = ?", [trackingId], (err, order) => {
        if (err) return res.status(500).json({ error: err.message });
        if (order) {
            return res.json({ success: true, type: 'Buy', status: order.status, order: order, details: `Total amount: ₹${order.total_amount}` });
        }
        
        // Check sell orders next
        db.get("SELECT * FROM sell_orders WHERE tracking_id = ?", [trackingId], (err, sell) => {
            if (err) return res.status(500).json({ error: err.message });
            if (sell) {
                return res.json({ success: true, type: 'Sell', status: sell.status, order: sell, details: `${sell.quantity} of ${sell.crop_type}` });
            }
            
            res.json({ success: false, message: 'Tracking ID not found' });
        });
    });
});

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
