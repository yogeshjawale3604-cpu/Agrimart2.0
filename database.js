const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = process.env.DATABASE_PATH || path.resolve(__dirname, 'agrimart.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to SQLite database.');
        
        db.serialize(() => {
            // Users table (Farmer Card info)
            db.run(`CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                phone TEXT UNIQUE NOT NULL,
                name TEXT,
                village TEXT,
                land_size TEXT,
                crops_grown TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);
            
            // Products table
            db.run(`CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                price REAL NOT NULL,
                unit TEXT NOT NULL,
                image_url TEXT
            )`);
            
            // Cart table
            db.run(`CREATE TABLE IF NOT EXISTS cart (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                product_id INTEGER NOT NULL,
                quantity INTEGER DEFAULT 1,
                FOREIGN KEY (user_id) REFERENCES users (id),
                FOREIGN KEY (product_id) REFERENCES products (id)
            )`);
            
            // Orders table
            db.run(`CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                tracking_id TEXT NOT NULL UNIQUE,
                total_amount REAL NOT NULL,
                status TEXT DEFAULT 'Processing',
                payment_method TEXT NOT NULL,
                items_summary TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )`);
            
            // Sell orders table
            db.run(`CREATE TABLE IF NOT EXISTS sell_orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                tracking_id TEXT UNIQUE,
                crop_type TEXT NOT NULL,
                quantity REAL NOT NULL,
                expected_price REAL NOT NULL,
                status TEXT DEFAULT 'Pending Review',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )`);
            
            // Migrate existing DB: add items_summary column if missing
            db.run(`ALTER TABLE orders ADD COLUMN items_summary TEXT`, (err) => {
                // Ignore error - column already exists
            });

            // Seed products if empty
            db.get("SELECT COUNT(*) as count FROM products", (err, row) => {
                if (row && row.count === 0) {
                    const stmt = db.prepare("INSERT INTO products (name, category, price, unit, image_url) VALUES (?, ?, ?, ?, ?)");
                    
                    // Fertilizers
                    stmt.run("Premium Urea 46% N", "Fertilizers", 350, "bag", "/images/urea_fertilizer.png");
                    stmt.run("DAP (Di-ammonium Phosphate)", "Fertilizers", 550, "bag", "/images/dap_fertilizer.png");
                    stmt.run("NPK 19:19:19 Water Soluble", "Fertilizers", 250, "kg", "/images/npk_fertilizer.png");

                    // Seeds
                    stmt.run("BT Cotton Seeds (High Yield)", "Seeds", 850, "packet", "/images/cotton_seeds.png");
                    stmt.run("Soybean JS-335 Seeds", "Seeds", 1200, "bag", "/images/soybean.png");
                    stmt.run("Hybrid Onion Seeds", "Seeds", 600, "kg", "/images/hybrid_onion.png");

                    // Farming Tools
                    stmt.run("Heavy Duty Shovel", "Tools", 450, "item", "/images/shovel.png");
                    stmt.run("Manual Seed Seeder", "Tools", 2500, "item", "/images/seeder.png");
                    stmt.run("Pruning Shears", "Tools", 300, "item", "/images/shears.png");

                    // Pesticides
                    stmt.run("Chlorpyrifos 20% EC", "Pesticides", 350, "bottle", "/images/chlorpyrifos.png");
                    stmt.run("Imidacloprid 17.8% SL", "Pesticides", 400, "bottle", "/images/imidacloprid.png");
                    stmt.run("Organic Neem Oil", "Pesticides", 250, "bottle", "/images/neem_oil.png");

                    stmt.finalize();
                    console.log("Seeded initial products");
                }
            });
        });
    }
});

module.exports = db;
