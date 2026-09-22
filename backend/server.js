const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();

const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;

const JWT_SECRET =
    process.env.JWT_SECRET || "PhoneStoreCloud2026Secret";

/* =====================================================
   ENVIRONMENT
===================================================== */

if (!DATABASE_URL) {
    console.error("❌ DATABASE_URL chưa được cấu hình");
}

/* =====================================================
   CORS - VERCEL FRONTEND
===================================================== */

const allowedOrigins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",

    // Vercel production
    "https://phone-store-kha21.vercel.app",

    // Vercel deployment
    "https://phone-store-iv427fqf2-kha21.vercel.app",

    // Render Environment Variable
    process.env.FRONTEND_URL
].filter(Boolean);

app.use(
    cors({
        origin: function (origin, callback) {
            // Cho phép Postman/curl/server-to-server
            if (!origin) {
                return callback(null, true);
            }

            if (allowedOrigins.includes(origin)) {
                return callback(null, true);
            }

            console.log("⚠️ CORS blocked:", origin);

            return callback(null, false);
        },

        methods: [
            "GET",
            "POST",
            "PUT",
            "DELETE",
            "OPTIONS"
        ],

        allowedHeaders: [
            "Content-Type",
            "Authorization"
        ]
    })
);

app.use(express.json());

/* =====================================================
   SUPABASE POSTGRESQL
===================================================== */

const pool = new Pool({
    connectionString: DATABASE_URL,

    ssl: {
        rejectUnauthorized: false
    },

    max: 10,

    connectionTimeoutMillis: 10000,

    idleTimeoutMillis: 30000
});

pool.on("error", (error) => {
    console.error(
        "❌ PostgreSQL pool error:",
        error.message
    );
});

/* =====================================================
   DATABASE INITIALIZATION
===================================================== */

async function initializeDatabase() {
    if (!DATABASE_URL) {
        console.error(
            "❌ Không thể khởi tạo database vì thiếu DATABASE_URL"
        );

        return;
    }

    try {
        /* USERS */

        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(150) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role VARCHAR(20) NOT NULL DEFAULT 'user',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        /* PRODUCTS */

        await pool.query(`
            CREATE TABLE IF NOT EXISTS products (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                price NUMERIC(15,2) NOT NULL DEFAULT 0,
                category VARCHAR(100),
                description TEXT,
                image_url TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        /* BỔ SUNG image_url NẾU BẢNG CŨ CHƯA CÓ */

        await pool.query(`
            ALTER TABLE products
            ADD COLUMN IF NOT EXISTS image_url TEXT
        `);

        /* ORDERS */

        await pool.query(`
            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                customer_name VARCHAR(100) NOT NULL,
                customer_phone VARCHAR(20) NOT NULL,
                customer_address TEXT NOT NULL,
                total_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
                status VARCHAR(50) NOT NULL DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        /* ORDER ITEMS */

        await pool.query(`
            CREATE TABLE IF NOT EXISTS order_items (
                id SERIAL PRIMARY KEY,
                order_id INTEGER
                    REFERENCES orders(id)
                    ON DELETE CASCADE,

                product_id INTEGER
                    REFERENCES products(id),

                product_name VARCHAR(255),

                quantity INTEGER NOT NULL,

                price NUMERIC(15,2) NOT NULL,

                subtotal NUMERIC(15,2) NOT NULL
            )
        `);

        console.log(
            "✅ Database tables ready"
        );

    } catch (error) {
        console.error(
            "❌ Database initialization error:",
            error.message
        );
    }
}

/* =====================================================
   DATABASE CONNECTION TEST
===================================================== */

async function testDatabase() {
    if (!DATABASE_URL) {
        return false;
    }

    try {
        await pool.query("SELECT 1");

        console.log(
            "✅ PostgreSQL / Supabase connected successfully"
        );

        return true;

    } catch (error) {
        console.error(
            "❌ PostgreSQL connection error:",
            error.message
        );

        return false;
    }
}

/* =====================================================
   JWT AUTHENTICATION
===================================================== */

function authenticateToken(req, res, next) {
    const authHeader =
        req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({
            message: "Bạn chưa đăng nhập"
        });
    }

    const parts =
        authHeader.split(" ");

    if (
        parts.length !== 2 ||
        parts[0] !== "Bearer"
    ) {
        return res.status(401).json({
            message: "Token không hợp lệ"
        });
    }

    try {
        const decoded =
            jwt.verify(
                parts[1],
                JWT_SECRET
            );

        req.user = decoded;

        next();

    } catch (error) {
        return res.status(401).json({
            message:
                "Token không hợp lệ hoặc đã hết hạn"
        });
    }
}

/* =====================================================
   ADMIN AUTHENTICATION
===================================================== */

