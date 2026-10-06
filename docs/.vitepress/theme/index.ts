import DefaultTheme from "vitepress/theme";
import { inBrowser, type Theme } from "vitepress";

export default {
  extends: DefaultTheme,
  enhanceApp() {
    if (!inBrowser) return;

    // VitePress 1.6 can retain the hash-free SSR href when a deep link hydrates.
    // Refresh only the native locale links before keyboard/mouse interaction.
    const preserveSection = (event: Event) => {
      if (!(event.target instanceof Element)) return;
      const link = event.target.closest<HTMLAnchorElement>("a[href]");
      if (!link?.closest(
        ".VPNavBarTranslations, .VPNavBarExtra .translations, .VPNavScreenTranslations",
      )) return;
      link.hash = window.location.hash;
    };

    for (const event of ["focusin", "pointerover", "click"]) {
      document.addEventListener(event, preserveSection, true);
    }
  },
} satisfies Theme;
