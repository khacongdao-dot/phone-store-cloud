import {
  FormEvent,
  useState
} from "react";

import { api } from "./api";

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

interface AuthScreenProps {
  onLoginSuccess: (
    token: string,
    user: User
  ) => void;
}

function AuthScreen({
  onLoginSuccess
}: AuthScreenProps) {
  const [
    isLogin,
    setIsLogin
  ] = useState(true);

  const [
    name,
    setName
  ] = useState("");

  const [
    email,
    setEmail
  ] = useState("");

  const [
    password,
    setPassword
  ] = useState("");

  const [
    loading,
    setLoading
  ] = useState(false);

  const [
    error,
    setError
  ] = useState("");

  const [
    message,
    setMessage
  ] = useState("");

  async function handleSubmit(
    e: FormEvent
  ) {
    e.preventDefault();

    setError("");
    setMessage("");

    if (!email.trim()) {
      setError(
        "Vui lòng nhập email"
      );

      return;
    }

    if (!password) {
      setError(
        "Vui lòng nhập mật khẩu"
      );

      return;
    }

    if (
      !isLogin &&
      !name.trim()
    ) {
      setError(
        "Vui lòng nhập họ tên"
      );

      return;
    }

    if (
      !isLogin &&
      password.length < 6
    ) {
      setError(
        "Mật khẩu phải có ít nhất 6 ký tự"
      );

      return;
    }

    try {
      setLoading(true);

      if (isLogin) {
        const response =
          await api.post(
            "/auth/login",
            {
              email:
                email.trim(),
              password
            }
          );

        const {
          token,
          user
        } = response.data;

        if (
          !token ||
          !user
        ) {
          throw new Error(
            "Backend không trả về token hoặc user"
          );
        }

        onLoginSuccess(
          token,
          user
        );

        return;
      }

      await api.post(
        "/auth/register",
        {
          name:
            name.trim(),

          email:
            email.trim(),

          password
        }
      );

      setMessage(
        "Đăng ký thành công. Hãy đăng nhập."
      );

      setIsLogin(true);

      setPassword("");
    } catch (err: any) {
      console.error(
        "Auth error:",
        err
      );

      const serverMessage =
        err.response?.data?.message;

      setError(
        serverMessage ||
          "Không thể kết nối đến Backend."
      );
    } finally {
      setLoading(false);
    }
  }

  function switchMode() {
    setError("");
    setMessage("");
    setPassword("");
    setIsLogin(
      !isLogin
    );
  }

  return (
    <div
      style={{
        minHeight:
          "100vh",
        display:
          "flex",
        alignItems:
          "center",
        justifyContent:
          "center",
        padding:
          "20px",
        background:
          "linear-gradient(135deg, #eef2ff, #f8fafc)"
      }}
    >
      <div
        style={{
          width:
            "100%",
          maxWidth:
            "430px",
          background:
            "#ffffff",
          borderRadius:
            "24px",
          padding:
            "35px",
          boxShadow:
            "0 20px 60px rgba(0,0,0,.12)"
        }}
      >
        {/* LOGO */}
        <div
          style={{
            textAlign:
              "center",
            marginBottom:
              "25px"
          }}
        >
          <div
            style={{
              fontSize:
                "50px",
              marginBottom:
                "10px"
            }}
          >
            📱
          </div>

          <h1
            style={{
              margin:
                0,
              fontSize:
                "30px"
            }}
          >
            Phone Store
          </h1>

          <p
            style={{
              marginTop:
                "8px",
              color:
                "#64748b"
            }}
          >
            Phone Store Cloud
          </p>
        </div>

        {/* TITLE */}
        <h2
          style={{
            textAlign:
              "center",
            marginBottom:
              "25px"
          }}
        >
          {isLogin
            ? "Đăng nhập"
            : "Tạo tài khoản"}
        </h2>

        {/* MESSAGE */}
        {message && (
          <div
            style={{
              padding:
                "12px",
              marginBottom:
                "15px",
              borderRadius:
                "10px",
              background:
                "#dcfce7",
              color:
                "#166534"
            }}
          >
            {message}
          </div>
        )}

        {/* ERROR */}
        {error && (
          <div
            style={{
              padding:
                "12px",
              marginBottom:
                "15px",
              borderRadius:
                "10px",
              background:
                "#fee2e2",
              color:
                "#b91c1c"
            }}
          >
            {error}
          </div>
        )}

        {/* FORM */}
        <form
          onSubmit={
            handleSubmit
          }
        >

          {/* NAME */}
          {!isLogin && (
            <div
              style={{
                marginBottom:
                  "15px"
              }}
            >
              <label>
                Họ và tên
              </label>

              <input
                type="text"
                value={name}
                onChange={(
                  e
                ) =>
                  setName(
                    e.target.value
                  )
                }
                placeholder="Nguyễn Văn A"
                style={{
                  width:
                    "100%",
                  boxSizing:
                    "border-box",
                  marginTop:
                    "7px",
                  padding:
                    "13px 14px",
                  borderRadius:
                    "10px",
                  border:
                    "1px solid #cbd5e1",
                  fontSize:
                    "15px"
                }}
              />
            </div>
          )}

          {/* EMAIL */}
          <div
            style={{
              marginBottom:
                "15px"
            }}
          >
            <label>
              Email
            </label>

            <input
              type="email"
              value={email}
              onChange={(
                e
              ) =>
                setEmail(
                  e.target.value
                )
              }
              placeholder="example@gmail.com"
              style={{
                width:
                  "100%",
                boxSizing:
                  "border-box",
                marginTop:
                  "7px",
                padding:
                  "13px 14px",
                borderRadius:
                  "10px",
                border:
                  "1px solid #cbd5e1",
                fontSize:
                  "15px"
              }}
            />
          </div>

          {/* PASSWORD */}
          <div
            style={{
              marginBottom:
                "20px"
            }}
          >
            <label>
              Mật khẩu
            </label>

            <input
              type="password"
              value={password}
              onChange={(
                e
              ) =>
                setPassword(
                  e.target.value
                )
              }
              placeholder="Ít nhất 6 ký tự"
              style={{
                width:
                  "100%",
                boxSizing:
                  "border-box",
                marginTop:
                  "7px",
                padding:
                  "13px 14px",
                borderRadius:
                  "10px",
                border:
                  "1px solid #cbd5e1",
                fontSize:
                  "15px"
              }}
            />
          </div>

          {/* BUTTON */}
          <button
            type="submit"
            disabled={
              loading
            }
            style={{
              width:
                "100%",
              padding:
                "14px",
              border:
                "none",
              borderRadius:
                "10px",
              background:
                loading
                  ? "#94a3b8"
                  : "#2563eb",
              color:
                "#ffffff",
              fontSize:
                "16px",
              fontWeight:
                700,
              cursor:
                loading
                  ? "not-allowed"
                  : "pointer"
            }}
          >
            {loading
              ? "Đang xử lý..."
              : isLogin
                ? "Đăng nhập"
                : "Đăng ký"}
          </button>

        </form>

        {/* SWITCH */}
        <div
          style={{
            textAlign:
              "center",
            marginTop:
              "20px",
            color:
              "#64748b"
          }}
        >
          {isLogin
            ? "Chưa có tài khoản?"
            : "Đã có tài khoản?"}

          <button
            type="button"
            onClick={
              switchMode
            }
            style={{
              marginLeft:
                "6px",
              border:
                "none",
              background:
                "transparent",
              color:
                "#2563eb",
              fontWeight:
                700,
              cursor:
                "pointer"
            }}
          >
            {isLogin
              ? "Đăng ký"
              : "Đăng nhập"}
          </button>
        </div>

      </div>
    </div>
  );
}

export default AuthScreen;