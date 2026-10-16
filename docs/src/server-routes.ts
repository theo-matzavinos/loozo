import { RenderMode, type ServerRoute } from "@angular/ssr";
import { loadPackage, packageSlugs } from "../generated/content/index.generated.js";

async function loadAllPackages() {
  return Promise.all(packageSlugs.map((slug) => loadPackage(slug)));
}

/** Every page is prerendered from the content modules; the site is deployed as static files. */
export const serverRoutes: ServerRoute[] = [
  { path: "", renderMode: RenderMode.Prerender },
  {
    path: ":package",
    renderMode: RenderMode.Prerender,
    async getPrerenderParams() {
      const params = [];

      for (const slug of packageSlugs) {
        params.push({ package: slug });
      }

      return params;
    },
  },
  {
    path: ":package/guide/:guide",
    renderMode: RenderMode.Prerender,
    async getPrerenderParams() {
      const contents = await loadAllPackages();
      const params = [];

      for (const content of contents) {
        for (const guide of content.guides) {
          params.push({ package: content.slug, guide: guide.slug });
        }

        for (const entryPoint of content.entryPoints) {
          if (entryPoint.guide !== null) {
            params.push({ package: content.slug, guide: entryPoint.guide.slug });
          }
        }
      }

      return params;
    },
  },
  {
    path: ":package/api/:symbol",
    renderMode: RenderMode.Prerender,
    async getPrerenderParams() {
      const contents = await loadAllPackages();
      const params = [];

      for (const content of contents) {
        for (const entryPoint of content.entryPoints) {
          for (const symbol of entryPoint.symbols) {
            params.push({ package: content.slug, symbol: symbol.slug });
          }
        }
      }

      return params;
    },
  },
  {
    path: ":package/generated-api",
    renderMode: RenderMode.Prerender,
    async getPrerenderParams() {
      const contents = await loadAllPackages();
      const params = [];

      for (const content of contents) {
        if (content.generatedApi.length > 0) {
          params.push({ package: content.slug });
        }
      }

      return params;
    },
  },
  // Rendered once at /404; the build copies it to 404.html, which GitHub Pages serves for unknown URLs.
  {
    path: "**",
    renderMode: RenderMode.Prerender,
    async getPrerenderParams() {
      return [{ "**": "404" }];
    },
  },
];
