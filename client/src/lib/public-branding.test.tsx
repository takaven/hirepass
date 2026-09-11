import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ExternalPassBrand, ExternalPassFooter, externalPassAccentStyle } from "@/components/external-pass-brand";
import {
  DEFAULT_COMPANY_ACCENT_COLOR,
  resolveCompanyAccentColor,
  sanitizeCompanyAccentColor,
} from "@shared/public-branding";

describe("external Pass customer branding", () => {
  it("accepts exact six-digit hex colours and normalises their case", () => {
    assert.equal(sanitizeCompanyAccentColor("#8A6A2F"), "#8A6A2F");
    assert.equal(sanitizeCompanyAccentColor("#5b4bdb"), "#5B4BDB");
    assert.equal(sanitizeCompanyAccentColor("#0B1F3A"), "#0B1F3A");
  });

  it("rejects arbitrary CSS and safely resolves missing or invalid accents", () => {
    for (const value of ["javascript:alert(1)", "linear-gradient(red, blue)", "rgb(1,2,3)", "var(--primary)", "navy", "#ABC", " #01FF22"]) {
      assert.equal(sanitizeCompanyAccentColor(value), null);
      assert.equal(resolveCompanyAccentColor(value), DEFAULT_COMPANY_ACCENT_COLOR);
    }
    assert.equal(resolveCompanyAccentColor(undefined), DEFAULT_COMPANY_ACCENT_COLOR);
    assert.deepEqual(externalPassAccentStyle({ companyAccentColor: "javascript:alert(1)" }), {
      "--customer-accent": DEFAULT_COMPANY_ACCENT_COLOR,
    });
  });

  it("prefers a configured logo and keeps the customer identity ahead of the Pass descriptor", () => {
    const markup = renderToStaticMarkup(createElement(ExternalPassBrand, {
      descriptor: "Candidate Pass",
      config: { companyName: "Northbridge Legal", companyLogoUrl: "https://example.test/logo.svg", companyAccentColor: "#8A6A2F" },
    }));
    assert.match(markup, /<img[^>]+alt="Northbridge Legal"/);
    assert.ok(markup.indexOf("Northbridge Legal") < markup.indexOf("Candidate Pass"));
  });

  it("falls back to an elegant company-name identity and keeps HirePass attribution secondary", () => {
    const brand = renderToStaticMarkup(createElement(ExternalPassBrand, {
      descriptor: "Stakeholder Pass",
      config: { companyName: "ARIE Finance" },
    }));
    const footer = renderToStaticMarkup(createElement(ExternalPassFooter, { config: { companyName: "ARIE Finance" } }));
    assert.doesNotMatch(brand, /<img/);
    assert.match(brand, />AF</);
    assert.match(brand, /ARIE Finance/);
    assert.match(brand, /Stakeholder Pass/);
    assert.match(footer, /Powered by HirePass/);
  });

  it("keeps the customer accent scoped away from the internal HirePass theme", async () => {
    const internalTheme = await readFile(path.join(process.cwd(), "client/src/index.css"), "utf8");
    const candidatePass = await readFile(path.join(process.cwd(), "client/src/pages/candidate-portal-pass.tsx"), "utf8");
    const stakeholderPass = await readFile(path.join(process.cwd(), "client/src/pages/manager-recruitment-pass.tsx"), "utf8");
    assert.doesNotMatch(internalTheme, /--customer-accent/);
    assert.match(candidatePass, /externalPassAccentStyle\(publicConfig\)/);
    assert.match(stakeholderPass, /externalPassAccentStyle\(publicConfig\)/);
    assert.match(candidatePass, /Applied|state\.journey/);
    assert.doesNotMatch(candidatePass, /fit score|match percentage|candidate rank/i);
    assert.doesNotMatch(stakeholderPass, /<nav|<aside/);
  });
});
