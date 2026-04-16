import React from "react";
import GridShape from "../../components/common/GridShape";
import { Link } from "react-router";
import ThemeTogglerTwo from "../../components/common/ThemeTogglerTwo";
import { BRAND, env } from "../../config/env";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const logoStorageKey = "erp.company.logo_img";
  const systemLogo = "/images/logo/logo-icon.svg";
  const resolveLogoUrl = (value?: string | null) => {
    const raw = (value || "").trim();
    if (!raw) return "";
    if (/^data:/i.test(raw)) return raw;
    if (/^https?:\/\//i.test(raw)) return raw;
    // Frontend public assets (served by Vite)
    if (raw.startsWith("/images/") || raw === "/favicon.png") return raw;
    if (raw.startsWith("uploads/")) return `${env.API_URL}/${raw}`;
    if (raw.startsWith("/")) return `${env.API_URL}${raw}`;
    return raw;
  };

  const storedLogo =
    typeof window !== "undefined" ? window.localStorage.getItem(logoStorageKey) : "";
  const avatar =
    resolveLogoUrl(storedLogo) || systemLogo || resolveLogoUrl(env.COMPANY_AVATAR) || BRAND.AVATAR;

  return (
    <div className="relative p-6 bg-white z-1 dark:bg-gray-900 sm:p-0">
      <div className="relative flex flex-col justify-center w-full h-screen lg:flex-row dark:bg-gray-900 sm:p-0">
        {children}
        <div className="items-center hidden w-full h-full lg:w-1/2 bg-brand-900 dark:bg-white/5 lg:grid">
          <div className="relative flex items-center justify-center z-1">
            {/* <!-- ===== Common Grid Shape Start ===== --> */}
            <GridShape />
            <div className="flex w-full flex-col items-center max-w-sm">
              <Link to="/" className="block mb-4">
                <div className="flex flex-col items-center gap-3">
                  <div className="flex w-full items-center justify-center rounded-3xl ring-1 ring-white/25 bg-white/10 px-10 py-8 shadow-xl">
                    <img
                      src={avatar}
                      alt={BRAND.NAME}
                      className="h-auto w-full object-contain"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = systemLogo;
                      }}
                    />
                  </div>
                  <h1 className="text-3xl font-semibold tracking-tight text-white text-center">
                    {BRAND.NAME}
                  </h1>
                </div>
              </Link>
              <p className="text-center text-gray-300 dark:text-white/60">
                Manage inventory, sales, finance, and teams with a unified workflow.
              </p>
            </div>
          </div>
        </div>
        <div className="fixed z-50 hidden bottom-6 right-6 sm:block">
          <ThemeTogglerTwo />
        </div>
      </div>
    </div>
  );
}
