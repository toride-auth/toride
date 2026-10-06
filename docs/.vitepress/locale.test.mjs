import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const docs = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(docs, ".vitepress/dist");
const site = "https://toride-auth.github.io/toride/";

function markdownFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith(".") || entry.name === "node_modules") return [];
    const path = join(directory, entry.name);
    return entry.isDirectory() ? markdownFiles(path) : path.endsWith(".md") ? [path] : [];
  });
}

const files = markdownFiles(docs).map((path) => relative(docs, path).replaceAll("\\", "/"));
const english = files.filter((path) => !path.startsWith("ja/"));
const read = (path) => readFileSync(path, "utf8");
const route = (path) => path.replace(/(^|\/)index\.md$/, "$1").replace(/\.md$/, ".html");
const html = (path) => read(join(dist, path.replace(/\.md$/, ".html")));
const headings = (page) => [...page.matchAll(/<h[1-6][^>]* id="([^"]+)"/g)].map((match) => match[1]);
const codeBlocks = (markdown) => markdown.match(/^```[^\n]*\n[\s\S]*?^```[^\n]*/gm) ?? [];

test("every English page has a Japanese counterpart with unchanged code examples", () => {
  assert.deepEqual(files.filter((path) => path.startsWith("ja/")).map((path) => path.slice(3)).sort(), english.toSorted());
  for (const path of english) {
    assert.deepEqual(codeBlocks(read(join(docs, "ja", path))), codeBlocks(read(join(docs, path))), path);
  }
});

test("both locales render correct language, canonical URLs, and equivalent-page alternates", () => {
  for (const path of files) {
    const page = html(path);
    const locale = path.startsWith("ja/") ? "ja" : "en";
    const counterpart = path.replace(/^ja\//, "");
    assert.match(page, new RegExp(`<html[^>]* lang="${locale}"`), path);
    assert.ok(page.includes(`<link rel="canonical" href="${site}${route(path)}">`), path);
    for (const [language, prefix] of [["en", ""], ["ja", "ja/"], ["x-default", ""]]) {
      assert.ok(page.includes(`<link rel="alternate" hreflang="${language}" href="${site}${prefix}${route(counterpart)}">`), `${path}: ${language}`);
    }
    if (locale === "ja") {
      assert.match(page, /<meta name="description" content="[^"]*[\u3040-\u9fff]/, path);
    }
  }
});

test("section anchors match between locales so language switching retains the section", () => {
  for (const path of english) {
    assert.deepEqual(headings(html(`ja/${path}`)), headings(html(path)), path);
  }
});

test("rendered internal links and fragment targets exist under the GitHub Pages base", () => {
  for (const path of files) {
    const page = html(path);
    for (const [, href] of page.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)) {
      const url = new URL(href.replaceAll("&amp;", "&"), `${site}${route(path)}`);
      if (url.origin !== new URL(site).origin) continue;
      assert.ok(url.pathname.startsWith("/toride/"), `${path}: ${href}`);
      const target = decodeURIComponent(url.pathname.slice("/toride/".length));
      const output = join(dist, target.endsWith("/") || target === "" ? `${target}index.html` : target);
      assert.ok(existsSync(output), `${path}: missing ${href}`);
      if (url.hash && output.endsWith(".html")) {
        assert.ok(read(output).includes(`id="${decodeURIComponent(url.hash.slice(1))}"`), `${path}: missing anchor ${href}`);
      }
    }
  }
});

test("Japanese article links and navigation stay in Japanese", () => {
  for (const path of files.filter((path) => path.startsWith("ja/"))) {
    const page = html(path);
    // The framework's language menu intentionally links back to English.
    const englishCounterpart = `/toride/${route(path.slice(3))}`;
    for (const [, href] of page.matchAll(/<a\b[^>]*\bhref="(\/toride\/[^"#]*)/g)) {
      assert.ok(href.startsWith("/toride/ja/") || href === englishCounterpart, `${path}: ${href}`);
    }
    for (const section of ["guide/why-toride", "concepts/policy-format", "integrations/prisma", "reference/cli"]) {
      assert.ok(page.includes(`href="/toride/ja/${section}.html"`), `${path}: ${section}`);
    }
  }
});
