import React, { useEffect, useState, type CSSProperties } from "react";
import { resolveCompanyAccentColor } from "@shared/public-branding";

export type ExternalPassBrandConfig = {
  companyName?: string;
  companyLogoUrl?: string;
  companyAccentColor?: string;
  careersContactEmail?: string;
};

type ExternalPassStyle = CSSProperties & { "--customer-accent": string };

export function externalPassAccentStyle(config?: ExternalPassBrandConfig): ExternalPassStyle {
  return { "--customer-accent": resolveCompanyAccentColor(config?.companyAccentColor) };
}

function companyInitials(companyName: string) {
  const words = companyName.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? `${words[0][0]}${words[1][0]}` : words[0]?.slice(0, 2) || "HP").toUpperCase();
}

export function ExternalPassBrand({
  config,
  descriptor,
}: {
  config?: ExternalPassBrandConfig;
  descriptor: "Candidate Pass" | "Stakeholder Pass";
}) {
  const companyName = config?.companyName || "Hiring company";
  const logoUrl = config?.companyLogoUrl || "";
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => setLogoFailed(false), [logoUrl]);

  return (
    <div className="flex min-w-0 items-center gap-3" data-testid="external-pass-brand">
      {logoUrl && !logoFailed ? (
        <img
          src={logoUrl}
          alt={companyName}
          className="h-11 max-w-40 shrink-0 object-contain sm:h-12 sm:max-w-52"
          onError={() => setLogoFailed(true)}
        />
      ) : (
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border-2 bg-white text-sm font-semibold text-[#20242B] shadow-sm"
          style={{ borderColor: "var(--customer-accent)" }}
          aria-hidden="true"
        >
          {companyInitials(companyName)}
        </div>
      )}
      <div className="min-w-0">
        <p className="break-words text-base font-semibold leading-tight text-[#20242B] sm:text-lg">{companyName}</p>
        <p className="mt-0.5 text-xs font-medium uppercase tracking-[0.16em] text-[#68707D]">{descriptor}</p>
      </div>
    </div>
  );
}

export function ExternalPassFooter({ config }: { config?: ExternalPassBrandConfig }) {
  return (
    <footer className="border-t border-[#D8DEE5] py-6 text-center text-xs text-[#68707D]">
      <span>Powered by HirePass</span>
      {config?.careersContactEmail ? (
        <>
          <span aria-hidden="true"> · </span>
          <a className="underline underline-offset-4" href={`mailto:${config.careersContactEmail}`}>Contact the hiring team</a>
        </>
      ) : null}
    </footer>
  );
}