function requireAdmin(req, res, next) {
    if (!req.user) {
        return res.status(401).json({
            message: "Bạn chưa đăng nhập"
        });
    }

    if (req.user.role !== "admin") {
        return res.status(403).json({
            message: "Bạn không có quyền quản trị"
        });
    }

    next();
}

/* =====================================================
   ROOT
===================================================== */

app.get("/", (req, res) => {
    res.json({
        status: "success",
        message: "Phone Store Cloud API is running!",
        database: "PostgreSQL / Supabase"
    });
});

/* =====================================================
   HEALTH CHECK
===================================================== */

app.get(
    "/api/health",
    async (req, res) => {
        try {
            await pool.query("SELECT 1");

            res.json({
                status: "success",
                server: "connected",
                database: "connected",
                database_type: "PostgreSQL",
                timestamp:
                    new Date().toISOString()
            });

        } catch (error) {
            res.status(500).json({
                status: "error",
                server: "connected",
                database: "disconnected",
                database_type: "PostgreSQL",
                message: error.message
            });
        }
    }
);

/* =====================================================
   REGISTER
===================================================== */

app.post(
    "/api/auth/register",
    async (req, res) => {
        try {
            const {
                name,
                email,
                password
            } = req.body;

            if (
                !name ||
                !email ||
                !password
            ) {
                return res.status(400).json({
                    message:
                        "Vui lòng nhập đầy đủ thông tin"
                });
            }

            if (password.length < 6) {
                return res.status(400).json({
                    message:
                        "Mật khẩu phải có ít nhất 6 ký tự"
                });
            }

            const cleanEmail =
                email
                    .trim()
                    .toLowerCase();

            const exists =
                await pool.query(
                    `
                    SELECT id
                    FROM users
                    WHERE email = $1
                    `,
                    [cleanEmail]
                );

            if (exists.rows.length > 0) {
                return res.status(400).json({
                    message:
                        "Email đã tồn tại"
                });
            }

            const hashedPassword =
                await bcrypt.hash(
                    password,
                    10
                );

            const result =
                await pool.query(
                    `
                    INSERT INTO users
                    (
                        name,
                        email,
                        password,
                        role
                    )
                    VALUES
                    ($1, $2, $3, $4)
                    RETURNING
                        id,
                        name,
                        email,
                        role
                    `,
                    [
                        name.trim(),
                        cleanEmail,
                        hashedPassword,
                        "user"
                    ]
                );

            res.status(201).json({
                message:
                    "Đăng ký thành công",

                user:
                    result.rows[0]
            });

        } catch (error) {
            console.error(
                "Register error:",
                error.message
            );

            res.status(500).json({
                message:
                    "Lỗi server khi đăng ký",
                error:
                    error.message
            });
        }
    }
);

/* =====================================================
   LOGIN
===================================================== */

app.post(
    "/api/auth/login",
    async (req, res) => {
        try {
            const {
                email,
                password
            } = req.body;

            if (!email || !password) {
                return res.status(400).json({
                    message:
                        "Vui lòng nhập email và mật khẩu"
                });
            }

            const cleanEmail =
                email
                    .trim()
                    .toLowerCase();

            const result =
                await pool.query(
                    `
                    SELECT *
                    FROM users
                    WHERE email = $1
                    `,
                    [cleanEmail]
                );

            if (result.rows.length === 0) {
                return res.status(401).json({
                    message:
                        "Email hoặc mật khẩu không đúng"
                });
            }

            const user =
                result.rows[0];

            const valid =
                await bcrypt.compare(
                    password,
                    user.password
                );

            if (!valid) {
                return res.status(401).json({
                    message:
                        "Email hoặc mật khẩu không đúng"
                });
            }

            const token =
                jwt.sign(
                    {
                        id: user.id,
                        email: user.email,
                        role: user.role
                    },

                    JWT_SECRET,

                    {
                        expiresIn: "1d"
                    }
                );

            res.json({
                message:
                    "Đăng nhập thành công",

                token,

                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role
                }
            });

        } catch (error) {
            console.error(
                "Login error:",
                error.message
            );

            res.status(500).json({
                message:
                    "Lỗi server khi đăng nhập",
                error:
                    error.message
            });
        }
    }
);

/* =====================================================
   AUTH ME
===================================================== */

app.get(
    "/api/auth/me",
    authenticateToken,
    async (req, res) => {
        try {
            const result =
                await pool.query(
                    `
                    SELECT
                        id,
                        name,
                        email,
                        role,
                        created_at
                    FROM users
                    WHERE id = $1
                    `,
                    [req.user.id]
                );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    message:
                        "Không tìm thấy tài khoản"
                });
            }

            res.json({
                user:
                    result.rows[0]
            });

        } catch (error) {
            console.error(
                "Auth me error:",
                error.message
            );

            res.status(500).json({
                message:
                    "Lỗi server",
                error:
                    error.message
            });
        }
    }
);

