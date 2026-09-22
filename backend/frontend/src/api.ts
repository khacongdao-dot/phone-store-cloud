import axios from "axios";

export const API_URL =
  (
    import.meta.env.VITE_API_URL ||
    "http://localhost:3000/api"
  ).replace(/\/+$/, "");

export const BACKEND_URL =
  API_URL.replace(/\/api\/?$/, "");

export const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json"
  }
});

/*
|--------------------------------------------------------------------------
| Tự động gửi JWT nếu người dùng đã đăng nhập
|--------------------------------------------------------------------------
*/

api.interceptors.request.use(
  (config) => {
    const token =
      localStorage.getItem("token");

    if (token) {
      config.headers.Authorization =
        `Bearer ${token}`;
    }

    return config;
  },

  (error) => {
    return Promise.reject(error);
  }
);

/*
|--------------------------------------------------------------------------
| Nếu JWT hết hạn / không hợp lệ
|--------------------------------------------------------------------------
*/

api.interceptors.response.use(
  (response) => response,

  (error) => {
    if (
      error.response?.status === 401
    ) {
      const url =
        error.config?.url || "";

      /*
       * Không tự logout khi login sai
       */
      if (
        !url.includes("/auth/login") &&
        !url.includes("/auth/register")
      ) {
        localStorage.removeItem(
          "token"
        );

        localStorage.removeItem(
          "user"
        );
      }
    }

    return Promise.reject(error);
  }
);

/*
|--------------------------------------------------------------------------
| Xử lý URL hình ảnh
|--------------------------------------------------------------------------
*/

export function getImageUrl(
  imageUrl?: string
): string {
  if (!imageUrl) {
    return "";
  }

  /*
   * Nếu đã là URL đầy đủ:
   * https://...
   */
  if (
    imageUrl.startsWith("http://") ||
    imageUrl.startsWith("https://")
  ) {
    return imageUrl;
  }

  /*
   * Nếu backend trả:
   * /uploads/abc.jpg
   *
   * thì ghép thành:
   * https://cloud-lab-app.onrender.com/uploads/abc.jpg
   */
  if (
    imageUrl.startsWith("/")
  ) {
    return `${BACKEND_URL}${imageUrl}`;
  }

  return `${BACKEND_URL}/${imageUrl}`;
}