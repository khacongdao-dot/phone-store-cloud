const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

require("dotenv").config();

const app = express();

/* =====================================================
   CẤU HÌNH CƠ BẢN
===================================================== */

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.error("❌ DATABASE_URL chưa được cấu hình");
}

if (!JWT_SECRET) {
    console.error("❌ JWT_SECRET chưa được cấu hình");
}

/* =====================================================
   CORS
===================================================== */

const allowedOrigins = [
    "http://localhost:5173",
    "http://localhost:4173",
    process.env.FRONTEND_URL
].filter(Boolean);

app.use(
    cors({
        origin: function (origin, callback) {
            // Cho phép Postman / trình duyệt gọi không có Origin
            if (!origin) {
                return callback(null, true);
            }

            if (allowedOrigins.includes(origin)) {
                return callback(null, true);
            }

            console.log("❌ CORS blocked:", origin);

            return callback(
                new Error(`CORS: Origin không được phép: ${origin}`)
            );
        },
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: [
            "Content-Type",
            "Authorization"
        ],
        credentials: false
    })
);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

/* =====================================================
   UPLOAD HÌNH ẢNH
===================================================== */

const uploadDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },

    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname).toLowerCase();

        const filename =
            Date.now() +
            "-" +
            Math.round(Math.random() * 1e9) +
            ext;

        cb(null, filename);
    }
});

const upload = multer({
    storage,

    limits: {
        fileSize: 5 * 1024 * 1024
    },

    fileFilter: function (req, file, cb) {
        const allowedTypes = [
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/webp"
        ];

        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(
                new Error(
                    "Chỉ được upload ảnh JPG, JPEG, PNG hoặc WEBP"
                )
            );
        }
    }
});

app.use(
    "/uploads",
    express.static(uploadDir)
);

/* =====================================================
   DATABASE SUPABASE / POSTGRESQL
===================================================== */

const pool = new Pool({
    connectionString: DATABASE_URL,

    ssl: DATABASE_URL
        ? {
              rejectUnauthorized: false
          }
        : false,

    max: 10,

    idleTimeoutMillis: 30000,

    connectionTimeoutMillis: 10000
});

/* =====================================================
   KIỂM TRA DATABASE
===================================================== */

pool.on("error", (error) => {
    console.error("PostgreSQL pool error:", error.message);
});

/* =====================================================
   KHỞI TẠO DATABASE
===================================================== */

async function initializeDatabase() {
    try {
        if (!DATABASE_URL) {
            console.log(
                "⚠️ Bỏ qua initializeDatabase vì chưa có DATABASE_URL"
            );
            return;
        }

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

        /* Trường hợp database cũ chưa có image_url */
        await pool.query(`
            ALTER TABLE products
            ADD COLUMN IF NOT EXISTS image_url TEXT
        `);

        /* ORDERS */
        await pool.query(`
            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,

                user_id INTEGER NOT NULL
                    REFERENCES users(id)
                    ON DELETE CASCADE,

                total_amount NUMERIC(15,2)
                    NOT NULL DEFAULT 0,

                status VARCHAR(30)
                    NOT NULL DEFAULT 'pending',

                customer_name VARCHAR(100)
                    NOT NULL,

                customer_phone VARCHAR(20)
                    NOT NULL,

                customer_address TEXT
                    NOT NULL,

                created_at TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP
            )
        `);

        /* ORDER ITEMS */
        await pool.query(`
            CREATE TABLE IF NOT EXISTS order_items (
                id SERIAL PRIMARY KEY,

                order_id INTEGER NOT NULL
                    REFERENCES orders(id)
                    ON DELETE CASCADE,

                product_id INTEGER NOT NULL
                    REFERENCES products(id)
                    ON DELETE CASCADE,

                product_name VARCHAR(255)
                    NOT NULL,

                price NUMERIC(15,2)
                    NOT NULL,

                quantity INTEGER
                    NOT NULL DEFAULT 1,

                subtotal NUMERIC(15,2)
                    NOT NULL DEFAULT 0
            )
        `);

        await pool.query(`
            ALTER TABLE order_items
            ADD COLUMN IF NOT EXISTS subtotal NUMERIC(15,2)
            NOT NULL DEFAULT 0
        `);

        console.log("✅ Database tables are ready");
    } catch (error) {
        console.error(
            "❌ Database initialization error:",
            error.message
        );
    }
}