/* =====================================================
   PRODUCTS - GET ALL
===================================================== */

app.get(
    "/api/products",
    async (req, res) => {
        try {
            const result =
                await pool.query(
                    `
                    SELECT *
                    FROM products
                    ORDER BY id ASC
                    `
                );

            res.json(
                result.rows
            );

        } catch (error) {
            console.error(
                "Products error:",
                error.message
            );

            res.status(500).json({
                message:
                    "Lỗi khi lấy danh sách sản phẩm",

                error:
                    error.message
            });
        }
    }
);

/* =====================================================
   PRODUCTS - GET ONE
===================================================== */

app.get(
    "/api/products/:id",
    async (req, res) => {
        try {
            const result =
                await pool.query(
                    `
                    SELECT *
                    FROM products
                    WHERE id = $1
                    `,
                    [req.params.id]
                );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    message:
                        "Không tìm thấy sản phẩm"
                });
            }

            res.json(
                result.rows[0]
            );

        } catch (error) {
            console.error(
                "Product detail error:",
                error.message
            );

            res.status(500).json({
                message:
                    "Lỗi khi lấy sản phẩm",

                error:
                    error.message
            });
        }
    }
);

/* =====================================================
   PRODUCTS - CREATE
===================================================== */

app.post(
    "/api/products",
    authenticateToken,
    requireAdmin,
    async (req, res) => {
        try {
            const {
                name,
                price,
                category,
                description,
                image_url
            } = req.body;

            if (!name || price === undefined) {
                return res.status(400).json({
                    message:
                        "Tên và giá sản phẩm là bắt buộc"
                });
            }

            const result =
                await pool.query(
                    `
                    INSERT INTO products
                    (
                        name,
                        price,
                        category,
                        description,
                        image_url
                    )
                    VALUES
                    ($1, $2, $3, $4, $5)
                    RETURNING *
                    `,
                    [
                        name,
                        price,
                        category || null,
                        description || null,
                        image_url || null
                    ]
                );

            res.status(201).json({
                message:
                    "Thêm sản phẩm thành công",

                product:
                    result.rows[0]
            });

        } catch (error) {
            console.error(
                "Create product error:",
                error.message
            );

            res.status(500).json({
                message:
                    "Lỗi khi thêm sản phẩm",

                error:
                    error.message
            });
        }
    }
);

/* =====================================================
   PRODUCTS - UPDATE
===================================================== */

app.put(
    "/api/products/:id",
    authenticateToken,
    requireAdmin,
    async (req, res) => {
        try {
            const {
                name,
                price,
                category,
                description,
                image_url
            } = req.body;

            const result =
                await pool.query(
                    `
                    UPDATE products
                    SET
                        name = COALESCE($1, name),
                        price = COALESCE($2, price),
                        category = COALESCE($3, category),
                        description = COALESCE($4, description),
                        image_url = COALESCE($5, image_url)
                    WHERE id = $6
                    RETURNING *
                    `,
                    [
                        name,
                        price,
                        category,
                        description,
                        image_url,
                        req.params.id
                    ]
                );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    message:
                        "Không tìm thấy sản phẩm"
                });
            }

            res.json({
                message:
                    "Cập nhật sản phẩm thành công",

                product:
                    result.rows[0]
            });

        } catch (error) {
            console.error(
                "Update product error:",
                error.message
            );

            res.status(500).json({
                message:
                    "Lỗi khi cập nhật sản phẩm",

                error:
                    error.message
            });
        }
    }
);

/* =====================================================
   PRODUCTS - DELETE
===================================================== */

app.delete(
    "/api/products/:id",
    authenticateToken,
    requireAdmin,
    async (req, res) => {
        try {
            const result =
                await pool.query(
                    `
                    DELETE FROM products
                    WHERE id = $1
                    RETURNING *
                    `,
                    [req.params.id]
                );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    message:
                        "Không tìm thấy sản phẩm"
                });
            }

            res.json({
                message:
                    "Xóa sản phẩm thành công",

                product:
                    result.rows[0]
            });

        } catch (error) {
            console.error(
                "Delete product error:",
                error.message
            );

            res.status(500).json({
                message:
                    "Lỗi khi xóa sản phẩm",

                error:
                    error.message
            });
        }
    }
);

/* =====================================================
   ORDERS - CREATE
===================================================== */

