import { useState } from "react";
import { User } from "@/api/entities";
import { Eye, EyeOff, Mail, Lock, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Auth() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("signin");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});

  // Form states
  const [signInData, setSignInData] = useState({
    email: "",
    password: "",
    rememberMe: false
  });

  const [signUpData, setSignUpData] = useState({
    email: "",
    phoneNumber: "",
    password: "",
    rememberMe: false
  });

  // Validation functions
  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validatePassword = (password) => {
    return password.length >= 8;
  };

  const validateSignIn = () => {
    const newErrors = {};

    if (!signInData.email) {
      newErrors.email = "Email is required";
    } else if (!validateEmail(signInData.email)) {
      newErrors.email = "Please enter a valid email";
    }

    if (!signInData.password) {
      newErrors.password = "Password is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateSignUp = () => {
    const newErrors = {};

    if (!signUpData.email) {
      newErrors.email = "Email is required";
    } else if (!validateEmail(signUpData.email)) {
      newErrors.email = "Please enter a valid email";
    }

    if (!signUpData.phoneNumber) {
      newErrors.phoneNumber = "Phone number is required";
    }

    if (!signUpData.password) {
      newErrors.password = "Password is required";
    } else if (!validatePassword(signUpData.password)) {
      newErrors.password = "Password must be at least 8 characters";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleGoogleAuth = () => {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001';
    window.location.href = `${apiUrl}/api/v1/auth/google`;
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    if (!validateSignIn()) return;

    setIsLoading(true);
    setErrors({});

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/v1/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: signInData.email,
          password: signInData.password
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Login failed');
      }

      const data = await response.json();

      localStorage.setItem('authToken', data.data.token);
      localStorage.setItem('authUser', JSON.stringify(data.data.user));

      User.user = data.data.user;
      User.token = data.data.token;

      navigate('/');
    } catch (error) {
      console.error("Sign in error:", error);
      setErrors({ general: error.message || "Invalid email or password. Please try again." });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    if (!validateSignUp()) return;

    setIsLoading(true);
    setErrors({});

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/v1/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: signUpData.email,
          password: signUpData.password,
          phoneNumber: signUpData.phoneNumber
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Registration failed');
      }

      const registerData = await response.json();

      localStorage.setItem('authToken', registerData.data.token);
      localStorage.setItem('authUser', JSON.stringify(registerData.data.user));

      User.user = registerData.data.user;
      User.token = registerData.data.token;

      navigate('/');
    } catch (error) {
      console.error("Sign up error:", error);
      setErrors({ general: error.message || "Account creation failed. Please try again." });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">


      {/* Back Button */}
      <div className="px-4 pt-2 pb-6">
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 flex items-center justify-center"
        >
          <svg className="w-6 h-6 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 px-6 pb-8 overflow-y-auto">
        {/* General Error Message */}
        {errors.general && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
            {errors.general}
          </div>
        )}

        {/* Sign In Form */}
        {activeTab === "signin" && (
          <>
            <div className="mb-10">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Hi, Welcome Back</h1>
              <p className="text-gray-500 text-base">Login in to your account</p>
            </div>

            <form onSubmit={handleSignIn} className="space-y-6">
              <div>
                <label className="block text-base font-bold text-gray-900 mb-3">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="email"
                    value={signInData.email}
                    onChange={(e) => setSignInData({ ...signInData, email: e.target.value })}
                    className="w-full pl-12 pr-4 py-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-base bg-gray-50"
                    placeholder="Your email"
                    disabled={isLoading}
                  />
                </div>
                {errors.email && <p className="mt-2 text-sm text-red-600">{errors.email}</p>}
              </div>

              <div>
                <label className="block text-base font-bold text-gray-900 mb-3">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={signInData.password}
                    onChange={(e) => setSignInData({ ...signInData, password: e.target.value })}
                    className="w-full pl-12 pr-14 py-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-base bg-gray-50"
                    placeholder="Your password"
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    disabled={isLoading}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {errors.password && <p className="mt-2 text-sm text-red-600">{errors.password}</p>}
              </div>

              <div className="flex items-center justify-between pt-2">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={signInData.rememberMe}
                    onChange={(e) => setSignInData({ ...signInData, rememberMe: e.target.checked })}
                    className="w-5 h-5 text-orange-500 bg-orange-500 border-orange-500 rounded focus:ring-orange-500 checked:bg-orange-500"
                    style={{
                      accentColor: '#FF6B52'
                    }}
                    disabled={isLoading}
                  />
                  <span className="ml-3 text-base text-gray-700">Remember me</span>
                </label>
                <button type="button" className="text-base text-orange-500 hover:text-orange-600 font-medium">
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-gray-900 text-white py-4 px-6 rounded-2xl hover:bg-gray-800 focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 transition-all duration-200 font-semibold text-base disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-8"
              >
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                Login
              </button>

              <div className="text-center pt-6">
                <span className="text-base text-gray-600">Don't have an account? </span>
                <button
                  type="button"
                  onClick={() => setActiveTab("signup")}
                  className="text-base text-orange-500 hover:text-orange-600 font-semibold"
                >
                  Register
                </button>
              </div>
            </form>
          </>
        )}

        {/* Sign Up Form */}
        {activeTab === "signup" && (
          <>
            <div className="mb-10">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Hi, Sign up for an account</h1>
              <p className="text-gray-500 text-base">Enter your email and password for login</p>
            </div>

            <form onSubmit={handleSignUp} className="space-y-6">
              <div>
                <label className="block text-base font-bold text-gray-900 mb-3">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="email"
                    value={signUpData.email}
                    onChange={(e) => setSignUpData({ ...signUpData, email: e.target.value })}
                    className="w-full pl-12 pr-4 py-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-base bg-gray-50"
                    placeholder="kevinjulio@gmail.com"
                    disabled={isLoading}
                  />
                </div>
                {errors.email && <p className="mt-2 text-sm text-red-600">{errors.email}</p>}
              </div>

              <div>
                <label className="block text-base font-bold text-gray-900 mb-3">
                  Phone Number
                </label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 transform -translate-y-1/2 flex items-center gap-2">
                    <span className="text-xl">🇺🇸</span>
                    <span className="text-gray-600 text-base font-medium">+1</span>
                  </div>
                  <input
                    type="tel"
                    value={signUpData.phoneNumber}
                    onChange={(e) => setSignUpData({ ...signUpData, phoneNumber: e.target.value })}
                    className="w-full pl-24 pr-4 py-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-base bg-gray-50"
                    placeholder="111-222-3344"
                    disabled={isLoading}
                  />
                </div>
                {errors.phoneNumber && <p className="mt-2 text-sm text-red-600">{errors.phoneNumber}</p>}
              </div>

              <div>
                <label className="block text-base font-bold text-gray-900 mb-3">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={signUpData.password}
                    onChange={(e) => setSignUpData({ ...signUpData, password: e.target.value })}
                    className="w-full pl-12 pr-14 py-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-base bg-gray-50"
                    placeholder="Your password"
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    disabled={isLoading}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {errors.password && <p className="mt-2 text-sm text-red-600">{errors.password}</p>}
              </div>

              <div className="flex items-center justify-between pt-2">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={signUpData.rememberMe}
                    onChange={(e) => setSignUpData({ ...signUpData, rememberMe: e.target.checked })}
                    className="w-5 h-5 text-orange-500 border-gray-300 rounded focus:ring-orange-500"
                    style={{
                      accentColor: '#FF6B52'
                    }}
                    disabled={isLoading}
                  />
                  <span className="ml-3 text-base text-gray-700">Remember me</span>
                </label>
                <button type="button" className="text-base text-orange-500 hover:text-orange-600 font-medium">
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-gray-900 text-white py-4 px-6 rounded-2xl hover:bg-gray-800 focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 transition-all duration-200 font-semibold text-base disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-8"
              >
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                Sign Up
              </button>

              <div className="text-center pt-6">
                <span className="text-base text-gray-600">Have an account? </span>
                <button
                  type="button"
                  onClick={() => setActiveTab("signin")}
                  className="text-base text-orange-500 hover:text-orange-600 font-semibold"
                >
                  Login
                </button>
              </div>
            </form>
          </>
        )}

        {/* Divider */}
        <div className="my-10">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-base">
              <span className="px-4 bg-white text-gray-500">Or sign up with</span>
            </div>
          </div>
        </div>

        {/* Google Sign In */}
        <button
          onClick={handleGoogleAuth}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-3 px-6 py-4 border border-gray-200 rounded-2xl hover:bg-gray-50 focus:ring-2 focus:ring-gray-300 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium text-base"
        >
          <svg className="w-6 h-6" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Sign up with google
        </button>
      </div>


    </div>
  );
}