async function testDatabaseConnection() {
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

function authenticateToken(req, res, next) {
    if (!JWT_SECRET) {
        return res.status(500).json({
            message: "JWT_SECRET chưa được cấu hình"
        });
    }

    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({
            message: "Bạn chưa đăng nhập"
        });
    }

    const parts = authHeader.split(" ");

    if (
        parts.length !== 2 ||
        parts[0] !== "Bearer"
    ) {
        return res.status(401).json({
            message: "Token không hợp lệ"
        });
    }

    const token = parts[1];

    try {
        const decoded = jwt.verify(
            token,
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

function requireAdmin(req, res, next) {
    if (!req.user) {
        return res.status(401).json({
            message: "Bạn chưa đăng nhập"
        });
    }

    if (req.user.role !== "admin") {
        return res.status(403).json({
            message:
                "Bạn không có quyền thực hiện chức năng này"
        });
    }

    next();
}

/* =====================================================
   ROOT
===================================================== */

app.get("/", (req, res) => {
    res.json({
        message:
            "Phone Store Cloud API is running!",
        status: "success"
    });
});

/* =====================================================
   HEALTH CHECK
===================================================== */

app.get("/api/health", async (req, res) => {
    try {
        await pool.query("SELECT 1");

        res.json({
            status: "success",
            server: "connected",
            database: "connected",
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            status: "error",
            server: "connected",
            database: "disconnected",
            message: error.message
        });
    }
});

/* =====================================================
   AUTH - REGISTER
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
                        "Vui lòng nhập đầy đủ họ tên, email và mật khẩu"
                });
            }

            const cleanName = name.trim();
            const normalizedEmail =
                email.trim().toLowerCase();

            if (
                cleanName.length < 2
            ) {
                return res.status(400).json({
                    message:
                        "Họ tên phải có ít nhất 2 ký tự"
                });
            }

            if (password.length < 6) {
                return res.status(400).json({
                    message:
                        "Mật khẩu phải có ít nhất 6 ký tự"
                });
            }

            const existingUser =
                await pool.query(
                    `
                    SELECT id
                    FROM users
                    WHERE email = $1
                    `,
                    [normalizedEmail]
                );

            if (
                existingUser.rows.length > 0
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
                        role,
                        created_at
                    `,
                    [
                        cleanName,
                        normalizedEmail,
                        hashedPassword,
                        "user"
                    ]
                );

            return res.status(201).json({
                message:
                    "Đăng ký thành công",
                user:
                    result.rows[0]
            });
        } catch (error) {
            console.error(
                "Register error:",
                error
            );

            return res.status(500).json({
                message:
                    "Lỗi server khi đăng ký",
                error:
                    error.message
            });
        }
    }
);

/* =====================================================
   AUTH - LOGIN
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

            if (!JWT_SECRET) {
                return res.status(500).json({
                    message:
                        "JWT_SECRET chưa được cấu hình"
                });
            }

            const normalizedEmail =
                email.trim().toLowerCase();

            const result =
                await pool.query(
                    `
                    SELECT *
                    FROM users
                    WHERE email = $1
                    `,
                    [normalizedEmail]
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

            const passwordMatch =
                await bcrypt.compare(
                    password,
                    user.password
                );

            if (!passwordMatch) {
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

            return res.json({
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
                error
            );

            return res.status(500).json({
                message:
                    "Lỗi server khi đăng nhập",
                error:
                    error.message
            });
        }
    }
);

/* =====================================================
   AUTH - ME
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

            return res.json({
                user:
                    result.rows[0]
            });
        } catch (error) {
            console.error(
                "Get user error:",
                error
            );

            return res.status(500).json({
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

            return res.json(
                result.rows
            );
        } catch (error) {
            console.error(
                "Get products error:",
                error
            );

            return res.status(500).json({
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

            return res.json(
                result.rows[0]
            );
        } catch (error) {
            console.error(
                "Get product error:",
                error
            );

            return res.status(500).json({
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
    upload.single("image"),
    async (req, res) => {
        try {
            const {
                name,
                price,
                description,
                category
            } = req.body;

            if (
                !name ||
                price === undefined
            ) {
                return res.status(400).json({
                    message:
                        "Tên và giá sản phẩm là bắt buộc"
                });
            }

            const numericPrice =
                Number(price);

            if (
                !Number.isFinite(
                    numericPrice
                ) ||
                numericPrice < 0
            ) {
                return res.status(400).json({
                    message:
                        "Giá sản phẩm không hợp lệ"
                });
            }

            let imageUrl = "";

            if (req.file) {
                imageUrl =
                    `/uploads/${req.file.filename}`;
            }

            const result =
                await pool.query(
                    `
                    INSERT INTO products
                    (
                        name,
                        price,
                        description,
                        image_url,
                        category
                    )
                    VALUES
                    ($1, $2, $3, $4, $5)
                    RETURNING *
                    `,
                    [
                        name.trim(),
                        numericPrice,
                        description
                            ? description.trim()
                            : "",
                        imageUrl,
                        category
                            ? category.trim()
                            : ""
                    ]
                );

            return res.status(201).json({
                message:
                    "Thêm sản phẩm thành công",
                product:
                    result.rows[0]
            });
        } catch (error) {
            console.error(
                "Create product error:",
                error
            );

            return res.status(500).json({
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
    upload.single("image"),
    async (req, res) => {
        try {
            const {
                id
            } = req.params;

            const {
                name,
                price,
                description,
                category
            } = req.body;

            if (
                !name ||
                price === undefined
            ) {
                return res.status(400).json({
                    message:
                        "Tên và giá sản phẩm là bắt buộc"
                });
            }

            const numericPrice =
                Number(price);

            if (
                !Number.isFinite(
                    numericPrice
                ) ||
                numericPrice < 0
            ) {
                return res.status(400).json({
                    message:
                        "Giá sản phẩm không hợp lệ"
                });
            }

            const oldResult =
                await pool.query(
                    `
                    SELECT *
                    FROM products
                    WHERE id = $1
                    `,
                    [id]
                );

            if (
                oldResult.rows.length === 0
            ) {
                return res.status(404).json({
                    message:
                        "Không tìm thấy sản phẩm"
                });
            }

            const oldProduct =
                oldResult.rows[0];

            let imageUrl =
                oldProduct.image_url || "";

            if (req.file) {
                imageUrl =
                    `/uploads/${req.file.filename}`;

                if (
                    oldProduct.image_url &&
                    oldProduct.image_url.startsWith(
                        "/uploads/"
                    )
                ) {
                    const oldFilePath =
                        path.join(
                            __dirname,
                            oldProduct.image_url.replace(
                                "/uploads/",
                                "uploads/"
                            )
                        );

                    if (
                        fs.existsSync(
                            oldFilePath
                        )
                    ) {
                        fs.unlinkSync(
                            oldFilePath
                        );
                    }
                }
            }

            const result =
                await pool.query(
                    `
                    UPDATE products
                    SET
                        name = $1,
                        price = $2,
                        description = $3,
                        image_url = $4,
                        category = $5
                    WHERE id = $6
                    RETURNING *
                    `,
                    [
                        name.trim(),
                        numericPrice,
                        description
                            ? description.trim()
                            : "",
                        imageUrl,
                        category
                            ? category.trim()
                            : "",
                        id
                    ]
                );

            return res.json({
                message:
                    "Cập nhật sản phẩm thành công",
                product:
                    result.rows[0]
            });
        } catch (error) {
            console.error(
                "Update product error:",
                error
            );

            return res.status(500).json({
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

            const product =
                result.rows[0];

            await pool.query(
                `
                DELETE FROM products
                WHERE id = $1
                `,
                [req.params.id]
            );

            if (
                product.image_url &&
                product.image_url.startsWith(
                    "/uploads/"
                )
            ) {
                const imagePath =
                    path.join(
                        __dirname,
                        product.image_url.replace(
                            "/uploads/",
                            "uploads/"
                        )
                    );

                if (
                    fs.existsSync(imagePath)
                ) {
                    fs.unlinkSync(
                        imagePath
                    );
                }
            }

            return res.json({
                message:
                    "Xóa sản phẩm thành công",
                product
            });
        } catch (error) {
            console.error(
                "Delete product error:",
                error
            );

            return res.status(500).json({
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
                !customer_address
            ) {
                return res.status(400).json({
                    message:
                        "Vui lòng nhập đầy đủ thông tin giao hàng"
                });
            }

            if (
                !Array.isArray(items) ||
                items.length === 0
            ) {
                return res.status(400).json({
                    message:
                        "Giỏ hàng đang trống"
                });
            }

            await client.query("BEGIN");

            let totalAmount = 0;

            const orderItems = [];

            for (const item of items) {
                const productId =
                    Number(item.product_id);

                const quantity =
                    Number(item.quantity);

                if (
                    !Number.isInteger(
                        productId
                    ) ||
                    !Number.isInteger(
                        quantity
                    ) ||
                    quantity <= 0
                ) {
                    const error =
                        new Error(
                            "Thông tin sản phẩm không hợp lệ"
                        );

                    error.status = 400;

                    throw error;
                }

                const productResult =
                    await client.query(
                        `
                        SELECT
                            id,
                            name,
                            price
                        FROM products
                        WHERE id = $1
                        `,
                        [productId]
                    );

                if (
                    productResult.rows.length ===
                    0
                ) {
                    const error =
                        new Error(
                            `Không tìm thấy sản phẩm ID ${productId}`
                        );

                    error.status = 400;

                    throw error;
                }

                const product =
                    productResult.rows[0];

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

                    price,

                    quantity,

                    subtotal
                });
            }

            const orderResult =
                await client.query(
                    `
                    INSERT INTO orders
                    (
                        user_id,
                        total_amount,
                        status,
                        customer_name,
                        customer_phone,
                        customer_address
                    )
                    VALUES
                    ($1, $2, $3, $4, $5, $6)
                    RETURNING *
                    `,
                    [
                        req.user.id,
                        totalAmount,
                        "pending",
                        customer_name.trim(),
                        customer_phone.trim(),
                        customer_address.trim()
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
                        price,
                        quantity,
                        subtotal
                    )
                    VALUES
                    ($1, $2, $3, $4, $5, $6)
                    `,
                    [
                        order.id,
                        item.product_id,
                        item.product_name,
                        item.price,
                        item.quantity,
                        item.subtotal
                    ]
                );
            }

            await client.query("COMMIT");

            return res.status(201).json({
                message:
                    "Đặt hàng thành công",
                order
            });
        } catch (error) {
            try {
                await client.query(
                    "ROLLBACK"
                );
            } catch (rollbackError) {
                console.error(
                    "Rollback error:",
                    rollbackError.message
                );
            }

            console.error(
                "Create order error:",
                error
            );

            return res.status(
                error.status || 500
            ).json({
                message:
                    error.status
                        ? error.message
                        : "Không thể tạo đơn hàng",
                error:
                    error.message
            });
        } finally {
            client.release();
        }
    }
);

/* =====================================================
   ORDERS - MY ORDERS
===================================================== */

app.get(
    "/api/orders/my",
    authenticateToken,
    async (req, res) => {
        try {
            const result =
                await pool.query(
                    `
                    SELECT
                        o.id,
                        o.total_amount,
                        o.status,
                        o.customer_name,
                        o.customer_phone,
                        o.customer_address,
                        o.created_at,

                        COALESCE(
                            json_agg(
                                json_build_object(
                                    'id', oi.id,
                                    'product_id', oi.product_id,
                                    'product_name', oi.product_name,
                                    'price', oi.price,
                                    'quantity', oi.quantity,
                                    'subtotal', oi.subtotal
                                )
                            )
                            FILTER (
                                WHERE oi.id IS NOT NULL
                            ),
                            '[]'
                        ) AS items

                    FROM orders o

                    LEFT JOIN order_items oi
                    ON oi.order_id = o.id

                    WHERE o.user_id = $1

                    GROUP BY o.id

                    ORDER BY
                        o.created_at DESC
                    `,
                    [req.user.id]
                );

            return res.json({
                orders:
                    result.rows
            });
        } catch (error) {
            console.error(
                "Get my orders error:",
                error
            );

            return res.status(500).json({
                message:
                    "Không thể lấy lịch sử đơn hàng",
                error:
                    error.message
            });
        }
    }
);

/* =====================================================
   ADMIN - GET ALL ORDERS
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
                        o.id,
                        o.user_id,
                        o.total_amount,
                        o.status,
                        o.customer_name,
                        o.customer_phone,
                        o.customer_address,
                        o.created_at,
                        u.email AS user_email

                    FROM orders o

                    LEFT JOIN users u
                    ON u.id = o.user_id

                    ORDER BY
                        o.created_at DESC
                    `
                );

            return res.json({
                orders:
                    result.rows
            });
        } catch (error) {
            console.error(
                "Get admin orders error:",
                error
            );

            return res.status(500).json({
                message:
                    "Không thể lấy danh sách đơn hàng",
                error:
                    error.message
            });
        }
    }
);

/* =====================================================
   ADMIN - UPDATE ORDER STATUS
===================================================== */

app.put(
    "/api/admin/orders/:id",
    authenticateToken,
    requireAdmin,
    async (req, res) => {
        try {
            const {
                status
            } = req.body;

            const allowedStatuses = [
                "pending",
                "confirmed",
                "shipping",
                "completed",
                "cancelled"
            ];

            if (
                !allowedStatuses.includes(
                    status
                )
            ) {
                return res.status(400).json({
                    message:
                        "Trạng thái đơn hàng không hợp lệ"
                });
            }

            const result =
                await pool.query(
                    `
                    UPDATE orders
                    SET status = $1
                    WHERE id = $2
                    RETURNING *
                    `,
                    [
                        status,
                        req.params.id
                    ]
                );

            if (
                result.rows.length === 0
            ) {
                return res.status(404).json({
                    message:
                        "Không tìm thấy đơn hàng"
                });
            }

            return res.json({
                message:
                    "Cập nhật trạng thái thành công",
                order:
                    result.rows[0]
            });
        } catch (error) {
            console.error(
                "Update order status error:",
                error
            );

            return res.status(500).json({
                message:
                    "Không thể cập nhật đơn hàng",
                error:
                    error.message
            });
        }
    }
);

/* =====================================================
   MULTER ERROR
===================================================== */

app.use(
    (err, req, res, next) => {
        if (
            err instanceof multer.MulterError
        ) {
            if (
                err.code ===
                "LIMIT_FILE_SIZE"
            ) {
                return res.status(400).json({
                    message:
                        "Ảnh không được lớn hơn 5MB"
                });
            }

            return res.status(400).json({
                message:
                    "Lỗi upload hình ảnh: " +
                    err.message
            });
        }

        if (
            err &&
            err.message &&
            err.message.includes(
                "Chỉ được upload ảnh"
            )
        ) {
            return res.status(400).json({
                message:
                    err.message
            });
        }

        next(err);
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
   ERROR HANDLER
===================================================== */

app.use(
    (err, req, res, next) => {
        console.error(
            "Server error:",
            err
        );

        res.status(500).json({
            message:
                "Internal Server Error",
            error:
                err.message
        });
    }
);

/* =====================================================
   START SERVER
===================================================== */

async function startServer() {
    await testDatabaseConnection();
    await initializeDatabase();

    app.listen(
        PORT,
        "0.0.0.0",
        () => {
            console.log(
                `✅ Server running on port ${PORT}`
            );

            console.log(
                `✅ Server URL: http://localhost:${PORT}`
            );

            console.log(
                `✅ Allowed CORS origins:`,
                allowedOrigins
            );

            console.log(
                `✅ Upload folder: ${uploadDir}`
            );
        }
    );
}

startServer();