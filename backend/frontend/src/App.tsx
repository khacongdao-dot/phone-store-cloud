import {
  useEffect,
  useState
} from "react";

import AuthScreen from "./AuthScreen";

import {
  api,
  getImageUrl
} from "./api";

/* =====================================================
   TYPES
===================================================== */

interface Product {
  id: number;
  name: string;
  price: number | string;
  description?: string;
  image_url?: string;
  category?: string;
}

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

/* =====================================================
   APP
===================================================== */

function App() {
  const [
    user,
    setUser
  ] = useState<User | null>(null);

  const [
    products,
    setProducts
  ] = useState<Product[]>([]);

  const [
    loading,
    setLoading
  ] = useState(true);

  const [
    error,
    setError
  ] = useState("");

  /* ===================================================
     KIỂM TRA LOGIN
  =================================================== */

  useEffect(() => {
    const savedUser =
      localStorage.getItem("user");

    const token =
      localStorage.getItem("token");

    if (
      savedUser &&
      token
    ) {
      try {
        const parsedUser =
          JSON.parse(savedUser);

        setUser(parsedUser);
      } catch {
        localStorage.removeItem(
          "user"
        );

        localStorage.removeItem(
          "token"
        );
      }
    }
  }, []);

  /* ===================================================
     LẤY SẢN PHẨM
  =================================================== */

  useEffect(() => {
    getProducts();
  }, []);

  async function getProducts() {
    try {
      setLoading(true);
      setError("");

      const response =
        await api.get(
          "/products"
        );

      console.log(
        "✅ API products:",
        response.data
      );

      if (
        Array.isArray(
          response.data
        )
      ) {
        setProducts(
          response.data
        );
      } else if (
        Array.isArray(
          response.data.products
        )
      ) {
        setProducts(
          response.data.products
        );
      } else if (
        Array.isArray(
          response.data.data
        )
      ) {
        setProducts(
          response.data.data
        );
      } else {
        setProducts([]);
      }
    } catch (err: any) {
      console.error(
        "❌ Lỗi lấy sản phẩm:",
        err
      );

      if (
        err.response?.status ===
        404
      ) {
        setError(
          "Không tìm thấy API /products trên Backend."
        );
      } else if (
        err.response?.status ===
        500
      ) {
        setError(
          "Backend đang hoạt động nhưng Database có vấn đề."
        );
      } else {
        setError(
          "Không thể kết nối đến Backend Render."
        );
      }
    } finally {
      setLoading(false);
    }
  }

  /* ===================================================
     LOGIN SUCCESS
  =================================================== */

  function handleLoginSuccess(
    token: string,
    loggedUser: User
  ) {
    localStorage.setItem(
      "token",
      token
    );

    localStorage.setItem(
      "user",
      JSON.stringify(
        loggedUser
      )
    );

    setUser(
      loggedUser
    );
  }

  /* ===================================================
     LOGOUT
  =================================================== */

  function handleLogout() {
    localStorage.removeItem(
      "token"
    );

    localStorage.removeItem(
      "user"
    );

    setUser(null);
  }

  /* ===================================================
     FORMAT PRICE
  =================================================== */

  function formatPrice(
    price: number | string
  ) {
    const numberPrice =
      Number(price);

    if (
      Number.isNaN(
        numberPrice
      )
    ) {
      return `${price} ₫`;
    }

    return (
      numberPrice.toLocaleString(
        "vi-VN"
      ) +
      " ₫"
    );
  }

  /* ===================================================
     CHƯA LOGIN
  =================================================== */

  if (!user) {
    return (
      <AuthScreen
        onLoginSuccess={
          handleLoginSuccess
        }
      />
    );
  }

  /* ===================================================
     GIAO DIỆN CHÍNH
  =================================================== */

  return (
    <div className="app">

      {/* HEADER */}
      <header className="header">

        <div className="logo">
          📱 Phone Store
        </div>

        <nav className="nav">

          <a href="#home">
            Trang chủ
          </a>

          <a href="#products">
            Sản phẩm
          </a>

          <a href="#contact">
            Liên hệ
          </a>

        </nav>

        <div className="user-area">

          <span className="welcome-user">
            👋 {user.name}
          </span>

          <button
            className="login-button"
            onClick={
              handleLogout
            }
          >
            Đăng xuất
          </button>

        </div>

      </header>

      {/* HERO */}
      <section
        className="hero"
        id="home"
      >

        <div className="hero-content">

          <div className="hero-label">
            PHONE STORE CLOUD
          </div>

          <h1>
            Smartphone chính hãng
            <br />

            <span>
              Giá tốt mỗi ngày
            </span>
          </h1>

          <p>
            Xin chào{" "}
            <strong>
              {user.name}
            </strong>
            ! Khám phá những mẫu
            điện thoại mới nhất.
          </p>

          <a
            href="#products"
            className="hero-button"
          >
            Xem sản phẩm →
          </a>

        </div>

      </section>

      {/* PRODUCTS */}
      <section
        className="products-section"
        id="products"
      >

        <div className="section-title">

          <span>
            PHONE STORE
          </span>

          <h2>
            Sản phẩm nổi bật
          </h2>

          <p>
            Những sản phẩm điện thoại
            được yêu thích
          </p>

        </div>

        {/* LOADING */}
        {loading && (
          <div className="message">

            <div className="loading"></div>

            <p>
              Đang tải sản phẩm...
            </p>

          </div>
        )}

        {/* ERROR */}
        {!loading &&
          error && (
            <div className="error-box">

              <div className="error-icon">
                ⚠️
              </div>

              <h3>
                Không thể tải sản phẩm
              </h3>

              <p>
                {error}
              </p>

              <button
                onClick={
                  getProducts
                }
                className="retry-button"
              >
                Thử lại
              </button>

            </div>
          )}

        {/* EMPTY */}
        {!loading &&
          !error &&
          products.length === 0 && (
            <div className="empty-box">

              <div>
                📱
              </div>

              <h3>
                Chưa có sản phẩm
              </h3>

              <p>
                Hãy thêm sản phẩm vào
                cơ sở dữ liệu.
              </p>

            </div>
          )}

        {/* PRODUCT LIST */}
        {!loading &&
          !error &&
          products.length > 0 && (
            <div className="product-grid">

              {products.map(
                (product) => (
                  <div
                    className="product-card"
                    key={
                      product.id
                    }
                  >

                    <div className="product-image">

                      {product.image_url ? (
                        <img
                          src={
                            getImageUrl(
                              product.image_url
                            )
                          }
                          alt={
                            product.name
                          }
                          loading="lazy"
                          onError={(
                            e
                          ) => {
                            e.currentTarget.style.display =
                              "none";
                          }}
                        />
                      ) : (
                        <div className="no-image">
                          📱
                        </div>
                      )}

                    </div>

                    <div className="product-info">

                      <span className="category">
                        {product.category ||
                          "Điện thoại"}
                      </span>

                      <h3>
                        {product.name}
                      </h3>

                      <p className="description">
                        {product.description ||
                          "Sản phẩm chính hãng, chất lượng cao."}
                      </p>

                      <div className="product-bottom">

                        <strong>
                          {formatPrice(
                            product.price
                          )}
                        </strong>

                        <button
                          className="cart-button"
                          onClick={() =>
                            alert(
                              `Đã thêm ${product.name} vào giỏ hàng!`
                            )
                          }
                        >
                          🛒 Thêm
                        </button>

                      </div>

                    </div>

                  </div>
                )
              )}

            </div>
          )}

      </section>

      {/* FEATURES */}
      <section className="features">

        <div className="feature">

          <div className="feature-icon">
            🚚
          </div>

          <h3>
            Giao hàng nhanh
          </h3>

          <p>
            Giao hàng toàn quốc
          </p>

        </div>

        <div className="feature">

          <div className="feature-icon">
            🛡️
          </div>

          <h3>
            Hàng chính hãng
          </h3>

          <p>
            Cam kết sản phẩm
            chính hãng
          </p>

        </div>

        <div className="feature">

          <div className="feature-icon">
            💳
          </div>

          <h3>
            Thanh toán an toàn
          </h3>

          <p>
            Nhiều phương thức
            thanh toán
          </p>

        </div>

        <div className="feature">

          <div className="feature-icon">
            📞
          </div>

          <h3>
            Hỗ trợ 24/7
          </h3>

          <p>
            Luôn sẵn sàng hỗ trợ
          </p>

        </div>

      </section>

      {/* FOOTER */}
      <footer
        className="footer"
        id="contact"
      >

        <div>

          <h2>
            📱 Phone Store
          </h2>

          <p>
            Hệ thống bán điện thoại
            trực tuyến
          </p>

        </div>

        <div>

          <h3>
            Liên hệ
          </h3>

          <p>
            📞 0123 456 789
          </p>

          <p>
            ✉️ phonestore@gmail.com
          </p>

        </div>

      </footer>

    </div>
  );
}

export default App;