app.post(
    "/api/orders",
    authenticateToken,
    async (req, res) => {
        const client =
            await pool.connect();

        try {
            const {
                customer_name,
                customer_phone,
                customer_address,
                items
            } = req.body;

            if (
                !customer_name ||
                !customer_phone ||
                !customer_address ||
                !Array.isArray(items) ||
                items.length === 0
            ) {
                client.release();

                return res.status(400).json({
                    message:
                        "Thông tin đơn hàng không đầy đủ"
                });
            }

            await client.query("BEGIN");

            let totalAmount = 0;

            const orderItems = [];

            for (const item of items) {
                const productResult =
                    await client.query(
                        `
                        SELECT *
                        FROM products
                        WHERE id = $1
                        `,
                        [item.product_id]
                    );

                if (
                    productResult.rows.length === 0
                ) {
                    throw new Error(
                        `Không tìm thấy sản phẩm ${item.product_id}`
                    );
                }

                const product =
                    productResult.rows[0];

                const quantity =
                    Number(item.quantity);

                if (
                    !Number.isInteger(quantity) ||
                    quantity <= 0
                ) {
                    throw new Error(
                        "Số lượng sản phẩm không hợp lệ"
                    );
                }

                const price =
                    Number(product.price);

                const subtotal =
                    price * quantity;

                totalAmount += subtotal;

                orderItems.push({
                    product_id:
                        product.id,

                    product_name:
                        product.name,

                    quantity,

                    price,

                    subtotal
                });
            }

            const orderResult =
                await client.query(
                    `
                    INSERT INTO orders
                    (
                        user_id,
                        customer_name,
                        customer_phone,
                        customer_address,
                        total_amount,
                        status
                    )
                    VALUES
                    ($1, $2, $3, $4, $5, $6)
                    RETURNING *
                    `,
                    [
                        req.user.id,
                        customer_name,
                        customer_phone,
                        customer_address,
                        totalAmount,
                        "pending"
                    ]
                );

            const order =
                orderResult.rows[0];

            for (const item of orderItems) {
                await client.query(
                    `
                    INSERT INTO order_items
                    (
                        order_id,
                        product_id,
                        product_name,
                        quantity,
                        price,
                        subtotal
                    )
                    VALUES
                    ($1, $2, $3, $4, $5, $6)
                    `,
                    [
                        order.id,
                        item.product_id,
                        item.product_name,
                        item.quantity,
                        item.price,
                        item.subtotal
                    ]
                );
            }

            await client.query("COMMIT");

            res.status(201).json({
                message:
                    "Đặt hàng thành công",

                order
            });

        } catch (error) {
            await client.query("ROLLBACK");

            console.error(
                "Create order error:",
                error.message
            );

            res.status(500).json({
                message:
                    "Lỗi khi tạo đơn hàng",

                error:
                    error.message
            });

        } finally {
            client.release();
        }
    }
);

/* =====================================================
   ORDERS - USER ORDERS
===================================================== */

app.get(
    "/api/orders/my",
    authenticateToken,
    async (req, res) => {
        try {
            const orders =
                await pool.query(
                    `
                    SELECT *
                    FROM orders
                    WHERE user_id = $1
                    ORDER BY id DESC
                    `,
                    [req.user.id]
                );

            res.json(
                orders.rows
            );

        } catch (error) {
            console.error(
                "My orders error:",
                error.message
            );

            res.status(500).json({
                message:
                    "Lỗi khi lấy đơn hàng"
            });
        }
    }
);

/* =====================================================
   ORDERS - ADMIN GET ALL
===================================================== */

app.get(
    "/api/admin/orders",
    authenticateToken,
    requireAdmin,
    async (req, res) => {
        try {
            const result =
                await pool.query(
                    `
                    SELECT
                        o.*,
                        u.name AS user_name,
                        u.email AS user_email
                    FROM orders o
                    LEFT JOIN users u
                        ON o.user_id = u.id
                    ORDER BY o.id DESC
                    `
                );

            res.json(
                result.rows
            );

        } catch (error) {
            console.error(
                "Admin orders error:",
                error.message
            );

            res.status(500).json({
                message:
                    "Lỗi khi lấy danh sách đơn hàng"
            });
        }
    }
);

/* =====================================================
   404
===================================================== */

app.use(
    (req, res) => {
        res.status(404).json({
            message:
                "API không tồn tại",

            path:
                req.originalUrl
        });
    }
);

/* =====================================================
   GLOBAL ERROR HANDLER
===================================================== */

app.use(
    (error, req, res, next) => {
        console.error(
            "Global error:",
            error.message
        );

        res.status(500).json({
            message:
                "Internal Server Error"
        });
    }
);

/* =====================================================
   START SERVER
===================================================== */

async function startServer() {
    await testDatabase();

    await initializeDatabase();

    app.listen(
        PORT,
        "0.0.0.0",
        () => {
            console.log(
                `✅ Phone Store Cloud API running on port ${PORT}`
            );

            console.log(
                "✅ Database: Supabase PostgreSQL"
            );
        }
    );
}

startServer();