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
   KIỂM TRA ENV
===================================================== */

if (!DATABASE_URL) {
    console.error("❌ DATABASE_URL chưa được cấu hình");
}

/* =====================================================
   CORS
===================================================== */

const allowedOrigins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://phone-store-kha21.vercel.app",
    "https://phone-store-iv427fqf2-kha21.vercel.app",
    process.env.FRONTEND_URL
].filter(Boolean);

app.use(
    cors({
        origin: function (origin, callback) {
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
   DATABASE SUPABASE POSTGRESQL
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
        "PostgreSQL pool error:",
        error.message
    );
});

/* =====================================================
   TẠO BẢNG
===================================================== */

async function initializeDatabase() {
    try {
        if (!DATABASE_URL) {
            return;
        }

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

        await pool.query(`
            ALTER TABLE products
            ADD COLUMN IF NOT EXISTS image_url TEXT
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
   DATABASE CONNECTION
===================================================== */

async function testDatabase() {
    try {
        if (!DATABASE_URL) {
            return;
        }

        await pool.query("SELECT 1");

        console.log(
            "✅ Database connected successfully"
        );
    } catch (error) {
        console.error(
            "❌ Database connection error:",
            error.message
        );
    }
}

/* =====================================================
   JWT
===================================================== */

function authenticateToken(
    req,
    res,
    next
) {
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
    } catch {
        return res.status(401).json({
            message:
                "Token không hợp lệ hoặc đã hết hạn"
        });
    }
}

/* =====================================================
   ROOT
===================================================== */

app.get("/", (req, res) => {
    res.json({
        status: "success",
        message:
            "Phone Store Cloud API is running!"
    });
});

/* =====================================================
   HEALTH
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
                timestamp:
                    new Date().toISOString()
            });
        } catch (error) {
            res.status(500).json({
                status: "error",
                server: "connected",
                database: "disconnected",
                message:
                    error.message
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

            if (
                password.length < 6
            ) {
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

            if (
                exists.rows.length > 0
            ) {
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
                    "Lỗi server khi đăng ký"
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

            if (
                result.rows.length === 0
            ) {
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
                        expiresIn:
                            "1d"
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
                    "Lỗi server khi đăng nhập"
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

            if (
                result.rows.length === 0
            ) {
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
            res.status(500).json({
                message:
                    "Lỗi server"
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

            if (
                result.rows.length === 0
            ) {
                return res.status(404).json({
                    message:
                        "Không tìm thấy sản phẩm"
                });
            }

            res.json(
                result.rows[0]
            );
        } catch (error) {
            res.status(500).json({
                message:
                    "Lỗi khi lấy sản phẩm"
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
   START
===================================================== */

async function startServer() {
    await testDatabase();
    await initializeDatabase();

    app.listen(
        PORT,
        "0.0.0.0",
        () => {
            console.log(
                `✅ Server running on port ${PORT}`
            );
        }
    );
}

startServer();