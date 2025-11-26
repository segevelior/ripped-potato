import { useState } from "react";
import { User } from "@/api/entities";
import { Eye, EyeOff, Mail, Lock, Loader2, User as UserIcon } from "lucide-react";
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
    name: "",
    email: "",
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

    if (!signUpData.name) {
      newErrors.name = "Name is required";
    }

    if (!signUpData.email) {
      newErrors.email = "Email is required";
    } else if (!validateEmail(signUpData.email)) {
      newErrors.email = "Please enter a valid email";
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
          name: signUpData.name,
          email: signUpData.email,
          password: signUpData.password
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
    <div className="min-h-screen bg-coral-brand/80 relative overflow-hidden flex items-center justify-center p-4">
      {/* Background Logo - softer */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.06]">
        <img src="/logo.png" alt="" className="w-[100%] max-w-none blur-sm" />
      </div>

      {/* Main Card */}
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md z-20 overflow-hidden relative">
        <div className="p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-coral-brand/5 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <img src="/logo.png" alt="Torii Logo" className="w-12 h-12 object-contain" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">
              {activeTab === "signup" ? "Create an Account" : "Welcome Back"}
            </h1>
            <p className="text-gray-500 mt-2">
              {activeTab === "signup" ? "Start your fitness journey today" : "Sign in to continue your progress"}
            </p>
          </div>

          {/* Error Message */}
          {errors.general && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-600 rounded-xl text-sm flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
              {errors.general}
            </div>
          )}

          {/* Forms */}
          {activeTab === "signin" ? (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 ml-1">Email</label>
                <div className="relative group">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-coral-brand transition-colors" />
                  <input
                    type="email"
                    required
                    value={signInData.email}
                    onChange={(e) => setSignInData({ ...signInData, email: e.target.value })}
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-coral-brand/20 focus:border-coral-brand transition-all"
                    placeholder="john@example.com"
                    disabled={isLoading}
                  />
                </div>
                {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center ml-1">
                  <label className="text-sm font-medium text-gray-700">Password</label>
                  <button type="button" className="text-xs font-medium text-coral-brand/80 hover:text-coral-brand transition-colors">
                    Forgot Password?
                  </button>
                </div>
                <div className="relative group">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-coral-brand transition-colors" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={signInData.password}
                    onChange={(e) => setSignInData({ ...signInData, password: e.target.value })}
                    className="w-full pl-10 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-coral-brand/20 focus:border-coral-brand transition-all"
                    placeholder="••••••••"
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    disabled={isLoading}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password}</p>}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-coral-brand/90 hover:bg-coral-brand text-white font-semibold py-3.5 rounded-xl shadow-lg shadow-coral-brand/25 transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  "Sign In"
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSignUp} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 ml-1">Name</label>
                <div className="relative group">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-coral-brand transition-colors" />
                  <input
                    type="text"
                    required
                    value={signUpData.name}
                    onChange={(e) => setSignUpData({ ...signUpData, name: e.target.value })}
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-coral-brand/20 focus:border-coral-brand transition-all"
                    placeholder="John Doe"
                    disabled={isLoading}
                  />
                </div>
                {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 ml-1">Email</label>
                <div className="relative group">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-coral-brand transition-colors" />
                  <input
                    type="email"
                    required
                    value={signUpData.email}
                    onChange={(e) => setSignUpData({ ...signUpData, email: e.target.value })}
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-coral-brand/20 focus:border-coral-brand transition-all"
                    placeholder="john@example.com"
                    disabled={isLoading}
                  />
                </div>
                {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 ml-1">Password</label>
                <div className="relative group">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-coral-brand transition-colors" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={signUpData.password}
                    onChange={(e) => setSignUpData({ ...signUpData, password: e.target.value })}
                    className="w-full pl-10 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-coral-brand/20 focus:border-coral-brand transition-all"
                    placeholder="Create a password"
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    disabled={isLoading}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password}</p>}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-coral-brand/90 hover:bg-coral-brand text-white font-semibold py-3.5 rounded-xl shadow-lg shadow-coral-brand/25 transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  "Create Account"
                )}
              </button>
            </form>
          )}

          {/* Divider */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-100"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white text-gray-500">Or continue with</span>
            </div>
          </div>

          {/* Google Sign In */}
          <button
            onClick={handleGoogleAuth}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 px-6 py-3.5 border border-gray-200 rounded-xl hover:bg-gray-50 focus:ring-2 focus:ring-gray-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium text-gray-700 bg-white"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Google
          </button>

          {/* Toggle View */}
          <div className="text-center mt-6">
            <p className="text-gray-600">
              {activeTab === "signup" ? "Already have an account?" : "Don't have an account?"}{" "}
              <button
                onClick={() => {
                  setActiveTab(activeTab === "signup" ? "signin" : "signup");
                  setErrors({});
                }}
                className="font-semibold text-coral-brand/80 hover:text-coral-brand transition-colors"
              >
                {activeTab === "signup" ? "Sign In" : "Sign Up"}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
