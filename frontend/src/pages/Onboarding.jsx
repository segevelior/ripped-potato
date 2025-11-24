import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import splashPattern1 from "../assets/figma/splash-pattern-1.svg";
import splashPattern2 from "../assets/figma/splash-pattern-2.svg";

export default function Onboarding() {
  const navigate = useNavigate();

  // Show splash screen for 2 seconds then redirect to auth
  // Show splash screen for 2 seconds then redirect to auth
  useEffect(() => {
    const timer = setTimeout(() => {
      navigate("/auth");
    }, 2000);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-coral-brand relative overflow-hidden flex flex-col items-center justify-center">
      {/* Background Patterns */}
      <div className="absolute left-[-324px] top-[451px] w-[451px] h-[225px] opacity-[0.08] pointer-events-none">
        <img src={splashPattern1} alt="" className="w-full h-full" />
      </div>
      <div className="absolute left-[-76px] top-[406px] w-[451px] h-[451px] opacity-[0.08] pointer-events-none">
        <img src={splashPattern2} alt="" className="w-full h-full" />
      </div>

      {/* Logo/Brand */}
      <div className="z-10 text-center mt-[-60px]">
        <h1 className="text-[40px] font-bold text-white leading-[1.5] tracking-[0.2px]">
          Torii
        </h1>
      </div>

      {/* Terms */}
      <div className="absolute bottom-[34px] left-0 right-0 text-center px-6 z-10">
        <p className="text-[13px] font-medium text-white/90 leading-[1.5]">
          By joining Torii, you agree to our{" "}
          <span className="underline cursor-pointer">Terms of Service</span>
        </p>
      </div>
    </div>
  );
}
